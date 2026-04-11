/**
 * @file AgentConnectionManager.js
 * @description Connection manager that routes through LM instead of direct NAR
 */

import { ConnectionInterface } from './ConnectionInterface.js';

export class AgentConnectionManager extends ConnectionInterface {
    constructor(lmController, logger) {
        super();
        this.lmController = lmController;
        this.logger = logger;
        this._isConnected = false;
    }

    async connect() {
        this._isConnected = true;
        this.logger.log('Agent connection established (LM mode)', 'system');
        this.dispatchMessage({ type: 'connection.status', data: 'Connected (Agent)' });
        return true;
    }

    disconnect() {
        this._isConnected = false;
        this.logger.log('Agent connection closed', 'system');
        this.dispatchMessage({ type: 'connection.status', data: 'Disconnected' });
    }

    isConnected() {
        return this._isConnected;
    }

    async sendMessage(type, data) {
        if (!this._isConnected) {
            this.logger.log('Cannot send message: not connected', 'warning');
            return;
        }

        try {
            if (type.startsWith('control/')) {
                this.dispatchMessage({ type, data });
                return;
            }

            if (type.startsWith('input/')) {
                const input = data.content ?? data.input ?? '';
                const response = await this.lmController.chat(input);

                this.dispatchMessage({
                    type: 'nar.result',
                    data: { content: response, type: 'lm-response' }
                });

                const tools = this.lmController.getAvailableTools();
                if (tools.length > 0) {
                    this.dispatchMessage({ type: 'tools.available', data: { tools } });
                }
            }
        } catch (error) {
            this.logger.log(`Error sending message through LM: ${error.message}`, 'error');
            this.dispatchMessage({ type: 'error', data: { error: error.message } });
        }
    }

    getAvailableTools() {
        return this.lmController.getAvailableTools();
    }
}
