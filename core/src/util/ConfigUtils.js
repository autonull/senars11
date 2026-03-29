/**
 * Configuration utilities for SeNARS
 * Following AGENTS.md guidelines for elegant, consolidated, consistent, organized, and DRY code
 */

import { deepMerge } from './common.js';
import { Logger } from './Logger.js';
import { ConfigurationError, ValidationError } from './ErrorUtils.js';

/**
 * Merge configurations with deep merge capability and validation
 * @param {Object} defaults - Default configuration values
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} options - Options for merging
 * @returns {Object} Merged configuration
 */
export function mergeConfig(defaults, userConfig, options = {}) {
    const { 
        validate = false, 
        validator = null, 
        freeze = true,
        deep = true,
        strict = false
    } = options;
    
    if (!defaults || typeof defaults !== 'object') {
        throw new ConfigurationError('Defaults must be a valid object', 'defaults', defaults);
    }
    
    if (!userConfig || typeof userConfig !== 'object') {
        userConfig = {};
    }
    
    let mergedConfig;
    
    if (deep) {
        mergedConfig = deepMerge({...defaults}, {...userConfig});
    } else {
        mergedConfig = {...defaults, ...userConfig};
    }
    
    // Validate if requested
    if (validate && validator) {
        try {
            const validatedConfig = validator(mergedConfig);
            mergedConfig = validatedConfig;
        } catch (error) {
            const configError = error instanceof ConfigurationError 
                ? error 
                : new ConfigurationError(
                    `Configuration validation failed: ${error.message}`,
                    'validation',
                    mergedConfig
                  );
            
            if (strict) {
                throw configError;
            }
            
            Logger.warn('Configuration validation failed, using defaults', {
                error: configError.message,
                defaults: Object.keys(defaults)
            });
            return freeze ? Object.freeze({...defaults}) : {...defaults};
        }
    }
    
    return freeze ? Object.freeze(mergedConfig) : mergedConfig;
}

/**
 * Validate configuration against a schema
 * @param {Object} config - Configuration to validate
 * @param {Function} schemaValidator - Schema validation function
 * @returns {Object} Validated configuration
 */
export function validateConfig(config, schemaValidator) {
    if (typeof schemaValidator !== 'function') {
        throw new ConfigurationError('Schema validator must be a function', 'validator', schemaValidator);
    }
    
    try {
        return schemaValidator(config);
    } catch (error) {
        throw new ConfigurationError(
            `Configuration validation failed: ${error.message}`,
            'config',
            config
        );
    }
}

/**
 * Get a configuration value with fallback
 * @param {Object} config - Configuration object
 * @param {string} path - Dot notation path to the value
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Configuration value or default
 */
export function getConfigValue(config, path, defaultValue = undefined) {
    if (!config || typeof config !== 'object') {
        return defaultValue;
    }
    
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : defaultValue;
    }, config);
}

/**
 * Set a configuration value at a specific path
 * @param {Object} config - Configuration object
 * @param {string} path - Dot notation path
 * @param {*} value - Value to set
 * @returns {Object} Updated configuration
 */
export function setConfigValue(config, path, value) {
    if (!config || typeof config !== 'object') {
        throw new ConfigurationError('Configuration must be a valid object', 'config', config);
    }
    
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = config;
    
    for (const key of keys) {
        if (current[key] === undefined || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    
    current[lastKey] = value;
    return config;
}

/**
 * Configuration manager class for handling complex configuration scenarios
 */
export class ConfigManager {
    /**
     * Create a configuration manager
     * @param {Object} defaultConfig - Default configuration
     * @param {Object} options - Additional options
     */
    constructor(defaultConfig = {}, options = {}) {
        const { validationSchema = null, autoValidate = false } = options;
        
        this.defaultConfig = defaultConfig;
        this.currentConfig = { ...defaultConfig };
        this.validationSchema = validationSchema;
        this.autoValidate = autoValidate;
    }
    
    /**
     * Get the current configuration
     * @returns {Object} Current configuration
     */
    get config() {
        return { ...this.currentConfig };
    }
    
    /**
     * Update configuration with new values
     * @param {Object} newConfig - New configuration values
     * @param {Object} options - Options for merging
     * @returns {ConfigManager} This instance for chaining
     */
    update(newConfig, options = {}) {
        this.currentConfig = mergeConfig(this.defaultConfig, newConfig, {
            ...options,
            validate: this.autoValidate && !options.validate,
            validator: this.validationSchema
        });
        return this;
    }
    
    /**
     * Get a specific configuration value
     * @param {string} path - Path to the configuration value
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    getValue(path, defaultValue = undefined) {
        return getConfigValue(this.currentConfig, path, defaultValue);
    }
    
    /**
     * Set a specific configuration value
     * @param {string} path - Path to the configuration value
     * @param {*} value - Value to set
     * @returns {ConfigManager} This instance for chaining
     */
    setValue(path, value) {
        setConfigValue(this.currentConfig, path, value);
        return this;
    }
    
    /**
     * Reset configuration to defaults
     * @returns {ConfigManager} This instance for chaining
     */
    reset() {
        this.currentConfig = { ...this.defaultConfig };
        return this;
    }
    
    /**
     * Validate the current configuration
     * @param {Function} validator - Validator function (optional, uses internal schema if not provided)
     * @returns {boolean} Whether the configuration is valid
     */
    validate(validator = null) {
        const schema = validator || this.validationSchema;
        
        if (!schema) {
            Logger.warn('No validation schema provided for ConfigManager validation');
            return true;
        }
        
        try {
            validateConfig(this.currentConfig, schema);
            return true;
        } catch (error) {
            Logger.error('Configuration validation failed', error);
            return false;
        }
    }
    
    /**
     * Get configuration as a typed accessor
     * @param {Object} types - Type definitions for configuration values
     * @returns {Object} Typed configuration accessor
     */
    getTypedConfig(types = {}) {
        return createTypedConfig(this.currentConfig, types);
    }
}

/**
 * Create a typed configuration accessor
 * @param {Object} config - Configuration object
 * @param {Object} types - Type definitions for configuration values
 * @returns {Object} Typed configuration accessor
 */
export function createTypedConfig(config, types = {}) {
    const typedConfig = {};
    
    for (const [key, typeDef] of Object.entries(types)) {
        const { type, default: defaultValue, validator, required = false } = typeDef;
        
        Object.defineProperty(typedConfig, key, {
            get: () => {
                let value = getConfigValue(config, key, defaultValue);
                
                // Required field validation
                if (required && (value === undefined || value === null)) {
                    throw new ValidationError(
                        `Required configuration field '${key}' is missing`,
                        key,
                        value
                    );
                }
                
                // Type validation
                if (type && value !== undefined && value !== null && typeof value !== type) {
                    const typeError = new ValidationError(
                        `Configuration value for ${key} is not of expected type ${type}`,
                        key,
                        { expected: type, actual: typeof value, value }
                    );
                    
                    Logger.warn(typeError.message, typeError.details);
                    value = defaultValue;
                }
                
                // Custom validation
                if (validator && value !== undefined && value !== null) {
                    if (!validator(value)) {
                        const validationError = new ValidationError(
                            `Configuration value for ${key} failed validation`,
                            key,
                            value
                        );
                        
                        Logger.warn(validationError.message, { value });
                        value = defaultValue;
                    }
                }
                
                return value;
            },
            enumerable: true,
            configurable: false
        });
    }
    
    return typedConfig;
}

/**
 * Validates configuration against a predefined schema
 * @param {Object} config - Configuration to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validated and cleaned configuration
 */
export function validateAgainstSchema(config, schema) {
    const result = {};
    const errors = [];
    
    for (const [key, rules] of Object.entries(schema)) {
        const value = config[key];
        
        // Required field check
        if (rules.required && (value === undefined || value === null)) {
            errors.push(new ValidationError(
                `Required field '${key}' is missing`,
                key,
                value
            ));
            continue;
        }
        
        // Skip if not required and not provided
        if (value === undefined || value === null) {
            if (rules.default !== undefined) {
                result[key] = rules.default;
            }
            continue;
        }
        
        // Type validation
        if (rules.type && typeof value !== rules.type) {
            errors.push(new ValidationError(
                `Field '${key}' must be of type ${rules.type}, got ${typeof value}`,
                key,
                { expected: rules.type, actual: typeof value, value }
            ));
            continue;
        }
        
        // Custom validation
        if (rules.validator && typeof rules.validator === 'function' && !rules.validator(value)) {
            errors.push(new ValidationError(
                `Field '${key}' failed custom validation`,
                key,
                value
            ));
            continue;
        }
        
        // Range validation for numbers
        if (typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
                errors.push(new ValidationError(
                    `Field '${key}' must be at least ${rules.min}, got ${value}`,
                    key,
                    { min: rules.min, value }
                ));
                continue;
            }
            
            if (rules.max !== undefined && value > rules.max) {
                errors.push(new ValidationError(
                    `Field '${key}' must be at most ${rules.max}, got ${value}`,
                    key,
                    { max: rules.max, value }
                ));
                continue;
            }
        }
        
        // Length validation for strings/arrays
        if ((typeof value === 'string' || Array.isArray(value)) && value.length) {
            if (rules.minLength !== undefined && value.length < rules.minLength) {
                errors.push(new ValidationError(
                    `Field '${key}' must be at least ${rules.minLength} characters/elements, got ${value.length}`,
                    key,
                    { minLength: rules.minLength, length: value.length, value }
                ));
                continue;
            }
            
            if (rules.maxLength !== undefined && value.length > rules.maxLength) {
                errors.push(new ValidationError(
                    `Field '${key}' must be at most ${rules.maxLength} characters/elements, got ${value.length}`,
                    key,
                    { maxLength: rules.maxLength, length: value.length, value }
                ));
                continue;
            }
        }
        
        result[key] = value;
    }
    
    if (errors.length > 0) {
        throw new ConfigurationError(
            `Configuration validation failed with ${errors.length} error(s)`,
            'validation',
            { errors, config }
        );
    }
    
    return result;
}