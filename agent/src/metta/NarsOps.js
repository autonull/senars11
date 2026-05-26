/**
 * NarsOps.js — NARS inference grounded operations for MeTTa
 *
 * Bridges the NARS engine to the MeTTa interpreter, enabling
 * NAL reasoning within the MeTTa control plane.
 *
 * Grounded ops:
 *   |- premises           → NAL inference conclusions (delegates to NARS stream reasoner)
 *   nar-beliefs term      → beliefs matching term
 *   nar-add sentence      → add belief/goal to NARS
 *   nar-truth term        → current truth value for term
 */
import { Logger } from '@senars/core';
import { Term } from '@senars/metta/kernel/Term.js';

export class NarsOps {
    #nar;

    constructor(nar) {
        this.#nar = nar;
    }

    register(interp) {
        const g = interp.ground;

        // ── NAL inference (delegates to NARS stream reasoner) ────────
        g.register('|-', async premisesStr => {
            if (!this.#nar) return Term.grounded('(error :no-nars-engine)');
            try {
                const str = String(premisesStr?.value ?? premisesStr ?? '');
                const conclusions = await this.#infer(str);
                return Term.grounded(conclusions.length > 0
                    ? conclusions.join('\n')
                    : '(no-conclusions)');
            } catch (err) {
                return Term.grounded(`(inference-error "${err.message.slice(0, 200)}")`);
            }
        }, { async: true });

        // ── Query beliefs ──────────────────────────────────────────
        g.register('nar-beliefs', termStr => {
            if (!this.#nar) return Term.grounded('()');
            const term = String(termStr?.value ?? termStr ?? '');
            const beliefs = this.#getBeliefs(term);
            return Term.grounded(beliefs.slice(0, 20).map(b => b.toString()).join('\n'));
        });

        // ── Add sentence ───────────────────────────────────────────
        g.register('nar-add', sentenceStr => {
            if (!this.#nar?.input) return Term.grounded('(error :no-nars-input)');
            try {
                this.#nar.input(String(sentenceStr?.value ?? sentenceStr ?? ''));
                return Term.sym('ok');
            } catch (err) {
                return Term.grounded(`(add-error "${err.message.slice(0, 200)}")`);
            }
        });

        // ── Query truth value ──────────────────────────────────────
        g.register('nar-truth', termStr => {
            if (!this.#nar) return Term.grounded('(truth :none)');
            const term = String(termStr?.value ?? termStr ?? '');
            const beliefs = this.#getBeliefs(term);
            if (beliefs.length === 0) return Term.grounded('(truth :none)');
            const { f, c } = beliefs[0].truth ?? { f: 0, c: 0 };
            return Term.grounded(`(truth :f ${f.toFixed(3)} :c ${c.toFixed(3)})`);
        });
    }

    #getBeliefs(termStr) {
        const nar = this.#nar;
        if (typeof nar.getBeliefs === 'function') {
            try { return nar.getBeliefs(termStr) ?? []; } catch { /* fall through */ }
        }
        const memory = nar.memory;
        if (memory?.getConcept) {
            try {
                const concept = memory.getConcept(termStr);
                return concept?.getTasksByType?.('BELIEF') ?? [];
            } catch { /* fall through */ }
        }
        return [];
    }

    /**
     * Run NAL inference by delegating to the NARS stream reasoner.
     *
     * Instead of manually pairing premises and applying Truth.* functions,
     * this feeds premises into nar.input() and runs reasoning cycles,
     * letting the full NAL rule engine (syllogistic, modus ponens,
     * induction, abduction, analogy, conversion, comparison, compound
     * terms, etc.) produce conclusions.
     */
    async #infer(str) {
        const nar = this.#nar;
        const conclusions = [];
        const beforeKeys = new Set();

        // Snapshot existing belief keys so we can detect new conclusions
        const memory = nar.memory;
        if (memory?.getConcepts) {
            for (const concept of memory.getConcepts?.() ?? []) {
                beforeKeys.add(concept.name);
            }
        }

        // Feed premises into NARS
        const premiseTerms = [];
        for (const part of str.split(/\n+/)) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            try {
                if (nar.input) await nar.input(trimmed);
                // Extract the term from the premise for later querying
                const m = trimmed.match(/[<(\[]\s*([\w\-]+)/);
                if (m) premiseTerms.push(m[1]);
            } catch { /* skip unparseable premises */ }
        }

        if (premiseTerms.length < 2) return conclusions;

        // Run reasoning cycles to let the stream reasoner derive conclusions
        const cycles = nar.streamReasoner ? 5 : 3;
        for (let i = 0; i < cycles; i++) {
            if (nar.step) await nar.step();
        }

        // Extract new/changed beliefs for the premise terms
        const seen = new Set();
        for (const termName of premiseTerms) {
            const beliefs = this.#getBeliefs(termName);
            for (const b of beliefs) {
                const key = b.term?.toString?.() ?? String(b);
                if (seen.has(key)) continue;
                seen.add(key);
                const f = b.truth?.f ?? b.truthValue?.f ?? 0;
                const c = b.truth?.c ?? b.truthValue?.c ?? 0;
                if (c > 0.1) {
                    conclusions.push(`(belief "${key.replace(/"/g, '\\"')}" :f ${f.toFixed(3)} :c ${c.toFixed(3)})`);
                }
            }
        }

        // Also check for entirely new concepts that emerged
        if (memory?.getConcepts) {
            for (const concept of memory.getConcepts?.() ?? []) {
                if (beforeKeys.has(concept.name)) continue;
                const beliefs = concept.getTasksByType?.('BELIEF') ?? [];
                for (const b of beliefs.slice(0, 3)) {
                    const key = b.term?.toString?.() ?? String(b);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const f = b.truth?.f ?? b.truthValue?.f ?? 0;
                    const c = b.truth?.c ?? b.truthValue?.c ?? 0;
                    conclusions.push(`(derived "${key.replace(/"/g, '\\"')}" :f ${f.toFixed(3)} :c ${c.toFixed(3)})`);
                }
            }
        }

        return conclusions;
    }
}
