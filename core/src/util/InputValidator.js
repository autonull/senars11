/**
 * Input validation utilities for SeNARS public APIs
 */

import { Logger } from './Logger.js';

export class ValidationError extends Error {
    constructor(message, field = null, value = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
        this.timestamp = Date.now();
    }
}

export const validateRequired = (value, fieldName) => {
    if (value == null) {
        throw new ValidationError(`${fieldName} is required`, fieldName, value);
    }
};

export const validateType = (value, expectedType, fieldName, optional = false) => {
    if (optional && value === undefined) return;

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
        throw new ValidationError(
            `${fieldName} must be of type ${expectedType}, got ${actualType}`,
            fieldName,
            value
        );
    }
};

export const validateRange = (value, { min, max }, fieldName, optional = false) => {
    if (optional && value === undefined) return;

    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${fieldName} must be a number`, fieldName, value);
    }

    if (min !== undefined && value < min) {
        throw new ValidationError(`${fieldName} must be >= ${min}`, fieldName, value);
    }

    if (max !== undefined && value > max) {
        throw new ValidationError(`${fieldName} must be <= ${max}`, fieldName, value);
    }
};

export const validatePattern = (value, pattern, fieldName, optional = false) => {
    if (optional && value === undefined) return;

    if (typeof value !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`, fieldName, value);
    }

    if (!pattern.test(value)) {
        throw new ValidationError(`${fieldName} must match pattern ${pattern}`, fieldName, value);
    }
};

export const validateArray = (value, validator, fieldName, optional = false) => {
    if (optional && value === undefined) return;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName, value);
    }

    for (const [i, item] of value.entries()) {
        try {
            validator(item);
        } catch (error) {
            throw new ValidationError(
                `${fieldName}[${i}] is invalid: ${error.message}`,
                `${fieldName}[${i}]`,
                item
            );
        }
    }
};

export const validateSchema = (obj, schema, context = 'validation') => {
    if (obj == null) {
        throw new ValidationError('Options object is required', 'options', obj);
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
        throw new ValidationError('Options must be an object', 'options', obj);
    }

    const validated = {};

    for (const [field, rules] of Object.entries(schema)) {
        const value = obj[field];

        if (rules.required && !rules.optional && value == null) {
            throw new ValidationError(`${context}: ${field} is required`, field, value);
        }

        if (value === undefined && rules.optional) continue;

        if (value !== undefined && rules.type) {
            try {
                validateType(value, rules.type, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        if (value !== undefined && rules.type === 'number' && (rules.min !== undefined || rules.max !== undefined)) {
            try {
                validateRange(value, { min: rules.min, max: rules.max }, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        if (value !== undefined && rules.validator && typeof rules.validator === 'function') {
            if (!rules.validator(value)) {
                throw new ValidationError(
                    `${context}: ${field} failed custom validation`,
                    field,
                    value
                );
            }
        }

        validated[field] = value;
    }

    return validated;
};

export const createValidator = (context) => ({
    required: (value, fieldName) => validateRequired(value, `${context}.${fieldName}`),
    type: (value, expectedType, fieldName, optional = false) =>
        validateType(value, expectedType, `${context}.${fieldName}`, optional),
    range: (value, options, fieldName, optional = false) =>
        validateRange(value, options, `${context}.${fieldName}`, optional),
    schema: (obj, schemaDef) => validateSchema(obj, schemaDef, context)
});

export const logValidationError = (error, context = 'validation') => {
    Logger.error(`[${context}] Validation failed: ${error.message}`, {
        field: error.field,
        value: error.value,
        timestamp: error.timestamp
    });
};
