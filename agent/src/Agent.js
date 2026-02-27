import {FormattingUtils, Input, NAR, Logger} from '@senars/core';
import {PersistenceManager} from './io/PersistenceManager.js';
import {ChannelManager} from './io/ChannelManager.js';
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

        this.channelManager = new ChannelManager();
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

        // Ensure MeTTa interpreter gets the channel manager
        if (this.metta) {
             // If metta was already init by super(), we might need to re-init extensions or pass it now
             // But super() creates it. Let's see if we can attach it.
             // The cleanest way is to pass it in options if possible, but super() calls initialize.
             // We can manually register the extension here if we have access to this.metta.
             this._registerMeTTaExtensions();
        }
    }

    _registerMeTTaExtensions() {
        if (this.metta && !this._channelExtensionRegistered) {
            // Lazy load to avoid circular deps if needed, but we imported it in Interpreter
            // The Interpreter constructor now takes channelManager in options, but super() didn't pass it.
            // So we manually instantiate and register.
             import('../../../metta/src/extensions/ChannelExtension.js').then(({ ChannelExtension }) => {
                 const ext = new ChannelExtension(this.metta, this.channelManager);
                 ext.register();
                 this._channelExtensionRegistered = true;
             }).catch(err => Logger.error("Failed to register ChannelExtension:", err));
        }
    }

    // Override initialize to ensure extensions are ready
    async initialize() {
        await super.initialize();
        this._registerMeTTaExtensions();
        this._registerEventHandlers();
        this.emit(AGENT_EVENTS.ENGINE_READY, {success: true, message: 'Agent initialized successfully'});
        return true;
    }

    _setupChannelRouting() {
        this.channelManager.on('message', async (msg) => {
            // Route incoming channel message to Agent input
            // msg: { channelId, protocol, from, content, ... }
            Logger.info(`[Agent] Received from ${msg.protocol}:${msg.from}: ${msg.content}`);

            // Format input for the agent (e.g. including source context)
            const inputContext = `[${msg.protocol}:${msg.from}] ${msg.content}`;

            // We can treat this as Narsese input or Natural Language
            // For now, feed it to processInput
            try {
                // If it's a metta-based agent, we might want to insert it into the space directly
                // or trigger a specific event.
                // Let's treat it as generic input.
                const result = await this.processInput(inputContext);

                // If agent produces a result, we might want to reply back?
                // Currently processInput returns a result object.
                // If the result contains a response intended for the user, we should send it back.
                // This logic depends on how the Agent decides to reply.
                // For parity with mettaclaw, the MeTTa logic often handles the reply via (send-message).
                // So we might not auto-reply here unless configured.

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
        // No longer automatically emit log events for task.focus - UI handles task.focus directly
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

    // Delegate methods for backward compatibility and API
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
