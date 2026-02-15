import Logger from './utils/logger.js';
import MessageValidator from './utils/message-validator.js';
import NodeFactory from './utils/node-factory.js';
import DataTransformer from './utils/data-transformer.js';
import { ADD_NODE, ADD_LOG_ENTRY } from './constants/actions.js';

/**
 * EventProcessor - Centralized module for processing NARS events and dispatching UI actions
 * Refactored version to reduce duplication
 */
class EventProcessor {
    constructor(store) {
        this.store = store;
        this.handlers = this._initializeHandlers();
        this.nodeCreators = this._initializeNodeCreators();
    }

    _initializeHandlers() {
        return new Map([
            ['concept.created', this._handleGenericNodeEvent.bind(this, 'concept.created', 'createConcept')],
            ['task.added', this._handleGenericNodeEvent.bind(this, 'task.added', 'createTask')],
            ['belief.added', this._handleGenericNodeEvent.bind(this, 'belief.added', 'createBelief')],
            ['task.processed', this._handleGenericNodeEvent.bind(this, 'task.processed', 'createProcessedTask')],
            ['task.input', this._handleGenericNodeEvent.bind(this, 'task.input', 'createInputTask')],
            ['question.answered', this._handleGenericNodeEvent.bind(this, 'question.answered', 'createQuestion')],
            ['reasoning.derivation', this._handleGenericNodeEvent.bind(this, 'reasoning.derivation', 'createDerivation')],
            ['reasoning.step', this._handleGenericNodeEvent.bind(this, 'reasoning.step', 'createReasoningStep')],
            ['memorySnapshot', this._handleMemorySnapshot.bind(this)],
            ['eventBatch', this._handleEventBatch.bind(this)]
        ]);
    }

    _initializeNodeCreators() {
        return {
            'concept.created': 'createConcept',
            'task.added': 'createTask',
            'belief.added': 'createBelief',
            'task.processed': 'createProcessedTask',
            'task.input': 'createInputTask',
            'question.answered': 'createQuestion',
            'reasoning.derivation': 'createDerivation',
            'reasoning.step': 'createReasoningStep'
        };
    }

    process(message) {
        try {
            // Validate the message
            const validation = MessageValidator.validate(message);
            if (!validation.valid) {
                Logger.warn(`Invalid message received: ${validation.error}`, { message });
                return;
            }

            const handler = this.handlers.get(message.type);
            if (handler) {
                handler(message);
            } else {
                this._handleUnknownEvent(message);
            }
        } catch (error) {
            Logger.error(`Error processing message of type ${message.type}`, { error: error.message, message });
        }
    }

    _handleGenericNodeEvent(eventType, nodeCreatorMethod, message) {
        try {
            const transformedData = DataTransformer.transformEventData(eventType, message.data);
            const node = NodeFactory[nodeCreatorMethod](transformedData);

            this.store.dispatch({
                type: ADD_NODE,
                payload: node
            });
        } catch (error) {
            Logger.error(`Error handling ${eventType} event`, { error: error.message, message });
        }
    }

    _handleMemorySnapshot(message) {
        try {
            const transformedData = DataTransformer.transformEventData('memorySnapshot', message.payload);

            this.store.dispatch({
                type: 'SET_GRAPH_SNAPSHOT',
                payload: {
                    nodes: transformedData.concepts.map(concept => NodeFactory.createConcept(concept)),
                    edges: []
                }
            });
        } catch (error) {
            Logger.error('Error handling memorySnapshot event', { error: error.message, message });
        }
    }

    _handleEventBatch(message) {
        try {
            const events = Array.isArray(message.data) ? message.data : [message.data];
            for (const event of events) {
                this.process(event); // Recursive processing
            }
        } catch (error) {
            Logger.error('Error handling eventBatch event', { error: error.message, message });
        }
    }

    _handleUnknownEvent(message) {
        try {
            // Log specific message types that are meant to be displayed
            const displayTypes = ['error', 'log', 'connection', 'task.added', 'concept.created', 'belief.added', 'question.answered', 'reasoning.derivation', 'reasoning.step', 'task.processed', 'task.input'];

            if (displayTypes.includes(message.type)) {
                // For error messages, extract the error content appropriately
                let content;
                if (message.type === 'error') {
                    content = message.payload?.error || message.data?.error || message.payload?.message || message.data?.message || JSON.stringify(message);
                } else {
                    content = message.payload?.message || JSON.stringify(message);
                }

                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: {
                        content: content,
                        type: 'in'
                    }
                });
            } else {
                // For debugging, also log other message types that might be coming from the backend
                // but only for debugging purposes, not all the time to avoid spam
                Logger.debug('Unknown event type received', { type: message.type, data: message });
            }
        } catch (error) {
            Logger.error('Error handling unknown event', { error: error.message, message });
        }
    }
}

export default EventProcessor;