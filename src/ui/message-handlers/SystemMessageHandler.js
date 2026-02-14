import {BaseMessageHandler} from './BaseMessageHandler.js';

/**
 * Handler for system and connection related messages
 */
export class SystemMessageHandler extends BaseMessageHandler {
    /**
     * Handle connection messages
     */
    handleConnection(msg) {
        const messageContent = msg.payload?.message || msg.data?.message || 'Connected to server';
        return {content: messageContent, type: 'info', icon: '🌐'};
    }

    /**
     * Handle memory snapshot messages
     */
    handleMemorySnapshot(graphManager, msg) {
        graphManager.updateFromSnapshot(msg.payload);
        return {
            content: `Memory snapshot received: ${msg.payload?.concepts?.length || 0} concepts`,
            type: 'info',
            icon: '📊'
        };
    }

    /**
     * Handle info and log messages similarly
     */
    handleInfo(msg) {
        return this._formatMessage(msg.payload, JSON.stringify(msg.payload), 'info', 'ℹ️');
    }

    /**
     * Handle log messages using the same logic as info
     */
    handleLog(msg) {
        return this._formatMessage(msg.payload, JSON.stringify(msg.payload), 'info', 'ℹ️');
    }

    /**
     * Handle control result messages
     */
    handleControlResult(msg) {
        return this._formatMessage(msg.payload, 'Control command executed', 'info', '⚙️');
    }

    /**
     * Create an error message
     */
    handleErrorMessage(message) {
        const content = message.payload || message.message || message.error || JSON.stringify(message);
        return {content, type: 'error', icon: '🚨'};
    }
}