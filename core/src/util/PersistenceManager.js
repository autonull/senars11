import {Logger} from './Logger.js';

export class PersistenceManager {
    constructor(options = {}) {
        this.options = {
            enabled: options.enabled !== false,
            storagePath: options.storagePath || './data',
            autoSave: options.autoSave !== false,
            saveInterval: options.saveInterval || 30000,
            ...options
        };

        this.storage = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return true;

        try {
            this.isInitialized = true;
            return true;
        } catch (error) {
            Logger.error('Failed to initialize persistence manager:', error);
            return false;
        }
    }

    _checkAvailability() {
        return this.options.enabled && this.isInitialized;
    }

    _wrapOperation(operation, errorMessage) {
        if (!this._checkAvailability()) {
            return typeof operation() === 'boolean' ? false :
                typeof operation() === 'object' ? {} :
                    Array.isArray(operation()) ? [] : null;
        }

        try {
            return operation();
        } catch (error) {
            Logger.error(errorMessage, error);
            return typeof operation() === 'boolean' ? false :
                typeof operation() === 'object' ? {} :
                    Array.isArray(operation()) ? [] : null;
        }
    }

    async save(key, data) {
        return this._wrapOperation(
            () => {
                this.storage.set(key, data);
                return true;
            },
            `Failed to save data for key ${key}:`
        );
    }

    async load(key) {
        return this._wrapOperation(
            () => this.storage.get(key) ?? null,
            `Failed to load data for key ${key}:`
        );
    }

    async delete(key) {
        return this._wrapOperation(
            () => {
                const exists = this.storage.has(key);
                exists && this.storage.delete(key);
                return exists;
            },
            `Failed to delete data for key ${key}:`
        );
    }

    async listKeys() {
        return this._wrapOperation(
            () => Array.from(this.storage.keys()),
            'Failed to list keys:'
        );
    }

    async clear() {
        return this._wrapOperation(
            () => {
                this.storage.clear();
                return true;
            },
            'Failed to clear storage:'
        );
    }

    async getStats() {
        return this._wrapOperation(
            () => ({
                keyCount: this.storage.size,
                enabled: this.options.enabled,
                storagePath: this.options.storagePath,
                autoSave: this.options.autoSave
            }),
            'Failed to get stats:'
        );
    }
}