import {NarseseMessageHandler} from './NarseseMessageHandler.js';
import {TaskConceptMessageHandler} from './TaskConceptMessageHandler.js';
import {QuestionReasoningMessageHandler} from './QuestionReasoningMessageHandler.js';
import {SystemMessageHandler} from './SystemMessageHandler.js';
import {BaseMessageHandler} from './BaseMessageHandler.js';
import {UI_CONSTANTS} from '@senars/core';

/**
 * Main Message Handler class to process different message types
 */
export class MessageHandler extends BaseMessageHandler {
    constructor(graphManager) {
        super();
        this.graphManager = graphManager;
        this.narseseHandler = new NarseseMessageHandler();
        this.taskConceptHandler = new TaskConceptMessageHandler();
        this.questionReasoningHandler = new QuestionReasoningMessageHandler();
        this.systemHandler = new SystemMessageHandler();
        this.handlers = this._initializeHandlers();
    }

    /**
     * Initialize message handlers lookup table
     */
    _initializeHandlers() {
        return {
            [UI_CONSTANTS.MESSAGE_TYPES.NARSESE_RESULT]: (msg) => this.narseseHandler.handleNarseseResult(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.NARSESE_PROCESSED]: (msg) => this.narseseHandler.handleNarseseProcessed(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.NARSESE_ERROR]: (msg) => this.narseseHandler.handleNarseseError(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.TASK_ADDED]: (msg) => this.taskConceptHandler.handleTaskMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.TASK_INPUT]: (msg) => this.taskConceptHandler.handleTaskMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_CREATED]: (msg) => this.taskConceptHandler.handleConceptMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_UPDATED]: (msg) => this.taskConceptHandler.handleConceptMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_ADDED]: (msg) => this.taskConceptHandler.handleConceptMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.QUESTION_ANSWERED]: (msg) => this.questionReasoningHandler.handleQuestionAnswered(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.REASONING_DERIVATION]: (msg) => this.questionReasoningHandler.handleReasoningDerivation(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.REASONING_STEP]: (msg) => this.questionReasoningHandler.handleReasoningStep(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.ERROR]: (msg) => this.systemHandler.handleErrorMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.ERROR_MESSAGE]: (msg) => this.systemHandler.handleErrorMessage(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.CONNECTION]: (msg) => this.systemHandler.handleConnection(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.MEMORY_SNAPSHOT]: (msg) => this.systemHandler.handleMemorySnapshot(this.graphManager, msg),
            [UI_CONSTANTS.MESSAGE_TYPES.INFO]: (msg) => this.systemHandler.handleInfo(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.LOG]: (msg) => this.systemHandler.handleLog(msg),
            [UI_CONSTANTS.MESSAGE_TYPES.CONTROL_RESULT]: (msg) => this.systemHandler.handleControlResult(msg)
        };
    }

    /**
     * Process a message and return content, type, and icon
     */
    processMessage(message) {
        // Normalize message to ensure payload is available
        const normalizedMessage = {...message};
        if (!normalizedMessage.payload && normalizedMessage.data) {
            normalizedMessage.payload = normalizedMessage.data;
        }

        const handler = this.handlers[message.type] || ((msg) => this._createDefaultMessage(msg));
        return typeof handler === 'function' ? handler(normalizedMessage) : this._createDefaultMessage(normalizedMessage);
    }
}
