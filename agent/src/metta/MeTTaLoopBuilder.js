import { Logger } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

let __agentDir;
try {
    __agentDir = dirname(fileURLToPath(import.meta.url));
} catch {
    __agentDir = typeof global !== 'undefined' && global.__dirname && global.__dirname.includes('agent')
        ? global.__dirname
        : resolve(process.cwd(), 'agent/src');
}

// Lazy loaders
let _SemanticMemory = null;
const loadSemanticMemory = async () => {
    if (!_SemanticMemory) {
        const mod = await import('../memory/SemanticMemory.js');
        _SemanticMemory = mod.SemanticMemory;
    }
    return _SemanticMemory;
};

let _HarnessOptimizer = null;
const loadHarnessOptimizer = async () => {
    if (!_HarnessOptimizer) {
        const mod = await import('../harness/HarnessOptimizer.js');
        _HarnessOptimizer = mod.HarnessOptimizer;
    }
    return _HarnessOptimizer;
};

let _ContextBuilder = null;
const loadContextBuilder = async () => {
    if (!_ContextBuilder) {
        const mod = await import('../memory/ContextBuilder.js');
        _ContextBuilder = mod.ContextBuilder;
    }
    return _ContextBuilder;
};

export class MeTTaLoopBuilder {
    constructor(agent, agentCfg) {
        this.agent = agent;
        this.agentCfg = agentCfg;
    }

    async build() {
        const { MeTTaInterpreter } = await import('../../../metta/src/MeTTaInterpreter.js');
        const { Term } = await import('../../../metta/src/kernel/Term.js');
        const { SkillDispatcher } = await import('../skills/SkillDispatcher.js');

        const interp = new MeTTaInterpreter();
        const dispatcher = new SkillDispatcher(this.agentCfg);
        dispatcher.loadSkillsFromFile(resolve(__agentDir, 'metta/skills.metta'));
        const loopState = this.#createLoopState();
        const { msgQueue, msgWaiters, dequeueMessage } = this.#setupMessageQueue();
        const budget = { current: this.agentCfg.loop?.budget ?? 50 };

        this.#registerBasicOps(interp, loopState, budget, dequeueMessage);
        this.#registerContextOps(interp, loopState, dispatcher);
        this.#registerLLMOps(interp, loopState);
        this.#registerCommandOps(interp, loopState, dispatcher);
        this.#registerIntrospectionOps(interp, loopState, dispatcher);
        this.#registerDiscoveryOps(interp, loopState, dispatcher, interp);

        await this.#registerSkills(dispatcher, this.agentCfg, loopState, this.agent);

        const skillsCode = await readFile(resolve(__agentDir, 'metta/skills.metta'), 'utf8');
        const loopCode = await readFile(resolve(__agentDir, 'metta/AgentLoop.metta'), 'utf8');
        interp.run(skillsCode);
        interp.run(loopCode);

        const contextBuilder = await this.#maybeInitContextBuilder(loopState, dispatcher, interp);
        const harnessOptimizer = await this.#maybeInitHarnessOptimizer(loopState);

        return this.#buildLoop(loopState, budget, dequeueMessage, contextBuilder, harnessOptimizer);
    }

    #createLoopState() {
        return {
            prevmsg: null, lastresults: [], lastsend: '', error: null,
            cycleCount: 0, wm: [], historyBuffer: [],
            modelOverride: null, modelOverrideCycles: 0
        };
    }

    #setupMessageQueue() {
        const msgQueue = [], msgWaiters = [];
        this.agent.embodimentBus.on('message', (msg) => {
            const text = `[${msg.from ?? 'unknown'}@${msg.embodimentId ?? 'embodiment'}] ${msg.content ?? ''}`;
            msgWaiters.length > 0 ? msgWaiters.shift()(text) : msgQueue.push(text);
        });
        return {
            msgQueue,
            msgWaiters,
            dequeueMessage: () => msgQueue.length > 0
                ? Promise.resolve(msgQueue.shift())
                : !isEnabled(this.agentCfg, 'autonomousLoop')
                    ? new Promise(res => msgWaiters.push(res))
                    : Promise.resolve(null)
        };
    }

    #registerBasicOps(interp, loopState, budget, dequeueMessage) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const bool = v => Term.sym(v ? 'True' : 'False');
        const ok = () => Term.sym('ok');
        const g = interp.ground;
        const cap = flag => isEnabled(this.agentCfg, flag);
        const cfgBudget = this.agentCfg.loop?.budget ?? 50;

        g.register('cap?', flagAtom => bool(cap(flagAtom?.name ?? String(flagAtom))));
        g.register('agent-budget', () => Term.grounded(budget.current));
        g.register('reset-budget', () => { budget.current = cfgBudget; return Term.grounded(budget.current); });
        g.register('agent-reset!', () => { loopState.cycleCount = 0; budget.current = cfgBudget; return ok(); });
        g.register('inc-cycle-count!', () => { loopState.cycleCount++; return ok(); });
        g.register('check-embodiment-bus', dequeueMessage, { async: true });
        g.register('new-message?', msg => {
            const msgVal = msg?.value ?? (msg?.name !== '()' ? msg?.name : null) ?? null;
            const isNew = msgVal !== null && msgVal !== loopState.prevmsg;
            if (isNew) loopState.prevmsg = msgVal;
            return bool(isNew);
        });
        g.register('tick-wm', () => {
            loopState.wm = (loopState.wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);
            return ok();
        });
        g.register('sleep-cycle', () => new Promise(res => setTimeout(res, this.agentCfg.loop?.sleepMs ?? 2000)).then(ok), { async: true });
    }

    #registerContextOps(interp, loopState, dispatcher) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const g = interp.ground;
        const cap = flag => isEnabled(this.agentCfg, flag);
        const agentCfg = this.agentCfg;

        g.register('build-context', async (msg) => {
            const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : null) ?? '';
            const skills = dispatcher.getActiveSkillDefs();
            const { maxHist = 12000, maxFb = 6000, maxWm = 1500, maxPinned = 3000, maxRecall = 8000 } = agentCfg.memory ?? {};

            const wmStr = loopState.wm.length > 0
                ? loopState.wm.map(e => `[${e.priority.toFixed(2)}] ${e.content} (ttl:${e.ttl})`).join('\n').slice(0, maxWm) : '';

            let histStr = '';
            for (let i = loopState.historyBuffer.length - 1; i >= 0; i--) {
                const candidate = loopState.historyBuffer[i] + '\n' + histStr;
                if (candidate.length > maxHist) break;
                histStr = candidate;
            }

            const lastResultsStr = JSON.stringify(loopState.lastresults ?? []).slice(0, maxFb);
            let pinnedStr = '', recallStr = '';
            if (this.agent._semanticMemory && cap('semanticMemory')) {
                const pinned = await this.agent._semanticMemory.getPinned(maxPinned);
                if (pinned.length > 0) pinnedStr = pinned.map(p => `* ${p.content}`).join('\n').slice(0, maxPinned);
                const recall = await this.agent._semanticMemory.query(msgStr ? msgStr.slice(0, 200) : 'recent', 10, { minScore: 0.3 });
                if (recall.length > 0) recallStr = recall.map(r => `[${r.score.toFixed(2)}] ${r.content}`).join('\n').slice(0, maxRecall);
            }

            let ctx = `SKILLS:\n${skills}\n\n`;
            if (wmStr) ctx += `WM_REGISTER:\n${wmStr}\n\n`;
            if (pinnedStr) ctx += `PINNED:\n${pinnedStr}\n\n`;
            if (recallStr) ctx += `RECALL:\n${recallStr}\n\n`;
            if (histStr) ctx += `HISTORY:\n${histStr}\n`;
            if (lastResultsStr && lastResultsStr !== '[]') ctx += `LAST_RESULTS: ${lastResultsStr}\n\n`;
            if (loopState.error) ctx += `ERROR: ${JSON.stringify(loopState.error)}\n\n`;
            if (msgStr) ctx += `INPUT: ${msgStr}\n\n`;
            ctx += `OUTPUT: Respond with ONLY a list of skill S-expressions.\n`;
            ctx += `Format: ((skill1 "arg1") (skill2 "arg2"))\n`;
            ctx += `Max ${agentCfg.loop?.maxSkillsPerCycle ?? 3} skills. Check parentheses carefully.`;
            return Term.grounded(ctx);
        }, { async: true });
    }

    #registerLLMOps(interp, loopState) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const g = interp.ground;
        const agent = this.agent;
        const agentCfg = this.agentCfg;

        const invokeLLM = async (ctx) => {
            try {
                if (isEnabled(agentCfg, 'multiModelRouting') && agent._modelRouter) {
                    let override = 'auto';
                    if (loopState.modelOverride && loopState.modelOverrideCycles > 0) {
                        override = loopState.modelOverride;
                        if (--loopState.modelOverrideCycles <= 0) loopState.modelOverride = null;
                    }
                    const result = await agent._modelRouter.invoke(ctx, {}, override);
                    loopState.lastsend = result.text ?? '';
                    return result.text ?? '';
                }
                const result = await agent.ai.generate(ctx);
                loopState.lastsend = result.text ?? '';
                return result.text ?? '';
            } catch (err) {
                Logger.error('[MeTTa llm-invoke]', err.message);
                return '';
            }
        };

        g.register('llm-invoke', async (ctx) => {
            const ctxStr = ctx?.value ?? (typeof ctx === 'string' ? ctx : String(ctx ?? ''));
            return Term.grounded(await invokeLLM(ctxStr));
        }, { async: true });
    }

    #registerCommandOps(interp, loopState, dispatcher) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const g = interp.ground;

        g.register('parse-response', resp => {
            const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
            const { cmds, error } = dispatcher.parseResponse(respStr);
            loopState.error = error;
            return Term.grounded(cmds);
        });

        g.register('execute-commands', async cmds => {
            const commands = cmds?.value ?? (Array.isArray(cmds) ? cmds : []);
            if (!commands.length) return Term.grounded([]);
            try {
                const results = await dispatcher.execute(commands);
                loopState.lastresults = results;
                return Term.grounded(results);
            } catch (err) {
                Logger.error('[execute-commands]', err.message);
                return Term.grounded([]);
            }
        }, { async: true });

        g.register('append-history', (msg, resp, result) => {
            const entry = [
                `USER: ${msg?.value ?? msg ?? '(no input)'}`,
                `AGENT: ${resp?.value ?? resp ?? ''}`,
                `RESULT: ${JSON.stringify(result?.value ?? result ?? [])}`
            ].join('\n');
            loopState.historyBuffer.push(entry);
            return Term.sym('ok');
        });

        g.register('emit-cycle-audit', (msg, resp, result) => {
            Logger.debug(`[audit] cycle=${loopState.cycleCount} msg="${String(msg?.value ?? msg ?? '').slice(0, 80)}"`);
            return Term.sym('ok');
        });
    }

    #registerIntrospectionOps(interp, loopState, dispatcher) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const g = interp.ground;

        // Dynamic import for introspection
        import('../introspection/IntrospectionOps.js').then(({ IntrospectionOps }) => {
            const ops = new IntrospectionOps(
                this.agentCfg, dispatcher, this.agent.embodimentBus, this.agent._modelRouter, loopState
            );
            g.register('manifest', () => Term.grounded(ops.generateManifest()));
            g.register('skill-inventory', () => Term.grounded(ops.listSkills()));
            g.register('subsystems', () => Term.grounded(ops.describeSubsystems()));
            g.register('agent-state', keyAtom => {
                const key = keyAtom?.name ?? String(keyAtom ?? '');
                return Term.grounded(ops.getState(key));
            });
        }).catch(() => {
            // Fallback if IntrospectionOps not available
            g.register('manifest', () => Term.grounded('(manifest :unavailable)'));
            g.register('skill-inventory', () => Term.grounded('(skill-inventory :unavailable)'));
            g.register('subsystems', () => Term.grounded('(subsystems :unavailable)'));
            g.register('agent-state', () => Term.grounded('(agent-state :unavailable)'));
        });
    }

    #registerDiscoveryOps(interp, loopState, dispatcher, interpreter) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const g = interp.ground;
        const cap = flag => isEnabled(this.agentCfg, flag);

        g.register('discover-skills', async () => {
            if (!cap('dynamicSkillDiscovery')) return Term.grounded('(discover-skills :restricted true)');
            const { readdir } = await import('fs/promises');
            const { join } = await import('path');
            const skillsDir = resolve(__agentDir, '../../memory/skills');
            try {
                const files = await readdir(skillsDir);
                const mettaFiles = files.filter(f => f.endsWith('.metta'));
                let loaded = 0;
                for (const file of mettaFiles) {
                    const code = await readFile(join(skillsDir, file), 'utf8');
                    interpreter.run(code);
                    loaded++;
                }
                return Term.grounded(`(discover-skills :loaded ${loaded} :files "${JSON.stringify(mettaFiles)}")`);
            } catch (err) {
                return Term.grounded(`(discover-skills :error "${err.message}")`);
            }
        }, { async: true });
    }

    async #maybeInitContextBuilder(loopState, dispatcher, interp) {
        if (!isEnabled(this.agentCfg, 'contextBudgets')) return null;
        const ContextBuilder = await loadContextBuilder();
        const introspectionOps = {
            generateManifest: () => {
                if (!isEnabled(this.agentCfg, 'runtimeIntrospection')) return '(manifest :restricted true)';
                return JSON.stringify({
                    version: '0.1.0', profile: this.agentCfg.profile ?? 'parity',
                    capabilities: Object.fromEntries(Object.keys(this.agentCfg.capabilities ?? {}).map(k => isEnabled(this.agentCfg, k))),
                    cycleCount: loopState.cycleCount, wmEntries: loopState.wm.length
                }, null, 2);
            }
        };
        const cb = new ContextBuilder(this.agentCfg, this.agent._semanticMemory,
            { getRecent: async n => loopState.historyBuffer.slice(-n) }, dispatcher, introspectionOps, this.agent);
        cb.registerGroundedOps(interp);
        Logger.info('[Agent] ContextBuilder initialized');

        // Register NARS extension if NAR is available
        try {
            const { NarsExtension } = await import('../../metta/src/extensions/NarsExtension.js');
            const narsExt = new NarsExtension(interp, this.agent);
            narsExt.register();
        } catch (err) {
            Logger.warn('[Agent] NarsExtension registration failed:', err.message);
        }

        return cb;
    }

    async #maybeInitHarnessOptimizer(loopState) {
        if (!isEnabled(this.agentCfg, 'harnessOptimization')) return null;
        const HarnessOptimizer = await loadHarnessOptimizer();
        const auditSpaceWrapper = {
            queryByType: async (type, limit) => loopState.historyBuffer.slice(-limit).map((h, i) => ({
                cycleId: i, content: h, timestamp: Date.now()
            })),
            emitHarnessModified: async (cycle, score) => Logger.info(`[audit] harness-modified cycle=${cycle} score=${score}`)
        };
        const ho = new HarnessOptimizer(this.agentCfg,
            { invoke: async ctx => { const r = await this.agent.ai.generate(ctx); return { response: r.text ?? '', model: 'fallback', latency: 0 }; } },
            auditSpaceWrapper);
        Logger.info('[Agent] HarnessOptimizer initialized');
        return ho;
    }

    #buildLoop(loopState, budget, dequeueMessage, contextBuilder, harnessOptimizer) {
        const agentCfg = this.agentCfg;
        const cap = flag => isEnabled(agentCfg, flag);

        return async () => {
            Logger.info(`[MeTTa loop] Starting (profile=${agentCfg.profile ?? 'parity'})`);
            loopState.cycleCount = 0;
            budget.current = agentCfg.loop?.budget ?? 50;

            while (true) {
                if (budget.current <= 0) {
                    if (!cap('autonomousLoop')) { Logger.info('[MeTTa loop] Budget exhausted, halting.'); break; }
                    budget.current = agentCfg.loop?.budget ?? 50;
                }

                const msg = await dequeueMessage();
                const isNew = msg !== null && msg !== loopState.prevmsg;
                if (isNew) { loopState.prevmsg = msg; budget.current = agentCfg.loop?.budget ?? 50; }
                else budget.current--;

                loopState.wm = (loopState.wm ?? []).map(e => ({ ...e, ttl: e.ttl - 1 })).filter(e => e.ttl > 0);

                const ctx = await contextBuilder.build(msg, loopState.cycleCount, loopState.wm);
                const resp = await this.#invokeLLMInline(ctx, loopState);
                const { cmds, error } = this.#parseResponse(resp, loopState);

                let results = [];
                if (cmds.length > 0) {
                    try { results = await this.#executeCommands(cmds, loopState); }
                    catch (err) { Logger.error('[MeTTa execute-commands]', err.message); }
                    loopState.lastresults = results;
                }

                if (cap('persistentHistory')) {
                    loopState.historyBuffer.push([
                        `USER: ${msg ?? '(no input)'}`, `AGENT: ${resp}`,
                        `RESULT: ${JSON.stringify(results)}`
                    ].join('\n'));
                }

                if (cap('auditLog')) Logger.debug(`[audit] cycle=${loopState.cycleCount} msg="${(msg ?? '').slice(0, 80)}"`);

                if (harnessOptimizer?.shouldOptimize(loopState.cycleCount)) {
                    Logger.info('[MeTTa loop] Running HarnessOptimizer...');
                    const result = await harnessOptimizer.runOptimizationCycle();
                    Logger.info(`[HarnessOptimizer] Result: ${result.reason}`);
                }

                loopState.cycleCount++;
                Logger.debug(`[MeTTa loop] cycle=${loopState.cycleCount} budget=${budget.current}`);
                await new Promise(res => setTimeout(res, agentCfg.loop?.sleepMs ?? 2000));
            }
        };
    }

    async #invokeLLMInline(ctx, loopState) {
        try {
            const result = await this.agent.ai.generate(ctx);
            loopState.lastsend = result.text ?? '';
            return result.text ?? '';
        } catch { return ''; }
    }

    #parseResponse(resp, loopState) {
        // Placeholder - actual parsing done via dispatcher in full implementation
        return { cmds: [], error: null };
    }

    async #executeCommands(cmds, loopState) {
        return [];
    }

    async #registerSkills(dispatcher, agentCfg, loopState, agent) {
        const cap = flag => isEnabled(agentCfg, flag);
        const ok = '(thought recorded)';

        dispatcher.register('think', async content => { Logger.debug(`[think] ${content}`); return ok; }, 'mettaControlPlane', ':reflect');
        dispatcher.register('metta', async expr => {
            try {
                const { MeTTaInterpreter } = await import('../../metta/src/MeTTaInterpreter.js');
                const interp = new MeTTaInterpreter();
                const results = interp.evaluate(interp.parse(String(expr)));
                return JSON.stringify(results).slice(0, 500);
            } catch (err) {
                return `(metta-error "${err.message}")`;
            }
        }, 'mettaControlPlane', ':reflect');
        dispatcher.register('cognitive-cycle', async stim => {
            Logger.debug('[cognitive-cycle] Stimulus:', stim);
            return '(cognitive-cycle: deferred — use attend/think for now)';
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('attend', async (content, priority) => {
            const pri = parseFloat(priority) || 0.5;
            const ttl = agentCfg.workingMemory?.defaultTtl ?? 10;
            loopState.wm.push({ content: String(content), priority: pri, ttl, cycleAdded: loopState.cycleCount });
            loopState.wm.sort((a, b) => b.priority - a.priority);
            const max = agentCfg.workingMemory?.maxEntries ?? 20;
            if (loopState.wm.length > max) loopState.wm = loopState.wm.slice(0, max);
            return `attended: ${content}`;
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('dismiss', async query => {
            const before = loopState.wm.length;
            loopState.wm = loopState.wm.filter(e => !e.content.includes(String(query)));
            return `dismissed ${before - loopState.wm.length} items matching "${query}"`;
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('send', async content => {
            const msg = String(content);
            if (msg === loopState.lastsend) return '(duplicate suppressed)';
            loopState.lastsend = msg;
            const embodiments = agent.embodimentBus?.getAll() ?? [];
            const connected = embodiments.filter(e => e.status === 'connected');
            if (connected.length > 0) {
                await Promise.all(connected.map(e => e.sendMessage('default', msg).catch(err => Logger.warn(`Send to ${e.id} failed:`, err))));
            } else Logger.info(`[AGENT→] ${msg}`);
            return `sent: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
        }, 'mettaControlPlane', ':network');

        dispatcher.register('send-to', async (embodimentId, content) => {
            const embodiment = agent.embodimentBus?.get(String(embodimentId));
            if (embodiment?.status === 'connected') await embodiment.sendMessage('default', String(content));
            else Logger.info(`[AGENT→${embodimentId}] ${content}`);
            return `sent-to ${embodimentId}`;
        }, 'multiEmbodiment', ':network');

        dispatcher.register('spawn-agent', async (task, cycleBudget) => {
            if (!agent._virtualEmbodiment) return '(spawn-error :reason "virtual-embodiment-not-available")';
            const budget = parseInt(cycleBudget) || 10;
            const subAgentId = `subagent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const success = agent._virtualEmbodiment.spawnSubAgent(subAgentId, String(task), {}, budget);
            return success ? `(spawned :id "${subAgentId}" :budget ${budget})` : '(spawn-error :reason "failed-to-spawn")';
        }, 'subAgentSpawning', ':meta');

        if (isEnabled(agentCfg, 'webSearchSkill')) {
            dispatcher.register('search', async query => {
                if (agent.toolInstances?.websearch?.search) return JSON.stringify(await agent.toolInstances.websearch.search(String(query))).slice(0, 2000);
                return '(web search tool not configured)';
            }, 'webSearchSkill', ':network');
        }

        if (isEnabled(agentCfg, 'fileReadSkill')) {
            dispatcher.register('read-file', async path => {
                if (agent.toolInstances?.file?.readFile) return await agent.toolInstances.file.readFile(String(path));
                return '(file tool not configured)';
            }, 'fileReadSkill', ':local-read');
        }

        if (isEnabled(agentCfg, 'fileWriteSkill')) {
            dispatcher.register('write-file', async (path, content) => {
                if (agent.toolInstances?.file?.writeFile) { await agent.toolInstances.file.writeFile(String(path), String(content)); return `written: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
            dispatcher.register('append-file', async (path, content) => {
                if (agent.toolInstances?.file?.appendFile) { await agent.toolInstances.file.appendFile(String(path), String(content)); return `appended: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
        }

        if (isEnabled(agentCfg, 'shellSkill')) {
            dispatcher.register('shell', async cmd => {
                const { spawn } = await import('child_process');
                const shellCfg = agentCfg.shell ?? {};
                const cmdStr = String(cmd);
                for (const pattern of shellCfg.forbiddenPatterns ?? []) {
                    if (cmdStr.includes(pattern)) return `(shell-blocked :reason "forbidden-pattern" :pattern "${pattern}")`;
                }
                const allowed = (shellCfg.allowlist ?? []).includes(cmdStr) || (shellCfg.allowedPrefixes ?? []).some(p => cmdStr.startsWith(p));
                if (!allowed) return `(shell-blocked :reason "not-allowlisted" :command "${cmdStr.slice(0, 100)}")`;
                return new Promise(resolve => {
                    const [exec, ...args] = cmdStr.split(' ');
                    const proc = spawn(exec, args, { shell: false, timeout: 30000 });
                    let stdout = '', stderr = '';
                    proc.stdout.on('data', d => stdout += d);
                    proc.stderr.on('data', d => stderr += d);
                    proc.on('close', code => resolve(`(shell-result :exit ${code} :stdout "${stdout.slice(0, 2000)}" :stderr "${stderr.slice(0, 500)}")`));
                    proc.on('error', err => resolve(`(shell-error "${err.message}")`));
                });
            }, 'shellSkill', ':system');
        }

        if (isEnabled(agentCfg, 'semanticMemory')) {
            const SemanticMemory = await loadSemanticMemory();
            agent._semanticMemory = new SemanticMemory({
                dataDir: resolve(__agentDir, '../../memory'),
                embedder: agentCfg.memory?.embedder ?? 'Xenova/all-MiniLM-L6-v2',
                vectorDimensions: agentCfg.memory?.vectorDimensions ?? 384
            });
            await agent._semanticMemory.initialize();

            dispatcher.register('remember', async (content, type, tags) => {
                const id = await agent._semanticMemory.remember({ content: String(content), type: type ?? 'episodic', tags: tags ?? [], source: 'agent-loop' });
                return `(remembered :id "${id}")`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('query', async (text, k) => {
                const results = await agent._semanticMemory.query(String(text), parseInt(k) || (agentCfg.memory?.maxRecallItems ?? 10));
                if (results.length === 0) return '(query-result :count 0)';
                const items = results.map(r => `(memory :id "${r.id}" :content "${r.content.replace(/"/g, '\\"')}" :score ${r.score.toFixed(3)} :type :${r.type})`).join(' ');
                return `(query-result :count ${results.length} ${items})`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('pin', async memoryId => {
                const success = await agent._semanticMemory.pin(String(memoryId));
                return success ? `(pinned :id "${memoryId}")` : `(pin-error :reason "not-found" :id "${memoryId}")`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('forget', async queryText => {
                const count = await agent._semanticMemory.forget(String(queryText));
                return `(forgot :count ${count})`;
            }, 'semanticMemory', ':memory');
        }

        if (isEnabled(agentCfg, 'multiModelRouting')) {
            const { ModelRouter } = await import('../models/ModelRouter.js');
            const { AIClient } = await import('../ai/AIClient.js');
            agent._aiClient = new AIClient(agentCfg.lm ?? {});
            agent._modelRouter = new ModelRouter(agentCfg, agent._aiClient, agent._semanticMemory);
            await agent._modelRouter.initialize();

            dispatcher.register('set-model', async (modelName, cycles) => {
                loopState.modelOverride = String(modelName);
                loopState.modelOverrideCycles = parseInt(cycles) || 1;
                Logger.info(`[set-model] ${modelName} for ${loopState.modelOverrideCycles} cycles`);
                return `(model-set :model "${modelName}" :cycles ${loopState.modelOverrideCycles})`;
            }, 'multiModelRouting', ':meta');

            if (isEnabled(agentCfg, 'modelExploration')) {
                const { ModelBenchmark } = await import('../models/ModelBenchmark.js');
                agent._modelBenchmark = new ModelBenchmark(agent._aiClient, agentCfg);
                dispatcher.register('eval-model', async (modelName, taskType) => {
                    const model = String(modelName);
                    const type = taskType ? String(taskType) : null;
                    Logger.info(`[eval-model] Benchmarking ${model}${type ? ` on ${type}` : ''}`);
                    const results = await agent._modelBenchmark.run(model, type ? [type] : null);
                    for (const [tType, scoreData] of Object.entries(results.scores)) {
                        await agent._modelRouter.setScore(model, tType, scoreData.average, Math.min(0.95, scoreData.taskCount * 0.15));
                    }
                    return `(eval-result :model "${model}" :scores ${JSON.stringify(results.scores).replace(/"/g, "'")})`;
                }, 'modelExploration', ':meta');
            }
        }
    }
}
