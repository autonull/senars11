import {FormattingUtils, Input, NAR, Logger} from '@senars/core';
import {PersistenceManager} from './io/PersistenceManager.js';
import {ChannelManager} from './io/ChannelManager.js';
import {ChannelConfig} from './io/ChannelConfig.js';
import * as Commands from './commands/Commands.js';
import {AGENT_EVENTS} from './constants.js';
import {InputProcessor} from './InputProcessor.js';
import {AgentStreamer} from './AgentStreamer.js';
import {AIClient} from './ai/AIClient.js';

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

        // Auto-join if configured
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

        if (this.metta) {
             this._registerMeTTaExtensions();
        }
    }

    async _autoJoinChannels(config) {
        if (config.channels) {
            // Lazy load specific channels to avoid circular deps
            const { IRCChannel, NostrChannel } = await import('./io/index.js');

            if (config.channels.irc) {
                try {
                    const irc = new IRCChannel(config.channels.irc);
                    this.channelManager.register(irc);
                    // Connect asynchronously
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
        }
    }

    _registerMeTTaExtensions() {
        if (this.metta && !this._channelExtensionRegistered) {
             // Register ChannelExtension
             import('../../../metta/src/extensions/ChannelExtension.js').then(({ ChannelExtension }) => {
                 // Pass `this` (agent) to ChannelExtension to enable LLM access
                 const ext = new ChannelExtension(this.metta, this.channelManager);
                 ext.agent = this; // Attach agent explicitly
                 ext.register();
                 this._channelExtensionRegistered = true;
             }).catch(err => Logger.error("Failed to register ChannelExtension:", err));

             // Register MemoryExtension
             import('../../../metta/src/extensions/MemoryExtension.js').then(({ MemoryExtension }) => {
                 const memExt = new MemoryExtension(this.metta, this);
                 memExt.register();
             }).catch(err => Logger.error("Failed to register MemoryExtension:", err));
        }
    }

    async initialize() {
        await super.initialize();
        this._registerMeTTaExtensions();
        this._registerEventHandlers();
        this.emit(AGENT_EVENTS.ENGINE_READY, {success: true, message: 'Agent initialized successfully'});
        return true;
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
        // Register all command classes exported from Commands.js
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
