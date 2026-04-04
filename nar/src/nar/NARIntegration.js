export class NARIntegration {
    #nar;

    constructor(nar) {
        this.#nar = nar;
    }

    _createToolContext(context = {}) {
        return {
            nar: this.#nar,
            memory: this.#nar._memory,
            timestamp: Date.now(),
            ...context
        };
    }

    _withComponentCheck(component, message, operation) {
        if (!component) throw new Error(message);
        return operation(component);
    }

    // --- LM Integration ---

    registerLMProvider(id, provider) {
        return this._withComponentCheck(this.#nar._lm, 'Language Model is not enabled', lm => {
            lm.registerProvider(id, provider);
            return this.#nar;
        });
    }

    async generateWithLM(prompt, options = {}) {
        return this._withComponentCheck(this.#nar._lm, 'Language Model is not enabled', lm => lm.generateText(prompt, options));
    }

    translateToNarsese(text) {
        return this._withComponentCheck(this.#nar._lm, 'Language Model is not enabled', lm => lm.translateToNarsese(text));
    }

    translateFromNarsese(narsese) {
        return this._withComponentCheck(this.#nar._lm, 'Language Model is not enabled', lm => lm.translateFromNarsese(narsese));
    }

    // --- Monitoring ---

    connectToWebSocketMonitor(monitor) {
        if (!monitor || typeof monitor.listenToNAR !== 'function') {
            throw new Error('Invalid WebSocket monitor provided');
        }

        monitor.listenToNAR(this.#nar);
        this.#nar.logInfo('Connected to WebSocket monitor for real-time monitoring');

        if (this.#nar._reasoningAboutReasoning) {
            this.#nar._reasoningStateInterval = setInterval(() => {
                this.#emitPeriodicReasoningState();
            }, 5000);
        }
    }

    #emitPeriodicReasoningState() {
        try {
            if (this.#nar._reasoningAboutReasoning?.getReasoningState) {
                const state = this.#nar._reasoningAboutReasoning.getReasoningState();
                this.#nar._eventBus.emit('reasoningState', state, { source: 'periodic' });
            }
        } catch (error) {
            this.#nar.logError('Error in reasoning state update:', error);
        }
    }

    disconnectFromWebSocketMonitor() {
        if (this.#nar._reasoningStateInterval) {
            clearInterval(this.#nar._reasoningStateInterval);
            this.#nar._reasoningStateInterval = null;
        }
    }

    getReasoningState() {
        return this.#nar._reasoningAboutReasoning?.getReasoningState?.() ?? null;
    }

    getMetrics() {
        return this.#nar._metricsMonitor ? this.#nar._metricsMonitor.getMetricsSnapshot() : null;
    }

    performSelfOptimization() {
        this.#nar._metricsMonitor?._performSelfOptimization();
    }

    // --- Advanced Reasoning ---

    async solveEquation(leftTerm, rightTerm, variableName, context = null) {
        if (this.#nar._evaluator) {
            return await this.#nar._evaluator.solveEquation(
                leftTerm, rightTerm, variableName,
                context || { memory: this.#nar._memory, termFactory: this.#nar._termFactory }
            );
        }
        return { result: null, success: false, message: 'No operation evaluation engine available' };
    }

    async performMetaCognitiveReasoning() {
        return this.#nar._reasoningAboutReasoning?.performMetaCognitiveReasoning() ?? null;
    }

    async performSelfCorrection() {
        return this.#nar._reasoningAboutReasoning?.performSelfCorrection() ?? null;
    }

    querySystemState(query) {
        return this.#nar._reasoningAboutReasoning?.querySystemState(query) ?? null;
    }

    getReasoningTrace() {
        return this.#nar._reasoningAboutReasoning?.getReasoningTrace() ?? [];
    }

    // --- Tool Integration ---

    async initializeTools() {
        if (this.#nar._toolIntegration) {
            await this.#nar._toolIntegration.initializeTools(this.#nar);
            this.#nar.logInfo('Tools initialized successfully');
            return true;
        }
        return false;
    }

    async executeTool(toolId, params, context = {}) {
        return this.#measureToolExecution(toolId, params, () =>
            this._withComponentCheck(this.#nar._toolIntegration, 'Tool integration is not enabled',
                toolIntegration => toolIntegration.executeTool(toolId, params, this._createToolContext(context)))
        );
    }

    async executeTools(toolCalls, context = {}) {
        return await this._withComponentCheck(this.#nar._toolIntegration, 'Tool integration is not enabled',
            toolIntegration => toolIntegration.executeTools(toolCalls, this._createToolContext(context)));
    }

    getAvailableTools() {
        return this.#nar._toolIntegration?.getAvailableTools() ?? [];
    }

    async explainToolResult(toolResult, context = {}) {
        return await this._withComponentCheck(this.#nar._explanationService, 'Explanation service is not enabled',
            service => service.explainToolResult(toolResult, this._createToolContext(context)));
    }

    async explainToolResults(toolResults, context = {}) {
        return await this._withComponentCheck(this.#nar._explanationService, 'Explanation service is not enabled',
            service => service.explainToolResults(toolResults, this._createToolContext(context)));
    }

    async summarizeToolExecution(toolResults, context = {}) {
        return await this._withComponentCheck(this.#nar._explanationService, 'Explanation service is not enabled',
            service => service.summarizeToolExecution(toolResults, this._createToolContext(context)));
    }

    async assessToolResults(toolResults, context = {}) {
        return await this._withComponentCheck(this.#nar._explanationService, 'Explanation service is not enabled',
            service => service.assessToolResults(toolResults, this._createToolContext(context)));
    }

    async #measureToolExecution(toolId, params, operation) {
        const startTime = Date.now();
        try {
            const result = await operation();
            const duration = Date.now() - startTime;
            if (duration > 1000) {
                this.#nar.logWarn(`Slow tool execution: ${toolId} took ${duration}ms`, {
                    toolId, duration, paramsSize: JSON.stringify(params).length
                });
            }
            return result;
        } catch (error) {
            this.#nar.logError(`Tool execution failed: ${toolId}`, {
                toolId, error: error?.message || error, duration: Date.now() - startTime
            });
            throw error;
        }
    }

    async _inputTask(task, options = {}) {
        try {
            return await this.#nar._processNewTask(task, 'derived', null, null, options);
        } catch (error) {
            this.#nar._eventBus.emit('input.error', { error: error.message, input: 'derived-task' }, { traceId: options.traceId });
            this.#nar.logError('_inputTask failed:', { error: error.message, stack: error.stack, input: 'derived-task', traceId: options.traceId });
            throw error;
        }
    }
}
