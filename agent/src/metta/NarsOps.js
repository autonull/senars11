/**
 * NarsOps.js — NARS inference grounded operations for MeTTa
 *
 * Bridges the NARS engine to the MeTTa interpreter, enabling
 * NAL reasoning within the MeTTa control plane.
 *
 * Grounded ops:
 *   |- premises           → NAL inference conclusions
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

        // ── NAL inference ──────────────────────────────────────────
        g.register('|-', async premisesStr => {
            if (!this.#nar) return Term.grounded('(error :no-nars-engine)');
            try {
                const str = String(premisesStr?.value ?? premisesStr ?? '');
                const conclusions = this.#infer(str);
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
        // Try public API first: nar.getBeliefs(termStr)
        if (typeof nar.getBeliefs === 'function') {
            try { return nar.getBeliefs(termStr) ?? []; } catch { /* fall through */ }
        }
        // Fallback: memory.getConcept(term).getTasksByType('BELIEF')
        const memory = nar.memory;
        if (memory?.getConcept) {
            try {
                const concept = memory.getConcept(termStr);
                return concept?.getTasksByType?.('BELIEF') ?? [];
            } catch { /* fall through */ }
        }
        return [];
    }

    #infer(str) {
        const nar = this.#nar;
        const conclusions = [];
        const seen = new Set();

        const parser = nar._parser;
        if (!parser) return conclusions;

        const premises = [];
        for (const part of str.split(/\n+/)) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            try {
                const parsed = parser.parse(trimmed);
                if (parsed) premises.push(parsed);
            } catch { /* skip unparseable */ }
        }
        if (premises.length < 2) return conclusions;

        const { Truth } = requireOrImport('@senars/nar/Truth.js');
        if (!Truth) return conclusions;

        const addConclusion = (type, conclusion, truth) => {
            const termStr = typeof conclusion === 'string' ? conclusion : conclusion?.toString?.() ?? String(conclusion);
            const key = `${type}|${termStr}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (truth?.c > 0.1) {
                conclusions.push(`(${type} :conclusion "${termStr}" :f ${truth.f.toFixed(3)} :c ${truth.c.toFixed(3)})`);
            }
        };

        const conflictMap = new Map();

        for (let i = 0; i < premises.length; i++) {
            for (let j = i + 1; j < premises.length; j++) {
                const p1 = premises[i];
                const p2 = premises[j];
                const t1 = p1.truthValue ?? { f: 0.5, c: 0.9 };
                const t2 = p2.truthValue ?? { f: 0.5, c: 0.9 };

                const truthObjs = [t1, t2].map(t =>
                    t instanceof Truth ? t : Truth.create(t.f ?? t.frequency ?? 0.5, t.c ?? t.confidence ?? 0.9));

                const p1Term = p1.term?.toString?.() ?? String(p1);
                const p2Term = p2.term?.toString?.() ?? String(p2);

                const ded = Truth.deduction(truthObjs[0], truthObjs[1]);
                addConclusion('deduction', p1Term, ded);

                const ind = Truth.induction(truthObjs[0], truthObjs[1]);
                addConclusion('induction', p2Term, ind);

                const abd = Truth.abduction(truthObjs[0], truthObjs[1]);
                addConclusion('abduction', p2Term, abd);

                const rev = Truth.revision(truthObjs[0], truthObjs[1]);
                if (rev && Math.abs(rev.f - truthObjs[0].f) > 0.01) {
                    const conflictKey = `revision|${p1Term}`;
                    if (!conflictMap.has(conflictKey) || Truth.expectation(rev) > Truth.expectation(conflictMap.get(conflictKey))) {
                        conflictMap.set(conflictKey, rev);
                    }
                }
            }
        }

        for (const [key, truth] of conflictMap) {
            const term = key.split('|')[1];
            if (!seen.has(key)) {
                seen.add(key);
                conclusions.push(`(revision :conclusion "${term}" :f ${truth.f.toFixed(3)} :c ${truth.c.toFixed(3)})`);
            }
        }

        return conclusions;
    }
}

async function requireOrImport(spec) {
    try { return await import(spec); } catch { return null; }
}
