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
        this._llmReady = false;
        this._llmReadyPromise = new Promise(resolve => { this._llmResolve = resolve; });
    }

    /** Call this when LLM warmup completes (background or foreground) */
    resolveLlmReady() {
        this._llmReady = true;
        this._llmResolve?.();
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
        const { ActionDispatcher } = await import('../actions/ActionDispatcher.js');

        const interp = new MeTTaInterpreter();
        this._dispatcher = new ActionDispatcher(this.agentCfg);
        this._dispatcher.loadActionsFromFile(this.#resolveMettaFile('skills.metta'));

        this._loopState = this.#createLoopState();
        const budget = { current: this.#budget };
        const auditSpace = this.#getAuditSpace();

        // Shared services
        const llmInvoker = new LLMInvoker(this.agent, this.agentCfg, this._loopState, this.#cap, auditSpace);
        const narsOps = new NarsOps(this.agent.nar);

        const msgQueue = new AgentMessageQueue(this.agent.embodimentBus, this.#cap);

        // Create ContextBuilder early so op registrar can delegate to it
        // When contextBudgets is disabled, provide a minimal fallback
        const contextBuilder = this.#cap('contextBudgets')
            ? await this.#createContextBuilder(this._loopState, this._dispatcher, interp)
            : this.#minimalContextBuilder();

        const opRegistrar = new MeTTaOpRegistrar(this.agent, this.agentCfg, this._dispatcher, this._loopState, budget, Term, this.#cap, llmInvoker);
        opRegistrar.registerBasicOps(interp, () => msgQueue.dequeue());
        opRegistrar.registerContextOps(interp, contextBuilder);
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

                    // ── Idle cycle ──────────────────────────────────────────
                    if (!msg) {
                        budget.current--;
                        loopState.wm = this.#tickWM(loopState.wm);
                        loopState.cycleCount++;
                        this.#emit('cycle-end', { cycle: loopState.cycleCount, budget: budget.current, error: null });
                        await this.#sleep();
                        continue;
                    }

                    // ── Active cycle ────────────────────────────────────────
                    // Wait for LLM warmup on first message
                    if (!this._llmReady) {
                        Logger.info('[MeTTa] Waiting for LLM warmup...');
                        await this._llmReadyPromise;
                        this._llmReady = true;
                    }

                    const isNew = msg.text !== loopState.prevmsg;
                    loopState.prevmsg = msg.text;
                    loopState.lastmsg = msg;
                    budget.current = isNew ? this.#budget : budget.current - 1;
                    loopState.wm = this.#tickWM(loopState.wm);

                    if (isNew) {
                        Logger.info(`[MeTTa] New message: ${msg.text.substring(0, 120)}`);
                    }

                    // Build context, invoke LLM, parse and execute actions
                    let resp = '';
                    let results = [];
                    try {
                        Logger.info(`[MeTTa] Building context for cycle ${loopState.cycleCount}...`);
                        const ctx = await contextBuilder.build(msg.text, loopState.cycleCount, loopState.wm);
                        Logger.info(`[MeTTa] Context built: ${ctx?.length ?? 0} chars`);
                        Logger.info('[MeTTa] Invoking LLM...');
                        resp = await llmInvoker.invoke(ctx);
                        Logger.info(`[MeTTa] LLM response: ${String(resp).substring(0, 120)}`);
                        const { cmds, error } = this.#parseResponse(resp, loopState);
                        if (cmds.length) {
                            Logger.debug(`[MeTTa] Actions: ${cmds.map(c => c.name).join(', ')}`);
                        } else if (error) {
                            Logger.debug(`[MeTTa] Parse error: ${error}`);
                        }

                        if (cmds.length) {
                            try { results = await this.#executeCommands(cmds, loopState); }
                            catch (err) { Logger.error('[MeTTa execute-commands]', err.message); }
                            loopState.lastresults = results;
                        }

                        // ── Send response back to user ──────────────────────────
                        const responded = results.some(r => r.action === 'respond' && !r.error);
                        if (!responded) {
                            const replyText = this.#extractReplyText(resp, results);
                            if (replyText) {
                                await this.#sendReply(loopState.lastmsg, replyText);
                            }
                        }

                        // ── Post-cycle bookkeeping ──────────────────────────────
                        if (this.#cap('persistentHistory')) {
                            loopState.historyBuffer.push([
                                `USER: ${msg.text}`, `AGENT: ${resp}`,
                                `RESULT: ${JSON.stringify(results)}`
                            ].join('\n'));
                        }

                        if (this.#cap('auditLog')) {
                            await this._dispatcher._ensureSafetyAndAudit();
                            if (this._dispatcher._auditSpace) {
                                await this._dispatcher._auditSpace.emitCycleAudit(msg.text, resp, results);
                            }
                        }

                        if (harnessOptimizer?.shouldOptimize(loopState.cycleCount)) {
                            const result = await harnessOptimizer.runOptimizationCycle();
                            this.#emit('optimization', { cycle: loopState.cycleCount, reason: result.reason });
                        }
                    } catch (err) {
                        Logger.error(`[MeTTa cycle ${loopState.cycleCount}] Error:`, err.message);
                        loopState.error = err.message;
                        loopState.lastresults = [];
                        resp = '';
                        results = [];
                    }

                    loopState.cycleCount++;
                    this.#emit('cycle-end', { cycle: loopState.cycleCount, budget: budget.current, error: loopState.error });

                    await this.#sleep();
                }
            } finally {
                this.#running = false;
                this.#emit('halt', { cycleCount: loopState.cycleCount });
            }
        };
    }

    #tickWM(wm) {
        return (wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);
    }

    #sleep() {
        return new Promise(res => setTimeout(res, this.#sleepMs));
    }

    /**
     * Extract reply text from LLM response and/or action results.
     * Priority: (1) respond action text, (2) result text from any successful action,
     *           (3) response text with JSON stripped.
     */
    #extractReplyText(rawResp, results) {
        // 1. Use successful respond action if present
        const respondResult = results?.find(r => r.action === 'respond' && !r.error);
        if (respondResult?.result?.text) {
            return respondResult.result.text;
        }
        if (respondResult?.result?.sent && respondResult?.result?.text) {
            return respondResult.result.text;
        }

        // 2. Fall back to result text from any successful non-respond action
        for (const r of (results ?? [])) {
            if (!r.error && r.action !== 'respond' && r.action !== 'think') {
                const t = r.result?.text ?? r.result?.response ?? r.result?.answer;
                if (t) return String(t).substring(0, 2000);
            }
        }

        // 3. Strip JSON blocks and common junk prefixes from raw LLM text
        if (!rawResp || typeof rawResp !== 'string') return null;
        const text = rawResp.trim();
        if (!text) return null;
        // Remove JSON blocks
        const stripped = this.#stripJsonBlocks(text);
        // Strip common LLM meta-prefixes
        let cleaned = stripped
            .replace(/^(JSON\s*tool\s*call[:\s]*)+/gi, '')
            .replace(/^(Action[s]?\s*:?\s*)+/gi, '')
            .replace(/^(Response\s*:?\s*)+/gi, '')
            .replace(/^(Output\s*:?\s*)+/gi, '')
            .trim();
        if (!cleaned) return null;
        // Suppress error/sentinel responses
        if (/^\(llm-error|^\(respond-error/i.test(cleaned)) return null;
        return cleaned.length > 2000 ? cleaned.slice(0, 2000) + '...' : cleaned;
    }

    #stripJsonBlocks(text) {
        let result = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '{') {
                // Try to find balanced JSON block
                const end = this.#findJsonBlockEnd(text, i);
                if (end >= 0) {
                    i = end + 1;
                    continue;
                }
            }
            result += text[i];
            i++;
        }
        return result;
    }

    #findJsonBlockEnd(text, start) {
        let depth = 0, inStr = false, escaped = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    async #sendReply(msg, text) {
        const sanitized = this.#sanitizeResponse(text);
        if (!sanitized) {
            Logger.debug(`[MeTTa auto-respond] Suppressed: ${text?.substring(0, 80)}`);
            return;
        }
        const embodiment = this.agent.embodimentBus?.get(msg.embodimentId);
        if (embodiment?.status !== 'connected') {
            Logger.warn(`[MeTTa auto-respond] Not connected: ${msg.embodimentId} (status: ${embodiment?.status ?? 'none'})`);
            return;
        }
        const target = msg.isPrivate ? msg.from : (msg.channel ?? 'default');
        Logger.info(`[MeTTa auto-respond] → ${target}: ${sanitized.substring(0, 80)}`);
        try { await embodiment.sendMessage(target, sanitized); }
        catch (e) { Logger.warn('[MeTTa auto-respond] Send failed:', e.message); }
    }

    #parseResponse(resp, loopState) {
        const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
        if (!this._dispatcher) return { cmds: [], error: 'dispatcher-not-available' };
        const { cmds, error } = this._dispatcher.parseResponse(respStr);
        if (error) {
            loopState.error = `${error}. Respond with JSON: {"actions":[{"name":"respond","args":["answer"]}]}`;
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

    #sanitizeResponse(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('(llm-error') || trimmed.startsWith('(respond-error')) return null;
        const nick = this.agent.agentCfg?.nick ?? this.agent?.agentCfg?.bot?.nick;
        if (nick) {
            const stripped = trimmed.replace(new RegExp(`^\\s*${nick}[,:\\s]+\\s*`, 'i'), '').trim();
            if (!stripped) return null;
            return stripped.length > 2000 ? stripped.slice(0, 2000) + '...' : stripped;
        }
        return trimmed.length > 2000 ? trimmed.slice(0, 2000) + '...' : trimmed;
    }

    /* ── Helpers ───────────────────────────────────────────────────── */

    #createLoopState() {
        return {
            prevmsg: null, lastmsg: null, lastresults: [], lastsend: '', error: null,
            cycleCount: 0, wm: [], historyBuffer: [],
            modelOverride: null, modelOverrideCycles: 0
        };
    }

    #getAuditSpace() {
        return this._dispatcher?._auditSpace ?? null;
    }

    async #createContextBuilder(loopState, dispatcher, interp) {
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

    /**
     * Minimal context builder for when contextBudgets is disabled (e.g., minimal profile).
     * Provides just enough context for the LLM to function — input text and action definitions.
     */
    #minimalContextBuilder() {
        return {
            build: (msg) => {
                const actions = this._dispatcher?.getActiveActionDefs() ?? '(no actions available)';
                return `You are SeNARchy, a helpful AI assistant.\n\n` +
                    `AVAILABLE ACTIONS:\n${actions}\n\n` +
                    `To take actions, respond with JSON: {"actions":[{"name":"action","args":["..."]}]}.\n\n` +
                    `INPUT: ${msg}`;
            }
        };
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
