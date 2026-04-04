import { ConfigManager } from '@senars/core/src/config/ConfigManager.js';
import { BaseComponent } from '@senars/core';
import { IntrospectionEvents } from '@senars/core';
import { NARInitializer } from './NARInitializer.js';
import { NARSerializer } from './NARSerializer.js';
import { NARQueryEngine } from './NARQueryEngine.js';
import { NARIntegration } from './NARIntegration.js';
import { validateSchema } from '@senars/core/src/util/InputValidator.js';

export class NAR extends BaseComponent {
    constructor(config = {}) {
        super(config, 'NAR');
        this._initializer = new NARInitializer(this, config, this._eventBus);
        this._initializeCoreComponents(config);
        this._debugMode = this.config.debug?.pipeline || false;
        this.traceEnabled = false;
        this._serializer = new NARSerializer(this);
        this._queryEngine = new NARQueryEngine(this);
        this._integration = new NARIntegration(this);
    }

    get memory() { return this._memory; }
    get isRunning() { return this._isRunning; }
    get cycleCount() { return this._streamReasoner?.metrics?.totalDerivations || 0; }
    get lm() { return this._lm; }
    get tools() { return this._toolIntegration; }
    get explanationService() { return this._explanationService; }
    get componentManager() { return this._componentManager; }
    get metricsMonitor() { return this._metricsMonitor; }
    get evaluator() { return this._evaluator; }
    get ruleEngine() { return this._ruleEngine; }
    get embeddingLayer() { return this._embeddingLayer; }
    get termLayer() { return this._termLayer; }
    get reasoningAboutReasoning() { return this._reasoningAboutReasoning; }
    get streamReasoner() { return this._streamReasoner; }
    get metta() { return this._metta; }
    set metta(v) { this._metta = v; }
    get taskManager() { return this._taskManager; }
    get focus() { return this._focus; }

    _initializeCoreComponents(config) {
        this._configManager = new ConfigManager(config);
        const components = this._initializer.initialize();

        Object.assign(this, {
            _componentManager: components.componentManager,
            _termFactory: components.termFactory,
            _parser: components.parser,
            _lm: components.lm,
            _memory: components.memory,
            _focus: components.focus,
            _termLayer: components.termLayer,
            _embeddingLayer: components.embeddingLayer,
            _taskManager: components.taskManager,
            _evaluator: components.evaluator,
            _budgetManager: components.budgetManager,
            _inputProcessor: components.inputProcessor,
            _reasoningAboutReasoning: components.reasoningAboutReasoning,
            _toolIntegration: components.toolIntegration,
            _explanationService: components.explanationService,
            _metricsMonitor: components.metricsMonitor,
            _ruleEngine: null
        });

        this._isRunning = false;
        this._startTime = Date.now();
        this._initStreamReasoner();
    }

    async initialize() {
        try {
            const success = await this._componentManager.initializeAll();
            if (success) await this._setupDefaultRules();

            if (!this._streamReasoner) {
                this._initStreamReasoner();
                await this._registerRulesWithStreamReasoner();
            }
            return success;
        } catch (error) {
            this.logError('NAR initialization failed:', error);
            throw error;
        }
    }

    _initStreamReasoner() {
        this._streamReasoner = this._initializer.initStreamReasoner({
            focus: this._focus, memory: this._memory, termFactory: this._termFactory,
            parser: this._parser, budgetManager: this._budgetManager
        });
        this._streamReasoner.on('derivation', (derivation) => this._handleStreamDerivation(derivation));
    }

    async _handleStreamDerivation(derivation) {
        try {
            const added = await this._integration._inputTask(derivation, { traceId: 'stream' });
            if (added && this.traceEnabled) {
                this._eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                    derivedTask: derivation, source: 'streamReasoner.stream', timestamp: Date.now()
                });
            }
        } catch (error) {
            this.logError('Error handling stream derivation:', { error: error.message, task: derivation?.toString() });
        }
    }

    async _setupDefaultRules() {
        try { await this._registerRulesWithStreamReasoner(); }
        catch (error) { this.logWarn('Error setting up default rules:', error); }
    }

    async _registerRulesWithStreamReasoner() {
        if (!this._streamReasoner) return;
        await this._initializer.registerDefaultRules(this._streamReasoner, {
            parser: this._parser, lm: this._lm, embeddingLayer: this._embeddingLayer,
            memory: this._memory, termFactory: this._termFactory, eventBus: this._eventBus
        });
    }

    async input(input, options = {}) {
        if (input === null || input === undefined) {
            throw new Error('NAR.input: input parameter is required');
        }
        const validatedOptions = validateSchema(options, {
            traceId: { type: 'string', optional: true },
            priority: { type: 'number', min: 0, max: 1, optional: true },
            durability: { type: 'number', min: 0, max: 1, optional: true }
        }, 'NAR.input');

        try {
            const task = this._inputProcessor.processInput(input, validatedOptions);
            if (!task) throw new Error('Input processing failed to create task');

            const parsed = {
                term: task.term, punctuation: task.punctuation, taskType: task.type,
                truthValue: task.truth ? { frequency: task.truth.f, confidence: task.truth.c } : null
            };
            const originalInput = typeof input === 'string' ? input : task.toString();
            return await this._processNewTask(task, 'user', originalInput, parsed, validatedOptions);
        } catch (error) {
            this._handleInputError(error, input, validatedOptions);
        }
    }

    _handleInputError(error, input, options) {
        const inputError = new Error(`Input processing failed: ${error.message}`);
        inputError.cause = error;
        inputError.input = typeof input === 'string' ? input : 'Task Object';

        this._eventBus.emit(IntrospectionEvents.TASK_ERROR, {
            error: inputError.message, input: inputError.input, originalError: error
        }, { traceId: options.traceId });

        this.logError('Input processing error', { input: inputError.input, error: error.message, stack: error.stack });
        throw inputError;
    }

    async _processNewTask(task, source, originalInput, parsed, options = {}) {
        this._taskManager.addTask(task);
        const addedTasks = await this._processPendingTasks(options.traceId);
        const wasAdded = addedTasks.includes(task);

        if (wasAdded) {
            try {
                this._eventBus.emit(IntrospectionEvents.TASK_INPUT,
                    { task, source, originalInput, parsed }, { traceId: options.traceId });
                this._eventBus.emit(IntrospectionEvents.TASK_ADDED, { task }, { traceId: options.traceId });
                if (this._focus && this._focus.addTaskToFocus(task)) {
                    this._eventBus.emit(IntrospectionEvents.TASK_FOCUS, task, { traceId: options.traceId });
                }
            } catch (error) {
                this.logError('_processNewTask event emission failed:', error);
                throw error;
            }
        }
        return wasAdded;
    }

    _processPendingTasks(traceId) {
        return this._taskManager.processPendingTasks(Date.now());
    }

    start(options = {}) {
        if (this._isRunning) { this.logWarn('NAR already running'); return false; }

        this._startComponentsAsync();
        this._isRunning = true;
        const processed = this._processPendingTasks(options.traceId);
        if (processed) {
            for (const task of processed) {
                this._eventBus.emit(IntrospectionEvents.TASK_ADDED, { task }, { traceId: options.traceId });
            }
        }

        this._streamReasoner.start();
        this._setupStreamMonitoring(options);
        this._eventBus.emit(IntrospectionEvents.SYSTEM_START, { timestamp: Date.now() }, { traceId: options.traceId });
        this._emitIntrospectionEvent(IntrospectionEvents.SYSTEM_START, () => ({ timestamp: Date.now() }));
        this.logInfo(`NAR started successfully with stream-based reasoning`);
        return true;
    }

    _setupStreamMonitoring(options) {
        this._streamMonitoringInterval = setInterval(() => {
            if (this._streamReasoner) {
                const metrics = this._streamReasoner.getMetrics();
                this._eventBus.emit('streamReasoner.metrics', metrics, { traceId: options.traceId });
            }
        }, 5000);
    }

    async _startComponentsAsync() {
        try {
            const success = await this._componentManager.startAll();
            if (!success) this.logError('Failed to start all components');
        } catch (error) { this.logError('Error during component start:', error); }
    }

    stop(options = {}) {
        if (!this._isRunning) { this.logWarn('NAR not running'); return false; }

        this._isRunning = false;
        this._stopStreamReasoner();
        this._cleanupMonitoring();
        this._shutdownOptionalComponents();
        this._stopComponentsAsync();

        this._eventBus.emit(IntrospectionEvents.SYSTEM_STOP, { timestamp: Date.now() }, { traceId: options.traceId });
        this._emitIntrospectionEvent(IntrospectionEvents.SYSTEM_STOP, () => ({ timestamp: Date.now() }));
        this.logInfo(`NAR stopped successfully (stream-based reasoning)`);
        return true;
    }

    _stopStreamReasoner() { if (this._streamReasoner) this._streamReasoner.stop(); }

    _cleanupMonitoring() {
        if (this._streamMonitoringInterval) {
            clearInterval(this._streamMonitoringInterval);
            this._streamMonitoringInterval = null;
        }
        this._integration.disconnectFromWebSocketMonitor();
    }

    _shutdownOptionalComponents() {
        this._metricsMonitor?.shutdown?.();
        this._reasoningAboutReasoning?.shutdown?.();
    }

    async _stopComponentsAsync() {
        try {
            const success = await this._componentManager.stopAll();
            if (!success) this.logError('Failed to stop all components');
        } catch (error) { this.logError('Error during component stop:', error); }
    }

    async step(options = {}) {
        try {
            await this._processPendingTasks(options.traceId);
            const results = await this._streamReasoner.step(undefined, true);
            await this._processDerivations(results, options);
            this._eventBus.emit('streamReasoner.step', { results, count: results.length }, { traceId: options.traceId });
            return results;
        } catch (error) {
            this._eventBus.emit('streamReasoner.error', { error: error.message }, { traceId: options.traceId });
            this.logError('Error in reasoning step:', { error: error.message, stack: error.stack, traceId: options.traceId });
            throw error;
        }
    }

    async _processDerivations(results, options) {
        const traceId = options.traceId;
        const validResults = results.filter(Boolean);
        try {
            const addedResults = await Promise.all(validResults.map(async result => {
                const added = await this._integration._inputTask(result, { traceId });
                return { result, added };
            }));
            for (const { result, added } of addedResults) {
                if (added && this.traceEnabled) {
                    this._eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                        derivedTask: result, source: 'streamReasoner.step.method', timestamp: Date.now()
                    }, { traceId });
                }
            }
        } catch (error) {
            this.logError('_processDerivations failed:', { error: error.message, stack: error.stack, traceId, resultsCount: validResults.length });
            throw error;
        }
    }

    async runCycles(count, options = {}) {
        const results = [];
        for (let i = 0; i < count; i++) {
            try { results.push(await this.step({ ...options, cycleNumber: i + 1 })); }
            catch (error) { results.push({ error: error.message, cycleNumber: i + 1 }); }
        }
        return results;
    }

    async dispose() {
        if (this._isRunning) this.stop();
        if (this._streamReasoner) await this._streamReasoner.cleanup();
        this._metricsMonitor?.shutdown?.();
        this._reasoningAboutReasoning?.shutdown?.();
        const success = await this._componentManager.disposeAll();
        await super.dispose();
        return success;
    }

    reset(options = {}) {
        this.stop();
        this._memory.clear();
        this._taskManager.clearPendingTasks();
        this._eventBus.emit(IntrospectionEvents.SYSTEM_RESET, { timestamp: Date.now() }, { traceId: options.traceId });
        this.logInfo('NAR reset completed');
    }

    on(eventName, callback) { this._eventBus.on(eventName, callback); }
    off(eventName, callback) { this._eventBus.off(eventName, callback); }

    getStats() {
        return {
            isRunning: this._isRunning,
            cycleCount: this._streamReasoner?.metrics?.totalDerivations || 0,
            memoryStats: this._memory.getDetailedStats(),
            termLayerStats: this._termLayer ? this._termLayer.getStats() : null,
            taskManagerStats: this._taskManager.getTaskStats?.() ?? this._taskManager.stats,
            config: this.config,
            lmStats: this._lm?.getMetrics?.(),
            streamReasonerStats: this._streamReasoner?.getMetrics?.() || null
        };
    }

    // Delegate to NARSerializer
    serialize() { return this._serializer.serialize(); }
    async deserialize(state) { return this._serializer.deserialize(state); }
    getConcepts() { return this._serializer.getConcepts(); }
    getConceptByName(termString) { return this._serializer.getConceptByName(termString); }
    getConceptPriorities() { return this._serializer.getConceptPriorities(); }

    // Delegate to NARQueryEngine
    query(queryTerm) { return this._queryEngine.query(queryTerm); }
    getBeliefs(queryTerm = null) { return this._queryEngine.getBeliefs(queryTerm); }
    getGoals() { return this._queryEngine.getGoals(); }
    getQuestions() { return this._queryEngine.getQuestions(); }
    async reconcile(beliefData) { return this._queryEngine.reconcile(beliefData); }
    async ask(task) { return this._queryEngine.ask(task); }

    // Delegate to NARIntegration
    registerLMProvider(id, provider) { return this._integration.registerLMProvider(id, provider); }
    async generateWithLM(prompt, options = {}) { return this._integration.generateWithLM(prompt, options); }
    translateToNarsese(text) { return this._integration.translateToNarsese(text); }
    translateFromNarsese(narsese) { return this._integration.translateFromNarsese(narsese); }
    connectToWebSocketMonitor(monitor) { return this._integration.connectToWebSocketMonitor(monitor); }
    disconnectFromWebSocketMonitor() { return this._integration.disconnectFromWebSocketMonitor(); }
    getReasoningState() { return this._integration.getReasoningState(); }
    getMetrics() { return this._integration.getMetrics(); }
    performSelfOptimization() { return this._integration.performSelfOptimization(); }
    async solveEquation(leftTerm, rightTerm, variableName, context = null) { return this._integration.solveEquation(leftTerm, rightTerm, variableName, context); }
    async performMetaCognitiveReasoning() { return this._integration.performMetaCognitiveReasoning(); }
    async performSelfCorrection() { return this._integration.performSelfCorrection(); }
    querySystemState(query) { return this._integration.querySystemState(query); }
    getReasoningTrace() { return this._integration.getReasoningTrace(); }
    async initializeTools() { return this._integration.initializeTools(); }
    async executeTool(toolId, params, context = {}) { return this._integration.executeTool(toolId, params, context); }
    async executeTools(toolCalls, context = {}) { return this._integration.executeTools(toolCalls, context); }
    getAvailableTools() { return this._integration.getAvailableTools(); }
    async explainToolResult(toolResult, context = {}) { return this._integration.explainToolResult(toolResult, context); }
    async explainToolResults(toolResults, context = {}) { return this._integration.explainToolResults(toolResults, context); }
    async summarizeToolExecution(toolResults, context = {}) { return this._integration.summarizeToolExecution(toolResults, context); }
    async assessToolResults(toolResults, context = {}) { return this._integration.assessToolResults(toolResults, context); }
}
