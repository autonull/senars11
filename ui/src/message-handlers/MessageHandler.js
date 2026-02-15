import { NarseseMessageHandler } from './NarseseMessageHandler.js';
import { TaskConceptMessageHandler } from './TaskConceptMessageHandler.js';
import { QuestionReasoningMessageHandler } from './QuestionReasoningMessageHandler.js';
import { SystemMessageHandler } from './SystemMessageHandler.js';

/**
 * Main Message Handler class to process different message types
 */
export class MessageHandler {
  constructor(graphManager) {
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
      'narsese.result': (msg) => this.narseseHandler.handleNarseseResult(msg),
      'narsese.error': (msg) => this.narseseHandler.handleNarseseError(msg),
      'task.added': (msg) => this.taskConceptHandler.handleTaskMessage(msg),
      'task.input': (msg) => this.taskConceptHandler.handleTaskMessage(msg),
      'concept.created': (msg) => this.taskConceptHandler.handleConceptMessage(msg),
      'concept.updated': (msg) => this.taskConceptHandler.handleConceptMessage(msg),
      'concept.added': (msg) => this.taskConceptHandler.handleConceptMessage(msg),
      'question.answered': (msg) => this.questionReasoningHandler.handleQuestionAnswered(msg),
      'reasoning.derivation': (msg) => this.questionReasoningHandler.handleReasoningDerivation(msg),
      'reasoning.step': (msg) => this.questionReasoningHandler.handleReasoningStep(msg),
      'error': (msg) => this.systemHandler.handleErrorMessage(msg),
      'error.message': (msg) => this.systemHandler.handleErrorMessage(msg),
      'connection': (msg) => this.systemHandler.handleConnection(msg),
      'memorySnapshot': (msg) => this.systemHandler.handleMemorySnapshot(this.graphManager, msg),
      'info': (msg) => this.systemHandler.handleInfo(msg),
      'log': (msg) => this.systemHandler.handleLog(msg),
      'control.result': (msg) => this.systemHandler.handleControlResult(msg)
    };
  }

  /**
   * Process a message and return content, type, and icon
   */
  processMessage(message) {
    const handler = this.handlers[message.type] || ((msg) => this._createDefaultMessage(msg));
    return typeof handler === 'function' ? handler(message) : this._createDefaultMessage(message);
  }

  /**
   * Create a default message for unknown types
   */
  _createDefaultMessage(message) {
    const content = message.payload || message.data || message;
    return {
      content: `${message.type}: ${JSON.stringify(content)}`,
      type: 'info',
      icon: '📝'
    };
  }
}