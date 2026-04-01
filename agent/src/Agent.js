import {FormattingUtils, Input, NAR, Logger} from '@senars/core';
import {PersistenceManager} from './io/PersistenceManager.js';
import {ChannelManager} from './io/ChannelManager.js';
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

        // Initialize Channels with Config
        const channelConfig = ChannelConfig.load(config.channelConfigPath);
        this.channelManager = new ChannelManager(channelConfig);

        // Setup Tools
        this.toolInstances = {};

        // Auto-join if configured and register tools
        this._autoJoinChannels(channelConfig);
        this._setupChannelRouting();

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
                    this.channelManager.register(irc);
                    irc.connect().catch(e => Logger.error('Auto-connect IRC failed:', e));
                } catch (e) {
                    Logger.error('Failed to init IRC channel:', e);
                }
            }

            if (config.channels.nostr) {
                try {
                    const nostr = new NostrChannel(config.channels.nostr);
                    this.channelManager.register(nostr);
                    nostr.connect().catch(e => Logger.error('Auto-connect Nostr failed:', e));
                } catch (e) {
                    Logger.error('Failed to init Nostr channel:', e);
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
                 const ext = new ChannelExtension(this.metta, this.channelManager);
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

        // Message queue wired from ChannelManager events
        const msgQueue    = [];
        const msgWaiters  = [];

        this.channelManager.on('message', (msg) => {
            const text = `[${msg.from ?? 'unknown'}@${msg.channel ?? 'cli'}] ${msg.content ?? ''}`;
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

        const buildContextFn = (msgStr) => {
            const skills   = dispatcher.getActiveSkillDefs();
            const maxHist  = agentCfg.memory?.maxHistoryChars   ?? 12000;
            const maxFb    = agentCfg.memory?.maxFeedbackChars  ?? 6000;
            const maxWm    = agentCfg.memory?.wmRegisterChars   ?? 1500;

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

            let ctx = `SKILLS:\n${skills}\n\n`;
            if (wmStr)           ctx += `WM_REGISTER:\n${wmStr}\n\n`;
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
                const result = await this.ai.generate(ctx);
                const text   = result.text ?? '';
                loopState.lastsend = text;
                return text;
            } catch (err) {
                Logger.error('[MeTTa llm-invoke]', err.message);
                return '';
            }
        };

        // ── Grounded ops (for MeTTa introspection and future MeTTa execution) ──

        g.register('build-context', (msg) => {
            const msgStr = msg?.value ?? (typeof msg === 'string' ? msg : null) ?? '';
            return Term.grounded(buildContextFn(msgStr));
        });

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

        // Register skill handlers into dispatcher
        this._registerMeTTaSkills(dispatcher, agentCfg, loopState);

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

                // build-context
                const ctx = buildContextFn(msg);

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
    _registerMeTTaSkills(dispatcher, agentCfg, loopState) {
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
            const channels = [...(this.channelManager?.channels?.values() ?? [])];
            const primary  = channels[0];
            if (primary?.send) {
                await primary.send(msg);
            } else {
                Logger.info(`[AGENT→] ${msg}`);
            }
            return `sent: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
        }, 'mettaControlPlane', ':network');

        dispatcher.register('send-to', async (channel, content) => {
            const ch = this.channelManager?.channels?.get(String(channel));
            if (ch?.send) await ch.send(String(content));
            else Logger.info(`[AGENT→${channel}] ${content}`);
            return `sent-to ${channel}`;
        }, 'multiEmbodiment', ':network');

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

        // Semantic memory stubs — Phase 2 will wire SemanticMemory.js
        if (isEnabled(agentCfg, 'semanticMemory')) {
            dispatcher.register('remember', async (content) => {
                Logger.debug(`[remember] ${content} (SemanticMemory Phase 2)`);
                return '(remember queued — SemanticMemory not yet loaded)';
            }, 'semanticMemory', ':memory');

            dispatcher.register('query', async (text) => {
                return '(query — SemanticMemory not yet loaded)';
            }, 'semanticMemory', ':memory');

            dispatcher.register('pin', async (content) => {
                return '(pin — SemanticMemory not yet loaded)';
            }, 'semanticMemory', ':memory');

            dispatcher.register('forget', async (query) => {
                return '(forget — SemanticMemory not yet loaded)';
            }, 'semanticMemory', ':memory');
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
        await this.channelManager.shutdown();
        if (super.shutdown) await super.shutdown();
    }
}
