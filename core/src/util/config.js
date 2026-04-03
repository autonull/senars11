/**
 * Configuration utilities for SeNARS
 */

import { deepMerge } from './object.js';
import { Logger } from './Logger.js';
import { ConfigurationError, ValidationError } from '../errors/index.js';
import { validateSchema } from './validate.js';
import { ConfigManager as BaseConfigManager } from '../config/ConfigManager.js';

export function mergeConfig(defaults, userConfig, { validate = false, validator = null, freeze = true, deep = true, strict = false } = {}) {
    if (!defaults || typeof defaults !== 'object') {
        throw new ConfigurationError('Defaults must be a valid object', { key: 'defaults' });
    }
    if (!userConfig || typeof userConfig !== 'object') userConfig = {};

    let mergedConfig = deep ? deepMerge({ ...defaults }, { ...userConfig }) : { ...defaults, ...userConfig };

    if (validate && validator) {
        try {
            mergedConfig = validator(mergedConfig);
        } catch (error) {
            const configError = error instanceof ConfigurationError
                ? error
                : new ConfigurationError(`Configuration validation failed: ${error.message}`, { key: 'validation' });
            if (strict) throw configError;
            Logger.warn('Configuration validation failed, using defaults', { error: configError.message, defaults: Object.keys(defaults) });
            return freeze ? Object.freeze({ ...defaults }) : { ...defaults };
        }
    }

    return freeze ? Object.freeze(mergedConfig) : mergedConfig;
}

export function validateConfig(config, schemaValidator) {
    if (typeof schemaValidator !== 'function') {
        throw new ConfigurationError('Schema validator must be a function', { key: 'validator' });
    }
    try {
        return schemaValidator(config);
    } catch (error) {
        throw new ConfigurationError(`Configuration validation failed: ${error.message}`, { key: 'config' });
    }
}

export function getConfigValue(config, path, defaultValue = undefined) {
    if (!config || typeof config !== 'object') return defaultValue;
    return path.split('.').reduce((cur, key) => cur?.[key] ?? defaultValue, config);
}

export function setConfigValue(config, path, value) {
    if (!config || typeof config !== 'object') {
        throw new ConfigurationError('Configuration must be a valid object', { key: 'config' });
    }
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = config;
    for (const key of keys) {
        current[key] ??= {};
        current = current[key];
    }
    current[lastKey] = value;
    return config;
}

export function createTypedConfig(config, types = {}) {
    const typedConfig = {};
    for (const [key, { type, default: defaultValue, validator: valFn, required = false }] of Object.entries(types)) {
        Object.defineProperty(typedConfig, key, {
            get: () => {
                let value = getConfigValue(config, key, defaultValue);
                if (required && (value == null)) {
                    throw new ValidationError(`Required configuration field '${key}' is missing`, { field: key, value });
                }
                if (type && value != null && typeof value !== type) {
                    Logger.warn(`Config type mismatch for ${key}: expected ${type}, got ${typeof value}`);
                    value = defaultValue;
                }
                if (valFn && value != null && !valFn(value)) {
                    Logger.warn(`Config validation failed for ${key}`);
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

export function validateAgainstSchema(config, schema) {
    return validateSchema(config, schema, 'Configuration');
}

// Re-export the unified ConfigManager
export { BaseConfigManager as ConfigManager };
