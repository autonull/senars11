import Logger from './utils/logger.js';
import MessageValidator from './utils/message-validator.js';
import NodeFactory from './utils/node-factory.js';
import DataTransformer from './utils/data-transformer.js';
import { ADD_NODE, ADD_LOG_ENTRY } from './constants/actions.js';

/**
 * EventProcessor - Centralized module for processing NARS events and dispatching UI actions
 * Refactored to reduce duplication with shared utility methods
 */
class EventProcessor {
    constructor(store) {
        this.store = store;
        this.handlers = this._initializeHandlers();
        this.nodeCreators = this._initializeNodeCreators();
    }

    _initializeHandlers() {
        // Define event handler map with generic node event handlers
        const nodeEventTypes = [
            { type: 'concept.created', method: 'createConcept' },
            { type: 'task.added', method: 'createTask' },
            { type: 'belief.added', method: 'createBelief' },
            { type: 'task.processed', method: 'createProcessedTask' },
            { type: 'task.input', method: 'createInputTask' },
            { type: 'question.answered', method: 'createQuestion' },
            { type: 'reasoning.derivation', method: 'createDerivation' },
            { type: 'reasoning.step', method: 'createReasoningStep' }
        ];

        const handlers = new Map();

        // Add node event handlers
        nodeEventTypes.forEach(({ type, method }) => {
            handlers.set(type, this._handleGenericNodeEvent.bind(this, type, method));
        });

        // Add specific event handlers
        handlers.set('memorySnapshot', this._handleMemorySnapshot.bind(this));
        handlers.set('eventBatch', this._handleEventBatch.bind(this));

        return handlers;
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
            Logger.error(`Error processing message of type ${message.type}`, {
                error: error.message,
                message
            });
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
            Logger.error(`Error handling ${eventType} event`, {
                error: error.message,
                message
            });
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
            Logger.error('Error handling memorySnapshot event', {
                error: error.message,
                message
            });
        }
    }

    _handleEventBatch(message) {
        try {
            const events = Array.isArray(message.data) ? message.data : [message.data];
            for (const event of events) {
                this.process(event); // Recursive processing
            }
        } catch (error) {
            Logger.error('Error handling eventBatch event', {
                error: error.message,
                message
            });
        }
    }

    _handleUnknownEvent(message) {
        try {
            const displayTypes = [
                'error', 'log', 'connection', 'task.added', 'concept.created',
                'belief.added', 'question.answered', 'reasoning.derivation',
                'reasoning.step', 'task.processed', 'task.input'
            ];

            if (displayTypes.includes(message.type)) {
                const content = this._extractContentFromMessage(message);

                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: {
                        content,
                        type: 'in'
                    }
                });
            } else {
                // For debugging, also log other message types that might be coming from the backend
                // but only for debugging purposes, not all the time to avoid spam
                Logger.debug('Unknown event type received', {
                    type: message.type,
                    data: message
                });
            }
        } catch (error) {
            Logger.error('Error handling unknown event', {
                error: error.message,
                message
            });
        }
    }

    /**
     * Extract content from a message, handling different message types appropriately
     * @param {Object} message - The message object
     * @returns {string} The extracted content
     */
    _extractContentFromMessage(message) {
        if (message.type === 'error') {
            return message.payload?.error ??
                   message.data?.error ??
                   message.payload?.message ??
                   message.data?.message ??
                   JSON.stringify(message);
        }

        return message.payload?.message ?? JSON.stringify(message);
    }
}

export default EventProcessor;