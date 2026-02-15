import { BaseMessageHandler } from './BaseMessageHandler.js';

/**
 * Handler for task and concept related messages
 */
export class TaskConceptMessageHandler extends BaseMessageHandler {
  /**
   * Create a task-related message
   */
  handleTaskMessage(message) {
    return this._formatMessage(message.payload, JSON.stringify(message.payload), 'task', '📥');
  }

  /**
   * Create a concept-related message
   */
  handleConceptMessage(message) {
    return this._formatMessage(message.payload, JSON.stringify(message.payload), 'concept', '🧠');
  }
}