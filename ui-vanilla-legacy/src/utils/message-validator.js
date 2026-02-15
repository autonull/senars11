/**
 * MessageValidator - Validates WebSocket messages for proper structure and content
 * Updated to work with centralized ValidationService
 */
import { validationService } from './validation-service.js';
import errorHandler from './error-handler.js';

class MessageValidator {
    static validate(message) {
        try {
            // Basic message structure validation
            if (!message || typeof message !== 'object') {
                return { valid: false, error: 'Message must be an object' };
            }

            if (typeof message.type !== 'string' || !message.type.trim()) {
                return { valid: false, error: 'Message type must be a non-empty string' };
            }

            // Use the centralized validation service for known message types
            const validationMap = {
                'narseseInput': 'narseseInput',
                'task.added': 'task',
                'belief.added': 'task',
                'concept.created': 'concept',
                'memorySnapshot': 'memorySnapshot'
            };

            const validationType = validationMap[message.type];
            if (validationType) {
                return this._useValidationService(message, validationType);
            }

            // For other types, use basic validation
            return { valid: true, message };
        } catch (error) {
            errorHandler.handleError(error, {
                message,
                context: 'MessageValidator.validate'
            });
            return { valid: false, error: error.message };
        }
    }

    static _useValidationService(message, validationType) {
        // Adapt the message for validation service
        const dataToValidate = this._extractDataForValidation(message, validationType);

        const result = validationService.validate(dataToValidate, validationType);

        if (result.valid) {
            return { valid: true, message };
        } else {
            return { valid: false, error: result.errors.join(', ') };
        }
    }

    static _extractDataForValidation(message, validationType) {
        switch (validationType) {
            case 'narseseInput':
                return message.payload || {};
            case 'task':
            case 'concept':
                return message.data || message.payload || {};
            case 'memorySnapshot':
                return message.payload || {};
            default:
                return message;
        }
    }
}

export default MessageValidator;