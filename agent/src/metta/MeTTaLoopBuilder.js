import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback, fallbackAgentDir } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';
import { MeTTaOpRegistrar } from './MeTTaOpRegistrar.js';
import { MeTTaSkillRegistrar } from './MeTTaSkillRegistrar.js';
import { AgentMessageQueue } from './AgentMessageQueue.js';
import { existsSync } from 'fs';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

const lazyImport = (cache, key, importFn) => async () => {
    if (!cache[key]) cache[key] = await importFn();
    return cache[key];
};

const _lazyCache = {};
const loadHarnessOptimizer = lazyImport(_lazyCache, 'HarnessOptimizer', () => import('../harness/HarnessOptimizer.js'));
const loadContextBuilder = lazyImport(_lazyCache, 'ContextBuilder', () => import('../memory/ContextBuilder.js'));

export class MeTTaLoopBuilder {
    #budget;
    #sleepMs;
    #cap;

    constructor(agent, agentCfg) {
        this.agent = agent;
        this.agentCfg = agentCfg;
        this.#budget = agentCfg.loop?.budget ?? 50;
        this.#sleepMs = agentCfg.loop?.sleepMs ?? 2000;
        this.#cap = flag => isEnabled(agentCfg, flag);
    }

    async build() {
        const { MeTTaInterpreter } = await import('../../../metta/src/MeTTaInterpreter.js');
        const { SkillDispatcher } = await import('../skills/SkillDispatcher.js');

        const interp = new MeTTaInterpreter();
        const Term = interp.ground.constructor.prototype.constructor;
        this._dispatcher = new SkillDispatcher(this.agentCfg);
        const skillsFile = this.#resolveMettaFile('skills.metta');
        this._dispatcher.loadSkillsFromFile(skillsFile);
        const loopState = this.#createLoopState();
        const budget = { current: this.#budget };

        const msgQueue = new AgentMessageQueue(this.agent.embodimentBus, this.#cap);
        const opRegistrar = new MeTTaOpRegistrar(this.agent, this.agentCfg, this._dispatcher, loopState, budget, Term, this.#cap);
        opRegistrar.registerBasicOps(interp, () => msgQueue.dequeue());
        opRegistrar.registerContextOps(interp);
        opRegistrar.registerLLMOps(interp);
        opRegistrar.registerCommandOps(interp);
        opRegistrar.registerIntrospectionOps(interp);
        opRegistrar.registerDiscoveryOps(interp, interp);

        const skillRegistrar = new MeTTaSkillRegistrar(this.agent, this.agentCfg, this._dispatcher, loopState, this.#cap);
        await skillRegistrar.registerAll();

        const skillsCode = await readFile(this.#resolveMettaFile('skills.metta'), 'utf8');
        const loopCode = await readFile(this.#resolveMettaFile('AgentLoop.metta'), 'utf8');
        interp.run(skillsCode);
        interp.run(loopCode);

        const contextBuilder = await this.#maybeInitContextBuilder(loopState, this._dispatcher, interp);
        const harnessOptimizer = await this.#maybeInitHarnessOptimizer(loopState);

        return this.#buildLoop(loopState, budget, msgQueue, contextBuilder, harnessOptimizer);
    }

    #createLoopState() {
        return {
            prevmsg: null, lastresults: [], lastsend: '', error: null,
            cycleCount: 0, wm: [], historyBuffer: [],
            modelOverride: null, modelOverrideCycles: 0
        };
    }

    async #maybeInitContextBuilder(loopState, dispatcher, interp) {
        if (!this.#cap('contextBudgets')) return null;
        const { ContextBuilder } = await loadContextBuilder();
        const introspectionOps = {
            generateManifest: () => {
                if (!this.#cap('runtimeIntrospection')) return '(manifest :restricted true)';
                return JSON.stringify({
                    version: '0.1.0', profile: this.agentCfg.profile ?? 'parity',
                    capabilities: Object.fromEntries(Object.keys(this.agentCfg.capabilities ?? {}).map(k => isEnabled(this.agentCfg, k))),
                    cycleCount: loopState.cycleCount, wmEntries: loopState.wm.length
                }, null, 2);
            }
        };
        const cb = new ContextBuilder(this.agentCfg, this.agent.semanticMemory,
            { getRecent: async n => loopState.historyBuffer.slice(-n) }, dispatcher, introspectionOps, this.agent);
        cb.registerGroundedOps(interp);
        Logger.info('[MeTTaLoopBuilder] ContextBuilder initialized');

        try {
            const { NarsExtension } = await import('../../../metta/src/extensions/NarsExtension.js');
            new NarsExtension(interp, this.agent).register();
        } catch (err) {
            Logger.warn('[MeTTaLoopBuilder] NarsExtension registration failed:', err.message);
        }

        return cb;
    }

    async #maybeInitHarnessOptimizer(loopState) {
        if (!this.#cap('harnessOptimization')) return null;
        const { HarnessOptimizer } = await loadHarnessOptimizer();
        await this._dispatcher._ensureSafetyAndAudit();
        const realAuditSpace = this._dispatcher._auditSpace;
        const auditSpaceWrapper = realAuditSpace ? {
            queryByType: async (type, limit) => realAuditSpace.getRecent(limit, type),
            emitHarnessModified: async (cycle, score) => realAuditSpace.emitHarnessModified(cycle, score)
        } : {
            queryByType: async () => [],
            emitHarnessModified: async (cycle, score) => Logger.info(`[audit] harness-modified cycle=${cycle} score=${score}`)
        };
        const ho = new HarnessOptimizer(this.agentCfg,
            { invoke: async ctx => { const r = await this.agent.ai.generate(ctx); return { response: r.text ?? '', model: 'fallback', latency: 0 }; } },
            auditSpaceWrapper);
        Logger.info('[MeTTaLoopBuilder] HarnessOptimizer initialized with real AuditSpace');
        return ho;
    }

    #buildLoop(loopState, budget, msgQueue, contextBuilder, harnessOptimizer) {
        return async () => {
            Logger.info(`[MeTTa loop] Starting (profile=${this.agentCfg.profile ?? 'parity'})`);
            loopState.cycleCount = 0;
            budget.current = this.#budget;

            while (true) {
                if (budget.current <= 0) {
                    if (!this.#cap('autonomousLoop')) { Logger.info('[MeTTa loop] Budget exhausted, halting.'); break; }
                    budget.current = this.#budget;
                }

                const msg = await msgQueue.dequeue();
                const isNew = msg !== null && msg !== loopState.prevmsg;
                if (isNew) { loopState.prevmsg = msg; budget.current = this.#budget; }
                else budget.current--;

                loopState.wm = (loopState.wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);

                const ctx = await contextBuilder.build(msg, loopState.cycleCount, loopState.wm);
                const resp = await this.#invokeLLM(ctx, loopState);
                const { cmds, error } = this.#parseResponse(resp, loopState);

                let results = [];
                if (cmds.length > 0) {
                    try { results = await this.#executeCommands(cmds, loopState); }
                    catch (err) { Logger.error('[MeTTa execute-commands]', err.message); }
                    loopState.lastresults = results;
                }

                if (this.#cap('persistentHistory')) {
                    loopState.historyBuffer.push([
                        `USER: ${msg ?? '(no input)'}`, `AGENT: ${resp}`,
                        `RESULT: ${JSON.stringify(results)}`
                    ].join('\n'));
                }

                if (this.#cap('auditLog')) {
                    await this._dispatcher._ensureSafetyAndAudit();
                    if (this._dispatcher._auditSpace) {
                        await this._dispatcher._auditSpace.emitCycleAudit(msg, resp, results);
                    }
                }

                if (harnessOptimizer?.shouldOptimize(loopState.cycleCount)) {
                    Logger.info('[MeTTa loop] Running HarnessOptimizer...');
                    const result = await harnessOptimizer.runOptimizationCycle();
                    Logger.info(`[HarnessOptimizer] Result: ${result.reason}`);
                }

                loopState.cycleCount++;
                Logger.debug(`[MeTTa loop] cycle=${loopState.cycleCount} budget=${budget.current}`);
                await new Promise(res => setTimeout(res, this.#sleepMs));
            }
        };
    }

    async #invokeLLM(ctx, loopState) {
        try {
            if (this.#cap('multiModelRouting') && this.agent.modelRouter) {
                let override = 'auto';
                if (loopState.modelOverride && loopState.modelOverrideCycles > 0) {
                    override = loopState.modelOverride;
                    if (--loopState.modelOverrideCycles <= 0) loopState.modelOverride = null;
                }
                const result = await this.agent.modelRouter.invoke(ctx, {}, override);
                loopState.lastsend = result.text ?? '';
                return result.text ?? '';
            }
            const result = await this.agent.ai.generate(ctx);
            loopState.lastsend = result.text ?? '';
            return result.text ?? '';
        } catch (err) {
            Logger.error('[MeTTa invokeLLM]', err.message);
            loopState.error = `llm-error: ${err.message}`;
            return `(llm-error "${err.message.slice(0, 200)}")`;
        }
    }

    #parseResponse(resp, loopState) {
        const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
        if (!this._dispatcher) return { cmds: [], error: 'dispatcher-not-available' };
        const { cmds, error } = this._dispatcher.parseResponse(respStr);
        loopState.error = error;
        return { cmds, error };
    }

    async #executeCommands(cmds, loopState) {
        if (!this._dispatcher) return [];
        try {
            const results = await this._dispatcher.execute(cmds);
            loopState.lastresults = results;
            return results;
        } catch (err) {
            Logger.error('[MeTTa execute-commands]', err.message);
            return [];
        }
    }

    #resolveMettaFile(filename) {
        const direct = resolve(__agentDir, filename);
        const inMetta = resolve(__agentDir, 'metta', filename);
        return existsSync(direct) ? direct : inMetta;
    }
}
