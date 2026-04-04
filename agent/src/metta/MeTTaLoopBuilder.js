import { readFile, readdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback, fallbackAgentDir } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

const lazyImport = (cache, key, importFn) => async () => {
    if (!cache[key]) cache[key] = await importFn();
    return cache[key];
};

const _lazyCache = {};
const loadSemanticMemory = lazyImport(_lazyCache, 'SemanticMemory', () => import('../memory/SemanticMemory.js'));
const loadHarnessOptimizer = lazyImport(_lazyCache, 'HarnessOptimizer', () => import('../harness/HarnessOptimizer.js'));
const loadContextBuilder = lazyImport(_lazyCache, 'ContextBuilder', () => import('../memory/ContextBuilder.js'));

export class MeTTaLoopBuilder {
    #budget;
    #sleepMs;

    constructor(agent, agentCfg) {
        this.agent = agent;
        this.agentCfg = agentCfg;
        this.#budget = agentCfg.loop?.budget ?? 50;
        this.#sleepMs = agentCfg.loop?.sleepMs ?? 2000;
    }

    async build() {
        const { MeTTaInterpreter } = await import('../../../metta/src/MeTTaInterpreter.js');
        const { SkillDispatcher } = await import('../skills/SkillDispatcher.js');

        const interp = new MeTTaInterpreter();
        this._dispatcher = new SkillDispatcher(this.agentCfg);
        this._dispatcher.loadSkillsFromFile(resolve(__agentDir, 'metta/skills.metta'));
        const loopState = this.#createLoopState();
        const { msgQueue, msgWaiters, dequeueMessage } = this.#setupMessageQueue();
        const budget = { current: this.#budget };

        this.#registerBasicOps(interp, loopState, budget, dequeueMessage);
        this.#registerContextOps(interp, loopState, this._dispatcher);
        this.#registerLLMOps(interp, loopState);
        this.#registerCommandOps(interp, loopState, this._dispatcher);
        this.#registerIntrospectionOps(interp, loopState, this._dispatcher);
        this.#registerDiscoveryOps(interp, loopState, this._dispatcher, interp);

        await this.#registerSkills(this._dispatcher, this.agentCfg, loopState, this.agent);

        const skillsCode = await readFile(resolve(__agentDir, 'metta/skills.metta'), 'utf8');
        const loopCode = await readFile(resolve(__agentDir, 'metta/AgentLoop.metta'), 'utf8');
        interp.run(skillsCode);
        interp.run(loopCode);

        const contextBuilder = await this.#maybeInitContextBuilder(loopState, this._dispatcher, interp);
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
        this.agent.embodimentBus.on('message', msg => {
            const text = `[${msg.from ?? 'unknown'}@${msg.embodimentId ?? 'embodiment'}] ${msg.content ?? ''}`;
            msgWaiters.length > 0 ? msgWaiters.shift()(text) : msgQueue.push(text);
        });
        return {
            msgQueue, msgWaiters,
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

        g.register('cap?', flagAtom => bool(cap(flagAtom?.name ?? String(flagAtom))));
        g.register('agent-budget', () => Term.grounded(budget.current));
        g.register('reset-budget', () => { budget.current = this.#budget; return Term.grounded(budget.current); });
        g.register('agent-reset!', () => { loopState.cycleCount = 0; budget.current = this.#budget; return ok(); });
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
        g.register('sleep-cycle', () => new Promise(res => setTimeout(res, this.#sleepMs)).then(ok), { async: true });
    }

    #registerContextOps(interp, loopState, dispatcher) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const cap = flag => isEnabled(this.agentCfg, flag);

        interp.ground.register('build-context', async msg => {
            const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : null) ?? '';
            const skills = dispatcher.getActiveSkillDefs();
            const { maxHist = 12000, maxFb = 6000, maxWm = 1500, maxPinned = 3000, maxRecall = 8000 } = this.agentCfg.memory ?? {};

            const wmStr = loopState.wm.length > 0
                ? loopState.wm.map(e => `[${e.priority.toFixed(2)}] ${e.content} (ttl:${e.ttl})`).join('\n').slice(0, maxWm)
                : '';

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
            ctx += `Max ${this.agentCfg.loop?.maxSkillsPerCycle ?? 3} skills. Check parentheses carefully.`;
            return Term.grounded(ctx);
        }, { async: true });
    }

    #registerLLMOps(interp, loopState) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const agent = this.agent;
        const agentCfg = this.agentCfg;

        const invokeLLM = async ctx => {
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
                loopState.error = `llm-error: ${err.message}`;
                return `(llm-error "${err.message.slice(0, 200)}")`;
            }
        };

        interp.ground.register('llm-invoke', async ctx => {
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
                Logger.error('[execute-commands]', err);
                return Term.grounded([]);
            }
        }, { async: true });

        g.register('append-history', (msg, resp, result) => {
            loopState.historyBuffer.push([
                `USER: ${msg?.value ?? msg ?? '(no input)'}`,
                `AGENT: ${resp?.value ?? resp ?? ''}`,
                `RESULT: ${JSON.stringify(result?.value ?? result ?? [])}`
            ].join('\n'));
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

        import('../introspection/IntrospectionOps.js').then(({ IntrospectionOps }) => {
            const ops = new IntrospectionOps(
                this.agentCfg, dispatcher, this.agent.embodimentBus, this.agent._modelRouter, loopState
            );
            g.register('manifest', () => Term.grounded(ops.generateManifest()));
            g.register('skill-inventory', () => Term.grounded(ops.listSkills()));
            g.register('subsystems', () => Term.grounded(ops.describeSubsystems()));
            g.register('agent-state', keyAtom => Term.grounded(ops.getState(keyAtom?.name ?? String(keyAtom ?? ''))));
        }).catch(err => {
            Logger.warn('[MeTTaLoopBuilder] IntrospectionOps unavailable:', err.message);
            g.register('manifest', () => Term.grounded('(manifest :unavailable)'));
            g.register('skill-inventory', () => Term.grounded('(skill-inventory :unavailable)'));
            g.register('subsystems', () => Term.grounded('(subsystems :unavailable)'));
            g.register('agent-state', () => Term.grounded('(agent-state :unavailable)'));
        });
    }

    #registerDiscoveryOps(interp, loopState, dispatcher, interpreter) {
        const { Term } = interp.ground.constructor.prototype.constructor;
        const cap = flag => isEnabled(this.agentCfg, flag);
        const g = interp.ground;

        g.register('discover-skills', async () => {
            if (!cap('dynamicSkillDiscovery')) return Term.grounded('(discover-skills :restricted true)');
            const skillsDir = resolve(__agentDir, '../../memory/skills');
            try {
                const files = (await readdir(skillsDir)).filter(f => f.endsWith('.metta'));
                let loaded = 0;
                for (const file of files) {
                    interpreter.run(await readFile(join(skillsDir, file), 'utf8'));
                    loaded++;
                }
                return Term.grounded(`(discover-skills :loaded ${loaded} :files "${JSON.stringify(files)}")`);
            } catch (err) {
                return Term.grounded(`(discover-skills :error "${err.message}")`);
            }
        }, { async: true });
    }

    async #maybeInitContextBuilder(loopState, dispatcher, interp) {
        if (!isEnabled(this.agentCfg, 'contextBudgets')) return null;
        const { ContextBuilder } = await loadContextBuilder();
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
        if (!isEnabled(this.agentCfg, 'harnessOptimization')) return null;
        const { HarnessOptimizer } = await loadHarnessOptimizer();
        const auditSpaceWrapper = {
            queryByType: async (type, limit) => loopState.historyBuffer.slice(-limit).map((h, i) => ({
                cycleId: i, content: h, timestamp: Date.now()
            })),
            emitHarnessModified: async (cycle, score) => Logger.info(`[audit] harness-modified cycle=${cycle} score=${score}`)
        };
        const ho = new HarnessOptimizer(this.agentCfg,
            { invoke: async ctx => { const r = await this.agent.ai.generate(ctx); return { response: r.text ?? '', model: 'fallback', latency: 0 }; } },
            auditSpaceWrapper);
        Logger.info('[MeTTaLoopBuilder] HarnessOptimizer initialized');
        return ho;
    }

    #buildLoop(loopState, budget, dequeueMessage, contextBuilder, harnessOptimizer) {
        const agentCfg = this.agentCfg;
        const cap = flag => isEnabled(agentCfg, flag);

        return async () => {
            Logger.info(`[MeTTa loop] Starting (profile=${agentCfg.profile ?? 'parity'})`);
            loopState.cycleCount = 0;
            budget.current = this.#budget;

            while (true) {
                if (budget.current <= 0) {
                    if (!cap('autonomousLoop')) { Logger.info('[MeTTa loop] Budget exhausted, halting.'); break; }
                    budget.current = this.#budget;
                }

                const msg = await dequeueMessage();
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
                    catch (err) { Logger.error('[MeTTa execute-commands]', err); }
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
                await new Promise(res => setTimeout(res, this.#sleepMs));
            }
        };
    }

    async #invokeLLM(ctx, loopState) {
        try {
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
            Logger.error('[MeTTa execute-commands]', err);
            return [];
        }
    }

    async #registerSkills(dispatcher, agentCfg, loopState, agent) {
        const cap = flag => isEnabled(agentCfg, flag);
        const ok = '(thought recorded)';

        dispatcher.register('think', async content => { Logger.debug(`[think] ${content}`); return ok; }, 'mettaControlPlane', ':reflect');
        dispatcher.register('metta', async expr => {
            try {
                const { MeTTaInterpreter } = await import('../../../metta/src/MeTTaInterpreter.js');
                const interp = new MeTTaInterpreter();
                return JSON.stringify(interp.evaluate(interp.parse(String(expr)))).slice(0, 500);
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
            if (loopState.wm.length > (agentCfg.workingMemory?.maxEntries ?? 20)) loopState.wm = loopState.wm.slice(0, agentCfg.workingMemory?.maxEntries ?? 20);
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
            const connected = (agent.embodimentBus?.getAll() ?? []).filter(e => e.status === 'connected');
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
            const subAgentId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const success = agent._virtualEmbodiment.spawnSubAgent(subAgentId, String(task), {}, budget);
            return success ? `(spawned :id "${subAgentId}" :budget ${budget})` : '(spawn-error :reason "failed-to-spawn")';
        }, 'subAgentSpawning', ':meta');

        if (cap('webSearchSkill')) {
            dispatcher.register('search', async query => {
                if (agent.toolInstances?.websearch?.search) return JSON.stringify(await agent.toolInstances.websearch.search(String(query))).slice(0, 2000);
                return '(web search tool not configured)';
            }, 'webSearchSkill', ':network');
        }

        if (cap('fileReadSkill')) {
            dispatcher.register('read-file', async path => {
                if (agent.toolInstances?.file?.readFile) return await agent.toolInstances.file.readFile(String(path));
                return '(file tool not configured)';
            }, 'fileReadSkill', ':local-read');
        }

        if (cap('fileWriteSkill')) {
            dispatcher.register('write-file', async (path, content) => {
                if (agent.toolInstances?.file?.writeFile) { await agent.toolInstances.file.writeFile(String(path), String(content)); return `written: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
            dispatcher.register('append-file', async (path, content) => {
                if (agent.toolInstances?.file?.appendFile) { await agent.toolInstances.file.appendFile(String(path), String(content)); return `appended: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
        }

        if (cap('shellSkill')) {
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

        if (cap('semanticMemory')) {
            const { SemanticMemory } = await loadSemanticMemory();
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

        if (cap('goalPursuit')) {
            dispatcher.register('nar-goal-add', async (content, priority) => {
                const term = String(content);
                const pri = parseFloat(priority) || 0.5;
                agent.nar._taskManager.createGoal(term, null, { priority: pri });
                return `(goal-added "${term.slice(0, 100)}")`;
            }, 'goalPursuit', ':meta');

            dispatcher.register('nar-goal-complete', async goalId => {
                const goals = agent.nar._taskManager.findTasksByType('GOAL');
                const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
                if (goal) { agent.nar._taskManager.removeTask(goal); return `(goal-completed "${goalId}")`; }
                return `(goal-not-found "${goalId}")`;
            }, 'goalPursuit', ':meta');

            dispatcher.register('nar-goal-status', async goalId => {
                const goals = agent.nar._taskManager.findTasksByType('GOAL');
                const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
                return goal ? `(goal-status :id "${goalId}" :priority ${goal.priority?.toFixed(2) ?? 'unknown'})` : `(goal-not-found "${goalId}")`;
            }, 'goalPursuit', ':meta');

            dispatcher.register('nar-goals', async filter => {
                const goals = agent.nar._taskManager.findTasksByType('GOAL');
                const count = goals.length;
                const list = goals.slice(0, 10).map(g => `"${g.term?.toString?.().slice(0, 80) ?? 'unknown'}"`).join(' ');
                return `(goals :count ${count} :items ${list || '()'})`;
            }, 'goalPursuit', ':meta');
        }

        if (cap('coordinatorMode')) {
            dispatcher.register('nar-focus-sets', async () => {
                const stats = agent.nar._focus?.getStats() ?? {};
                const sets = Object.keys(stats.focusSets ?? {});
                return `(focus-sets :count ${sets.length} :names ${JSON.stringify(sets).replace(/"/g, "'")})`;
            }, 'coordinatorMode', ':meta');

            dispatcher.register('nar-focus-create', async name => {
                agent.nar._focus?.createFocusSet(String(name), 20);
                return `(focus-created "${name}")`;
            }, 'coordinatorMode', ':meta');

            dispatcher.register('nar-focus-switch', async name => {
                const success = agent.nar._focus?.setFocus(String(name)) ?? false;
                return success ? `(focus-switched "${name}")` : `(focus-switch-failed "${name}")`;
            }, 'coordinatorMode', ':meta');
        }

        if (cap('separateEvaluator')) {
            dispatcher.register('nar-revision', async (term, evidence) => {
                const { Truth } = await import('../../../nar/src/Truth.js');
                const beliefs = agent.nar.memory?.getBeliefsByTerm?.(String(term)) ?? [];
                if (beliefs.length === 0) return `(revision-error :reason "no-beliefs-for-term" :term "${term}")`;
                const evTruth = evidence?.value ?? evidence;
                const revised = Truth.revision(beliefs[0].truth, evTruth);
                return `(revised :term "${term}" :f ${revised.f.toFixed(3)} :c ${revised.c.toFixed(3)})`;
            }, 'separateEvaluator', ':meta');
        }

        if (cap('memoryConsolidation')) {
            dispatcher.register('consolidate', async () => {
                const result = agent.nar.memory?.consolidate?.();
                return result ? `(consolidated :concepts-removed ${result.conceptsRemoved ?? 0} :decayed ${result.conceptsDecayed ?? 0})` : '(consolidation-not-available)';
            }, 'memoryConsolidation', ':meta');
        }

        if (cap('selfModifyingSkills')) {
            dispatcher.register('add-skill', async skillDef => {
                const { appendFile } = await import('fs/promises');
                const skillsPath = resolve(__agentDir, 'metta/skills.metta');
                const def = String(skillDef);
                await appendFile(skillsPath, `\n${def}`);
                dispatcher.loadSkillsFromFile(resolve(__agentDir, 'metta/skills.metta'));
                return `(skill-added "${def.slice(0, 80)}")`;
            }, 'selfModifyingSkills', ':meta');
        }

        if (cap('multiModelRouting')) {
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

            if (cap('modelExploration')) {
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
