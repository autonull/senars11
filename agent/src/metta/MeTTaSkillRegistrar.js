/**
 * MeTTaSkillRegistrar.js — Modular skill handler registration
 *
 * Skills are organized into domain modules. Each module exports
 * `register(dispatcher, deps, cap)` to register its skills.
 *
 * This eliminates the 120-line `registerAll()` wall of code and
 * makes adding/removing skill groups trivial.
 */
import { Logger, resolveWithFallback, fallbackAgentDir, generateId } from '@senars/core';
import { appendFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

export class MeTTaSkillRegistrar {
    #agent;
    #agentCfg;
    #dispatcher;
    #loopState;
    #cap;

    constructor(agent, agentCfg, dispatcher, loopState, cap) {
        this.#agent = agent;
        this.#agentCfg = agentCfg;
        this.#dispatcher = dispatcher;
        this.#loopState = loopState;
        this.#cap = cap;
    }

    async registerAll() {
        const deps = this.#buildDeps();

        await CoreSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('webSearchSkill')) await NetworkSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('fileReadSkill') || this.#cap('fileWriteSkill')) await FileSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('shellSkill')) await ShellSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('semanticMemory')) await MemorySkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('goalPursuit')) await GoalSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('persistentHistory')) await HistorySkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('memorySnapshots') || this.#cap('actionTrace') || this.#cap('coordinatorMode') || this.#cap('separateEvaluator')) await NarsMetaSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('memoryConsolidation')) await ConsolidationSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('selfModifyingSkills')) await SelfModSkills.register(this.#dispatcher, deps, this.#cap);
        if (this.#cap('multiModelRouting')) await ModelSkills.register(this.#dispatcher, deps, this.#cap);
    }

    #buildDeps() {
        return {
            agent: this.#agent,
            agentCfg: this.#agentCfg,
            loopState: this.#loopState,
            resolveMettaFile: filename => {
                const direct = resolve(__agentDir, filename);
                const inMetta = resolve(__agentDir, 'metta', filename);
                return existsSync(direct) ? direct : inMetta;
            }
        };
    }
}

/* ── Core Skills (always registered) ─────────────────────────────── */

class CoreSkills {
    static async register(disp, deps, cap) {
        const ok = '(thought recorded)';
        disp.register('think', async content => { Logger.debug(`[think] ${content}`); return ok; }, 'mettaControlPlane', ':reflect');

        disp.register('metta', async expr => {
            try {
                const interp = deps.agent.metta;
                if (!interp) {
                    const { MeTTaInterpreter } = await import('@senars/metta/MeTTaInterpreter.js');
                    return JSON.stringify(new MeTTaInterpreter().evaluate(new MeTTaInterpreter().parse(String(expr)))).slice(0, 500);
                }
                return JSON.stringify(interp.evaluate(interp.parse(String(expr)))).slice(0, 500);
            } catch (err) { return `(metta-error "${err.message}")`; }
        }, 'mettaControlPlane', ':reflect');

        disp.register('cognitive-cycle', async stim => {
            try {
                const { CognitiveArchitecture } = await import('../cognitive/CognitiveArchitecture.js');
                if (!deps.agent._cognitiveArch) {
                    deps.agent._cognitiveArch = new CognitiveArchitecture({
                        agentName: 'SeNARchy', nar: deps.agent.nar, llm: deps.agent.ai,
                    });
                    deps.agent._cognitiveArch.setReasoner(deps.agent.nar);
                    deps.agent._cognitiveArch.setLLM(deps.agent.ai);
                }
                const stimulus = typeof stim === 'string' ? { type: 'message', content: stim, source: 'agent-loop' } : stim;
                const result = await deps.agent._cognitiveArch.cognitiveCycle(stimulus);
                return `(cognitive-cycle :phase "${result?.action?.type ?? 'none'}" :result "${JSON.stringify(result?.result ?? {}).slice(0, 200)}")`;
            } catch (err) {
                Logger.error('[cognitive-cycle]', err.message);
                return `(cognitive-cycle-error "${err.message.slice(0, 200)}")`;
            }
        }, 'mettaControlPlane', ':reflect');

        disp.register('attend', async (content, priority) => {
            const pri = parseFloat(priority) || 0.5;
            const ttl = deps.agentCfg.workingMemory?.defaultTtl ?? 10;
            deps.loopState.wm.push({ content: String(content), priority: pri, ttl, cycleAdded: deps.loopState.cycleCount });
            deps.loopState.wm.sort((a, b) => b.priority - a.priority);
            const max = deps.agentCfg.workingMemory?.maxEntries ?? 20;
            if (deps.loopState.wm.length > max) deps.loopState.wm = deps.loopState.wm.slice(0, max);
            return `attended: ${content}`;
        }, 'mettaControlPlane', ':reflect');

        disp.register('dismiss', async query => {
            const before = deps.loopState.wm.length;
            deps.loopState.wm = deps.loopState.wm.filter(e => !e.content.includes(String(query)));
            return `dismissed ${before - deps.loopState.wm.length} items matching "${query}"`;
        }, 'mettaControlPlane', ':reflect');

        disp.register('respond', async content => {
            const msg = String(content);
            if (msg === deps.loopState.lastsend) return { sent: true, text: msg, duplicate: true };
            deps.loopState.lastsend = msg;
            const lastMsg = deps.loopState.lastmsg;
            if (!lastMsg?.from) {
                Logger.debug(`[respond] ${msg}`);
                return { sent: false, text: msg, reason: 'no-lastmsg' };
            }
            const embodiment = deps.agent.embodimentBus?.get(lastMsg.embodimentId);
            if (embodiment?.status !== 'connected') {
                Logger.debug(`[respond] ${msg}`);
                return { sent: false, text: msg, reason: 'disconnected' };
            }
            const target = lastMsg.isPrivate ? lastMsg.from : (lastMsg.channel ?? 'default');
            try {
                await embodiment.sendMessage(target, msg);
                return { sent: true, text: msg };
            } catch (err) {
                Logger.warn(`[respond] Send failed: ${err.message}`);
                deps.loopState.wm.push({ content: `respond failed: ${err.message.slice(0, 120)}`, priority: 0.8, ttl: 2 });
                return { sent: false, text: msg, error: err.message };
            }
        }, 'mettaControlPlane', ':reflect', 'Reply to user');

        disp.register('send', async content => {
            const msg = String(content);
            if (msg === deps.loopState.lastsend) return '(duplicate suppressed)';
            deps.loopState.lastsend = msg;
            const lastMsg = deps.loopState.lastmsg;
            const connected = (deps.agent.embodimentBus?.getAll() ?? []).filter(e => e.status === 'connected');
            if (connected.length > 0) {
                const target = lastMsg?.isPrivate ? lastMsg.from : (lastMsg?.channel ?? connected[0].id);
                const emb = connected.find(e => e.id === lastMsg?.embodimentId) ?? connected[0];
                await emb.sendMessage(target, msg).catch(err => Logger.warn(`Send to ${emb.id} failed:`, err.message));
            } else { Logger.info(`[AGENT→] ${msg}`); }
            return `sent: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
        }, 'mettaControlPlane', ':network');

        disp.register('send-to', async (embodimentId, content) => {
            const emb = deps.agent.embodimentBus?.get(String(embodimentId));
            if (emb?.status === 'connected') {
                const lastMsg = deps.loopState.lastmsg;
                const target = lastMsg?.isPrivate ? lastMsg.from : (lastMsg?.channel ?? 'default');
                await emb.sendMessage(target, String(content));
            } else { Logger.info(`[AGENT→${embodimentId}] ${content}`); }
            return `sent-to ${embodimentId}`;
        }, 'multiEmbodiment', ':network');

        disp.register('spawn-agent', async (task, cycleBudget) => {
            if (!deps.agent.virtualEmbodiment) return '(spawn-error :reason "virtual-embodiment-not-available")';
            const budget = parseInt(cycleBudget) || 10;
            const subAgentId = generateId('subagent');
            const success = deps.agent.virtualEmbodiment.spawnSubAgent(subAgentId, String(task), {}, budget);
            return success ? `(spawned :id "${subAgentId}" :budget ${budget})` : '(spawn-error :reason "failed-to-spawn")';
        }, 'subAgentSpawning', ':meta');
    }
}

/* ── Network Skills ──────────────────────────────────────────────── */

class NetworkSkills {
    static async register(disp, deps) {
        disp.register('search', async query => {
            if (deps.agent.toolInstances?.websearch?.search) {
                return JSON.stringify(await deps.agent.toolInstances.websearch.search(String(query))).slice(0, 2000);
            }
            return '(web search tool not configured)';
        }, 'webSearchSkill', ':network');
    }
}

/* ── File Skills ─────────────────────────────────────────────────── */

class FileSkills {
    static async register(disp, deps, cap) {
        if (cap('fileReadSkill')) {
            disp.register('read-file', async path => {
                if (deps.agent.toolInstances?.file?.readFile) return await deps.agent.toolInstances.file.readFile(String(path));
                return '(file tool not configured)';
            }, 'fileReadSkill', ':local-read');
        }
        if (cap('fileWriteSkill')) {
            disp.register('write-file', async (path, content) => {
                if (deps.agent.toolInstances?.file?.writeFile) { await deps.agent.toolInstances.file.writeFile(String(path), String(content)); return `written: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
            disp.register('append-file', async (path, content) => {
                if (deps.agent.toolInstances?.file?.appendFile) { await deps.agent.toolInstances.file.appendFile(String(path), String(content)); return `appended: ${path}`; }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
        }
    }
}

/* ── Shell Skills ────────────────────────────────────────────────── */

class ShellSkills {
    static async register(disp, deps) {
        disp.register('shell', async cmd => {
            const { spawn } = await import('child_process');
            const shellCfg = deps.agentCfg.shell ?? {};
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
}

/* ── Memory Skills ───────────────────────────────────────────────── */

class MemorySkills {
    static async register(disp, deps) {
        const { SemanticMemory } = await import('../memory/SemanticMemory.js');
        deps.agent._semanticMemory = new SemanticMemory({
            dataDir: resolve(__agentDir, '../../memory'),
            embedder: deps.agentCfg.memory?.embedder ?? 'Xenova/all-MiniLM-L6-v2',
            vectorDimensions: deps.agentCfg.memory?.vectorDimensions ?? 384
        });
        await deps.agent._semanticMemory.initialize();

        disp.register('remember', async (content, type, tags) => {
            const id = await deps.agent._semanticMemory.remember({ content: String(content), type: type ?? 'episodic', tags: tags ?? [], source: 'agent-loop' });
            return `(remembered :id "${id}")`;
        }, 'semanticMemory', ':memory');

        disp.register('query', async (text, k) => {
            const results = await deps.agent._semanticMemory.query(String(text), parseInt(k) || (deps.agentCfg.memory?.maxRecallItems ?? 10));
            if (results.length === 0) return '(query-result :count 0)';
            const items = results.map(r => `(memory :id "${r.id}" :content "${r.content.replace(/"/g, '\\"')}" :score ${r.score.toFixed(3)} :type :${r.type})`).join(' ');
            return `(query-result :count ${results.length} ${items})`;
        }, 'semanticMemory', ':memory');

        disp.register('pin', async memoryId => {
            const success = await deps.agent._semanticMemory.pin(String(memoryId));
            return success ? `(pinned :id "${memoryId}")` : `(pin-error :reason "not-found" :id "${memoryId}")`;
        }, 'semanticMemory', ':memory');

        disp.register('forget', async queryText => {
            const count = await deps.agent._semanticMemory.forget(String(queryText));
            return `(forgot :count ${count})`;
        }, 'semanticMemory', ':memory');
    }
}

/* ── Goal Skills ─────────────────────────────────────────────────── */

class GoalSkills {
    static register(disp, deps) {
        const tm = () => deps.agent.nar.taskManager;

        const goalOp = (name, fn, capFlag) => disp.register(name, fn, capFlag, ':meta');

        goalOp('nar-goal-add', async (content, priority) => {
            tm()?.createGoal?.(String(content), null, { priority: parseFloat(priority) || 0.5 });
            return `(goal-added "${String(content).slice(0, 100)}")`;
        }, 'goalPursuit');

        goalOp('nar-goal-complete', async goalId => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
            if (goal) { tm().removeTask(goal); return `(goal-completed "${goalId}")`; }
            return `(goal-not-found "${goalId}")`;
        }, 'goalPursuit');

        goalOp('nar-goal-status', async goalId => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const goal = goals.find(g => g.term?.toString?.().includes(String(goalId)));
            return goal ? `(goal-status :id "${goalId}" :priority ${goal.priority?.toFixed(2) ?? 'unknown'})` : `(goal-not-found "${goalId}")`;
        }, 'goalPursuit');

        goalOp('nar-goals', async () => {
            const goals = tm()?.findTasksByType('GOAL') ?? [];
            const list = goals.slice(0, 10).map(g => `"${g.term?.toString?.().slice(0, 80) ?? 'unknown'}"`).join(' ');
            return `(goals :count ${goals.length} :items ${list || '()'})`;
        }, 'goalPursuit');

        goalOp('set-goal', async (content, priority) => {
            tm()?.createGoal?.(String(content), null, { priority: parseFloat(priority) || 0.5 });
            return `(goal-set "${String(content).slice(0, 100)}")`;
        }, 'goalPursuit');
    }
}

/* ── History Skills ──────────────────────────────────────────────── */

class HistorySkills {
    static register(disp, deps) {
        disp.register('nar-serialize', async () => {
            const state = deps.agent.nar.serialize?.();
            return `(serialized :length ${JSON.stringify(state ?? {}).length})`;
        }, 'persistentHistory', ':meta');
    }
}

/* ── NARS Meta Skills (snapshots, traces, focus, revision) ───────── */

class NarsMetaSkills {
    static async register(disp, deps, cap) {
        if (cap('memorySnapshots')) {
            disp.register('nar-snapshot', async label => {
                const beliefs = deps.agent.nar.memory?.getBeliefs?.() ?? [];
                return `(snapshot :label "${label}" :beliefs ${beliefs.length} :ts ${Date.now()})`;
            }, 'memorySnapshots', ':meta');
            disp.register('nar-snapshot-compare', async (labelA, labelB, threshold) => {
                const mem = deps.agent.nar.memory;
                const beliefs = mem?.getBeliefs?.() ?? [];
                const thresh = parseFloat(threshold) || 0.5;
                const highConf = beliefs.filter(b => (b.truth?.confidence ?? 0) >= thresh).length;
                const lowConf = beliefs.length - highConf;
                return `(snapshot-compare :a "${labelA}" :b "${labelB}" :threshold ${thresh} :beliefs ${beliefs.length} :high-confidence ${highConf} :low-confidence ${lowConf})`;
            }, 'memorySnapshots', ':meta');
        }
        if (cap('actionTrace')) {
            disp.register('nar-stamps', async term => {
                const beliefs = deps.agent.nar.memory?.getBeliefsByTerm?.(String(term)) ?? [];
                const stamps = beliefs.map(b => b.stamp ?? 'unknown');
                return `(stamps :term "${term}" :count ${stamps.length} :values ${JSON.stringify(stamps).replace(/"/g, "'")})`;
            }, 'actionTrace', ':meta');
            disp.register('nar-recent-derivations', async count => {
                const mem = deps.agent.nar.memory;
                const n = parseInt(count) || 10;
                const beliefs = mem?.getBeliefs?.() ?? [];
                const recent = beliefs.slice(-n).map(b => {
                    const term = b.term?.toString?.() ?? 'unknown';
                    const f = b.truth?.frequency?.toFixed(3) ?? '?';
                    const c = b.truth?.confidence?.toFixed(3) ?? '?';
                    return `(belief "${term.replace(/"/g, '\\"')}" :f ${f} :c ${c})`;
                }).join(' ');
                return `(recent-derivations :count ${recent.length || beliefs.length} :requested ${n} :items ${recent || '()'})`;
            }, 'actionTrace', ':meta');
        }
        if (cap('coordinatorMode')) {
            disp.register('nar-focus-sets', async () => {
                const stats = deps.agent.nar.focus?.getStats() ?? {};
                const sets = Object.keys(stats.focusSets ?? {});
                return `(focus-sets :count ${sets.length} :names ${JSON.stringify(sets).replace(/"/g, "'")})`;
            }, 'coordinatorMode', ':meta');
            disp.register('nar-focus-create', async name => {
                deps.agent.nar.focus?.createFocusSet(String(name), 20);
                return `(focus-created "${name}")`;
            }, 'coordinatorMode', ':meta');
            disp.register('nar-focus-switch', async name => {
                const success = deps.agent.nar.focus?.setFocus(String(name)) ?? false;
                return success ? `(focus-switched "${name}")` : `(focus-switch-failed "${name}")`;
            }, 'coordinatorMode', ':meta');
        }
        if (cap('separateEvaluator')) {
            disp.register('nar-revision', async (term, evidence) => {
                const { Truth } = await import('@senars/nar/Truth.js');
                const beliefs = deps.agent.nar.memory?.getBeliefsByTerm?.(String(term)) ?? [];
                if (beliefs.length === 0) return `(revision-error :reason "no-beliefs-for-term" :term "${term}")`;
                const evTruth = evidence?.value ?? evidence;
                const revised = Truth.revision(beliefs[0].truth, evTruth);
                return `(revised :term "${term}" :f ${revised.f.toFixed(3)} :c ${revised.c.toFixed(3)})`;
            }, 'separateEvaluator', ':meta');
        }
    }
}

/* ── Consolidation Skills ────────────────────────────────────────── */

class ConsolidationSkills {
    static register(disp, deps) {
        disp.register('consolidate', async () => {
            const result = deps.agent.nar.memory?.consolidate?.();
            return result ? `(consolidated :concepts-removed ${result.conceptsRemoved ?? 0} :decayed ${result.conceptsDecayed ?? 0})` : '(consolidation-not-available)';
        }, 'memoryConsolidation', ':meta');
    }
}

/* ── Self-Modifying Skills ───────────────────────────────────────── */

class SelfModSkills {
    static async register(disp, deps) {
        disp.register('add-skill', async skillDef => {
            const skillsPath = deps.resolveMettaFile('skills.metta');
            const def = String(skillDef);
            await appendFile(skillsPath, `\n${def}`);
            deps.agent._mettaLoopBuilder?._dispatcher?.loadActionsFromFile(deps.resolveMettaFile('skills.metta'));
            return `(skill-added "${def.slice(0, 80)}")`;
        }, 'selfModifyingSkills', ':meta');
    }
}

/* ── Model Skills ────────────────────────────────────────────────── */

class ModelSkills {
    static async register(disp, deps, cap) {
        const { ModelRouter } = await import('../models/ModelRouter.js');
        deps.agent._modelRouter = new ModelRouter(deps.agentCfg, deps.agent.ai, deps.agent.semanticMemory);
        await deps.agent._modelRouter.initialize();

        disp.register('set-model', async (modelName, cycles) => {
            deps.loopState.modelOverride = String(modelName);
            deps.loopState.modelOverrideCycles = parseInt(cycles) || 1;
            Logger.info(`[set-model] ${modelName} for ${deps.loopState.modelOverrideCycles} cycles`);
            return `(model-set :model "${modelName}" :cycles ${deps.loopState.modelOverrideCycles})`;
        }, 'multiModelRouting', ':meta');

        if (cap('modelExploration')) {
            const { ModelBenchmark } = await import('../models/ModelBenchmark.js');
            deps.agent._modelBenchmark = new ModelBenchmark(deps.agent.ai, deps.agentCfg);
            disp.register('eval-model', async (modelName, taskType) => {
                const model = String(modelName);
                const type = taskType ? String(taskType) : null;
                Logger.info(`[eval-model] Benchmarking ${model}${type ? ` on ${type}` : ''}`);
                const results = await deps.agent._modelBenchmark.run(model, type ? [type] : null);
                for (const [tType, scoreData] of Object.entries(results.scores)) {
                    await deps.agent._modelRouter.setScore(model, tType, scoreData.average, Math.min(0.95, scoreData.taskCount * 0.15));
                }
                return `(eval-result :model "${model}" :scores ${JSON.stringify(results.scores).replace(/"/g, "'")})`;
            }, 'modelExploration', ':meta');
        }
    }
}
