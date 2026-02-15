import { BaseMessageHandler } from './BaseMessageHandler.js';

/**
 * Handler for narsese-related messages
 */
export class NarseseMessageHandler extends BaseMessageHandler {
  /**
   * Handle narsese result messages
   */
  handleNarseseResult(msg) {
    const payload = msg.payload || {};
    if (payload.result?.startsWith('✅')) {
      return { content: payload.result, type: 'success', icon: '✅' };
    } else if (payload.result?.startsWith('❌')) {
      return { content: payload.result, type: 'error', icon: '❌' };
    } else if (payload.success === true) {
      return this._formatMessage(payload, 'Command processed', 'success', '✅');
    } else {
      return this._formatMessage(payload, 'Command processed', 'info', '✅');
    }
  }

  /**
   * Handle narsese error messages
   */
  handleNarseseError(msg) {
    return this._formatMessage(msg.payload, 'Narsese processing error', 'error', '❌');
  }
}