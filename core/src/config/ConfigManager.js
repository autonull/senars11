import { deepMerge } from '../util/object.js';
import { Logger } from '../util/Logger.js';
import { ConfigurationError, ValidationError } from '../errors/index.js';

export class ConfigManager {
    #defaults;
    #config;
    #schema;
    #listeners = new Set();
    #frozen = false;

    constructor(defaults = {}, { schema = null, autoValidate = false, freeze = false } = {}) {
        this.#defaults = Object.freeze({ ...defaults });
        this.#config = { ...defaults };
        this.#schema = schema;
        this.#autoValidate = autoValidate;
        if (freeze) this.freeze();
    }

    #autoValidate;

    get config() { return { ...this.#config }; }
    get defaults() { return { ...this.#defaults }; }

    get(path, fallback) {
        if (!path) return { ...this.#config };
        return path.split('.').reduce((cur, key) => cur?.[key], this.#config) ?? fallback;
    }

    set(path, value, { validate = true } = {}) {
        if (this.#frozen) throw new ConfigurationError('Config is frozen', { key: path });
        const keys = path.split('.');
        const target = keys.slice(0, -1).reduce((cur, key) => { cur[key] ??= {}; return cur[key]; }, this.#config);
        target[keys.at(-1)] = value;
        if (validate && this.#autoValidate) this.#validate();
        this.#notify(path, value);
        return this;
    }

    update(updates, { deep = true, validate = true } = {}) {
        if (this.#frozen) throw new ConfigurationError('Config is frozen');
        this.#config = deep ? deepMerge({ ...this.#config }, updates) : { ...this.#config, ...updates };
        if (validate && this.#autoValidate) this.#validate();
        return this;
    }

    reset(path = null) {
        if (path) {
            this.#config[path] = structuredClone(this.#defaults[path]);
        } else {
            this.#config = { ...this.#defaults };
        }
        return this;
    }

    freeze() { this.#frozen = true; return this; }
    get isFrozen() { return this.#frozen; }

    onChange(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
    #notify(key, value) { this.#listeners.forEach(fn => { try { fn(key, value, this.config); } catch { /* skip */ } }); }

    #validate() {
        if (!this.#schema) return true;
        try { return this.#schema(this.#config); }
        catch (error) {
            Logger.warn('Config validation failed', { error: error.message });
            return false;
        }
    }

    getDiff() {
        return Object.fromEntries(
            Object.entries(this.#config).filter(([k, v]) => this.#defaults[k] !== v)
        );
    }

    toJSON() { return { ...this.#config }; }
    clone() { return new ConfigManager(this.#defaults, { schema: this.#schema, autoValidate: this.#autoValidate }).update(this.#config); }
}
