import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Input, NAR } from '@senars/nar';
import { BaseComponent, FormattingUtils, Logger, resolveWithFallback, fallbackAgentDir, generateId } from '@senars/core';
import { PersistenceManager } from './io/PersistenceManager.js';
import { EmbodimentBus } from './io/EmbodimentBus.js';
import { VirtualEmbodiment } from './io/VirtualEmbodiment.js';
import { AgentCommand, AgentCommandRegistry } from './commands/AgentCommand.js';
import { AGENT_EVENTS } from './constants.js';
import { InputProcessor } from './InputProcessor.js';
import { AgentStreamer } from './AgentStreamer.js';
import { AIClient } from './ai/AIClient.js';
import { ToolAdapter } from './ai/ToolAdapter.js';
import { isEnabled, validateDeps } from './config/capabilities.js';
import { validate } from './config/validate.js';
import { MeTTaLoopBuilder } from './metta/MeTTaLoopBuilder.js';
import { resolveCommand } from './commands/CommandMappings.js';
import * as CommandModules from './commands/Commands.js';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

export class Agent extends BaseComponent {
    constructor(config = {}) {
        super(config, 'Agent');

        this.id = config.id || generateId('agent');
        this.nar = new NAR(config);
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
        this.channels = {
            get: (id) => this.embodimentBus.get(id),
            register: (emb) => this.embodimentBus.register(emb),
            send: async (id, target, content, metadata) => {
                const emb = this.embodimentBus.get(id);
                if (emb?.status !== 'connected') throw new Error(`Channel ${id} not connected`);
                return emb.sendMessage(target, content, metadata);
            }
        };
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

        if (this.metta) {this.#registerMeTTaExtensions();}
    }

    get metta() { return this.nar.metta; }
    set metta(v) { this.nar.metta = v; }
    get cycleCount() { return this.nar.cycleCount; }
    get traceEnabled() { return this.nar.traceEnabled; }
    set traceEnabled(v) { this.nar.traceEnabled = v; }
    get lm() { return this.nar.lm; }
    get agentLM() { return this.nar.lm; }
    get config() { return this.nar.config; }
    get memory() { return this.nar.memory; }
    get isRunning() { return this.nar.isRunning; }
    get tools() { return this.nar.tools; }
    get evaluator() { return this.nar.evaluator; }
    get metricsMonitor() { return this.nar.metricsMonitor; }
    get embeddingLayer() { return this.nar.embeddingLayer; }
    get termLayer() { return this.nar.termLayer; }
    get streamReasoner() { return this.nar.streamReasoner; }
    get explanationService() { return this.nar.explanationService; }
    get componentManager() { return this.nar.componentManager; }
    get reasoningAboutReasoning() { return this.nar.reasoningAboutReasoning; }
    get ruleEngine() { return this.nar.ruleEngine; }
    get semanticMemory() { return this._semanticMemory; }
    get modelRouter() { return this._modelRouter; }
    get virtualEmbodiment() { return this._virtualEmbodiment; }
    get modelBenchmark() { return this._modelBenchmark; }

    emit(event, ...args) { this.nar._eventBus?.emit(event, ...args); }
    on(event, handler) { this.nar._eventBus?.on(event, handler); }
    off(event, handler) { this.nar._eventBus?.off(event, handler); }

    async input(input, options = {}) { return this.nar.input(input, options); }
    getBeliefs() { return this.nar?.getBeliefs?.() ?? []; }
    async runCycles(n = 1) { for (let i = 0; i < n; i++) {await this.nar.step();} }
    async start() { return this.nar.start(); }
    async stop() { return this.nar.stop(); }

    async _autoJoinChannels(config) {
        if (!config.channels) {return;}
        const { IRCChannel, NostrChannel, WebSearchTool, FileTool } = await import('./io/index.js');

        for (const [name, ChannelClass, cfg] of [
            ['irc', IRCChannel, config.channels.irc],
            ['nostr', NostrChannel, config.channels.nostr]
        ]) {
            if (!cfg) {continue;}
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
        if (!this.metta) return;
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
        }).catch(err => Logger.warn(`[Agent] Extension ${path.split('/').pop()} not loaded:`, err.message));
    }

    async initialize() {
        await this.nar.initialize();

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

        // Merge constructor config (from Bot or other callers) into agentCfg.
        // This is how the Bot's bot.config.json capabilities reach the Agent.
        const constructorCaps = this.config.capabilities;
        if (constructorCaps && typeof constructorCaps === 'object') {
            this.agentCfg.capabilities = { ...this.agentCfg.capabilities, ...constructorCaps };
        }

        const constructorLm = this.config.lm || {};
        if (Object.keys(constructorLm).length > 0) {
            this.agentCfg.lm = { ...this.agentCfg.lm, ...constructorLm };
            for (const key of Object.keys(constructorLm)) {
                if (typeof constructorLm[key] === 'object' && constructorLm[key] !== null && !Array.isArray(constructorLm[key])) {
                    this.agentCfg.lm[key] = { ...(this.agentCfg.lm[key] || {}), ...constructorLm[key] };
                }
            }
        }

        if (this.agentCfg.lm) {this.ai = new AIClient(this.agentCfg.lm);}

        const validationErrors = validate(this.agentCfg);
        if (validationErrors.length > 0) {
            const msg = `[Agent] Configuration errors:\n${validationErrors.map(e => `  - ${e}`).join('\n')}`;
            Logger.error(msg);
            throw new Error(msg);
        }
        try {
            validateDeps(this.agentCfg);
        } catch (err) {
            Logger.error('[Agent] Capability dependency error:', err.message);
            throw err;
        }

        if (isEnabled(this.agentCfg, 'mettaControlPlane')) {
            const builder = new MeTTaLoopBuilder(this, this.agentCfg);
            this._mettaLoopBuilder = builder;
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
        const command = resolveCommand(cmd);
        const builtins = {
            n: () => this._next(),
            go: () => this.startAutoStep(10),
            st: () => this._stopRun(),
            exit: () => { this.emit(AGENT_EVENTS.ENGINE_QUIT); return 'Goodbye!'; }
        };

        if (builtins[command]) {return builtins[command]();}
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
            await this.nar.step();
            this.emit(AGENT_EVENTS.NAR_CYCLE_STEP, { cycle: this.cycleCount });
            return `Single cycle executed. Cycle: ${this.cycleCount}`;
        } catch (error) {
            this.emit(AGENT_EVENTS.NAR_ERROR, { error: error.message });
            return `Error executing single cycle: ${error.message}`;
        }
    }

    async startAutoStep(interval = 10) {
        if (this.runState.isRunning) {this._stopRun();}
        this.runState.isRunning = true;
        this.emit(AGENT_EVENTS.NAR_CYCLE_START, { reason: 'auto-step' });

        if (!this.displaySettings.quiet && !this.traceEnabled) {
            this.traceEnabled = true;
            this.emit(AGENT_EVENTS.NAR_TRACE_ENABLE, { reason: 'auto-step session' });
        }

        const runLoop = async () => {
            if (!this.runState.isRunning) {return;}
            try {
                await this.nar.step();
                if (this.runState.isRunning) {this.runState.intervalId = setTimeout(runLoop, interval);}
            } catch (error) {
                Logger.error(`Error during run: ${error.message}`);
                this._stopRun();
            }
        };
        await runLoop();
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
        this.nar.reset(options);
        this.sessionState.history = [];
        this.sessionState.lastResult = null;
        this.emit(AGENT_EVENTS.ENGINE_RESET);
        return 'Agent reset successfully.';
    }

    async save() { return this.persistenceManager.saveToDefault(this.nar.serialize()); }

    async load(filepath = null) {
        const state = filepath
            ? await this.persistenceManager.loadFromPath(filepath)
            : await this.persistenceManager.loadFromDefault();
        return state ? this.nar.deserialize(state) : false;
    }

    getHistory() { return [...this.sessionState.history]; }
    formatTaskForDisplay(task) { return FormattingUtils.formatTask(task); }

    async shutdown() {
        this._mettaLoopBuilder?.stop();
        await this.embodimentBus?.shutdown();
        await this.nar.shutdown?.();
    }
}
