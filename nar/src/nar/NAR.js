import { ConfigManager } from '@senars/core/src/config/ConfigManager.js';
import { BaseComponent } from '@senars/core/src/util/BaseComponent.js';
import { IntrospectionEvents } from '@senars/core';
import { Truth } from '../Truth.js';
import { Stamp } from '../Stamp.js';
import { Task } from '../task/Task.js';
import { NARInitializer } from './NARInitializer.js';
import { validateSchema } from '@senars/core/src/util/InputValidator.js';

export class NAR extends BaseComponent {
    constructor(config = {}) {
        super(config, 'NAR');
        this._initializer = new NARInitializer(this, config, this._eventBus);
        this._initializeCoreComponents(config);
        this._debugMode = this.config.debug?.pipeline || false;
        this.traceEnabled = false;
        this._createToolContext = (context = {}) => ({
            nar: this,
            memory: this._memory,
            timestamp: Date.now(),
            ...context
        });
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

    _initializeCoreComponents(config) {
        this._configManager = new ConfigManager(config);
        const components = this._initializer.initialize();

        // Destructure components into private properties
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
            if (success) {
                await this._setupDefaultRules();
            }

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
            focus: this._focus,
            memory: this._memory,
            termFactory: this._termFactory,
            parser: this._parser,
            budgetManager: this._budgetManager
        });

        this._streamReasoner.on('derivation', (derivation) => {
            this._handleStreamDerivation(derivation);
        });
    }

    async _handleStreamDerivation(derivation) {
        try {
            const added = await this._inputTask(derivation, { traceId: 'stream' });

            if (added && this.traceEnabled) {
                this._eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                    derivedTask: derivation,
                    source: 'streamReasoner.stream',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            this.logError('Error handling stream derivation:', {
                error: error.message,
                task: derivation?.toString()
            });
        }
    }

    async _setupDefaultRules() {
        try {
            await this._registerRulesWithStreamReasoner();
        } catch (error) {
            this.logWarn('Error setting up default rules:', error);
        }
    }

    async _registerRulesWithStreamReasoner() {
        if (!this._streamReasoner) return;
        await this._initializer.registerDefaultRules(this._streamReasoner, {
            parser: this._parser,
            lm: this._lm,
            embeddingLayer: this._embeddingLayer,
            memory: this._memory,
            termFactory: this._termFactory,
            eventBus: this._eventBus
        });
    }

    async input(input, options = {}) {
        // Validate input at API boundary
        if (input === null || input === undefined) {
            throw new Error('NAR.input: input parameter is required');
        }

        // Validate options schema
        const validatedOptions = validateSchema(options, {
            traceId: { type: 'string', optional: true },
            priority: { type: 'number', min: 0, max: 1, optional: true },
            durability: { type: 'number', min: 0, max: 1, optional: true }
        }, 'NAR.input');

        try {
            const task = this._inputProcessor.processInput(input, validatedOptions);
            if (!task) throw new Error('Input processing failed to create task');

            const parsed = {
                term: task.term,
                punctuation: task.punctuation,
                taskType: task.type,
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
            error: inputError.message,
            input: inputError.input,
            originalError: error
        }, { traceId: options.traceId });

        this.logError('Input processing error', {
            input: inputError.input,
            error: error.message,
            stack: error.stack
        });

        throw inputError;
    }

    async _processNewTask(task, source, originalInput, parsed, options = {}) {
        this._taskManager.addTask(task);

        const addedTasks = await this._processPendingTasks(options.traceId);
        const wasAdded = addedTasks.includes(task);

        if (wasAdded) {
            try {
                this._eventBus.emit(IntrospectionEvents.TASK_INPUT, {
                    task, source, originalInput, parsed
                }, { traceId: options.traceId });

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
        if (this._isRunning) {
            this.logWarn('NAR already running');
            return false;
        }

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
        } catch (error) {
            this.logError('Error during component start:', error);
        }
    }

    stop(options = {}) {
        if (!this._isRunning) {
            this.logWarn('NAR not running');
            return false;
        }

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

    _stopStreamReasoner() {
        if (this._streamReasoner) this._streamReasoner.stop();
    }

    _cleanupMonitoring() {
        if (this._streamMonitoringInterval) {
            clearInterval(this._streamMonitoringInterval);
            this._streamMonitoringInterval = null;
        }
        this.disconnectFromWebSocketMonitor();
    }

    _shutdownOptionalComponents() {
        this._metricsMonitor?.shutdown?.();
        this._reasoningAboutReasoning?.shutdown?.();
    }

    async _stopComponentsAsync() {
        try {
            const success = await this._componentManager.stopAll();
            if (!success) this.logError('Failed to stop all components');
        } catch (error) {
            this.logError('Error during component stop:', error);
        }
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
                const added = await this._inputTask(result, { traceId });
                return { result, added };
            }));

            for (const { result, added } of addedResults) {
                if (added && this.traceEnabled) {
                    this._eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                        derivedTask: result,
                        source: 'streamReasoner.step.method',
                        timestamp: Date.now()
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
            try {
                results.push(await this.step({ ...options, cycleNumber: i + 1 }));
            } catch (error) {
                results.push({ error: error.message, cycleNumber: i + 1 });
            }
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

    serialize() {
        return {
            config: this.config,
            memory: this._memory.serialize ? this._memory.serialize() : null,
            taskManager: this._taskManager.serialize ? this._taskManager.serialize() : null,
            focus: this._focus.serialize ? this._focus.serialize() : null,
            cycleCount: this.cycleCount,
            isRunning: this._isRunning,
            timestamp: Date.now(),
            version: '10.0.0'
        };
    }

    getConcepts() {
        return this._memory ? this._memory.getAllConcepts() : [];
    }

    getConceptByName(termString) {
        if (!this._memory) return null;
        return this._memory.getAllConcepts().find(concept => concept.term.toString() === termString) || null;
    }

    getConceptPriorities() {
        if (!this._memory) return [];
        return this._memory.getAllConcepts().map(concept => ({
            term: concept.term.toString(),
            priority: concept.priority || concept.activation || 0,
            activation: concept.activation || 0,
            useCount: concept.useCount || 0,
            quality: concept.quality || 0,
            totalTasks: concept.totalTasks || 0
        }));
    }

    async deserialize(state) {
        try {
            if (this._isRunning) this.stop();
            if (state.config) this._configManager = new ConfigManager(state.config);

            await this._deserializeComponents(state);
            
            if (state.isRunning !== undefined) this._isRunning = state.isRunning;

            await this._reinitializeAfterDeserialization(state);

            this._eventBus.emit(IntrospectionEvents.SYSTEM_LOADED, {
                timestamp: Date.now(),
                stateVersion: state.version,
                fromFile: state.sourceFile || 'serialized'
            });
            return true;
        } catch (error) {
            const deserializationError = new Error(`NAR deserialization failed: ${error.message}`);
            deserializationError.cause = error;
            deserializationError.stateVersion = state?.version;
            this.logError(deserializationError.message, deserializationError);
            return false;
        }
    }

    _deserializeComponents(state) {
        const componentsToDeserialize = [
            { key: 'memory', component: this._memory },
            { key: 'taskManager', component: this._taskManager },
            { key: 'focus', component: this._focus }
        ];

        return Promise.all(componentsToDeserialize.map(
            async ({ key, component }) => {
                if (state[key] && typeof component.deserialize === 'function') {
                    await component.deserialize(state[key]);
                }
            }
        ));
    }

    async _reinitializeAfterDeserialization(state) {
        await this._componentManager.disposeAll();
        
        this._initializer = new NARInitializer(this, this.config, this._eventBus);
        const components = this._initializer.initialize();

        this._assignDeserializedComponents(components);

        await this._componentManager.initializeAll();
        await this._setupDefaultRules();
    }

    _assignDeserializedComponents(components) {
        const { componentManager, termFactory, parser, lm, memory, focus, 
                termLayer, embeddingLayer, taskManager, evaluator, budgetManager,
                inputProcessor, reasoningAboutReasoning, toolIntegration,
                explanationService, metricsMonitor } = components;

        Object.assign(this, {
            _componentManager: componentManager,
            _termFactory: termFactory,
            _parser: parser,
            _lm: lm,
            _memory: memory,
            _focus: focus,
            _termLayer: termLayer,
            _embeddingLayer: embeddingLayer,
            _taskManager: taskManager,
            _evaluator: evaluator,
            _budgetManager: budgetManager,
            _inputProcessor: inputProcessor,
            _reasoningAboutReasoning: reasoningAboutReasoning,
            _toolIntegration: toolIntegration,
            _explanationService: explanationService,
            _metricsMonitor: metricsMonitor
        });
    }

    query(queryTerm) {
        return this._memory.getConcept(queryTerm)?.getTasksByType('BELIEF') ?? [];
    }

    getBeliefs(queryTerm = null) {
        return queryTerm ? this.query(queryTerm)
            : this._memory.getAllConcepts().flatMap(c => c.getTasksByType('BELIEF'));
    }

    async reconcile(beliefData) {
        if (!beliefData?.term || !beliefData?.truth) return false;

        try {
            const term = this._resolveTerm(beliefData.term);
            const finalTruth = this._calculateReconciledTruth(term, beliefData.truth);
            const task = this._createReconciliationTask(term, finalTruth);

            return await this._processNewTask(task, 'reconcile', beliefData.term, null, {traceId: 'gossip'});
        } catch (error) {
            this.logError('Reconciliation failed:', error);
            return false;
        }
    }

    _resolveTerm(termInput) {
        if (this._parser && typeof termInput === 'string') {
             const parsed = this._parser.parse(termInput.endsWith('.') ? termInput : termInput + '.');
             return parsed.term;
        }
        return this._termFactory.create(termInput);
    }

    _calculateReconciledTruth(term, incomingTruthData) {
        const incomingTruth = new Truth(incomingTruthData.frequency, incomingTruthData.confidence);
        const concept = this._memory.getConcept(term);

        if (concept) {
            const beliefs = concept.getTasksByType('BELIEF');
            if (beliefs.length > 0) {
                const revised = Truth.revision(beliefs[0].truth, incomingTruth);
                if (revised) return revised;
            }
        }
        return incomingTruth;
    }

    _createReconciliationTask(term, truth) {
        const expectation = Truth.expectation(truth);
        return new Task({
            term,
            truth,
            stamp: Stamp.createInput(),
            punctuation: '.',
            budget: {
                priority: Math.max(0.1, expectation),
                durability: 0.9,
                quality: truth.confidence
            }
        });
    }

    async ask(task) {
        if (!this._streamReasoner) throw new Error('Stream reasoner is not initialized.');
        return this._streamReasoner.strategy.ask(task);
    }

    getGoals() { return this._taskManager.findTasksByType('GOAL'); }
    getQuestions() { return this._taskManager.findTasksByType('QUESTION'); }

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

    // --- LM Integration ---

    registerLMProvider(id, provider) {
        return this._withComponentCheck(this._lm, 'Language Model is not enabled', lm => {
            lm.registerProvider(id, provider);
            return this;
        });
    }

    async generateWithLM(prompt, options = {}) {
        return this._withComponentCheck(this._lm, 'Language Model is not enabled', lm => lm.generateText(prompt, options));
    }

    translateToNarsese(text) {
        return this._withComponentCheck(this._lm, 'Language Model is not enabled', lm => lm.translateToNarsese(text));
    }

    translateFromNarsese(narsese) {
        return this._withComponentCheck(this._lm, 'Language Model is not enabled', lm => lm.translateFromNarsese(narsese));
    }

    // --- Monitoring ---

    connectToWebSocketMonitor(monitor) {
        if (!monitor || typeof monitor.listenToNAR !== 'function') throw new Error('Invalid WebSocket monitor provided');

        monitor.listenToNAR(this);
        this.logInfo('Connected to WebSocket monitor for real-time monitoring');

        if (this._reasoningAboutReasoning) {
            this._reasoningStateInterval = setInterval(() => {
                this._emitPeriodicReasoningState();
            }, 5000);
        }
    }

    _emitPeriodicReasoningState() {
        try {
            if (this._reasoningAboutReasoning?.getReasoningState) {
                const state = this._reasoningAboutReasoning.getReasoningState();
                this._eventBus.emit('reasoningState', state, { source: 'periodic' });
            }
        } catch (error) {
            this.logError('Error in reasoning state update:', error);
        }
    }

    disconnectFromWebSocketMonitor() {
        if (this._reasoningStateInterval) {
            clearInterval(this._reasoningStateInterval);
            this._reasoningStateInterval = null;
        }
    }

    getReasoningState() {
        return this._reasoningAboutReasoning?.getReasoningState?.() ?? null;
    }

    getMetrics() {
        return this._metricsMonitor ? this._metricsMonitor.getMetricsSnapshot() : null;
    }

    performSelfOptimization() {
        this._metricsMonitor?._performSelfOptimization();
    }

    // --- Advanced Reasoning ---

    async solveEquation(leftTerm, rightTerm, variableName, context = null) {
        if (this._evaluator) {
            return await this._evaluator.solveEquation(
                leftTerm, rightTerm, variableName,
                context || { memory: this._memory, termFactory: this._termFactory }
            );
        }
        return { result: null, success: false, message: 'No operation evaluation engine available' };
    }

    async performMetaCognitiveReasoning() {
        return this._reasoningAboutReasoning?.performMetaCognitiveReasoning() ?? null;
    }

    async performSelfCorrection() {
        return this._reasoningAboutReasoning?.performSelfCorrection() ?? null;
    }

    querySystemState(query) {
        return this._reasoningAboutReasoning?.querySystemState(query) ?? null;
    }

    getReasoningTrace() {
        return this._reasoningAboutReasoning?.getReasoningTrace() ?? [];
    }

    // --- Tool Integration ---

    async initializeTools() {
        if (this._toolIntegration) {
            await this._toolIntegration.initializeTools(this);
            this.logInfo('Tools initialized successfully');
            return true;
        }
        return false;
    }

    async executeTool(toolId, params, context = {}) {
        return this._measureToolExecution(toolId, params, () =>
            this._withComponentCheck(this._toolIntegration, 'Tool integration is not enabled',
                toolIntegration => toolIntegration.executeTool(toolId, params, this._createToolContext(context)))
        );
    }

    async executeTools(toolCalls, context = {}) {
        return await this._withComponentCheck(this._toolIntegration, 'Tool integration is not enabled',
            toolIntegration => toolIntegration.executeTools(toolCalls, this._createToolContext(context)));
    }

    getAvailableTools() {
        return this._toolIntegration?.getAvailableTools() ?? [];
    }

    async explainToolResult(toolResult, context = {}) {
        return await this._withComponentCheck(this._explanationService, 'Explanation service is not enabled',
            service => service.explainToolResult(toolResult, this._createToolContext(context)));
    }

    async explainToolResults(toolResults, context = {}) {
        return await this._withComponentCheck(this._explanationService, 'Explanation service is not enabled',
            service => service.explainToolResults(toolResults, this._createToolContext(context)));
    }

    async summarizeToolExecution(toolResults, context = {}) {
        return await this._withComponentCheck(this._explanationService, 'Explanation service is not enabled',
            service => service.summarizeToolExecution(toolResults, this._createToolContext(context)));
    }

    async assessToolResults(toolResults, context = {}) {
        return await this._withComponentCheck(this._explanationService, 'Explanation service is not enabled',
            service => service.assessToolResults(toolResults, this._createToolContext(context)));
    }

    async _measureToolExecution(toolId, params, operation) {
        const startTime = Date.now();
        try {
            const result = await operation();
            const duration = Date.now() - startTime;
            if (duration > 1000) {
                this.logWarn(`Slow tool execution: ${toolId} took ${duration}ms`, {
                    toolId, duration, paramsSize: JSON.stringify(params).length
                });
            }
            return result;
        } catch (error) {
            this.logError(`Tool execution failed: ${toolId}`, {
                toolId, error: error?.message || error, duration: Date.now() - startTime
            });
            throw error;
        }
    }

    async _inputTask(task, options = {}) {
        try {
            return await this._processNewTask(task, 'derived', null, null, options);
        } catch (error) {
            this._eventBus.emit('input.error', { error: error.message, input: 'derived-task' }, { traceId: options.traceId });
            this.logError('_inputTask failed:', { error: error.message, stack: error.stack, input: 'derived-task', traceId: options.traceId });
            throw error;
        }
    }

    _withComponentCheck(component, message, operation) {
        if (!component) throw new Error(message);
        return operation(component);
    }
}
