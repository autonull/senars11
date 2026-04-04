import { ConfigManager } from '@senars/core/src/config/ConfigManager.js';
import { IntrospectionEvents } from '@senars/core';
import { NARInitializer } from './NARInitializer.js';

export class NARSerializer {
    #nar;

    constructor(nar) {
        this.#nar = nar;
    }

    serialize() {
        const nar = this.#nar;
        return {
            config: nar.config,
            memory: nar._memory.serialize?.() ?? null,
            taskManager: nar._taskManager.serialize?.() ?? null,
            focus: nar._focus.serialize?.() ?? null,
            cycleCount: nar.cycleCount,
            isRunning: nar._isRunning,
            timestamp: Date.now(),
            version: '10.0.0'
        };
    }

    async deserialize(state) {
        try {
            if (this.#nar._isRunning) this.#nar.stop();
            if (state.config) this.#nar._configManager = new ConfigManager(state.config);

            await this._deserializeComponents(state);

            if (state.isRunning !== undefined) this.#nar._isRunning = state.isRunning;

            await this._reinitializeAfterDeserialization(state);

            this.#nar._eventBus.emit(IntrospectionEvents.SYSTEM_LOADED, {
                timestamp: Date.now(),
                stateVersion: state.version,
                fromFile: state.sourceFile || 'serialized'
            });
            return true;
        } catch (error) {
            const deserializationError = new Error(`NAR deserialization failed: ${error.message}`);
            deserializationError.cause = error;
            deserializationError.stateVersion = state?.version;
            this.#nar.logError(deserializationError.message, deserializationError);
            return false;
        }
    }

    _deserializeComponents(state) {
        const components = [
            { key: 'memory', component: this.#nar._memory },
            { key: 'taskManager', component: this.#nar._taskManager },
            { key: 'focus', component: this.#nar._focus }
        ];

        return Promise.all(components.map(
            async ({ key, component }) => {
                if (state[key] && typeof component.deserialize === 'function') {
                    await component.deserialize(state[key]);
                }
            }
        ));
    }

    async _reinitializeAfterDeserialization(state) {
        await this.#nar._componentManager.disposeAll();

        this.#nar._initializer = new NARInitializer(this.#nar, this.#nar.config, this.#nar._eventBus);
        const components = this.#nar._initializer.initialize();

        this._assignDeserializedComponents(components);

        await this.#nar._componentManager.initializeAll();
        await this.#nar._setupDefaultRules();
    }

    _assignDeserializedComponents(components) {
        const {
            componentManager, termFactory, parser, lm, memory, focus,
            termLayer, embeddingLayer, taskManager, evaluator, budgetManager,
            inputProcessor, reasoningAboutReasoning, toolIntegration,
            explanationService, metricsMonitor
        } = components;

        Object.assign(this.#nar, {
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

    getConcepts() {
        return this.#nar._memory?.getAllConcepts() ?? [];
    }

    getConceptByName(termString) {
        return this.#nar._memory?.getAllConcepts()
            .find(concept => concept.term.toString() === termString) ?? null;
    }

    getConceptPriorities() {
        return this.#nar._memory?.getAllConcepts().map(concept => ({
            term: concept.term.toString(),
            priority: concept.priority ?? concept.activation ?? 0,
            activation: concept.activation ?? 0,
            useCount: concept.useCount ?? 0,
            quality: concept.quality ?? 0,
            totalTasks: concept.totalTasks ?? 0
        })) ?? [];
    }
}
