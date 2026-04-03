/**
 * ConfigManager.js - MeTTa configuration with define/get/set pattern
 * Uses the base ConfigManager internally
 */

import { ConfigManager as BaseConfigManager } from '../../../core/src/config/ConfigManager.js';
import { Logger } from '../../../core/src/util/Logger.js';

export class ConfigManager extends BaseConfigManager {
    #entries = new Map();
    #listeners = new Map();
    #defaults = new Map();

    define(key, defaultValue, validator = null, description = '') {
        if (this.isFrozen) throw new Error(`Cannot define config after freeze: ${key}`);
        if (validator && !validator(defaultValue)) throw new Error(`Invalid default value for ${key}`);

        this.#entries.set(key, { value: defaultValue, validator, description, modified: false, modifiedAt: null });
        this.#defaults.set(key, defaultValue);
        super.set(key, defaultValue);
        return this;
    }

    get(key) {
        const entry = this.#entries.get(key);
        if (!entry) {
            Logger.warn(`Config key not found: ${key}`);
            return undefined;
        }
        return entry.value;
    }

    set(key, value) {
        const entry = this.#entries.get(key);
        if (!entry) throw new Error(`Unknown config key: ${key}`);
        if (entry.validator && !entry.validator(value)) throw new Error(`Invalid value for ${key}: ${value}`);

        const oldValue = entry.value;
        entry.value = value;
        entry.modified = true;
        entry.modifiedAt = Date.now();
        super.set(key, value);
        this.#notifyListeners(key, oldValue, value);
        return this;
    }

    getAll() {
        return Object.fromEntries([...this.#entries.entries()].map(([k, e]) => [k, e.value]));
    }

    setAll(config) {
        for (const [key, value] of Object.entries(config)) this.set(key, value);
        return this;
    }

    onChange(key, callback) {
        if (!this.#listeners.has(key)) this.#listeners.set(key, []);
        this.#listeners.get(key).push(callback);
        return () => this.offChange(key, callback);
    }

    offChange(key, callback) {
        const listeners = this.#listeners.get(key);
        if (listeners) {
            const idx = listeners.indexOf(callback);
            if (idx !== -1) listeners.splice(idx, 1);
        }
    }

    getStats() {
        const modifiedCount = [...this.#entries.values()].filter(e => e.modified).length;
        return { totalKeys: this.#entries.size, modifiedKeys: modifiedCount, listenerCount: this.#listeners.size };
    }

    getMeta(key) {
        const entry = this.#entries.get(key);
        if (!entry) return null;
        return {
            value: entry.value,
            modified: entry.modified,
            modifiedAt: entry.modifiedAt,
            hasValidator: !!entry.validator,
            description: entry.description,
            listenerCount: this.#listeners.get(key)?.length ?? 0
        };
    }

    reset(key) {
        if (key) {
            const entry = this.#entries.get(key);
            if (entry) {
                entry.value = this.#defaults.get(key);
                entry.modified = false;
                entry.modifiedAt = null;
            }
        } else {
            for (const [key, entry] of this.#entries) {
                entry.value = this.#defaults.get(key);
                entry.modified = false;
                entry.modifiedAt = null;
            }
        }
        return this;
    }

    serialize() {
        const data = Object.fromEntries(
            [...this.#entries.entries()].map(([k, e]) => [k, { value: e.value, modified: e.modified }])
        );
        return JSON.stringify(data, null, 2);
    }

    deserialize(json) {
        const data = JSON.parse(json);
        for (const [key, { value }] of Object.entries(data)) {
            if (this.#entries.has(key)) this.set(key, value);
        }
        return this;
    }

    #notifyListeners(key, oldValue, newValue) {
        const listeners = this.#listeners.get(key);
        if (listeners) {
            for (const callback of listeners) {
                try { callback(newValue, oldValue, key); }
                catch (err) { Logger.error(`Config listener error for ${key}:`, err); }
            }
        }
    }
}

export const Validators = {
    boolean: v => typeof v === 'boolean',
    positive: v => typeof v === 'number' && v > 0,
    nonNegative: v => typeof v === 'number' && v >= 0,
    string: v => typeof v === 'string',
    array: v => Array.isArray(v),
    range: (min, max) => v => typeof v === 'number' && v >= min && v <= max,
    oneOf: values => v => values.includes(v)
};

export function createMeTTaConfig(overrides = {}) {
    const config = configManager.getAll();
    return { ...config, ...overrides };
}

import { configManager } from './config.js';
