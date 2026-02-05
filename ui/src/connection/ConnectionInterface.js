/**
 * ConnectionInterface.js
 * 
 * Defines the contract for communication adapters (WebSocket or Local).
 * Allows the UI to operate transparently regardless of the backend.
 */

export class ConnectionInterface {
    constructor() {
        this.messageHandlers = new Map();
    }

    /**
     * Establish connection to the backend
     * @returns {Promise<boolean>}
     */
    async connect() {
        throw new Error('Method not implemented');
    }

    /**
     * Check if connected to the backend
     * @returns {boolean}
     */
    isConnected() {
        throw new Error('Method not implemented');
    }

    /**
     * Send a message to the backend
     * @param {string} type - Message type (e.g. 'agent/input')
     * @param {Object} payload - Message data
     */
    sendMessage(type, payload) {
        throw new Error('Method not implemented');
    }

    /**
     * Subscribe to backend events
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    subscribe(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    /**
     * Unsubscribe from backend events
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    unsubscribe(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (!handlers) return;
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
    }

    /**
     * Dispatch message to subscribers
     * @param {Object} message
     */
    dispatchMessage(message) {
        const handlers = [
            ...(this.messageHandlers.get(message.type) || []),
            ...(this.messageHandlers.get('*') || [])
        ];

        for (const handler of handlers) {
            try {
                handler(message);
            } catch (e) {
                console.error("Handler error", e);
            }
        }
    }

    /**
     * Disconnect from the backend
     */
    disconnect() {
        throw new Error('Method not implemented');
    }
}
