import {ReplMessageHandler} from './ReplMessageHandler.js';
import { Logger } from '@senars/core';

export class ReplCommonInterface {
    constructor(engine) {
        if (!engine || typeof engine.processInput !== 'function') {
            throw new Error('ReplCommonInterface requires a valid engine with processInput method');
        }

        this.engine = engine;
        this.messageHandler = new ReplMessageHandler(engine);
    }

    async processInput(input) {
        try {
            const message = {
                type: 'narseseInput',
                payload: {input}
            };

            const result = await this.messageHandler.processMessage(message);
            return result;
        } catch (error) {
            Logger.error('Error in processInput:', error);
            return {error: error.message};
        }
    }

    async executeCommand(command, ...args) {
        try {
            const message = {
                type: 'command.execute',
                payload: {command, args}
            };

            const result = await this.messageHandler.processMessage(message);
            return result;
        } catch (error) {
            Logger.error('Error in executeCommand:', error);
            return {error: error.message};
        }
    }

    async executeControlCommand(command) {
        try {
            const message = {
                type: `control/${command}`,
                payload: {}
            };

            const result = await this.messageHandler.processMessage(message);
            return result;
        } catch (error) {
            Logger.error('Error in executeControlCommand:', error);
            return {error: error.message};
        }
    }

    getEngine() {
        return this.engine;
    }

    getMessageHandler() {
        return this.messageHandler;
    }

    async processMessage(message) {
        return await this.messageHandler.processMessage(message);
    }

    registerCommandHandler(name, handler) {
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error('Command name must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new Error('Command handler must be a function');
        }
        this.messageHandler.registerCommandHandler(name, handler);
    }

    registerMessageHandler(type, handler) {
        if (typeof type !== 'string' || type.trim() === '') {
            throw new Error('Message type must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new Error('Message handler must be a function');
        }
        this.messageHandler.registerMessageHandler(type, handler);
    }

    async shutdown() {
        this.messageHandler.removeAllListeners();
    }
}