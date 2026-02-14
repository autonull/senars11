import {BaseMessageHandler} from './BaseMessageHandler.js';

/**
 * Handler for narsese-related messages
 */
export class NarseseMessageHandler extends BaseMessageHandler {
    /**
     * Handle narsese result messages
     */
    handleNarseseResult(msg) {
        const payload = msg.payload || {};
        if (typeof payload.result === 'string') {
            if (payload.result.startsWith('✅')) {
                return {content: payload.result, type: 'success', icon: '✅'};
            } else if (payload.result.startsWith('❌')) {
                return {content: payload.result, type: 'error', icon: '❌'};
            }
        }

        if (payload.success === true) {
            return {content: 'Command processed successfully', type: 'success', icon: '✅'};
        } else {
            return this._formatMessage(payload, 'Command processed', 'info', '✅');
        }
    }

    /**
     * Handle narsese processed messages
     */
    handleNarseseProcessed(msg) {
        const payload = msg.payload || {};
        const input = payload.input || '';
        return {
            content: `IN: ${input}`,
            type: 'info',
            icon: '✅'
        };
    }

    /**
     * Handle narsese error messages
     */
    handleNarseseError(msg) {
        return this._formatMessage(msg.payload, 'Narsese processing error', 'error', '❌');
    }
}
