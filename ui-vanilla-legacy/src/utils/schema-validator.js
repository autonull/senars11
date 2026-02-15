/**
 * SchemaValidator - Schema-based validation utility for complex data structures
 */
import errorHandler from './error-handler.js';

class SchemaValidator {
    constructor() {
        this.schemas = new Map();
    }

    /**
     * Register a schema for a data type
     */
    registerSchema(name, schema) {
        this.schemas.set(name, schema);
    }

    /**
     * Validate data against a registered schema
     */
    validate(data, schemaName) {
        const schema = this.schemas.get(schemaName);
        if (!schema) {
            return { valid: false, errors: [`Schema '${schemaName}' not found`] };
        }

        return this._validateAgainstSchema(data, schema);
    }

    /**
     * Validate data against an inline schema
     */
    validateInline(data, schema) {
        return this._validateAgainstSchema(data, schema);
    }

    _validateAgainstSchema(data, schema) {
        const errors = [];
        this._validateRecursive(data, schema, errors, '');
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    _validateRecursive(data, schema, errors, path) {
        if (schema.type) {
            // Type validation
            if (!this._validateType(data, schema.type)) {
                errors.push(`${path || 'Data'} must be of type ${schema.type}, got ${typeof data}`);
                return; // Don't continue with deeper validation if type is wrong
            }
        }

        if (schema.required && Array.isArray(schema.required)) {
            // Required field validation
            for (const field of schema.required) {
                if (data[field] === undefined || data[field] === null) {
                    errors.push(`Field '${path ? `${path}.${field}` : field}' is required`);
                }
            }
        }

        if (schema.properties && typeof schema.properties === 'object') {
            // Object property validation
            if (typeof data === 'object' && !Array.isArray(data)) {
                for (const [propName, propSchema] of Object.entries(schema.properties)) {
                    const propPath = path ? `${path}.${propName}` : propName;
                    const propValue = data[propName];

                    if (propValue !== undefined) {
                        this._validateRecursive(propValue, propSchema, errors, propPath);
                    } else if (!schema.properties[propName].optional) {
                        errors.push(`Field '${propPath}' is required`);
                    }
                }
            }
        }

        if (schema.items && Array.isArray(data)) {
            // Array item validation
            for (let i = 0; i < data.length; i++) {
                const itemPath = `${path}[${i}]`;
                this._validateRecursive(data[i], schema.items, errors, itemPath);
            }
        }

        if (schema.enum && Array.isArray(schema.enum)) {
            // Enum validation
            if (!schema.enum.includes(data)) {
                errors.push(`Value '${data}' is not in allowed enum: [${schema.enum.join(', ')}]`);
            }
        }

        if (schema.validator && typeof schema.validator === 'function') {
            // Custom validation
            try {
                const customResult = schema.validator(data);
                if (customResult !== true && typeof customResult === 'string') {
                    errors.push(customResult);
                } else if (customResult === false) {
                    errors.push(`Custom validation failed for ${path || 'data'}`);
                }
            } catch (error) {
                errorHandler.handleError(error, { data, schema, path, context: 'Schema validation' });
                errors.push(`Validation error: ${error.message}`);
            }
        }

        // Additional validations
        if (schema.minLength !== undefined && typeof data === 'string' && data.length < schema.minLength) {
            errors.push(`String at '${path || 'data'}' must be at least ${schema.minLength} characters long`);
        }

        if (schema.maxLength !== undefined && typeof data === 'string' && data.length > schema.maxLength) {
            errors.push(`String at '${path || 'data'}' must be no more than ${schema.maxLength} characters long`);
        }

        if (schema.min !== undefined && typeof data === 'number' && data < schema.min) {
            errors.push(`Number at '${path || 'data'}' must be greater than or equal to ${schema.min}`);
        }

        if (schema.max !== undefined && typeof data === 'number' && data > schema.max) {
            errors.push(`Number at '${path || 'data'}' must be less than or equal to ${schema.max}`);
        }
    }

    _validateType(value, expectedType) {
        switch (expectedType.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'object':
                return value !== null && typeof value === 'object' && !Array.isArray(value);
            case 'array':
                return Array.isArray(value);
            case 'function':
                return typeof value === 'function';
            case 'null':
                return value === null;
            case 'undefined':
                return value === undefined;
            case 'date':
                return value instanceof Date || !isNaN(Date.parse(value));
            default:
                return true; // Unknown types pass validation
        }
    }
}

// Create a singleton instance
const schemaValidator = new SchemaValidator();

// Pre-register some common schemas
schemaValidator.registerSchema('narseseInput', {
    type: 'object',
    required: ['input'],
    properties: {
        input: { type: 'string', required: true }
    }
});

schemaValidator.registerSchema('task', {
    type: 'object',
    properties: {
        id: { type: 'string' },
        term: { type: 'string' },
        priority: { type: 'number' }
    }
});

schemaValidator.registerSchema('concept', {
    type: 'object',
    required: ['term'],
    properties: {
        term: { type: 'string', required: true },
        priority: { type: 'number' }
    }
});

schemaValidator.registerSchema('memorySnapshot', {
    type: 'object',
    required: ['concepts'],
    properties: {
        concepts: { 
            type: 'array', 
            items: { type: 'object' },
            required: true
        }
    }
});

export { SchemaValidator, schemaValidator };