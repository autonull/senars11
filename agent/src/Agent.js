import { readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FormattingUtils, Input, NAR, Logger } from '@senars/core';
import { PersistenceManager } from './io/PersistenceManager.js';
import { EmbodimentBus } from './io/EmbodimentBus.js';
import { VirtualEmbodiment } from './io/VirtualEmbodiment.js';
import { AgentCommand, AgentCommandRegistry } from './commands/Commands.js';
import { AGENT_EVENTS } from './constants.js';
import { InputProcessor } from './InputProcessor.js';
import { AgentStreamer } from './AgentStreamer.js';
import { AIClient } from './ai/AIClient.js';
import { ToolAdapter } from './ai/ToolAdapter.js';
import { isEnabled, validateDeps } from './config/capabilities.js';
import { MeTTaLoopBuilder } from './metta/MeTTaLoopBuilder.js';
import * as CommandModules from './commands/Commands.js';

let __agentDir;
try {
    __agentDir = dirname(fileURLToPath(import.meta.url));
} catch {
    __agentDir = typeof global !== 'undefined' && global.__dirname && global.__dirname.includes('agent')
        ? global.__dirname
        : join(process.cwd(), 'agent/src');
}

export class Agent extends NAR {
    constructor(config = {}) {
        super(config);

        this.id = config.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        this.inputQueue = new Input();
        this.sessionState = { history: [], lastResult: null, startTime: Date.now() };
        this.runState = { isRunning: false, intervalId: null };
        this.displaySettings = { echo: false, quiet: false };
        this.inputProcessingConfig = {
            enableNarseseFallback: config.inputProcessing?.enableNarseseFallback ?? true,
            checkNarseseSyntax: config.inputProcessing?.checkNarseseSyntax ?? true,
            lmTemperature: config.inputProcessing?.lmTemperature ?? 0.7
        };
        this.persistenceManager = new PersistenceManager({
            defaultPath: config.persistence?.defaultPath ?? './agent.json'
        });

        const embodimentConfig = config.embodiment || {};
        this.embodimentBus = new EmbodimentBus({
            attentionSalience: config.capabilities?.attentionSalience ?? false,
            ...embodimentConfig
        });
        this._virtualEmbodiment = new VirtualEmbodiment({
            autonomousMode: config.capabilities?.autonomousLoop ?? false,
            idleTimeout: config.capabilities?.virtualEmbodimentIdleTimeout ?? 5000
        });
        this.embodimentBus.register(this._virtualEmbodiment);

        this.toolInstances = {};
        this._autoJoinChannels(embodimentConfig);
        this.commandRegistry = this.#initCommandRegistry();
        this.uiState = { taskGrouping: null, taskSelection: [], taskFilters: {}, viewMode: 'vertical-split' };

        this.inputProcessor = new InputProcessor(this);
        this.agentStreamer = new AgentStreamer(this);
        this.ai = new AIClient(config.lm || {});

        if (this.metta) this.#registerMeTTaExtensions();
    }

    async _autoJoinChannels(config) {
        if (!config.channels) return;
        const { IRCChannel, NostrChannel, WebSearchTool, FileTool } = await import('./io/index.js');

        for (const [name, ChannelClass, cfg] of [
            ['irc', IRCChannel, config.channels.irc],
            ['nostr', NostrChannel, config.channels.nostr]
        ]) {
            if (!cfg) continue;
            try {
                const channel = new ChannelClass(cfg);
                this.embodimentBus.register(channel);
                channel.connect().catch(e => Logger.error(`Auto-connect ${name} failed:`, e));
            } catch (e) {
                Logger.error(`Failed to init ${name} embodiment:`, e);
            }
        }

        this.toolInstances.websearch = new WebSearchTool(config.tools?.websearch);
        this.toolInstances.file = new FileTool({ workspace: config.workspace ?? './workspace' });
    }

    #registerMeTTaExtensions() {
        if (!this.metta || this._channelExtensionRegistered) return;
        this.#registerExtension('../../../metta/src/extensions/ChannelExtension.js', ext => {
            ext.agent = this;
        });
        this.#registerExtension('../../../metta/src/extensions/MemoryExtension.js');
    }

    #registerExtension(path, configure) {
        import(path).then(({ default: Extension }) => {
            const ext = new Extension(this.metta, this.embodimentBus);
            configure?.(ext);
            ext.register();
            this._channelExtensionRegistered = true;
        }).catch(err => Logger.error('Failed to register MeTTa extension:', err));
    }

    async initialize() {
        await super.initialize();

        if (!this.toolInstances.websearch) {
            const { WebSearchTool, FileTool } = await import('./io/index.js');
            this.toolInstances.websearch = new WebSearchTool();
            this.toolInstances.file = new FileTool();
        }

        this.aiTools = {
            ...ToolAdapter.toAISDK(this.toolInstances.websearch, 'websearch'),
            ...ToolAdapter.toAISDK(this.toolInstances.file, 'file')
        };

        this.#registerMeTTaExtensions();
        this.agentCfg = await this.#loadAgentConfig();
        try {
            validateDeps(this.agentCfg);
        } catch (err) {
            Logger.error('[Agent] Capability dependency error:', err.message);
            throw err;
        }

        if (isEnabled(this.agentCfg, 'mettaControlPlane')) {
            const builder = new MeTTaLoopBuilder(this, this.agentCfg);
            this._mettaLoopStarter = await builder.build();
            Logger.info('[Agent] MeTTa control plane ready. Call agent.startMeTTaLoop() to begin.');
        }

        this.emit(AGENT_EVENTS.ENGINE_READY, { success: true, message: 'Agent initialized successfully' });
        return true;
    }

    async startMeTTaLoop() {
        if (!this._mettaLoopStarter) {
            throw new Error('MeTTa control plane not initialized. Check mettaControlPlane capability in agent.json.');
        }
        Logger.info('[Agent] Starting MeTTa agent loop...');
        return this._mettaLoopStarter();
    }

    async #loadAgentConfig() {
        try {
            return JSON.parse(await readFile(resolve(__agentDir, '../workspace/agent.json'), 'utf8'));
        } catch {
            Logger.warn('[Agent] Could not load agent.json, using default parity profile.');
            return { profile: 'parity', capabilities: {} };
        }
    }

    get agentLM() { return this.lm; }

    emit(event, ...args) { this._eventBus?.emit(event, ...args); }

    #initCommandRegistry() {
        const registry = new AgentCommandRegistry();
        for (const CmdClass of Object.values(CommandModules)) {
            if (typeof CmdClass === 'function' && CmdClass.prototype instanceof AgentCommand && CmdClass !== AgentCommand) {
                try { registry.register(new CmdClass()); }
                catch (e) { Logger.warn(`Failed to register command ${CmdClass.name}: ${e.message}`); }
            }
        }
        return registry;
    }

    async processInput(input) { return this.inputProcessor.processInput(input); }

    async executeCommand(cmd, ...args) {
        const command = { next: 'n', stop: 'st', quit: 'exit', q: 'exit' }[cmd] ?? cmd;
        const builtins = {
            n: () => this._next(),
            go: () => this.startAutoStep(10),
            st: () => this._stopRun(),
            exit: () => { this.emit(AGENT_EVENTS.ENGINE_QUIT); return 'Goodbye!'; }
        };

        if (builtins[command]) return builtins[command]();
        if (this.commandRegistry.get(command)) {
            const result = await this.commandRegistry.execute(command, this, ...args);
            this.emit(`command.${command}`, { command, args, result });
            return result;
        }
        return `Unknown command: ${command}`;
    }

    async processNarsese(input) { return this.inputProcessor.processNarsese(input); }
    async* streamExecution(input) { yield* this.agentStreamer.streamExecution(input); }
    async processInputStreaming(input, onChunk, onStep) { return this.agentStreamer.processInputStreaming(input, onChunk, onStep); }

    async _next() {
        try {
            await this.step();
            this.emit(AGENT_EVENTS.NAR_CYCLE_STEP, { cycle: this.cycleCount });
            return `Single cycle executed. Cycle: ${this.cycleCount}`;
        } catch (error) {
            this.emit(AGENT_EVENTS.NAR_ERROR, { error: error.message });
            return `Error executing single cycle: ${error.message}`;
        }
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
                if (this.runState.isRunning) this.runState.intervalId = setTimeout(runLoop, interval);
            } catch (error) {
                Logger.error(`Error during run: ${error.message}`);
                this._stopRun();
            }
        };
        runLoop();
        this.emit(AGENT_EVENTS.NAR_CYCLE_RUNNING, { interval });
        return `Auto-stepping every ${interval}ms... Use "/stop" or input to stop.`;
    }

    _stop() { return this._stopRun(); }

    _stopRun() {
        if (this.runState.intervalId) {
            clearTimeout(this.runState.intervalId);
            this.runState.intervalId = null;
        }
        this.runState.isRunning = false;
        this.emit(AGENT_EVENTS.NAR_CYCLE_STOP);
        return 'Run stopped.';
    }

    reset(options = {}) {
        super.reset(options);
        this.sessionState.history = [];
        this.sessionState.lastResult = null;
        this.emit(AGENT_EVENTS.ENGINE_RESET);
        return 'Agent reset successfully.';
    }

    async save() { return this.persistenceManager.saveToDefault(this.serialize()); }

    async load(filepath = null) {
        const state = filepath
            ? await this.persistenceManager.loadFromPath(filepath)
            : await this.persistenceManager.loadFromDefault();
        return state ? this.deserialize(state) : false;
    }

    getHistory() { return [...this.sessionState.history]; }
    formatTaskForDisplay(task) { return FormattingUtils.formatTask(task); }

    async shutdown() {
        await this.embodimentBus?.shutdown();
        await super.shutdown?.();
    }
}
