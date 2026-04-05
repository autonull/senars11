import {MessageHandler} from './message-handlers/MessageHandler.js';

export class VirtualConsole {
    constructor(virtualGraph) {
        this.messageHandler = new MessageHandler(virtualGraph);
        this.logs = [];
    }

    processMessage(message) {
        try {
            const result = this.messageHandler.processMessage(message);
            if (result) {
                const logEntry = {
                    ...result,
                    timestamp: Date.now(),
                    originalMessage: message
                };
                this.logs.push(logEntry);
                return logEntry;
            }
        } catch (error) {
            console.error('Error processing message in VirtualConsole:', error);
            this.logs.push({
                content: `Error processing message: ${error.message}`,
                type: 'error',
                icon: '❌',
                timestamp: Date.now()
            });
        }
        return null;
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
    }
}
