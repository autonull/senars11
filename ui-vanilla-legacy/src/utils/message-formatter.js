/**
 * MessageFormatter - Centralized message formatting and validation utility
 */
import configManager from '../config/config-manager.js';
import errorHandler from './error-handler.js';

class MessageFormatter {
    static formatOutgoingMessage(type, payload, options = {}) {
        try {
            const message = {
                type,
                payload: this._sanitizePayload(payload),
                timestamp: Date.now(),
                id: this._generateMessageId(),
                ...options
            };

            // Apply validation if enabled
            if (configManager.getValidationEnabled()) {
                this.validateMessage(message);
            }

            return message;
        } catch (error) {
            errorHandler.handleError(error, {
                type,
                payload: payload,
                context: 'formatOutgoingMessage'
            });
            throw error;
        }
    }

    static formatIncomingMessage(rawData) {
        try {
            let parsedData = rawData;
            
            // If rawData is a string, parse it
            if (typeof rawData === 'string') {
                try {
                    parsedData = JSON.parse(rawData);
                } catch (parseError) {
                    errorHandler.handleError(parseError, {
                        rawData,
                        context: 'formatIncomingMessage'
                    });
                    throw new Error(`Invalid message format: ${parseError.message}`);
                }
            }

            // Apply validation if enabled
            if (configManager.getValidationEnabled()) {
                this.validateMessage(parsedData);
            }

            return parsedData;
        } catch (error) {
            errorHandler.handleError(error, {
                rawData,
                context: 'formatIncomingMessage'
            });
            throw error;
        }
    }

    static validateMessage(message) {
        const issues = [];

        // Basic structure validation
        if (!message || typeof message !== 'object') {
            issues.push('Message must be an object');
        }

        if (!message.type) {
            issues.push('Message type is required');
        }

        if (message.type && typeof message.type !== 'string') {
            issues.push('Message type must be a string');
        }

        // Check for payload if present
        if (message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)) {
            // Check if payload has essential properties if required
            // This can be customized based on message types
        }

        // Strict validation if enabled
        if (configManager.getStrictValidation()) {
            if (message.timestamp && typeof message.timestamp !== 'number') {
                issues.push('Message timestamp must be a number');
            }
        }

        if (issues.length > 0) {
            const error = new Error(`Message validation failed: ${issues.join(', ')}`);
            error.validationIssues = issues;
            throw error;
        }

        return true;
    }

    static validateMessageType(messageType) {
        const validTypes = [
            'narseseInput', 'concept.created', 'task.added', 'belief.added', 
            'task.processed', 'task.input', 'question.answered', 'reasoning.derivation', 
            'reasoning.step', 'memorySnapshot', 'eventBatch', 'error', 'log', 'connection'
        ];

        return validTypes.includes(messageType);
    }

    static _sanitizePayload(payload) {
        if (typeof payload !== 'object' || payload === null) {
            return payload;
        }

        // Create a clean copy without circular references or functions
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch (e) {
            // If JSON serialization fails, try a more careful approach
            return this._deepSanitize(payload);
        }
    }

    static _deepSanitize(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (seen.has(obj)) return '[Circular]';
        if (typeof obj === 'function') return '[Function]';

        seen.add(obj);

        if (Array.isArray(obj)) {
            return obj.map(item => this._deepSanitize(item, seen));
        }

        const sanitized = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = this._deepSanitize(obj[key], seen);
            }
        }

        seen.delete(obj);
        return sanitized;
    }

    static _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Utility to create command message
    static createCommandMessage(command) {
        return this.formatOutgoingMessage('narseseInput', { input: command });
    }

    // Utility to create event message
    static createEventMessage(eventType, data) {
        return this.formatOutgoingMessage(eventType, data);
    }
}

export default MessageFormatter;