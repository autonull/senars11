/**
 * MeTTaLoopBuilder.js — SeNARS Agent MeTTa Control Plane
 *
 * Builds and runs the agent's autonomous cognitive loop.
 *
 * Phases: init → register ops → register skills → load MeTTa → build loop → run
 *
 * Architecture:
 *   - LLMInvoker: shared LLM service (no duplication)
 *   - NarsOps: NAL inference grounded ops (|- bridge to NARS)
 *   - ContextBuilder: 12-slot context assembly (single source)
 *   - MeTTaOpRegistrar: grounded op registration
 *   - MeTTaSkillRegistrar: skill handler registration
 *   - AgentMessageQueue: embodiment → loop bridge
 */
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fallbackAgentDir, Logger, resolveWithFallback } from '@senars/core';
import { isEnabled } from '../config/index.js';
import { MeTTaOpRegistrar } from './MeTTaOpRegistrar.js';
import { MeTTaSkillRegistrar } from './MeTTaSkillRegistrar.js';
import { AgentMessageQueue } from './AgentMessageQueue.js';
import { LLMInvoker } from './LLMInvoker.js';
import { NarsOps } from './NarsOps.js';
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
    #running = false;
    #paused = false;
    #pauseResolve = null;
    #events = new Map();

    constructor(agent, agentCfg) {
        this.agent = agent;
        this.agentCfg = agentCfg;
        this.#budget = agentCfg.loop?.budget ?? 50;
        this.#sleepMs = agentCfg.loop?.sleepMs ?? 2000;
        this.#cap = flag => isEnabled(agentCfg, flag);
    }

    /* ── Lifecycle ─────────────────────────────────────────────────── */

    on(event, fn) {
        const fns = this.#events.get(event) ?? [];
        fns.push(fn);
        this.#events.set(event, fns);
    }

    #emit(event, data) {
        for (const fn of this.#events.get(event) ?? []) {
            try { fn(data); } catch (err) { Logger.error(`[loop-event:${event}]`, err.message); }
        }
    }

    pause() {
        if (!this.#running) return;
        this.#paused = true;
        this.#emit('pause', { cycleCount: this._loopState?.cycleCount ?? 0 });
    }

    resume() {
        if (!this.#paused) return;
        this.#paused = false;
        this.#pauseResolve?.();
        this.#pauseResolve = null;
        this.#emit('resume', { cycleCount: this._loopState?.cycleCount ?? 0 });
    }

    stop() {
        this.#running = false;
        this.#paused = false;
        this.#pauseResolve?.();
        this.#emit('stop', { cycleCount: this._loopState?.cycleCount ?? 0 });
    }

    get isRunning() { return this.#running; }
    get isPaused() { return this.#paused; }
    get loopState() { return this._loopState; }
    get dispatcher() { return this._dispatcher; }

    /* ── Build ─────────────────────────────────────────────────────── */

    async build() {
        const { MeTTaInterpreter } = await import('@senars/metta/MeTTaInterpreter.js');
        const { Term } = await import('@senars/metta/kernel/Term.js');
        const { SkillDispatcher } = await import('../skills/SkillDispatcher.js');

        const interp = new MeTTaInterpreter();
        this._dispatcher = new SkillDispatcher(this.agentCfg);
        this._dispatcher.loadSkillsFromFile(this.#resolveMettaFile('skills.metta'));

        this._loopState = this.#createLoopState();
        const budget = { current: this.#budget };
        const auditSpace = this.#getAuditSpace();

        // Shared services
        const llmInvoker = new LLMInvoker(this.agent, this.agentCfg, this._loopState, this.#cap, auditSpace);
        const narsOps = new NarsOps(this.agent.nar);

        const msgQueue = new AgentMessageQueue(this.agent.embodimentBus, this.#cap);

        const opRegistrar = new MeTTaOpRegistrar(this.agent, this.agentCfg, this._dispatcher, this._loopState, budget, Term, this.#cap, llmInvoker);
        opRegistrar.registerBasicOps(interp, () => msgQueue.dequeue());
        opRegistrar.registerContextOps(interp);
        opRegistrar.registerLLMOps(interp);
        opRegistrar.registerCommandOps(interp);
        opRegistrar.registerIntrospectionOps(interp);
        opRegistrar.registerDiscoveryOps(interp, interp);

        // NAL inference grounded ops
        narsOps.register(interp);

        const skillRegistrar = new MeTTaSkillRegistrar(this.agent, this.agentCfg, this._dispatcher, this._loopState, this.#cap);
        await skillRegistrar.registerAll();

        const skillsCode = await readFile(this.#resolveMettaFile('skills.metta'), 'utf8');
        const loopCode = await readFile(this.#resolveMettaFile('AgentLoop.metta'), 'utf8');
        interp.run(skillsCode);
        interp.run(loopCode);

        const contextBuilder = await this.#maybeInitContextBuilder(this._loopState, this._dispatcher, interp);
        const harnessOptimizer = await this.#maybeInitHarnessOptimizer(this._loopState, auditSpace);

        return this.#buildLoop(this._loopState, budget, msgQueue, contextBuilder, harnessOptimizer, llmInvoker);
    }

    /* ── Loop ──────────────────────────────────────────────────────── */

    #buildLoop(loopState, budget, msgQueue, contextBuilder, harnessOptimizer, llmInvoker) {
        return async () => {
            this.#running = true;
            loopState.cycleCount = 0;
            budget.current = this.#budget;
            this.#emit('start', { profile: this.agentCfg.profile ?? 'parity' });

            try {
                while (this.#running) {
                    if (this.#paused) {
                        await new Promise(resolve => { this.#pauseResolve = resolve; });
                    }

                    if (budget.current <= 0) {
                        if (!this.#cap('autonomousLoop')) {
                            this.#emit('budget-exhausted', { cycleCount: loopState.cycleCount });
                            break;
                        }
                        budget.current = this.#budget;
                    }

                    this.#emit('cycle-start', { cycle: loopState.cycleCount, budget: budget.current });

                    const msg = await msgQueue.dequeue();
                    const isNew = msg !== null && msg !== loopState.prevmsg;
                    if (isNew) {
                        loopState.prevmsg = msg;
                        budget.current = this.#budget;
                    } else {
                        budget.current--;
                    }

                    loopState.wm = (loopState.wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);

                    const ctx = await contextBuilder.build(msg, loopState.cycleCount, loopState.wm);
                    const resp = await llmInvoker.invoke(ctx);
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
                        const result = await harnessOptimizer.runOptimizationCycle();
                        this.#emit('optimization', { cycle: loopState.cycleCount, reason: result.reason });
                    }

                    loopState.cycleCount++;
                    this.#emit('cycle-end', { cycle: loopState.cycleCount, budget: budget.current, error });

                    await new Promise(res => setTimeout(res, this.#sleepMs));
                }
            } finally {
                this.#running = false;
                this.#emit('halt', { cycleCount: loopState.cycleCount });
            }
        };
    }

    #parseResponse(resp, loopState) {
        const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
        if (!this._dispatcher) return { cmds: [], error: 'dispatcher-not-available' };
        const { cmds, error } = this._dispatcher.parseResponse(respStr);
        if (error) {
            loopState.error = `${error}. Respond with S-expressions like: (respond "answer") (think "thought")`;
        } else {
            loopState.error = null;
        }
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

    /* ── Helpers ───────────────────────────────────────────────────── */

    #createLoopState() {
        return {
            prevmsg: null, lastresults: [], lastsend: '', error: null,
            cycleCount: 0, wm: [], historyBuffer: [],
            modelOverride: null, modelOverrideCycles: 0
        };
    }

    #getAuditSpace() {
        return this._dispatcher?._auditSpace ?? null;
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
        return cb;
    }

    async #maybeInitHarnessOptimizer(loopState, auditSpace) {
        if (!this.#cap('harnessOptimization')) return null;
        const { HarnessOptimizer } = await loadHarnessOptimizer();
        await this._dispatcher._ensureSafetyAndAudit();
        const realAuditSpace = this._dispatcher._auditSpace;
        const auditWrapper = realAuditSpace ? {
            queryByType: async (type, limit) => realAuditSpace.getRecent(limit, type),
            emitHarnessModified: async (cycle, score) => realAuditSpace.emitHarnessModified(cycle, score)
        } : {
            queryByType: async () => [],
            emitHarnessModified: async (cycle, score) => Logger.info(`[audit] harness-modified cycle=${cycle} score=${score}`)
        };
        const ho = new HarnessOptimizer(this.agentCfg,
            { invoke: async ctx => { const r = await this.agent.ai.generate(ctx); return { response: r.text ?? '', model: 'fallback', latency: 0 }; } },
            auditWrapper);
        return ho;
    }

    #resolveMettaFile(filename) {
        const direct = resolve(__agentDir, filename);
        const inMetta = resolve(__agentDir, 'metta', filename);
        return existsSync(direct) ? direct : inMetta;
    }
}
