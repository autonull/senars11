/**
 * Configuration utilities for SeNARS
 */

import { deepMerge } from './object.js';
import { Logger } from './Logger.js';
import { ConfigurationError, ValidationError } from './CustomErrors.js';
import { validateSchema } from './validate.js';

/**
 * Merge configurations with deep merge capability and validation
 * @param {Object} defaults - Default configuration values
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} options - Options for merging
 * @param {boolean} options.validate - Whether to validate
 * @param {Function} options.validator - Validator function
 * @param {boolean} options.freeze - Whether to freeze result
 * @param {boolean} options.deep - Whether to deep merge
 * @param {boolean} options.strict - Whether to throw on validation error
 * @returns {Object} Merged configuration
 */
export function mergeConfig(defaults, userConfig, options = {}) {
    const { validate = false, validator = null, freeze = true, deep = true, strict = false } = options;

    if (!defaults || typeof defaults !== 'object') {
        throw new ConfigurationError('Defaults must be a valid object', 'defaults', defaults);
    }
    if (!userConfig || typeof userConfig !== 'object') userConfig = {};

    let mergedConfig = deep
        ? deepMerge({ ...defaults }, { ...userConfig })
        : { ...defaults, ...userConfig };

    if (validate && validator) {
        try {
            mergedConfig = validator(mergedConfig);
        } catch (error) {
            const configError = error instanceof ConfigurationError
                ? error
                : new ConfigurationError(`Configuration validation failed: ${error.message}`, 'validation', mergedConfig);
            if (strict) throw configError;
            Logger.warn('Configuration validation failed, using defaults', {
                error: configError.message,
                defaults: Object.keys(defaults)
            });
            return freeze ? Object.freeze({ ...defaults }) : { ...defaults };
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
        throw new ConfigurationError(`Configuration validation failed: ${error.message}`, 'config', config);
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
    if (!config || typeof config !== 'object') return defaultValue;
    return path.split('.').reduce((current, key) =>
        current && current[key] !== undefined ? current[key] : defaultValue, config);
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
        if (current[key] === undefined || current[key] === null) current[key] = {};
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
     * @param {Function} options.validationSchema - Validation schema
     * @param {boolean} options.autoValidate - Auto validate on update
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
            validator: this.validationSchema,
            freeze: false
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

                if (required && (value === undefined || value === null)) {
                    throw new ValidationError(`Required configuration field '${key}' is missing`, key, value);
                }

                if (type && value !== undefined && value !== null && typeof value !== type) {
                    const typeError = new ValidationError(
                        `Configuration value for ${key} is not of expected type ${type}`,
                        key,
                        { expected: type, actual: typeof value, value }
                    );
                    Logger.warn(typeError.message, typeError.details);
                    value = defaultValue;
                }

                if (validator && value !== undefined && value !== null && !validator(value)) {
                    const validationError = new ValidationError(
                        `Configuration value for ${key} failed validation`,
                        key,
                        value
                    );
                    Logger.warn(validationError.message, { value });
                    value = defaultValue;
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
    return validateSchema(config, schema, 'Configuration');
}
