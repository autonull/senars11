/**
 * MeTTaOpRegistrar.js — Grounded operation registration for MeTTa interpreter
 *
 * Registers all grounded ops that bridge the MeTTa interpreter to the
 * agent's subsystems. Delegates LLM invocation to LLMInvoker and
 * context assembly to ContextBuilder (no duplication).
 *
 * Op groups:
 *   Basic:     cap?, budget, reset, cycle count, I/O, WM tick, sleep
 *   Context:   build-context (delegates to ContextBuilder)
 *   LLM:       llm-invoke (delegates to LLMInvoker)
 *   Command:   parse-response, execute-commands, append-history, emit-cycle-audit
 *   Introspection: manifest, skill-inventory, subsystems, agent-state
 *   Discovery: discover-skills
 */
import { Logger } from '@senars/core';

export class MeTTaOpRegistrar {
    #agent;
    #agentCfg;
    #dispatcher;
    #loopState;
    #budget;
    #Term;
    #cap;
    #llmInvoker;

    constructor(agent, agentCfg, dispatcher, loopState, budget, Term, cap, llmInvoker) {
        this.#agent = agent;
        this.#agentCfg = agentCfg;
        this.#dispatcher = dispatcher;
        this.#loopState = loopState;
        this.#budget = budget;
        this.#Term = Term;
        this.#cap = cap;
        this.#llmInvoker = llmInvoker;
    }

    registerBasicOps(interp, dequeueMessage) {
        const bool = v => this.#Term.sym(v ? 'True' : 'False');
        const ok = () => this.#Term.sym('ok');
        const g = interp.ground;

        g.register('cap?', flagAtom => bool(this.#cap(flagAtom?.name ?? String(flagAtom))));
        g.register('agent-budget', () => this.#Term.grounded(this.#budget.current));
        g.register('reset-budget', () => {
            this.#budget.current = this.#agentCfg.loop?.budget ?? 50;
            return this.#Term.grounded(this.#budget.current);
        });
        g.register('agent-reset!', () => {
            this.#loopState.cycleCount = 0;
            this.#budget.current = this.#agentCfg.loop?.budget ?? 50;
            return ok();
        });
        g.register('inc-cycle-count!', () => { this.#loopState.cycleCount++; return ok(); });
        g.register('check-embodiment-bus', dequeueMessage, { async: true });
        g.register('new-message?', msg => {
            const msgVal = msg?.value ?? (msg?.name !== '()' ? msg?.name : null) ?? null;
            const isNew = msgVal !== null && msgVal !== this.#loopState.prevmsg;
            if (isNew) this.#loopState.prevmsg = msgVal;
            return bool(isNew);
        });
        g.register('tick-wm', () => { this.#tickWM(); return ok(); });
        g.register('sleep-cycle', () => new Promise(res => setTimeout(res, this.#agentCfg.loop?.sleepMs ?? 2000)).then(ok), { async: true });
    }

    #tickWM() {
        this.#loopState.wm = (this.#loopState.wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);
    }

    registerContextOps(interp, contextBuilder = null) {
        // Delegate to ContextBuilder if available; otherwise use inline fallback.
        interp.ground.register('build-context', async msg => {
            if (contextBuilder) {
                const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : '');
                const ctx = await contextBuilder.build(msgStr, this.#loopState.cycleCount, this.#loopState.wm);
                return this.#Term.grounded(ctx);
            }
            // Inline fallback — fewer slots than ContextBuilder.build()
            const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : null) ?? '';
            const skills = this.#dispatcher.getActiveActionDefs();
            const { maxHist = 12000, maxFb = 6000, maxWm = 1500, maxPinned = 3000, maxRecall = 8000 } = this.#agentCfg.memory ?? {};
            const wmStr = this.#loopState.wm.length > 0
                ? this.#loopState.wm.map(e => `[${e.priority.toFixed(2)}] ${e.content} (ttl:${e.ttl})`).join('\n').slice(0, maxWm)
                : '';
            let histStr = '';
            for (let i = this.#loopState.historyBuffer.length - 1; i >= 0; i--) {
                const candidate = `${this.#loopState.historyBuffer[i]}\n${histStr}`;
                if (candidate.length > maxHist) break;
                histStr = candidate;
            }
            const lastResultsStr = JSON.stringify(this.#loopState.lastresults ?? []).slice(0, maxFb);
            let pinnedStr = '', recallStr = '';
            if (this.#agent.semanticMemory && this.#cap('semanticMemory')) {
                const pinned = await this.#agent.semanticMemory.getPinned(maxPinned);
                if (pinned.length > 0) pinnedStr = pinned.map(p => `* ${p.content}`).join('\n').slice(0, maxPinned);
                const recall = await this.#agent.semanticMemory.query(msgStr ? msgStr.slice(0, 200) : 'recent', 10, { minScore: 0.3 });
                if (recall.length > 0) recallStr = recall.map(r => `[${r.score.toFixed(2)}] ${r.content}`).join('\n').slice(0, maxRecall);
            }
            let ctx = `SKILLS:\n${skills}\n\n`;
            if (wmStr) ctx += `WM_REGISTER:\n${wmStr}\n\n`;
            if (pinnedStr) ctx += `PINNED:\n${pinnedStr}\n\n`;
            if (recallStr) ctx += `RECALL:\n${recallStr}\n\n`;
            if (histStr) ctx += `HISTORY:\n${histStr}\n`;
            if (lastResultsStr && lastResultsStr !== '[]') ctx += `LAST_RESULTS: ${lastResultsStr}\n\n`;
            if (this.#loopState.error) ctx += `ERROR: ${JSON.stringify(this.#loopState.error)}\n\n`;
            if (msgStr) ctx += `INPUT: ${msgStr}\n\n`;
            ctx += `OUTPUT FORMAT — You MUST respond in EXACTLY one of these ways:\n`;
            ctx += `1) To reply to the user: {"actions":[{"name":"respond","args":["Your reply text"]}]} followed by any other actions.\n`;
            ctx += `2) To reply in plain text: just write your reply text, no JSON.\n`;
            ctx += `CRITICAL: If you perform actions (query, think, search, etc.) you MUST ALSO include a respond action with your reply text.\n`;
            ctx += `Example: {"actions":[{"name":"respond","args":["4"]},{"name":"think","args":["basic math"]}]}  or just: The answer is 4.\n`;
            ctx += `Never return ONLY a JSON without a respond action — that will silently drop your reply.`;
            return this.#Term.grounded(ctx);
        }, { async: true });
    }

    registerLLMOps(interp) {
        interp.ground.register('llm-invoke', async ctx => {
            const ctxStr = ctx?.value ?? (typeof ctx === 'string' ? ctx : String(ctx ?? ''));
            return this.#Term.grounded(await this.#llmInvoker.invoke(ctxStr));
        }, { async: true });
    }

    registerCommandOps(interp) {
        const g = interp.ground;
        g.register('parse-response', resp => {
            const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
            const { cmds, error } = this.#dispatcher.parseResponse(respStr);
            this.#loopState.error = error;
            return this.#Term.grounded(cmds);
        });
        g.register('execute-commands', async cmds => {
            const commands = cmds?.value ?? (Array.isArray(cmds) ? cmds : []);
            if (!commands.length) return this.#Term.grounded([]);
            try {
                const results = await this.#dispatcher.execute(commands);
                this.#loopState.lastresults = results;
                return this.#Term.grounded(results);
            } catch (err) {
                Logger.error('[execute-commands]', err.message);
                return this.#Term.grounded([]);
            }
        }, { async: true });
        g.register('append-history', (msg, resp, result) => {
            this.#loopState.historyBuffer.push([
                `USER: ${msg?.value ?? msg ?? '(no input)'}`,
                `AGENT: ${resp?.value ?? resp ?? ''}`,
                `RESULT: ${JSON.stringify(result?.value ?? result ?? [])}`
            ].join('\n'));
            return this.#Term.sym('ok');
        });
        g.register('emit-cycle-audit', async (msg, resp, result) => {
            if (this.#cap('auditLog')) {
                await this.#dispatcher._ensureSafetyAndAudit();
                if (this.#dispatcher._auditSpace) {
                    await this.#dispatcher._auditSpace.emitCycleAudit(msg, resp, result);
                }
            }
            return this.#Term.sym('ok');
        }, { async: true });
    }

    registerIntrospectionOps(interp) {
        const g = interp.ground;
        import('../introspection/IntrospectionOps.js').then(({ IntrospectionOps }) => {
            const ops = new IntrospectionOps(this.#agentCfg, this.#dispatcher, this.#agent.embodimentBus, this.#agent.modelRouter, this.#loopState);
            g.register('manifest', () => this.#Term.grounded(ops.generateManifest()));
            g.register('skill-inventory', () => this.#Term.grounded(ops.listSkills()));
            g.register('subsystems', () => this.#Term.grounded(ops.describeSubsystems()));
            g.register('agent-state', keyAtom => this.#Term.grounded(ops.getState(keyAtom?.name ?? String(keyAtom ?? ''))));
        }).catch(err => {
            Logger.warn('[MeTTaOpRegistrar] IntrospectionOps unavailable:', err.message);
            g.register('manifest', () => this.#Term.grounded('(manifest :unavailable)'));
            g.register('skill-inventory', () => this.#Term.grounded('(skill-inventory :unavailable)'));
            g.register('subsystems', () => this.#Term.grounded('(subsystems :unavailable)'));
            g.register('agent-state', () => this.#Term.grounded('(agent-state :unavailable)'));
        });
    }

    registerDiscoveryOps(interp, interpreter) {
        const g = interp.ground;
        g.register('discover-skills', async () => {
            if (!this.#cap('dynamicSkillDiscovery')) {
                return this.#Term.grounded('(discover-skills :restricted true)');
            }
            const { resolve, join } = await import('path');
            const { readdir } = await import('fs/promises');
            const { fileURLToPath } = await import('url');
            const { dirname } = await import('path');
            const { resolveWithFallback, fallbackAgentDir } = await import('@senars/core');
            const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);
            const skillsDir = resolve(__agentDir, '../../memory/skills');
            try {
                const files = (await readdir(skillsDir)).filter(f => f.endsWith('.metta'));
                let loaded = 0;
                for (const file of files) {
                    const { readFile } = await import('fs/promises');
                    interpreter.run(await readFile(join(skillsDir, file), 'utf8'));
                    loaded++;
                }
                return this.#Term.grounded(`(discover-skills :loaded ${loaded} :files "${JSON.stringify(files)}")`);
            } catch (err) {
                return this.#Term.grounded(`(discover-skills :error "${err.message}")`);
            }
        }, { async: true });
    }
}
