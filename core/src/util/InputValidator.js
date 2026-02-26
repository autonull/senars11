/**
 * Input validation utilities for SeNARS public APIs
 * Following AGENTS.md guidelines for professional, production-ready code
 */

import { Logger } from './Logger.js';

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
    constructor(message, field = null, value = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
        this.timestamp = Date.now();
    }
}

/**
 * Validates that a value is not null or undefined
 * @param {*} value - Value to check
 * @param {string} fieldName - Name of the field for error messages
 * @throws {ValidationError} If value is null or undefined
 */
export function validateRequired(value, fieldName) {
    if (value === null || value === undefined) {
        throw new ValidationError(`${fieldName} is required`, fieldName, value);
    }
}

/**
 * Validates that a value is of expected type
 * @param {*} value - Value to check
 * @param {string} expectedType - Expected type ('string', 'number', 'boolean', 'object', 'array', 'function')
 * @param {string} fieldName - Name of the field for error messages
 * @param {boolean} [optional=false] - Whether the value can be undefined
 * @throws {ValidationError} If type doesn't match
 */
export function validateType(value, expectedType, fieldName, optional = false) {
    if (optional && value === undefined) {
        return;
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
        throw new ValidationError(
            `${fieldName} must be of type ${expectedType}, got ${actualType}`,
            fieldName,
            value
        );
    }
}

/**
 * Validates that a number is within a range
 * @param {number} value - Value to check
 * @param {Object} options - Validation options
 * @param {number} [options.min] - Minimum value (inclusive)
 * @param {number} [options.max] - Maximum value (inclusive)
 * @param {string} fieldName - Name of the field for error messages
 * @param {boolean} [optional=false] - Whether the value can be undefined
 * @throws {ValidationError} If value is out of range
 */
export function validateRange(value, options, fieldName, optional = false) {
    if (optional && value === undefined) {
        return;
    }

    const { min, max } = options;

    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${fieldName} must be a number`, fieldName, value);
    }

    if (min !== undefined && value < min) {
        throw new ValidationError(`${fieldName} must be >= ${min}`, fieldName, value);
    }

    if (max !== undefined && value > max) {
        throw new ValidationError(`${fieldName} must be <= ${max}`, fieldName, value);
    }
}

/**
 * Validates that a string matches a pattern
 * @param {string} value - Value to check
 * @param {RegExp} pattern - Regex pattern to match
 * @param {string} fieldName - Name of the field for error messages
 * @param {boolean} [optional=false] - Whether the value can be undefined
 * @throws {ValidationError} If string doesn't match pattern
 */
export function validatePattern(value, pattern, fieldName, optional = false) {
    if (optional && value === undefined) {
        return;
    }

    if (typeof value !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`, fieldName, value);
    }

    if (!pattern.test(value)) {
        throw new ValidationError(`${fieldName} must match pattern ${pattern}`, fieldName, value);
    }
}

/**
 * Validates that an array contains valid elements
 * @param {Array} value - Array to check
 * @param {Function} validator - Function to validate each element
 * @param {string} fieldName - Name of the field for error messages
 * @param {boolean} [optional=false] - Whether the value can be undefined
 * @throws {ValidationError} If array or elements are invalid
 */
export function validateArray(value, validator, fieldName, optional = false) {
    if (optional && value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName, value);
    }

    for (let i = 0; i < value.length; i++) {
        try {
            validator(value[i]);
        } catch (error) {
            throw new ValidationError(
                `${fieldName}[${i}] is invalid: ${error.message}`,
                `${fieldName}[${i}]`,
                value[i]
            );
        }
    }
}

/**
 * Validates an object against a schema
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Validation schema
 * @param {string} context - Context for error messages (e.g., method name)
 * @returns {Object} Validated object
 * @throws {ValidationError} If validation fails
 *
 * @example
 * const validated = validateSchema(options, {
 *     traceId: { type: 'string', optional: true },
 *     priority: { type: 'number', min: 0, max: 1, optional: true },
 *     count: { type: 'number', min: 1, required: true }
 * }, 'NAR.input');
 */
export function validateSchema(obj, schema, context = 'validation') {
    if (obj === null || obj === undefined) {
        throw new ValidationError('Options object is required', 'options', obj);
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
        throw new ValidationError('Options must be an object', 'options', obj);
    }

    const validated = {};

    for (const [field, rules] of Object.entries(schema)) {
        const value = obj[field];

        // Check required fields
        if (rules.required && !rules.optional && (value === undefined || value === null)) {
            throw new ValidationError(`${context}: ${field} is required`, field, value);
        }

        // Skip optional fields that are undefined
        if (value === undefined && rules.optional) {
            continue;
        }

        // Type validation
        if (value !== undefined && rules.type) {
            try {
                validateType(value, rules.type, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        // Range validation for numbers
        if (value !== undefined && rules.type === 'number' && (rules.min !== undefined || rules.max !== undefined)) {
            try {
                validateRange(value, { min: rules.min, max: rules.max }, field, rules.optional);
            } catch (error) {
                throw new ValidationError(`${context}: ${error.message}`, field, value);
            }
        }

        // Custom validator
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
}

/**
 * Creates a validation error handler for a specific context
 * @param {string} context - Context name (e.g., class or method name)
 * @returns {Object} Validation utilities bound to the context
 */
export function createValidator(context) {
    return {
        /**
         * Validate required field
         */
        required: (value, fieldName) => validateRequired(value, `${context}.${fieldName}`),

        /**
         * Validate type
         */
        type: (value, expectedType, fieldName, optional = false) =>
            validateType(value, expectedType, `${context}.${fieldName}`, optional),

        /**
         * Validate number range
         */
        range: (value, options, fieldName, optional = false) =>
            validateRange(value, options, `${context}.${fieldName}`, optional),

        /**
         * Validate against schema
         */
        schema: (obj, schemaDef) => validateSchema(obj, schemaDef, context)
    };
}

/**
 * Logs validation errors with context
 * @param {ValidationError} error - Validation error
 * @param {string} context - Context for logging
 */
export function logValidationError(error, context = 'validation') {
    Logger.error(`[${context}] Validation failed: ${error.message}`, {
        field: error.field,
        value: error.value,
        timestamp: error.timestamp
    });
}
