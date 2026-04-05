import { Logger, resolveWithFallback, fallbackAgentDir, generateId } from '@senars/core';
import { appendFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

export class MeTTaSkillRegistrar {
    constructor(agent, agentCfg, dispatcher, loopState, cap) {
        this.agent = agent;
        this.agentCfg = agentCfg;
        this.dispatcher = dispatcher;
        this.loopState = loopState;
        this.cap = cap;
    }

    async registerAll() {
        const ok = '(thought recorded)';
        this.dispatcher.register('think', async content => { Logger.debug(`[think] ${content}`); return ok; }, 'mettaControlPlane', ':reflect');
        this.dispatcher.register('metta', async expr => {
            try {
                const { MeTTaInterpreter } = await import('@senars/metta/MeTTaInterpreter.js');
                const interp = new MeTTaInterpreter();
                return JSON.stringify(interp.evaluate(interp.parse(String(expr)))).slice(0, 500);
            } catch (err) { return `(metta-error "${err.message}")`; }
        }, 'mettaControlPlane', ':reflect');
        this.dispatcher.register('cognitive-cycle', async stim => {
            try {
                const { CognitiveArchitecture } = await import('../cognitive/CognitiveArchitecture.js');
                if (!this.agent._cognitiveArch) {
                    this.agent._cognitiveArch = new CognitiveArchitecture({
                        agentName: 'SeNARchy', nar: this.agent.nar, llm: this.agent.ai,
                    });
                    this.agent._cognitiveArch.setReasoner(this.agent.nar);
                    this.agent._cognitiveArch.setLLM(this.agent.ai);
                }
                const stimulus = typeof stim === 'string' ? { type: 'message', content: stim, source: 'agent-loop' } : stim;
                const result = await this.agent._cognitiveArch.cognitiveCycle(stimulus);
                return `(cognitive-cycle :phase "${result?.action?.type ?? 'none'}" :result "${JSON.stringify(result?.result ?? {}).slice(0, 200)}")`;
            } catch (err) {
                Logger.error('[cognitive-cycle]', err.message);
                return `(cognitive-cycle-error "${err.message.slice(0, 200)}")`;
            }
        }, 'mettaControlPlane', ':reflect');
        this.dispatcher.register('attend', async (content, priority) => {
            const pri = parseFloat(priority) || 0.5;
            const ttl = this.agentCfg.workingMemory?.defaultTtl ?? 10;
            this.loopState.wm.push({ content: String(content), priority: pri, ttl, cycleAdded: this.loopState.cycleCount });
            this.loopState.wm.sort((a, b) => b.priority - a.priority);
            if (this.loopState.wm.length > (this.agentCfg.workingMemory?.maxEntries ?? 20))
                {this.loopState.wm = this.loopState.wm.slice(0, this.agentCfg.workingMemory?.maxEntries ?? 20);}
            return `attended: ${content}`;
        }, 'mettaControlPlane', ':reflect');
        this.dispatcher.register('dismiss', async query => {
            const before = this.loopState.wm.length;
            this.loopState.wm = this.loopState.wm.filter(e => !e.content.includes(String(query)));
            return `dismissed ${before - this.loopState.wm.length} items matching "${query}"`;
        }, 'mettaControlPlane', ':reflect');
        this.dispatcher.register('send', async content => {
            const msg = String(content);
            if (msg === this.loopState.lastsend) {return '(duplicate suppressed)';}
            this.loopState.lastsend = msg;
            const connected = (this.agent.embodimentBus?.getAll() ?? []).filter(e => e.status === 'connected');
            if (connected.length > 0) {
                await Promise.all(connected.map(e => e.sendMessage('default', msg).catch(err => Logger.warn(`Send to ${e.id} failed:`, err.message))));
            } else {Logger.info(`[AGENT→] ${msg}`);}
            return `sent: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
        }, 'mettaControlPlane', ':network');
        this.dispatcher.register('send-to', async (embodimentId, content) => {
            const embodiment = this.agent.embodimentBus?.get(String(embodimentId));
            if (embodiment?.status === 'connected') {await embodiment.sendMessage('default', String(content));}
            else {Logger.info(`[AGENT→${embodimentId}] ${content}`);}
            return `sent-to ${embodimentId}`;
        }, 'multiEmbodiment', ':network');
        this.dispatcher.register('spawn-agent', async (task, cycleBudget) => {
            if (!this.agent.virtualEmbodiment) {return '(spawn-error :reason "virtual-embodiment-not-available")';}
            const budget = parseInt(cycleBudget) || 10;
            const subAgentId = generateId('subagent');
            const success = this.agent.virtualEmbodiment.spawnSubAgent(subAgentId, String(task), {}, budget);
            return success ? `(spawned :id "${subAgentId}" :budget ${budget})` : '(spawn-error :reason "failed-to-spawn")';
        }, 'subAgentSpawning', ':meta');

        if (this.cap('webSearchSkill')) {
            this.dispatcher.register('search', async query => {
                if (this.agent.toolInstances?.websearch?.search) {return JSON.stringify(await this.agent.toolInstances.websearch.search(String(query))).slice(0, 2000);}
                return '(web search tool not configured)';
            }, 'webSearchSkill', ':network');
        }
        if (this.cap('fileReadSkill')) {
            this.dispatcher.register('read-file', async path => {
                if (this.agent.toolInstances?.file?.readFile) {return await this.agent.toolInstances.file.readFile(String(path));}
                return '(file tool not configured)';
            }, 'fileReadSkill', ':local-read');
        }
        if (this.cap('fileWriteSkill')) {
            this.dispatcher.register('write-file', async (path, content) => {
                if (this.agent.toolInstances?.file?.writeFile) { await this.agent.toolInstances.file.writeFile(String(path), String(content)); return `written: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
            this.dispatcher.register('append-file', async (path, content) => {
                if (this.agent.toolInstances?.file?.appendFile) { await this.agent.toolInstances.file.appendFile(String(path), String(content)); return `appended: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
        }
        if (this.cap('shellSkill')) {
            this.dispatcher.register('shell', async cmd => {
                const { spawn } = await import('child_process');
                const shellCfg = this.agentCfg.shell ?? {};
                const cmdStr = String(cmd);
                for (const pattern of shellCfg.forbiddenPatterns ?? []) {
                    if (cmdStr.includes(pattern)) {return `(shell-blocked :reason "forbidden-pattern" :pattern "${pattern}")`;}
                }
                const allowed = (shellCfg.allowlist ?? []).includes(cmdStr) || (shellCfg.allowedPrefixes ?? []).some(p => cmdStr.startsWith(p));
                if (!allowed) {return `(shell-blocked :reason "not-allowlisted" :command "${cmdStr.slice(0, 100)}")`;}
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
        if (this.cap('semanticMemory')) {await this.#registerSemanticMemorySkills();}
        if (this.cap('goalPursuit')) {this.#registerGoalPursuitSkills();}
        if (this.cap('persistentHistory')) {this.#registerPersistentHistorySkills();}
        if (this.cap('memorySnapshots')) {this.#registerMemorySnapshotSkills();}
        if (this.cap('actionTrace')) {this.#registerActionTraceSkills();}
        if (this.cap('coordinatorMode')) {this.#registerCoordinatorSkills();}
        if (this.cap('separateEvaluator')) {this.#registerEvaluatorSkills();}
        if (this.cap('memoryConsolidation')) {this.#registerConsolidationSkills();}
        if (this.cap('selfModifyingSkills')) {this.#registerSelfModifyingSkills();}
        if (this.cap('multiModelRouting')) {await this.#registerMultiModelSkills();}
    }

    async #registerSemanticMemorySkills() {
        const { SemanticMemory } = await import('../memory/SemanticMemory.js');
        this.agent._semanticMemory = new SemanticMemory({
            dataDir: resolve(__agentDir, '../../memory'),
            embedder: this.agentCfg.memory?.embedder ?? 'Xenova/all-MiniLM-L6-v2',
            vectorDimensions: this.agentCfg.memory?.vectorDimensions ?? 384
        });
        await this.agent._semanticMemory.initialize();
        this.dispatcher.register('remember', async (content, type, tags) => {
            const id = await this.agent._semanticMemory.remember({ content: String(content), type: type ?? 'episodic', tags: tags ?? [], source: 'agent-loop' });
            return `(remembered :id "${id}")`;
        }, 'semanticMemory', ':memory');
        this.dispatcher.register('query', async (text, k) => {
            const results = await this.agent._semanticMemory.query(String(text), parseInt(k) || (this.agentCfg.memory?.maxRecallItems ?? 10));
            if (results.length === 0) {return '(query-result :count 0)';}
            const items = results.map(r => `(memory :id "${r.id}" :content "${r.content.replace(/"/g, '\\"')}" :score ${r.score.toFixed(3)} :type :${r.type})`).join(' ');
            return `(query-result :count ${results.length} ${items})`;
        }, 'semanticMemory', ':memory');
        this.dispatcher.register('pin', async memoryId => {
            const success = await this.agent._semanticMemory.pin(String(memoryId));
            return success ? `(pinned :id "${memoryId}")` : `(pin-error :reason "not-found" :id "${memoryId}")`;
        }, 'semanticMemory', ':memory');
        this.dispatcher.register('forget', async queryText => {
            const count = await this.agent._semanticMemory.forget(String(queryText));
            return `(forgot :count ${count})`;
        }, 'semanticMemory', ':memory');
    }

    #registerGoalPursuitSkills() {
        const tm = () => this.agent.nar.taskManager;
        this.dispatcher.register('nar-goal-add', async (content, priority) => {
            tm()?.createGoal?.(String(content), null, { priority: parseFloat(priority) || 0.5 });
            return `(goal-added "${String(content).slice(0, 100)}")`;
        }, 'goalPursuit', ':meta');
        this.dispatcher.register('nar-goal-complete', async goalId => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
            if (goal) { tm().removeTask(goal); return `(goal-completed "${goalId}")`; }
            return `(goal-not-found "${goalId}")`;
        }, 'goalPursuit', ':meta');
        this.dispatcher.register('nar-goal-status', async goalId => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
            return goal ? `(goal-status :id "${goalId}" :priority ${goal.priority?.toFixed(2) ?? 'unknown'})` : `(goal-not-found "${goalId}")`;
        }, 'goalPursuit', ':meta');
        this.dispatcher.register('nar-goals', async () => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const list = goals.slice(0, 10).map(g => `"${g.term?.toString?.().slice(0, 80) ?? 'unknown'}"`).join(' ');
            return `(goals :count ${goals.length} :items ${list || '()'})`;
        }, 'goalPursuit', ':meta');
        this.dispatcher.register('set-goal', async (content, priority) => {
            tm()?.createGoal?.(String(content), null, { priority: parseFloat(priority) || 0.5 });
            return `(goal-set "${String(content).slice(0, 100)}")`;
        }, 'goalPursuit', ':meta');
    }

    #registerPersistentHistorySkills() {
        this.dispatcher.register('nar-serialize', async () => {
            const state = this.agent.nar.serialize?.();
            return `(serialized :length ${JSON.stringify(state ?? {}).length})`;
        }, 'persistentHistory', ':meta');
    }

    #registerMemorySnapshotSkills() {
        this.dispatcher.register('nar-snapshot', async label => {
            const beliefs = this.agent.nar.memory?.getBeliefs?.() ?? [];
            return `(snapshot :label "${label}" :beliefs ${beliefs.length} :ts ${Date.now()})`;
        }, 'memorySnapshots', ':meta');
        this.dispatcher.register('nar-snapshot-compare', async (labelA, labelB, threshold) => {
            return `(snapshot-compare :a "${labelA}" :b "${labelB}" :threshold ${parseFloat(threshold) || 0.5} :status "comparison-logged")`;
        }, 'memorySnapshots', ':meta');
    }

    #registerActionTraceSkills() {
        this.dispatcher.register('nar-stamps', async term => {
            const beliefs = this.agent.nar.memory?.getBeliefsByTerm?.(String(term)) ?? [];
            const stamps = beliefs.map(b => b.stamp ?? 'unknown');
            return `(stamps :term "${term}" :count ${stamps.length} :values ${JSON.stringify(stamps).replace(/"/g, "'")})`;
        }, 'actionTrace', ':meta');
        this.dispatcher.register('nar-recent-derivations', async count => {
            return `(recent-derivations :count ${parseInt(count) || 10} :status "trace-available")`;
        }, 'actionTrace', ':meta');
    }

    #registerCoordinatorSkills() {
        this.dispatcher.register('nar-focus-sets', async () => {
            const stats = this.agent.nar.focus?.getStats() ?? {};
            const sets = Object.keys(stats.focusSets ?? {});
            return `(focus-sets :count ${sets.length} :names ${JSON.stringify(sets).replace(/"/g, "'")})`;
        }, 'coordinatorMode', ':meta');
        this.dispatcher.register('nar-focus-create', async name => {
            this.agent.nar.focus?.createFocusSet(String(name), 20);
            return `(focus-created "${name}")`;
        }, 'coordinatorMode', ':meta');
        this.dispatcher.register('nar-focus-switch', async name => {
            const success = this.agent.nar.focus?.setFocus(String(name)) ?? false;
            return success ? `(focus-switched "${name}")` : `(focus-switch-failed "${name}")`;
        }, 'coordinatorMode', ':meta');
    }

    #registerEvaluatorSkills() {
        this.dispatcher.register('nar-revision', async (term, evidence) => {
            const { Truth } = await import('@senars/nar/Truth.js');
            const beliefs = this.agent.nar.memory?.getBeliefsByTerm?.(String(term)) ?? [];
            if (beliefs.length === 0) {return `(revision-error :reason "no-beliefs-for-term" :term "${term}")`;}
            const evTruth = evidence?.value ?? evidence;
            const revised = Truth.revision(beliefs[0].truth, evTruth);
            return `(revised :term "${term}" :f ${revised.f.toFixed(3)} :c ${revised.c.toFixed(3)})`;
        }, 'separateEvaluator', ':meta');
    }

    #registerConsolidationSkills() {
        this.dispatcher.register('consolidate', async () => {
            const result = this.agent.nar.memory?.consolidate?.();
            return result ? `(consolidated :concepts-removed ${result.conceptsRemoved ?? 0} :decayed ${result.conceptsDecayed ?? 0})` : '(consolidation-not-available)';
        }, 'memoryConsolidation', ':meta');
    }

    #registerSelfModifyingSkills() {
        this.dispatcher.register('add-skill', async skillDef => {
            const skillsPath = this.#resolveMettaFile('skills.metta');
            const def = String(skillDef);
            await appendFile(skillsPath, `\n${def}`);
            this.dispatcher.loadSkillsFromFile(this.#resolveMettaFile('skills.metta'));
            return `(skill-added "${def.slice(0, 80)}")`;
        }, 'selfModifyingSkills', ':meta');
    }

    async #registerMultiModelSkills() {
        const { ModelRouter } = await import('../models/ModelRouter.js');
        this.agent._modelRouter = new ModelRouter(this.agentCfg, this.agent.ai, this.agent.semanticMemory);
        await this.agent._modelRouter.initialize();
        this.dispatcher.register('set-model', async (modelName, cycles) => {
            this.loopState.modelOverride = String(modelName);
            this.loopState.modelOverrideCycles = parseInt(cycles) || 1;
            Logger.info(`[set-model] ${modelName} for ${this.loopState.modelOverrideCycles} cycles`);
            return `(model-set :model "${modelName}" :cycles ${this.loopState.modelOverrideCycles})`;
        }, 'multiModelRouting', ':meta');
        if (this.cap('modelExploration')) {
            const { ModelBenchmark } = await import('../models/ModelBenchmark.js');
            this.agent._modelBenchmark = new ModelBenchmark(this.agent.ai, this.agentCfg);
            this.dispatcher.register('eval-model', async (modelName, taskType) => {
                const model = String(modelName);
                const type = taskType ? String(taskType) : null;
                Logger.info(`[eval-model] Benchmarking ${model}${type ? ` on ${type}` : ''}`);
                const results = await this.agent._modelBenchmark.run(model, type ? [type] : null);
                for (const [tType, scoreData] of Object.entries(results.scores)) {
                    await this.agent._modelRouter.setScore(model, tType, scoreData.average, Math.min(0.95, scoreData.taskCount * 0.15));
                }
                return `(eval-result :model "${model}" :scores ${JSON.stringify(results.scores).replace(/"/g, "'")})`;
            }, 'modelExploration', ':meta');
        }
    }

    #resolveMettaFile(filename) {
        const direct = resolve(__agentDir, filename);
        const inMetta = resolve(__agentDir, 'metta', filename);
        return existsSync(direct) ? direct : inMetta;
    }
}
