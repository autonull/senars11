import {EventEmitter} from 'events';
import {MESSAGE_TYPES} from '@senars/core';
import {Logger} from '../../../core/src/util/Logger.js';

const CMD_MAP = {'start': 'run', 'stop': 'stop', 'step': 'next'};

export class ReplMessageHandler extends EventEmitter {
    constructor(engine) {
        super();

        if (!engine || typeof engine.processInput !== 'function') {
            throw new Error('ReplMessageHandler requires a valid engine with processInput method');
        }

        this.engine = engine;
        this.commandHandlers = new Map();
        this.messageHandlers = new Map();
        this.handlerCache = new Map();

        this._setupDefaultCommandHandlers();
        this._setupDefaultMessageHandlers();
    }

    _setupDefaultCommandHandlers() {
        // Map special commands to internal methods
        const internalCommands = {
            'n': '_next',
            'next': '_next',
            'run': '_run',
            'go': '_run',
            'stop': '_stop',
            'st': '_stop',
            'quit': 'shutdown',
            'q': 'shutdown',
            'exit': 'shutdown'
        };

        Object.entries(internalCommands).forEach(([cmd, method]) => {
            this.commandHandlers.set(cmd, async () => {
                try {
                    if (this.engine[method]) {
                        return await this.engine[method].call(this.engine);
                    }
                    return `Unknown command: ${cmd}`;
                } catch (error) {
                    const errorMsg = `❌ Error executing command '${cmd}': ${error.message}`;
                    this.emit('command.error', {command: cmd, error: error.message});
                    return errorMsg;
                }
            });
        });
    }

    _setupDefaultMessageHandlers() {
        this.messageHandlers.set('reason/step', this._handleReasonStep.bind(this));
        this.messageHandlers.set('narseseInput', this._handleNarseseInput.bind(this));
        this.messageHandlers.set('command.execute', this._handleCommandExecute.bind(this));
        this.messageHandlers.set('control/start', this._handleControlCommand.bind(this));
        this.messageHandlers.set('control/stop', this._handleControlCommand.bind(this));
        this.messageHandlers.set('control/step', this._handleControlCommand.bind(this));
        this.messageHandlers.set('agent/input', this._handleAgentInput.bind(this));
        this.messageHandlers.set('agent/response', this._handleAgentResponse.bind(this));
    }

    async processMessage(message) {
        if (!message || typeof message !== 'object') {
            return {error: 'Invalid message: expected object'};
        }

        try {
            const input = message?.payload?.text ?? message?.payload?.input ?? message?.payload ?? message;
            const messageType = message?.type;

            // Early return for common cases to avoid unnecessary processing
            if (!messageType && typeof input === 'string') {
                return await this.engine.processInput(input);
            }

            // Use a switch statement for the most common message types for better performance
            switch (messageType) {
                case 'narseseInput':
                case 'reason/step':
                    return await this._handleNarseseInput(message);
                case 'command.execute':
                    return await this._handleCommandExecute(message);
                case 'agent/input':
                    return await this._handleAgentInput(message);
                case 'agent/response':
                    return await this._handleAgentResponse(message);
            }

            // Handle control commands
            if (messageType?.startsWith('control/')) {
                return await this._handleControlCommand(message);
            }

            // Handle direct commands
            if (messageType?.startsWith('/')) {
                const [cmd, ...args] = messageType.slice(1).split(' ');
                return await this._handleCommand(cmd, ...args);
            }

            // Try cached handler first
            if (messageType) {
                if (this.handlerCache.has(messageType)) {
                    return await this.handlerCache.get(messageType)(message);
                }

                // Look up handler in registered handlers
                const handler = this.messageHandlers.get(messageType);
                if (handler) {
                    // Cache the handler for future use
                    this.handlerCache.set(messageType, handler);
                    return await handler(message);
                }
            }

            // Fallback to direct input processing
            if (typeof input === 'string' && input.trim()) {
                return await this.engine.processInput(input);
            }

            return {error: `Unknown message type: ${messageType || 'undefined'}`};
        } catch (error) {
            Logger.error('Error processing message:', error);
            this.emit('message.error', {message, error: error.message});
            return {error: error.message, type: MESSAGE_TYPES.ERROR};
        }
    }

    async _handleAgentInput(message) {
        try {
            const input = message?.payload?.text ?? message?.payload?.input ?? message?.payload;
            if (typeof input !== 'string' || !input.trim()) {
                return {error: 'No input provided', type: MESSAGE_TYPES.ERROR};
            }

            const result = await this.engine.processInput(input);
            return {
                type: MESSAGE_TYPES.AGENT_RESULT,
                payload: {input, result, success: true, timestamp: Date.now()}
            };
        } catch (error) {
            Logger.error('Error in agent input handler:', error);
            return {error: error.message, type: MESSAGE_TYPES.ERROR};
        }
    }

    async _handleAgentResponse(message) {
        try {
            const { id, response } = message.payload || {};
            if (!id || response === undefined) {
                return { error: 'Invalid agent response format', type: MESSAGE_TYPES.ERROR };
            }

            // Emit event so the Agent/NAR can pick it up
            if (this.engine.emit) {
                this.engine.emit('agent.response', { id, response });
            } else {
                 Logger.warn('Engine does not support emitting agent.response');
            }

            return {
                type: 'ack',
                payload: { id, success: true, timestamp: Date.now() }
            };
        } catch (error) {
            Logger.error('Error in agent response handler:', error);
            return { error: error.message, type: MESSAGE_TYPES.ERROR };
        }
    }

    async _handleNarseseInput(message) {
        try {
            const input = message?.payload?.text ?? message?.payload?.input ?? message?.payload ?? message;
            if (typeof input !== 'string' || !input.trim()) {
                return {error: 'No input provided', type: MESSAGE_TYPES.ERROR};
            }

            const result = await this.engine.processInput(input);
            return {
                type: MESSAGE_TYPES.NARSESE_RESULT,
                payload: {input, result, success: !!result, timestamp: Date.now()}
            };
        } catch (error) {
            Logger.error('Error in narsese input handler:', error);
            return {error: error.message, type: MESSAGE_TYPES.ERROR};
        }
    }

    async _handleControlCommand(message) {
        try {
            const command = message?.type?.split('/')[1];
            if (!command) {
                return {error: 'No control command specified', type: MESSAGE_TYPES.ERROR};
            }

            const mappedCommand = CMD_MAP[command] || command;
            const result = await this._handleCommand(mappedCommand);

            return {
                type: MESSAGE_TYPES.CONTROL_RESULT,
                payload: {command, result, timestamp: Date.now()}
            };
        } catch (error) {
            Logger.error('Error in control command handler:', error);
            return {error: error.message, type: MESSAGE_TYPES.ERROR};
        }
    }

    async _handleCommandExecute(message) {
        try {
            const cmd = message?.payload?.command;
            const args = message?.payload?.args ?? [];

            if (!cmd) {
                return {error: 'No command specified', type: MESSAGE_TYPES.ERROR};
            }

            const result = await this._handleCommand(cmd, ...args);

            return {
                type: MESSAGE_TYPES.COMMAND_RESULT,
                payload: {command: cmd, args, result, timestamp: Date.now()}
            };
        } catch (error) {
            Logger.error('Error in command execute handler:', error);
            return {error: error.message, type: MESSAGE_TYPES.ERROR};
        }
    }

    async _handleReasonStep(message) {
        return await this._handleNarseseInput(message);
    }

    async _handleCommand(cmd, ...args) {
        try {
            if (this.commandHandlers.has(cmd)) {
                return await this.commandHandlers.get(cmd)(...args);
            }

            if (this.engine.executeCommand) {
                return await this.engine.executeCommand(cmd, ...args);
            }

            return `Unknown command: ${cmd}`;
        } catch (error) {
            Logger.error(`Error executing command ${cmd}:`, error);
            const errorMsg = `❌ Error executing command: ${error.message}`;
            this.emit('command.error', {command: cmd, args, error: error.message});
            return errorMsg;
        }
    }

    registerCommandHandler(name, handler) {
        if (typeof name !== 'string' || name.trim() === '') throw new Error('Command name must be a non-empty string');
        if (typeof handler !== 'function') throw new Error('Command handler must be a function');
        this.commandHandlers.set(name, handler);
    }

    registerMessageHandler(type, handler) {
        if (typeof type !== 'string' || type.trim() === '') throw new Error('Message type must be a non-empty string');
        if (typeof handler !== 'function') throw new Error('Message handler must be a function');
        this.messageHandlers.set(type, handler);
    }

    getSupportedMessageTypes() {
        return {
            commands: Array.from(this.commandHandlers.keys()),
            messages: Array.from(this.messageHandlers.keys()),
            types: MESSAGE_TYPES
        };
    }

    clearHandlerCache() {
        this.handlerCache.clear();
    }
}
