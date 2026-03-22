/**
 * Input validation utilities for SeNARS public APIs
 */

import {Logger} from './Logger.js';
import {ValidationError} from './CustomErrors.js';

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

export const validateRange = (value, {min, max}, fieldName, optional = false) => {
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
        let value = obj[field];

        if (rules.required && !rules.optional && value == null) {
            throw new ValidationError(`${context}: ${field} is required`, field, value);
        }

        if (value === undefined && rules.optional) continue;

        if (value === undefined || value === null) {
            if (rules.default !== undefined) {
                validated[field] = rules.default;
                continue;
            }
        }

        if (value !== undefined && rules.type) {
            try {
                validateType(value, rules.type, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        if (value !== undefined && rules.type === 'number' && (rules.min !== undefined || rules.max !== undefined)) {
            try {
                validateRange(value, {min: rules.min, max: rules.max}, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        if (value !== undefined && (typeof value === 'string' || Array.isArray(value))) {
            if (rules.minLength !== undefined && value.length < rules.minLength) {
                throw new ValidationError(
                    `${context}: ${field} must have at least ${rules.minLength} characters/elements`,
                    field,
                    {minLength: rules.minLength, length: value.length, value}
                );
            }
            if (rules.maxLength !== undefined && value.length > rules.maxLength) {
                throw new ValidationError(
                    `${context}: ${field} must have at most ${rules.maxLength} characters/elements`,
                    field,
                    {maxLength: rules.maxLength, length: value.length, value}
                );
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

/**
 * Validates parameters against JSON Schema format
 */
export function validateJsonSchema(params, schema, context = 'validation') {
    if (!schema || typeof schema !== 'object') {
        return {isValid: true, errors: []};
    }

    const errors = [];
    const {properties = {}, required = []} = schema;

    for (const fieldName of required) {
        if (!(fieldName in params) || params[fieldName] == null) {
            errors.push(`${context}: Missing required parameter '${fieldName}'`);
        }
    }

    for (const [fieldName, propSchema] of Object.entries(properties)) {
        const value = params[fieldName];

        if (!(fieldName in params)) continue;

        if (propSchema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== propSchema.type) {
                errors.push(`${context}: Parameter '${fieldName}' must be of type ${propSchema.type}, got ${actualType}`);
            }
        }

        if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
            errors.push(`${context}: Parameter '${fieldName}' must be one of: ${propSchema.enum.join(', ')}`);
        }

        if (typeof value === 'number') {
            if (propSchema.minimum !== undefined && value < propSchema.minimum) {
                errors.push(`${context}: Parameter '${fieldName}' must be >= ${propSchema.minimum}`);
            }
            if (propSchema.maximum !== undefined && value > propSchema.maximum) {
                errors.push(`${context}: Parameter '${fieldName}' must be <= ${propSchema.maximum}`);
            }
        }

        if (typeof value === 'string') {
            if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
                errors.push(`${context}: Parameter '${fieldName}' must have at least ${propSchema.minLength} characters`);
            }
            if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
                errors.push(`${context}: Parameter '${fieldName}' must have at most ${propSchema.maxLength} characters`);
            }
        }

        if (typeof value === 'string' && propSchema.pattern) {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
                errors.push(`${context}: Parameter '${fieldName}' must match pattern ${propSchema.pattern}`);
            }
        }
    }

    return {isValid: errors.length === 0, errors};
}
