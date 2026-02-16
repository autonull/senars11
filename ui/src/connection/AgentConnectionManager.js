/**
 * @file AgentConnectionManager.js
 * @description Connection manager that routes through LM instead of direct NAR
 */

export class AgentConnectionManager {
    constructor(lmController, logger) {
        this.lmController = lmController;
        this.logger = logger;
        this.subscribers = new Map();
        this.isConnected = false;
    }

    async connect() {
        this.isConnected = true;
        this.logger.log('Agent connection established (LM mode)', 'system');
        this.emit('connection.status', 'Connected (Agent)');
        return true;
    }

    disconnect() {
        this.isConnected = false;
        this.logger.log('Agent connection closed', 'system');
        this.emit('connection.status', 'Disconnected');
    }

    /**
     * Send a message through the LM
     * This adapts the connection interface to work with LM-based interactions
     */
    async sendMessage(type, data) {
        if (!this.isConnected) {
            this.logger.log('Cannot send message: not connected', 'warning');
            return;
        }

        try {
            // Route different message types
            if (type === 'control/start' || type === 'control/stop' || type === 'control/pause') {
                // Control messages - emit directly
                this.emit(type, data);
                return;
            }

            if (type.startsWith('input/')) {
                // Input messages - send to LM
                const input = data.content || data.input || '';

                // Get response from LM
                const response = await this.lmController.chat(input);

                // Emit response as a result
                this.emit('nar.result', {
                    content: response,
                    type: 'lm-response'
                });

                // Also emit any tool results
                const tools = this.lmController.getAvailableTools();
                if (tools.length > 0) {
                    this.emit('tools.available', { tools });
                }
            }

        } catch (error) {
            this.logger.log(`Error sending message through LM: ${error.message}`, 'error');
            this.emit('error', { error: error.message });
        }
    }

    /**
     * Subscribe to events
     */
    subscribe(event, callback) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event).push(callback);
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(event, callback) {
        if (!this.subscribers.has(event)) return;

        const callbacks = this.subscribers.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Emit an event to subscribers
     */
    emit(event, data) {
        // Handle wildcard subscribers
        if (this.subscribers.has('*')) {
            this.subscribers.get('*').forEach(callback => {
                callback({ type: event, ...data });
            });
        }

        // Handle specific event subscribers
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).forEach(callback => {
                callback(data);
            });
        }
    }

    isConnected() {
        return this.isConnected;
    }

    /**
     * Get available tools from the LM controller
     */
    getAvailableTools() {
        return this.lmController.getAvailableTools();
    }
}
