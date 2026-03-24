/**
 * ConfigManager.js - Centralized configuration with runtime modification
 * Supports validation, change listeners, and A/B testing
 */

import { Logger } from '../../../core/src/util/Logger.js';
import { configManager } from './config.js';

/**
 * Create a MeTTa configuration with optional overrides
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Configuration object
 */
export function createMeTTaConfig(overrides = {}) {
    const config = configManager.getAll();
    return { ...config, ...overrides };
}

export class ConfigManager {
    constructor() {
        this._entries = new Map();
        this._listeners = new Map();
        this._frozen = false;
    }

    define(key, defaultValue, validator = null, description = '') {
        if (this._frozen) throw new Error(`Cannot define config after freeze: ${key}`);
        if (validator && !validator(defaultValue)) throw new Error(`Invalid default value for ${key}`);

        this._entries.set(key, { value: defaultValue, validator, description, modified: false, modifiedAt: null });
        return this;
    }

    get(key) {
        const entry = this._entries.get(key);
        if (!entry) {
            Logger.warn(`Config key not found: ${key}`);
            return undefined;
        }
        return entry.value;
    }

    set(key, value) {
        const entry = this._entries.get(key);
        if (!entry) throw new Error(`Unknown config key: ${key}`);
        if (entry.validator && !entry.validator(value)) throw new Error(`Invalid value for ${key}: ${value}`);

        const oldValue = entry.value;
        entry.value = value;
        entry.modified = true;
        entry.modifiedAt = Date.now();
        this._notifyListeners(key, oldValue, value);
        return this;
    }

    getAll() {
        return Object.fromEntries(this._entries.entries().map(([k, e]) => [k, e.value]));
    }

    setAll(config) {
        for (const [key, value] of Object.entries(config)) this.set(key, value);
        return this;
    }

    onChange(key, callback) {
        if (!this._listeners.has(key)) this._listeners.set(key, []);
        this._listeners.get(key).push(callback);
        return () => this.offChange(key, callback);
    }

    offChange(key, callback) {
        const listeners = this._listeners.get(key);
        if (listeners) {
            const idx = listeners.indexOf(callback);
            if (idx !== -1) listeners.splice(idx, 1);
        }
    }

    freeze() {
        this._frozen = true;
        return this;
    }

    getStats() {
        const modifiedCount = Array.from(this._entries.values()).filter(e => e.modified).length;
        return { totalKeys: this._entries.size, modifiedKeys: modifiedCount, listenerCount: this._listeners.size };
    }

    getMeta(key) {
        const entry = this._entries.get(key);
        if (!entry) return null;
        return {
            value: entry.value,
            modified: entry.modified,
            modifiedAt: entry.modifiedAt,
            hasValidator: !!entry.validator,
            description: entry.description,
            listenerCount: this._listeners.get(key)?.length ?? 0
        };
    }

    reset(key) {
        const entry = this._entries.get(key);
        if (entry) {
            entry.modified = false;
            entry.modifiedAt = null;
        }
        return this;
    }

    resetAll() {
        for (const entry of this._entries.values()) {
            entry.modified = false;
            entry.modifiedAt = null;
        }
        return this;
    }

    serialize() {
        const data = Object.fromEntries(
            this._entries.entries().map(([k, e]) => [k, { value: e.value, modified: e.modified }])
        );
        return JSON.stringify(data, null, 2);
    }

    deserialize(json) {
        const data = JSON.parse(json);
        for (const [key, entry] of Object.entries(data)) {
            if (this._entries.has(key)) this.set(key, entry.value);
        }
        return this;
    }

    _notifyListeners(key, oldValue, newValue) {
        const listeners = this._listeners.get(key);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(newValue, oldValue, key);
                } catch (err) {
                    Logger.error(`Config listener error for ${key}:`, err);
                }
            }
        }
    }
}

/**
 * Common validators
 */
export const Validators = {
    boolean: v => typeof v === 'boolean',
    positive: v => typeof v === 'number' && v > 0,
    nonNegative: v => typeof v === 'number' && v >= 0,
    string: v => typeof v === 'string',
    array: v => Array.isArray(v),
    range: (min, max) => v => typeof v === 'number' && v >= min && v <= max,
    oneOf: values => v => values.includes(v)
};
