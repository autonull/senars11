import { BaseMessageHandler } from './BaseMessageHandler.js';

/**
 * Handler for question and reasoning related messages
 */
export class QuestionReasoningMessageHandler extends BaseMessageHandler {
  /**
   * Handle question answered messages
   */
  handleQuestionAnswered(msg) {
    return this._formatMessage(msg.payload, JSON.stringify(msg.payload), 'info', '❓');
  }

  /**
   * Handle reasoning derivation messages
   */
  handleReasoningDerivation(msg) {
    return this._formatMessage(msg.payload, JSON.stringify(msg.payload), 'info', '🔍');
  }

  /**
   * Handle reasoning step messages
   */
  handleReasoningStep(msg) {
    return this._formatMessage(msg.payload, JSON.stringify(msg.payload), 'info', '🔍');
  }
}