import { ConfigManager } from '../config/ConfigManager.js';
import { EmbeddingLayer } from '../lm/EmbeddingLayer.js';
import { LM } from '../lm/LM.js';
import { Focus } from '../memory/Focus.js';
import { Memory } from '../memory/Memory.js';
import { TermLayer } from '../memory/TermLayer.js';
import { InputProcessor } from './InputProcessor.js';
import { NarseseParser } from '../parser/NarseseParser.js';
import { EvaluationEngine } from '../reason/EvaluationEngine.js';
import { MetricsMonitor } from '../reason/MetricsMonitor.js';
import { ReasonerBuilder } from '../reason/index.js';
import { ReasoningAboutReasoning } from '../self/ReasoningAboutReasoning.js';
import { TaskManager } from '../task/TaskManager.js';
import { TermFactory } from '../term/TermFactory.js';
import { ExplanationService } from '../tool/ExplanationService.js';
import { ToolIntegration } from '../tool/ToolIntegration.js';
import { BaseComponent } from '../util/BaseComponent.js';
import { ComponentManager } from '../util/ComponentManager.js';
import { IntrospectionEvents } from '../util/IntrospectionEvents.js';
import { BudgetManager } from '../util/BudgetManager.js';
import { Truth } from '../Truth.js';
import { Stamp } from '../Stamp.js';
import { Task } from '../task/Task.js';

export class NAR extends BaseComponent {
    constructor(config = {}) {
        super(config, 'NAR');
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
        this._componentManager = new ComponentManager({}, this._eventBus, this);

        this._initComponents();

        this._isRunning = false;
        this._startTime = Date.now();

        this._registerComponents();
        this._initStreamReasoner();

        if (this.config.components) {
            this._componentManager.loadComponentsFromConfig(this.config.components);
        }
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

    _initComponents() {
        this._initBaseSubsystem();
        this._initMemorySubsystem();
        this._initReasoningSubsystem();
        this._initToolSubsystem();
        this._initMonitoringSubsystem();
    }

    _initBaseSubsystem() {
        const { config } = this;
        this._termFactory = new TermFactory(config.termFactory, this._eventBus);
        this._parser = new NarseseParser(this._termFactory);
        this._lm = config.lm?.enabled ? new LM() : null;
    }

    _initMemorySubsystem() {
        const { config } = this;
        this._memory = new Memory(config.memory, this._eventBus, this._termFactory);
        this._focus = new Focus(config.focus);
        this._termLayer = new TermLayer({ capacity: config.termLayer?.capacity || 1000, ...config.termLayer });
        this._embeddingLayer = config.embeddingLayer?.enabled ? new EmbeddingLayer(config.embeddingLayer) : null;
    }

    _initReasoningSubsystem() {
        const { config } = this;
        this._taskManager = new TaskManager(this._memory, null, config.taskManager);
        this._evaluator = new EvaluationEngine(null, this._termFactory);
        this._budgetManager = new BudgetManager({
            total: config.budget?.total ?? 10000,
            enableComplexityPenalty: false
        });

        this._inputProcessor = new InputProcessor(config.taskManager || {}, {
            parser: this._parser,
            termFactory: this._termFactory
        });

        this._ruleEngine = null;
        this._reasoningAboutReasoning = new ReasoningAboutReasoning(this, { ...config.reasoningAboutReasoning });
    }

    _initToolSubsystem() {
        const { config } = this;
        this._toolIntegration = config.tools?.enabled !== false ? new ToolIntegration(config.tools || {}) : null;

        if (this._toolIntegration) {
            this._toolIntegration.connectToReasoningCore(this);
            this._explanationService = new ExplanationService({ lm: this._lm || null, ...config.tools?.explanation });
        }
    }

    _initMonitoringSubsystem() {
        this._metricsMonitor = new MetricsMonitor({ eventBus: this._eventBus, nar: this, ...this.config.metricsMonitor });
    }

    _initStreamReasoner() {
        this._streamReasoner = ReasonerBuilder.build(this.config, {
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

    _registerComponents() {
        const cm = this._componentManager;
        cm.registerComponent('termFactory', this._termFactory);
        cm.registerComponent('memory', this._memory);
        cm.registerComponent('focus', this._focus, ['memory']);
        cm.registerComponent('taskManager', this._taskManager, ['memory', 'focus']);

        if (this._ruleEngine) cm.registerComponent('ruleEngine', this._ruleEngine);
        if (this._lm) cm.registerComponent('lm', this._lm);

        if (this._toolIntegration) {
            cm.registerComponent('toolIntegration', this._toolIntegration);
            if (this._explanationService) {
                cm.registerComponent('explanationService', this._explanationService, ['toolIntegration']);
            }
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
        await ReasonerBuilder.registerDefaultRules(this._streamReasoner, this.config, {
            parser: this._parser,
            lm: this._lm,
            embeddingLayer: this._embeddingLayer,
            memory: this._memory,
            termFactory: this._termFactory,
            eventBus: this._eventBus
        });
    }

    async input(input, options = {}) {
        try {
            const task = this._inputProcessor.processInput(input, options);
            if (!task) throw new Error('Input processing failed to create task');

            const originalInput = typeof input === 'string' ? input : task.toString();
            const parsed = {
                term: task.term,
                punctuation: task.punctuation,
                taskType: task.type,
                truthValue: task.truth ? { frequency: task.truth.f, confidence: task.truth.c } : null
            };

            return await this._processNewTask(task, 'user', originalInput, parsed, options);
        } catch (error) {
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

            const componentsToDeserialize = [
                { key: 'memory', component: this._memory },
                { key: 'taskManager', component: this._taskManager },
                { key: 'focus', component: this._focus }
            ];

            for (const { key, component } of componentsToDeserialize) {
                if (state[key] && typeof component.deserialize === 'function') {
                    await component.deserialize(state[key]);
                }
            }

            if (state.isRunning !== undefined) this._isRunning = state.isRunning;

            await this._componentManager.disposeAll();
            this._initComponents();
            await this._componentManager.initializeAll();
            await this._setupDefaultRules();

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
            let term;
            if (this._parser && typeof beliefData.term === 'string') {
                const parsed = this._parser.parse(beliefData.term.endsWith('.') ? beliefData.term : beliefData.term + '.');
                term = parsed.term;
            } else {
                term = this._termFactory.create(beliefData.term);
            }

            const incomingTruth = new Truth(beliefData.truth.frequency, beliefData.truth.confidence);
            const concept = this._memory.getConcept(term);
            let finalTruth = incomingTruth;

            if (concept) {
                const beliefs = concept.getTasksByType('BELIEF');
                if (beliefs.length > 0) {
                    const revised = Truth.revision(beliefs[0].truth, incomingTruth);
                    if (revised) finalTruth = revised;
                }
            }

            const expectation = Truth.expectation(finalTruth);
            const task = new Task({
                term: term,
                truth: finalTruth,
                stamp: Stamp.createInput(),
                punctuation: '.',
                budget: {
                    priority: Math.max(0.1, expectation),
                    durability: 0.9,
                    quality: finalTruth.confidence
                }
            });

            return await this._processNewTask(task, 'reconcile', beliefData.term, null, {traceId: 'gossip'});

        } catch (error) {
            this.logError('Reconciliation failed:', error);
            return false;
        }
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

    _withComponentCheck(component, message, operation) {
        if (!component) throw new Error(message);
        return operation(component);
    }

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

    _processPendingTasks(traceId) {
        return this._taskManager.processPendingTasks(Date.now());
    }

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

    async initializeTools() {
        if (this._toolIntegration) {
            await this._toolIntegration.initializeTools(this);
            this.logger.info('Tools initialized successfully');
            return true;
        }
        return false;
    }

    getMetrics() {
        return this._metricsMonitor ? this._metricsMonitor.getMetricsSnapshot() : null;
    }

    performSelfOptimization() {
        this._metricsMonitor?._performSelfOptimization();
    }

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
                this.logger.warn(`Slow tool execution: ${toolId} took ${duration}ms`, {
                    toolId, duration, paramsSize: JSON.stringify(params).length
                });
            }
            return result;
        } catch (error) {
            this.logger.error(`Tool execution failed: ${toolId}`, {
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
}
