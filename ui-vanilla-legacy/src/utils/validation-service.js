/**
 * ValidationService - Centralized data validation and transformation service
 */
import { schemaValidator } from './schema-validator.js';
import EnhancedDataTransformer from './enhanced-data-transformer.js';
import errorHandler from './error-handler.js';
import configManager from '../config/config-manager.js';

class ValidationService {
    constructor() {
        this.validationRules = new Map();
        this.transformers = new Map();
        this.stats = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0
        };
    }

    /**
     * Register a validation rule
     */
    registerRule(name, validator) {
        if (typeof validator === 'function') {
            this.validationRules.set(name, validator);
        } else if (typeof validator === 'object') {
            this.validationRules.set(name, (data) => schemaValidator.validateInline(data, validator));
        }
    }

    /**
     * Register a transformer function
     */
    registerTransformer(name, transformer) {
        if (typeof transformer === 'function') {
            this.transformers.set(name, transformer);
        }
    }

    /**
     * Validate data against a rule or schema
     */
    validate(data, ruleName, options = {}) {
        this.stats.totalValidations++;
        
        try {
            // Check if it's a registered validation rule
            const rule = this.validationRules.get(ruleName);
            if (rule) {
                const result = rule(data);
                
                if (typeof result === 'object' && 'valid' in result) {
                    if (result.valid) {
                        this.stats.successfulValidations++;
                        return { valid: true, data, errors: [] };
                    } else {
                        this.stats.failedValidations++;
                        return { valid: false, data: null, errors: result.errors || [result.error] };
                    }
                } else {
                    // Assume boolean return from custom validation
                    const valid = Boolean(result);
                    if (valid) {
                        this.stats.successfulValidations++;
                        return { valid: true, data, errors: [] };
                    } else {
                        this.stats.failedValidations++;
                        return { valid: false, data: null, errors: ['Validation failed'] };
                    }
                }
            }

            // Try schema validation
            const schemaValidation = schemaValidator.validate(data, ruleName);
            if (schemaValidation.valid) {
                this.stats.successfulValidations++;
                return { valid: true, data, errors: [] };
            } else {
                this.stats.failedValidations++;
                return { valid: false, data: null, errors: schemaValidation.errors };
            }
        } catch (error) {
            errorHandler.handleError(error, {
                data,
                ruleName,
                options,
                context: 'ValidationService.validate'
            });
            
            this.stats.failedValidations++;
            return { valid: false, data: null, errors: [error.message] };
        }
    }

    /**
     * Transform data with optional validation
     */
    transform(data, options = {}) {
        const { type, validate = configManager.getValidationEnabled(), rule = null } = options;

        // Validate if required
        if (validate) {
            let validationRule = rule || type;
            if (validationRule) {
                const validation = this.validate(data, validationRule);
                if (!validation.valid) {
                    return { success: false, data: null, errors: validation.errors };
                }
            }
        }

        try {
            // Apply transformation
            const transformed = EnhancedDataTransformer.transform(data, options);
            return { success: true, data: transformed, errors: [] };
        } catch (error) {
            errorHandler.handleError(error, {
                data,
                options,
                context: 'ValidationService.transform'
            });
            return { success: false, data: null, errors: [error.message] };
        }
    }

    /**
     * Batch validation
     */
    validateBatch(dataArray, ruleName) {
        if (!Array.isArray(dataArray)) {
            return [{ valid: false, errors: ['Input must be an array'] }];
        }

        return dataArray.map((item, index) => {
            const result = this.validate(item, ruleName);
            return { ...result, index };
        });
    }

    /**
     * Batch transformation
     */
    transformBatch(dataArray, options = {}) {
        if (!Array.isArray(dataArray)) {
            return [{ success: false, errors: ['Input must be an array'] }];
        }

        return dataArray.map((item, index) => {
            const result = this.transform(item, options);
            return { ...result, index };
        });
    }

    /**
     * Validate and transform in one step
     */
    validateAndTransform(data, options = {}) {
        const { validate = true } = options;

        if (validate) {
            const validationResult = this.validate(data, options.rule || options.type);
            if (!validationResult.valid) {
                return { valid: false, transformed: null, errors: validationResult.errors };
            }
        }

        const transformResult = this.transform(data, options);
        return {
            valid: true,
            transformed: transformResult.success ? transformResult.data : null,
            errors: transformResult.success ? [] : transformResult.errors
        };
    }

    /**
     * Create validation middleware for use with other services
     */
    createMiddleware(validationRule) {
        return (data) => {
            const result = this.validate(data, validationRule);
            if (!result.valid) {
                throw new Error(`Validation failed: ${result.errors.join(', ')}`);
            }
            return result.data;
        };
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset validation statistics
     */
    resetStats() {
        this.stats = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0
        };
    }

    /**
     * Validate using a custom validation function
     */
    validateCustom(data, validatorFn) {
        try {
            const result = validatorFn(data);
            const valid = typeof result === 'boolean' ? result : (typeof result === 'object' && result.valid);
            
            if (valid) {
                this.stats.successfulValidations++;
                return { valid: true, data, errors: [] };
            } else {
                this.stats.failedValidations++;
                const errors = typeof result === 'object' && result.errors ? result.errors : ['Validation failed'];
                return { valid: false, data: null, errors };
            }
        } catch (error) {
            errorHandler.handleError(error, {
                data,
                context: 'ValidationService.validateCustom'
            });
            
            this.stats.failedValidations++;
            return { valid: false, data: null, errors: [error.message] };
        }
    }
}

// Create a singleton instance
const validationService = new ValidationService();

// Register common validation rules
validationService.registerRule('narseseInput', {
    type: 'object',
    required: ['input'],
    properties: {
        input: { type: 'string', minLength: 1 }
    }
});

validationService.registerRule('task', {
    type: 'object',
    properties: {
        task: { type: 'object' },
        id: { type: 'string' }
    }
});

validationService.registerRule('concept', {
    type: 'object',
    required: ['term'],
    properties: {
        term: { type: 'string' },
        id: { type: 'string' }
    }
});

export { ValidationService, validationService };