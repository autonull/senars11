import {FormattingUtils, Input, NAR, Logger} from '@senars/core';
import {PersistenceManager} from './io/PersistenceManager.js';
import {EmbodimentBus} from './io/EmbodimentBus.js';
import {VirtualEmbodiment} from './io/VirtualEmbodiment.js';
import {ChannelConfig} from './io/ChannelConfig.js';
import * as Commands from './commands/Commands.js';
import {AGENT_EVENTS} from './constants.js';
import {InputProcessor} from './InputProcessor.js';
import {AgentStreamer} from './AgentStreamer.js';
import {AIClient} from './ai/AIClient.js';
import {ToolAdapter} from './ai/ToolAdapter.js';
import {isEnabled, validateDeps} from './config/capabilities.js';
import {SkillDispatcher} from './skills/SkillDispatcher.js';
import {readFile} from 'fs/promises';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';

// Lazy-loaded for Phase 2 Semantic Memory
let _SemanticMemory = null;
const loadSemanticMemory = async () => {
    if (!_SemanticMemory) {
        const mod = await import('./memory/SemanticMemory.js');
        _SemanticMemory = mod.SemanticMemory;
    }
    return _SemanticMemory;
};

const __agentDir = dirname(fileURLToPath(import.meta.url));

export class Agent extends NAR {
    constructor(config = {}) {
        super(config);

        this.id = config.id || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)} `;
        this.inputQueue = new Input();
        this.sessionState = {history: [], lastResult: null, startTime: Date.now()};

        this.runState = {
            isRunning: false,
            intervalId: null,
        };

        this.displaySettings = {
            echo: false,
            quiet: false,
        };

        this.inputProcessingConfig = {
            enableNarseseFallback: config.inputProcessing?.enableNarseseFallback ?? true,
            checkNarseseSyntax: config.inputProcessing?.checkNarseseSyntax ?? true,
            lmTemperature: config.inputProcessing?.lmTemperature ?? 0.7
        };

        this.persistenceManager = new PersistenceManager({
            defaultPath: config.persistence?.defaultPath ?? './agent.json'
        });

        // Initialize Embodiment Bus (Phase 5)
        const embodimentConfig = config.embodiment || {};
        this.embodimentBus = new EmbodimentBus({
            attentionSalience: config.capabilities?.attentionSalience ?? false,
            ...embodimentConfig
        });

        // Virtual embodiment for self-directed tasks (Phase 5)
        this._virtualEmbodiment = new VirtualEmbodiment({
            autonomousMode: config.capabilities?.autonomousLoop ?? false,
            idleTimeout: config.capabilities?.virtualEmbodimentIdleTimeout ?? 5000
        });
        this.embodimentBus.register(this._virtualEmbodiment);

        // Setup Tools
        this.toolInstances = {};

        // Auto-join if configured and register tools
        this._autoJoinChannels(embodimentConfig);
        this._setupEmbodimentRouting();

        this.commandRegistry = this._initializeCommandRegistry();

        this.uiState = {
            taskGrouping: null,
            taskSelection: [],
            taskFilters: {},
            viewMode: 'vertical-split'
        };

        // Initialize helper components
        this.inputProcessor = new InputProcessor(this);
        this.agentStreamer = new AgentStreamer(this);

        // Initialize Vercel AI SDK Client
        this.ai = new AIClient(config.lm || {});

        // Bind tools to AI if config enables it (assumed for chatbot)
        this._bindToolsToAI(channelConfig); // Q: Should I pass config?

        if (this.metta) {
             this._registerMeTTaExtensions();
        }
    }

    async _autoJoinChannels(config) {
        if (config.channels) {
            // Lazy load specific channels to avoid circular deps
            const { IRCChannel, NostrChannel, WebSearchTool, FileTool } = await import('./io/index.js');

            if (config.channels.irc) {
                try {
                    const irc = new IRCChannel(config.channels.irc);
                    this.embodimentBus.register(irc);
                    irc.connect().catch(e => Logger.error('Auto-connect IRC failed:', e));
                } catch (e) {
                    Logger.error('Failed to init IRC embodiment:', e);
                }
            }

            if (config.channels.nostr) {
                try {
                    const nostr = new NostrChannel(config.channels.nostr);
                    this.embodimentBus.register(nostr);
                    nostr.connect().catch(e => Logger.error('Auto-connect Nostr failed:', e));
                } catch (e) {
                    Logger.error('Failed to init Nostr embodiment:', e);
                }
            }

            // Init Tools
            if (config.tools?.websearch) {
                this.toolInstances.websearch = new WebSearchTool(config.tools.websearch);
            } else {
                this.toolInstances.websearch = new WebSearchTool(); // Mock
            }

            this.toolInstances.file = new FileTool({ workspace: config.workspace || './workspace' });
        }
    }

    async _bindToolsToAI(config) {
        // Wait for lazy load in _autoJoinChannels? No, constructor is sync.
        // We need to wait or do it later.
        // _autoJoinChannels is async but called in constructor without await.
        // We should move initialization to `initialize()`
        // But `this.ai` needs tools when `generate` is called.
        // We'll defer binding until `initialize`.
    }

    _registerMeTTaExtensions() {
        if (this.metta && !this._channelExtensionRegistered) {
             import('../../../metta/src/extensions/ChannelExtension.js').then(({ ChannelExtension }) => {
                 const ext = new ChannelExtension(this.metta, this.embodimentBus);
                 ext.agent = this;
                 ext.register();
                 this._channelExtensionRegistered = true;
             }).catch(err => Logger.error("Failed to register ChannelExtension:", err));

             import('../../../metta/src/extensions/MemoryExtension.js').then(({ MemoryExtension }) => {
                 const memExt = new MemoryExtension(this.metta, this);
                 memExt.register();
             }).catch(err => Logger.error("Failed to register MemoryExtension:", err));
        }
    }

    async initialize() {
        await super.initialize();

        // Load tools if not loaded by constructor's async _autoJoinChannels
        if (!this.toolInstances.websearch) {
             const { WebSearchTool, FileTool } = await import('./io/index.js');
             this.toolInstances.websearch = new WebSearchTool();
             this.toolInstances.file = new FileTool();
        }

        this.aiTools = {
            ...ToolAdapter.toAISDK(this.toolInstances.websearch, 'websearch'),
            ...ToolAdapter.toAISDK(this.toolInstances.file, 'file')
        };

        this._registerMeTTaExtensions();
        this._registerEventHandlers();

        // Load METTACLAW agent.json config and wire MeTTa control plane
        this.agentCfg = await this._loadAgentConfig();
        try {
            validateDeps(this.agentCfg);
        } catch (err) {
            Logger.error('[Agent] Capability dependency error:', err.message);
            throw err;
        }

        if (isEnabled(this.agentCfg, 'mettaControlPlane')) {
            this._mettaLoopStarter = await this._buildMeTTaLoop(this.agentCfg);
            Logger.info('[Agent] MeTTa control plane ready. Call agent.startMeTTaLoop() to begin.');
        }

        this.emit(AGENT_EVENTS.ENGINE_READY, {success: true, message: 'Agent initialized successfully'});
        return true;
    }

    /**
     * Start the MeTTa-driven agent loop.
     * Returns a Promise that resolves when the loop halts.
     */
    async startMeTTaLoop() {
        if (!this._mettaLoopStarter) {
            throw new Error('MeTTa control plane not initialized. Check mettaControlPlane capability in agent.json.');
        }
        Logger.info('[Agent] Starting MeTTa agent loop...');
        return this._mettaLoopStarter();
    }

    /**
     * Load agent/workspace/agent.json. Returns default parity config on error.
     */
    async _loadAgentConfig() {
        const configPath = resolve(__agentDir, '../workspace/agent.json');
        try {
            const raw = await readFile(configPath, 'utf8');
            return JSON.parse(raw);
        } catch (_) {
            Logger.warn('[Agent] Could not load agent.json, using default parity profile.');
            return { profile: 'parity', capabilities: {} };
        }
    }

    /**
     * Build the MeTTa control plane: interpreter, grounded ops, skill dispatcher.
     * Returns an async start function () => Promise<any>.
     */
    async _buildMeTTaLoop(agentCfg) {
        const { MeTTaInterpreter } = await import('../../metta/src/MeTTaInterpreter.js');
        const { Term } = await import('../../metta/src/kernel/Term.js');

        const interp = new MeTTaInterpreter();
        const dispatcher = new SkillDispatcher(agentCfg);

        // JS-side loop state (read/written by grounded ops)
        const loopState = {
            prevmsg:      null,
            lastresults:  [],
            lastsend:     '',
            error:        null,
            cycleCount:   0,
            wm:           [],
            historyBuffer: []
        };

        // Message queue wired from EmbodimentBus events
        const msgQueue    = [];
        const msgWaiters  = [];

        this.embodimentBus.on('message', (msg) => {
            const text = `[${msg.from ?? 'unknown'}@${msg.embodimentId ?? 'embodiment'}] ${msg.content ?? ''}`;
            if (msgWaiters.length > 0) {
                msgWaiters.shift()(text);
            } else {
                msgQueue.push(text);
            }
        });

        const dequeueMessage = () => {
            if (msgQueue.length > 0) return Promise.resolve(msgQueue.shift());
            if (!isEnabled(agentCfg, 'autonomousLoop')) {
                return new Promise(res => msgWaiters.push(res));
            }
            return Promise.resolve(null); // autonomous mode: generate self-task elsewhere
        };

        // Helpers
        const bool = (v) => v ? Term.sym('True') : Term.sym('False');
        const ok   = () => Term.sym('ok');
        const g    = interp.ground;
        const cap  = (flag) => isEnabled(agentCfg, flag);

        // ── Grounded ops ──────────────────────────────────────────

        // Budget is a plain JS counter; no MeTTa state atom needed in Phase 1
        let _budget = agentCfg.loop?.budget ?? 50;

        g.register('cap?', (flagAtom) => {
            const flag = flagAtom?.name ?? String(flagAtom);
            return bool(cap(flag));
        });

        g.register('agent-budget', () => Term.grounded(_budget));

        g.register('reset-budget', () => {
            _budget = agentCfg.loop?.budget ?? 50;
            return Term.grounded(_budget);
        });

        g.register('agent-reset!', () => {
            loopState.cycleCount = 0;
            _budget = agentCfg.loop?.budget ?? 50;
            return ok();
        });

        g.register('inc-cycle-count!', () => {
            loopState.cycleCount++;
            return ok();
        });

        g.register('check-embodiment-bus', () => dequeueMessage(), { async: true });

        g.register('new-message?', (msg) => {
            const msgVal = msg?.value ?? (msg?.name !== '()' ? msg?.name : null) ?? null;
            const isNew  = msgVal !== null && msgVal !== loopState.prevmsg;
            if (isNew) loopState.prevmsg = msgVal;
            return bool(isNew);
        });

        g.register('tick-wm', () => {
            loopState.wm = (loopState.wm ?? [])
                .map(e => ({ ...e, ttl: e.ttl - 1 }))
                .filter(e => e.ttl > 0);
            return ok();
        });

        // ── Shared helpers (used by both grounded ops and JS loop) ──

        const buildContextFn = async (msgStr) => {
            const skills   = dispatcher.getActiveSkillDefs();
            const maxHist  = agentCfg.memory?.maxHistoryChars   ?? 12000;
            const maxFb    = agentCfg.memory?.maxFeedbackChars  ?? 6000;
            const maxWm    = agentCfg.memory?.wmRegisterChars   ?? 1500;
            const maxPinned = agentCfg.memory?.pinnedMaxChars   ?? 3000;
            const maxRecall = agentCfg.memory?.maxRecallChars   ?? 8000;

            const wmStr = loopState.wm.length > 0
                ? loopState.wm
                    .map(e => `[${e.priority.toFixed(2)}] ${e.content} (ttl:${e.ttl})`)
                    .join('\n').slice(0, maxWm)
                : '';

            let histStr = '';
            for (let i = loopState.historyBuffer.length - 1; i >= 0; i--) {
                const candidate = loopState.historyBuffer[i] + '\n' + histStr;
                if (candidate.length > maxHist) break;
                histStr = candidate;
            }

            const lastResultsStr = JSON.stringify(loopState.lastresults ?? []).slice(0, maxFb);

            // Semantic memory: pinned and recall
            let pinnedStr = '';
            let recallStr = '';
            if (this._semanticMemory && isEnabled(agentCfg, 'semanticMemory')) {
                const pinned = await this._semanticMemory.getPinned(maxPinned);
                if (pinned.length > 0) {
                    pinnedStr = pinned.map(p => `* ${p.content}`).join('\n').slice(0, maxPinned);
                }

                // Query recent memories based on context
                const contextQuery = msgStr ? msgStr.slice(0, 200) : 'recent';
                const recall = await this._semanticMemory.query(contextQuery, 10, { minScore: 0.3 });
                if (recall.length > 0) {
                    recallStr = recall
                        .map(r => `[${r.score.toFixed(2)}] ${r.content}`)
                        .join('\n')
                        .slice(0, maxRecall);
                }
            }

            let ctx = `SKILLS:\n${skills}\n\n`;
            if (wmStr)           ctx += `WM_REGISTER:\n${wmStr}\n\n`;
            if (pinnedStr)       ctx += `PINNED:\n${pinnedStr}\n\n`;
            if (recallStr)       ctx += `RECALL:\n${recallStr}\n\n`;
            if (histStr)         ctx += `HISTORY:\n${histStr}\n`;
            if (lastResultsStr && lastResultsStr !== '[]')
                                 ctx += `LAST_RESULTS: ${lastResultsStr}\n\n`;
            if (loopState.error) ctx += `ERROR: ${JSON.stringify(loopState.error)}\n\n`;
            if (msgStr)          ctx += `INPUT: ${msgStr}\n\n`;
            ctx += `OUTPUT: Respond with ONLY a list of skill S-expressions.\n`;
            ctx += `Format: ((skill1 "arg1") (skill2 "arg2"))\n`;
            ctx += `Max ${agentCfg.loop?.maxSkillsPerCycle ?? 3} skills. Check parentheses carefully.`;
            return ctx;
        };

        const invokeLLMFn = async (ctx) => {
            try {
                // Phase 3: Use ModelRouter if multiModelRouting is enabled
                if (isEnabled(agentCfg, 'multiModelRouting') && this._modelRouter) {
                    // Check for model override from set-model skill
                    let override = 'auto';
                    if (loopState.modelOverride && loopState.modelOverrideCycles > 0) {
                        override = loopState.modelOverride;
                        loopState.modelOverrideCycles--;
                        if (loopState.modelOverrideCycles <= 0) {
                            loopState.modelOverride = null;
                        }
                    }

                    const result = await this._modelRouter.invoke(ctx, {}, override);
                    const text = result.text ?? '';
                    loopState.lastsend = text;
                    return text;
                } else {
                    // Fallback to existing this.ai
                    const result = await this.ai.generate(ctx);
                    const text = result.text ?? '';
                    loopState.lastsend = text;
                    return text;
                }
            } catch (err) {
                Logger.error('[MeTTa llm-invoke]', err.message);
                return '';
            }
        };

        // ── Grounded ops (for MeTTa introspection and future MeTTa execution) ──

        g.register('build-context', async (msg) => {
            const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : null) ?? '';
            return Term.grounded(await buildContextFn(msgStr));
        }, { async: true });

        g.register('llm-invoke', async (ctx) => {
            const ctxStr = ctx?.value ?? (typeof ctx === 'string' ? ctx : String(ctx ?? ''));
            return Term.grounded(await invokeLLMFn(ctxStr));
        }, { async: true });

        g.register('parse-response', (resp) => {
            const respStr = resp?.value ?? (typeof resp === 'string' ? resp : String(resp ?? ''));
            const { cmds, error } = dispatcher.parseResponse(respStr);
            loopState.error = error;
            return Term.grounded(cmds);
        });

        g.register('execute-commands', async (cmds) => {
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
            return ok();
        });

        g.register('emit-cycle-audit', (msg, resp, result) => {
            Logger.debug(`[audit] cycle=${loopState.cycleCount} msg="${String(msg?.value ?? msg ?? '').slice(0, 80)}"`);
            return ok();
        });

        g.register('sleep-cycle', () => {
            const ms = agentCfg.loop?.sleepMs ?? 2000;
            return new Promise(res => setTimeout(res, ms)).then(() => ok());
        }, { async: true });

        // ── Introspection ops (§5.10) — gated by runtimeIntrospection ──
        g.register('manifest', () => {
            if (!cap('runtimeIntrospection')) {
                return Term.grounded('(manifest :restricted true)');
            }
            const manifest = {
                version: '0.1.0',
                profile: agentCfg.profile ?? 'parity',
                capabilities: Object.fromEntries(
                    Object.keys(agentCfg.capabilities ?? {}).map(k => [k, cap(k)])
                ),
                activeSkills: dispatcher.getActiveSkillDefs().split('\n'),
                cycleCount: loopState.cycleCount,
                wmEntries: loopState.wm.length,
                budget: _budget
            };
            return Term.grounded(`(agent-manifest :version "${manifest.version}" :profile "${manifest.profile}" :cycle-count ${manifest.cycleCount} :wm-entries-count ${manifest.wmEntries} :budget ${manifest.budget})`);
        });

        g.register('skill-inventory', () => {
            if (!cap('runtimeIntrospection')) {
                return Term.grounded('(skill-inventory :restricted true)');
            }
            const skills = dispatcher.getActiveSkillDefs();
            return Term.grounded(`(skill-inventory ${skills.split('\n').map(s => `(skill-entry ${s})`).join(' ')})`);
        });

        g.register('subsystems', () => {
            const subsystems = {
                channelManager: !!this.channelManager,
                ai: !!this.ai,
                toolInstances: Object.keys(this.toolInstances ?? {}),
                mettaControlPlane: cap('mettaControlPlane')
            };
            return Term.grounded(`(subsystems :channel-manager ${subsystems.channelManager} :ai ${subsystems.ai} :tools "${JSON.stringify(subsystems.toolInstances)}" :metta-control-plane ${subsystems.mettaControlPlane})`);
        });

        g.register('agent-state', (keyAtom) => {
            const key = keyAtom?.name ?? String(keyAtom ?? '');
            if (key === '&wm') {
                const wmStr = loopState.wm.map(e => `(wm-entry :content "${e.content}" :priority ${e.priority} :ttl ${e.ttl})`).join(' ');
                return Term.grounded(`(agent-state "&wm" (${wmStr}))`);
            }
            if (key === '&budget') {
                return Term.grounded(`(agent-state "&budget" ${_budget})`);
            }
            if (key === '&cycle-count') {
                return Term.grounded(`(agent-state "&cycle-count" ${loopState.cycleCount})`);
            }
            if (key === '&error') {
                return Term.grounded(`(agent-state "&error" ${loopState.error ? `"${loopState.error}"` : '()'})`);
            }
            return Term.grounded(`(agent-state :unknown-key "${key}")`);
        });

        // ── Dynamic skill discovery (§5.2.1) — gated by dynamicSkillDiscovery ──
        g.register('discover-skills', async () => {
            if (!cap('dynamicSkillDiscovery')) {
                return Term.grounded('(discover-skills :restricted true)');
            }
            // Phase 1: filesystem scan only (no SKILL.md parsing yet)
            const { readdir } = await import('fs/promises');
            const { join } = await import('path');
            const skillsDir = resolve(__agentDir, '../../memory/skills');
            try {
                const files = await readdir(skillsDir);
                const mettaFiles = files.filter(f => f.endsWith('.metta'));
                let loaded = 0;
                for (const file of mettaFiles) {
                    const code = await readFile(join(skillsDir, file), 'utf8');
                    interp.run(code);
                    loaded++;
                }
                return Term.grounded(`(discover-skills :loaded ${loaded} :files "${JSON.stringify(mettaFiles)}")`);
            } catch (err) {
                return Term.grounded(`(discover-skills :error "${err.message}")`);
            }
        }, { async: true });

        // Register skill handlers into dispatcher
        await this._registerMeTTaSkills(dispatcher, agentCfg, loopState);

        // Load MeTTa files (rules available for introspection and future MeTTa execution)
        const skillsCode = await readFile(
            resolve(__agentDir, 'metta/skills.metta'), 'utf8');
        const loopCode   = await readFile(
            resolve(__agentDir, 'metta/AgentLoop.metta'), 'utf8');

        interp.run(skillsCode);
        interp.run(loopCode);

        // ── Phase 1 JS async loop (mirrors AgentLoop.metta semantics) ──
        //
        // The MeTTa interpreter's reduceNDAsync does not yet support async
        // grounded ops mid-reduction. The JS loop implements the same semantics
        // until the interpreter gains that capability.
        return async () => {
            Logger.info('[MeTTa loop] Starting (profile=' + (agentCfg.profile ?? 'parity') + ')');
            loopState.cycleCount = 0;
            _budget = agentCfg.loop?.budget ?? 50;

            while (true) {
                if (_budget <= 0) {
                    if (!cap('autonomousLoop')) {
                        Logger.info('[MeTTa loop] Budget exhausted, halting.');
                        break;
                    }
                    _budget = agentCfg.loop?.budget ?? 50;
                }

                // check-embodiment-bus (async)
                const msg = await dequeueMessage();

                // new-message? — fresh message resets budget
                const isNew = msg !== null && msg !== loopState.prevmsg;
                if (isNew) {
                    loopState.prevmsg = msg;
                    _budget = agentCfg.loop?.budget ?? 50;
                } else {
                    _budget--;
                }

                // tick-wm
                loopState.wm = (loopState.wm ?? [])
                    .map(e => ({ ...e, ttl: e.ttl - 1 }))
                    .filter(e => e.ttl > 0);

                // build-context (async)
                const ctx = await buildContextFn(msg);

                // llm-invoke (async)
                const resp = await invokeLLMFn(ctx);

                // parse-response
                const { cmds, error } = dispatcher.parseResponse(resp);
                loopState.error = error;

                // execute-commands (async)
                let results = [];
                if (cmds.length > 0) {
                    try {
                        results = await dispatcher.execute(cmds);
                    } catch (err) {
                        Logger.error('[MeTTa execute-commands]', err.message);
                    }
                    loopState.lastresults = results;
                }

                // append-history
                if (cap('persistentHistory')) {
                    const entry = [
                        `USER: ${msg ?? '(no input)'}`,
                        `AGENT: ${resp}`,
                        `RESULT: ${JSON.stringify(results)}`
                    ].join('\n');
                    loopState.historyBuffer.push(entry);
                }

                // emit-cycle-audit
                if (cap('auditLog')) {
                    Logger.debug(`[audit] cycle=${loopState.cycleCount} msg="${(msg ?? '').slice(0, 80)}"`);
                }

                loopState.cycleCount++;
                Logger.debug(`[MeTTa loop] cycle=${loopState.cycleCount} budget=${_budget}`);

                // sleep-cycle (async)
                await new Promise(res => setTimeout(res, agentCfg.loop?.sleepMs ?? 2000));
            }
        };
    }

    /**
     * Register all parity-tier skill handlers into the dispatcher.
     * Called once during _buildMeTTaLoop setup.
     */
    async _registerMeTTaSkills(dispatcher, agentCfg, loopState) {
        // Always-on reflect skills
        dispatcher.register('think', async (content) => {
            Logger.debug(`[think] ${content}`);
            return '(thought recorded)';
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('metta', async (expr) => {
            Logger.debug(`[metta-eval] ${expr}`);
            return '(metta eval not yet wired — Phase 1)';
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('cognitive-cycle', async (stimulus) => {
            Logger.debug(`[cognitive-cycle] ${stimulus}`);
            return '(cognitive-cycle not yet wired — Phase 1)';
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('attend', async (content, priority) => {
            const pri = parseFloat(priority) || 0.5;
            const ttl = agentCfg.workingMemory?.defaultTtl ?? 10;
            loopState.wm.push({
                content: String(content),
                priority: pri,
                ttl,
                cycleAdded: loopState.cycleCount
            });
            loopState.wm.sort((a, b) => b.priority - a.priority);
            const max = agentCfg.workingMemory?.maxEntries ?? 20;
            if (loopState.wm.length > max) loopState.wm = loopState.wm.slice(0, max);
            return `attended: ${content}`;
        }, 'mettaControlPlane', ':reflect');

        dispatcher.register('dismiss', async (query) => {
            const before = loopState.wm.length;
            loopState.wm = loopState.wm.filter(
                e => !e.content.includes(String(query)));
            return `dismissed ${before - loopState.wm.length} items matching "${query}"`;
        }, 'mettaControlPlane', ':reflect');

        // Network skills
        dispatcher.register('send', async (content) => {
            const msg = String(content);
            if (msg === loopState.lastsend) return '(duplicate suppressed)';
            loopState.lastsend = msg;
            // Broadcast to all connected embodiments
            const embodiments = this.embodimentBus?.getAll() ?? [];
            const connected = embodiments.filter(e => e.status === 'connected');
            if (connected.length > 0) {
                await Promise.all(connected.map(e => e.sendMessage('default', msg).catch(err => Logger.warn(`Send to ${e.id} failed:`, err))));
            } else {
                Logger.info(`[AGENT→] ${msg}`);
            }
            return `sent: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
        }, 'mettaControlPlane', ':network');

        dispatcher.register('send-to', async (embodimentId, content) => {
            const embodiment = this.embodimentBus?.get(String(embodimentId));
            if (embodiment?.status === 'connected') {
                // Send to embodiment's primary target or broadcast
                await embodiment.sendMessage('default', String(content));
            } else {
                Logger.info(`[AGENT→${embodimentId}] ${content}`);
            }
            return `sent-to ${embodimentId}`;
        }, 'multiEmbodiment', ':network');

        // spawn-agent skill: spawn sub-agent in VirtualEmbodiment
        dispatcher.register('spawn-agent', async (task, cycleBudget) => {
            if (!this._virtualEmbodiment) {
                return '(spawn-error :reason "virtual-embodiment-not-available")';
            }
            const budget = parseInt(cycleBudget) || 10;
            const subAgentId = `subagent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const success = this._virtualEmbodiment.spawnSubAgent(subAgentId, String(task), {}, budget);
            if (success) {
                return `(spawned :id "${subAgentId}" :budget ${budget})`;
            }
            return `(spawn-error :reason "failed-to-spawn")`;
        }, 'subAgentSpawning', ':meta');

        if (isEnabled(agentCfg, 'webSearchSkill')) {
            dispatcher.register('search', async (query) => {
                if (this.toolInstances?.websearch?.search) {
                    const results = await this.toolInstances.websearch.search(String(query));
                    return JSON.stringify(results).slice(0, 2000);
                }
                return '(web search tool not configured)';
            }, 'webSearchSkill', ':network');
        }

        // File skills
        if (isEnabled(agentCfg, 'fileReadSkill')) {
            dispatcher.register('read-file', async (path) => {
                if (this.toolInstances?.file?.readFile) {
                    return await this.toolInstances.file.readFile(String(path));
                }
                return '(file tool not configured)';
            }, 'fileReadSkill', ':local-read');
        }

        if (isEnabled(agentCfg, 'fileWriteSkill')) {
            dispatcher.register('write-file', async (path, content) => {
                if (this.toolInstances?.file?.writeFile) {
                    await this.toolInstances.file.writeFile(String(path), String(content));
                    return `written: ${path}`;
                }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');

            dispatcher.register('append-file', async (path, content) => {
                if (this.toolInstances?.file?.appendFile) {
                    await this.toolInstances.file.appendFile(String(path), String(content));
                    return `appended: ${path}`;
                }
                return '(file tool not configured)';
            }, 'fileWriteSkill', ':local-write');
        }

        // Shell skill — gated by shellSkill capability
        if (isEnabled(agentCfg, 'shellSkill')) {
            dispatcher.register('shell', async (cmd) => {
                const { spawn } = await import('child_process');
                const shellCfg = agentCfg.shell ?? {};
                const allowlist = shellCfg.allowlist ?? [];
                const allowedPrefixes = shellCfg.allowedPrefixes ?? [];
                const forbiddenPatterns = shellCfg.forbiddenPatterns ?? [];

                const cmdStr = String(cmd);

                // Check forbidden patterns
                for (const pattern of forbiddenPatterns) {
                    if (cmdStr.includes(pattern)) {
                        return `(shell-blocked :reason "forbidden-pattern" :pattern "${pattern}")`;
                    }
                }

                // Check allowlist (exact match or prefix match)
                const allowed = allowlist.includes(cmdStr) ||
                    allowedPrefixes.some(prefix => cmdStr.startsWith(prefix));
                if (!allowed) {
                    return `(shell-blocked :reason "not-allowlisted" :command "${cmdStr.slice(0, 100)}")`;
                }

                // Execute with shell: false for safety
                return new Promise((resolve) => {
                    const [exec, ...args] = cmdStr.split(' ');
                    const proc = spawn(exec, args, { shell: false, timeout: 30000 });
                    let stdout = '';
                    let stderr = '';
                    proc.stdout.on('data', (d) => stdout += d);
                    proc.stderr.on('data', (d) => stderr += d);
                    proc.on('close', (code) => {
                        resolve(`(shell-result :exit ${code} :stdout "${stdout.slice(0, 2000)}" :stderr "${stderr.slice(0, 500)}")`);
                    });
                    proc.on('error', (err) => {
                        resolve(`(shell-error "${err.message}")`);
                    });
                });
            }, 'shellSkill', ':system');
        }

        // Semantic memory — Phase 2: wire SemanticMemory.js
        if (isEnabled(agentCfg, 'semanticMemory')) {
            const SemanticMemory = await loadSemanticMemory();
            this._semanticMemory = new SemanticMemory({
                dataDir: resolve(__agentDir, '../../memory'),
                embedder: agentCfg.memory?.embedder ?? 'Xenova/all-MiniLM-L6-v2',
                vectorDimensions: agentCfg.memory?.vectorDimensions ?? 384
            });
            await this._semanticMemory.initialize();

            dispatcher.register('remember', async (content, type, tags) => {
                const id = await this._semanticMemory.remember({
                    content: String(content),
                    type: type ?? 'episodic',
                    tags: tags ?? [],
                    source: 'agent-loop'
                });
                return `(remembered :id "${id}")`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('query', async (text, k) => {
                const kValue = parseInt(k) || (agentCfg.memory?.maxRecallItems ?? 10);
                const results = await this._semanticMemory.query(String(text), kValue);
                if (results.length === 0) return '(query-result :count 0)';
                const items = results.map(r =>
                    `(memory :id "${r.id}" :content "${r.content.replace(/"/g, '\\"')}" :score ${r.score.toFixed(3)} :type :${r.type})`
                ).join(' ');
                return `(query-result :count ${results.length} ${items})`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('pin', async (memoryId) => {
                const success = await this._semanticMemory.pin(String(memoryId));
                return success ? `(pinned :id "${memoryId}")` : `(pin-error :reason "not-found" :id "${memoryId}")`;
            }, 'semanticMemory', ':memory');

            dispatcher.register('forget', async (queryText) => {
                const count = await this._semanticMemory.forget(String(queryText));
                return `(forgot :count ${count})`;
            }, 'semanticMemory', ':memory');
        }

        // Phase 3: Multi-Model Intelligence
        if (isEnabled(agentCfg, 'multiModelRouting')) {
            const { ModelRouter } = await import('./models/ModelRouter.js');
            const { AIClient } = await import('./ai/AIClient.js');

            this._aiClient = new AIClient(agentCfg.lm ?? {});
            this._modelRouter = new ModelRouter(agentCfg, this._aiClient, this._semanticMemory);
            await this._modelRouter.initialize();

            // set-model skill: override active model for next N cycles
            dispatcher.register('set-model', async (modelName, cycles) => {
                const cyclesValue = parseInt(cycles) || 1;
                loopState.modelOverride = String(modelName);
                loopState.modelOverrideCycles = cyclesValue;
                Logger.info(`[set-model] ${modelName} for ${cyclesValue} cycles`);
                return `(model-set :model "${modelName}" :cycles ${cyclesValue})`;
            }, 'multiModelRouting', ':meta');

            // eval-model skill: benchmark a model on a task type
            if (isEnabled(agentCfg, 'modelExploration')) {
                const { ModelBenchmark } = await import('./models/ModelBenchmark.js');
                this._modelBenchmark = new ModelBenchmark(this._aiClient, agentCfg);

                dispatcher.register('eval-model', async (modelName, taskType) => {
                    const model = String(modelName);
                    const type = taskType ? String(taskType) : null;
                    const taskTypes = type ? [type] : null;

                    Logger.info(`[eval-model] Benchmarking ${model}${type ? ` on ${type}` : ''}`);
                    const results = await this._modelBenchmark.run(model, taskTypes);

                    // Update router scores
                    for (const [tType, scoreData] of Object.entries(results.scores)) {
                        const avg = scoreData.average;
                        const conf = Math.min(0.95, scoreData.taskCount * 0.15);
                        await this._modelRouter.setScore(model, tType, avg, conf);
                    }

                    return `(eval-result :model "${model}" :scores ${JSON.stringify(results.scores).replace(/"/g, "'")})`;
                }, 'modelExploration', ':meta');
            }
        }
    }

    _setupChannelRouting() {
        this.channelManager.on('message', async (msg) => {
            Logger.info(`[Agent] Received from ${msg.protocol}:${msg.from}: ${msg.content}`);
            try {
                await this.inputProcessor.processChannelMessage(msg);
            } catch (err) {
                Logger.error('Error processing channel message:', err);
            }
        });
    }

    get agentLM() {
        return this.lm;
    }

    emit(event, ...args) {
        this._eventBus?.emit(event, ...args);
    }

    _initializeCommandRegistry() {
        const registry = new Commands.AgentCommandRegistry();
        Object.values(Commands).forEach(CmdClass => {
            if (typeof CmdClass === 'function' &&
                CmdClass.prototype instanceof Commands.AgentCommand &&
                CmdClass !== Commands.AgentCommand) {
                try {
                    registry.register(new CmdClass());
                } catch (e) {
                    Logger.warn(`Failed to register command ${CmdClass.name}: ${e.message}`);
                }
            }
        });
        return registry;
    }

    _registerEventHandlers() {
    }

    async processInput(input) {
        return this.inputProcessor.processInput(input);
    }

    async executeCommand(cmd, ...args) {
        const ALIASES = {
            'next': 'n', 'stop': 'st', 'quit': 'exit', 'q': 'exit'
        };
        const command = ALIASES[cmd] ?? cmd;

        const builtins = {
            'n': () => this._next(),
            'go': () => this._run(),
            'st': () => this._stop(),
            'exit': () => {
                this.emit(AGENT_EVENTS.ENGINE_QUIT);
                return '👋 Goodbye!';
            }
        };

        if (builtins[command]) {
            return builtins[command]();
        }

        if (this.commandRegistry.get(command)) {
            const result = await this.commandRegistry.execute(command, this, ...args);
            this.emit(`command.${command} `, { command, args, result });
            return result;
        }

        return `❌ Unknown command: ${command} `;
    }

    async processNarsese(input) {
        return this.inputProcessor.processNarsese(input);
    }

    async* streamExecution(input) {
        yield* this.agentStreamer.streamExecution(input);
    }

    async processInputStreaming(input, onChunk, onStep) {
        return this.agentStreamer.processInputStreaming(input, onChunk, onStep);
    }

    async _next() {
        try {
            await this.step();
            this.emit(AGENT_EVENTS.NAR_CYCLE_STEP, {cycle: this.cycleCount});
            return `⏭️  Single cycle executed.Cycle: ${this.cycleCount} `;
        } catch (error) {
            this.emit(AGENT_EVENTS.NAR_ERROR, {error: error.message});
            return `❌ Error executing single cycle: ${error.message} `;
        }
    }

    async _run() {
        return this.startAutoStep(10);
    }

    async startAutoStep(interval = 10) {
        if (this.runState.isRunning) this._stopRun();

        this.runState.isRunning = true;
        this.emit(AGENT_EVENTS.NAR_CYCLE_START, { reason: 'auto-step' });

        if (!this.displaySettings.quiet && !this.traceEnabled) {
            this.traceEnabled = true;
            this.emit(AGENT_EVENTS.NAR_TRACE_ENABLE, { reason: 'auto-step session' });
        }

        const runLoop = async () => {
            if (!this.runState.isRunning) return;

            try {
                await this.step();
                if (this.runState.isRunning) {
                    this.runState.intervalId = setTimeout(runLoop, interval);
                }
            } catch (error) {
                Logger.error(`Error during run: ${error.message}`);
                this._stopRun();
            }
        };

        runLoop();

        this.emit(AGENT_EVENTS.NAR_CYCLE_RUNNING, { interval });
        return `🏃 Auto - stepping every ${interval}ms... Use "/stop" or input to stop.`;
    }

    _stop() {
        return this._stopRun();
    }

    _stopRun() {
        if (this.runState.intervalId) {
            clearTimeout(this.runState.intervalId);
            this.runState.intervalId = null;
        }
        this.runState.isRunning = false;
        this.emit(AGENT_EVENTS.NAR_CYCLE_STOP);
        return '🛑 Run stopped.';
    }

    reset(options = {}) {
        super.reset(options);
        this.sessionState.history = [];
        this.sessionState.lastResult = null;
        this.emit(AGENT_EVENTS.ENGINE_RESET);
        return '🔄 Agent reset successfully.';
    }

    async save() {
        const state = this.serialize();
        return await this.persistenceManager.saveToDefault(state);
    }

    async load(filepath = null) {
        let state;
        if (filepath) {
            state = await this.persistenceManager.loadFromPath(filepath);
        } else {
            state = await this.persistenceManager.loadFromDefault();
        }
        if (!state) return false;
        return await this.deserialize(state);
    }

    getHistory() {
        return [...this.sessionState.history];
    }

    formatTaskForDisplay(task) {
        return FormattingUtils.formatTask(task);
    }

    async shutdown() {
        await this.embodimentBus?.shutdown();
        if (super.shutdown) await super.shutdown();
    }
}
