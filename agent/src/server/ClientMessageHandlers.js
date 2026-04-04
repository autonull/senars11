/**
 * ClientMessageHandlers - Modular handlers for WebSocket client messages
 */
import { Logger, sendToClient } from '@senars/core';
import { SUPPORTED_MESSAGE_TYPES } from '@senars/nar';

export class ClientMessageHandlers {
    constructor(webSocketMonitor) {
        this.monitor = webSocketMonitor;
    }

    handleSubscribe(client, message) {
        this._handleSubscription(client, message, 'subscribe');
    }

    handleUnsubscribe(client, message) {
        this._handleSubscription(client, message, 'unsubscribe');
    }

    handleNarseseInput(client, message) {
        // Delegate directly to ReplMessageHandler if available
        if (this.monitor._replMessageHandler) {
            this.monitor._replMessageHandler.processMessage(message)
                .then(result => {
                    this._sendToClient(client, result);
                })
                .catch(error => {
                    Logger.error('Error in ReplMessageHandler:', error);
                    this._sendToClient(client, {
                        type: 'error',
                        message: error.message
                    });
                });
        } else {
            Logger.warn('No ReplMessageHandler attached to handle Narsese input');
            this._sendToClient(client, {
                type: 'error',
                message: 'Server not ready to process input'
            });
        }
    }

    handleTestLMConnection(client, message) {
        // Delegate to ReplMessageHandler if possible, as it knows about the Engine/LM
        // For now, we'll keep this logic here but it should ideally move to ReplMessageHandler too
        // to keep WebSocketMonitor completely dumb.
        // Since the plan is to make WebSocketMonitor dumb, we should try to route this.

        if (this.monitor._replMessageHandler && this.monitor._replMessageHandler.handleTestLMConnection) {
            this.monitor._replMessageHandler.handleTestLMConnection(client, message)
                .then(result => this._sendToClient(client, result));
            return;
        }

        // Fallback: Return error as we shouldn't have logic here
        this._sendToClient(client, {
            type: 'testLMConnection',
            success: false,
            message: 'LM Connection testing not available in dumb transport mode'
        });
    }

    handlePing(client) {
        this._sendToClient(client, {type: 'pong', timestamp: Date.now()});
    }

    handleLog(client, message) {
        this._handleClientLog(client, message);
    }

    handleRequestCapabilities(client, message) {
        this._handleRequestCapabilities(client, message);
    }

    // Private methods
    _handleSubscription(client, message, action) {
        if (!client.subscriptions) client.subscriptions = new Set();

        const eventTypes = message.eventTypes ?? ['all'];

        if (action === 'subscribe') {
            eventTypes.forEach(type => client.subscriptions.add(type));
            this._sendToClient(client, {
                type: 'subscription_ack',
                subscribedTo: Array.from(client.subscriptions),
                timestamp: Date.now()
            });
        } else if (action === 'unsubscribe') {
            eventTypes.forEach(type => client.subscriptions.delete(type));
            this._sendToClient(client, {
                type: 'unsubscription_ack',
                unsubscribedFrom: eventTypes,
                timestamp: Date.now()
            });
        }
    }

    // Handler for client log messages
    _handleClientLog(client, message) {
        // Log the client message to server console for debugging
        const logMessage = `[CLIENT-${client.clientId}] ${message.level.toUpperCase()}: ${message.data.join(' ')}`;
        Logger.debug(logMessage);
    }

    // Handler for requesting client capabilities
    _handleRequestCapabilities(client, message) {
        const clientId = client.clientId;
        const capabilities = this.monitor.clientCapabilities.get(clientId) || [];

        this._sendToClient(client, {
            type: 'capabilities',
            data: {
                clientId,
                capabilities,
                serverVersion: '10.0.0',
                supportedMessageTypes: SUPPORTED_MESSAGE_TYPES
            },
            timestamp: Date.now()
        });
    }

    _sendToClient(client, message) {
        if (!client) {
            Logger.warn('Attempt to send message to null/undefined client:', message);
            return;
        }
        sendToClient(client, message);
    }
}
