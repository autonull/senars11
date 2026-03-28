import {BaseComponent} from '../util/BaseComponent.js';

export class TermCache extends BaseComponent {
    constructor(config = {}) {
        super(config, 'TermCache');
        this._strongCache = new Map();
        this._maxSize = config.maxSize || 5000;
        this._hits = 0;
        this._misses = 0;
    }

    get size() {
        return this._strongCache.size;
    }

    get stats() {
        const total = this._hits + this._misses;
        return {
            size: this._strongCache.size,
            maxSize: this._maxSize,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? this._hits / total : 0
        };
    }

    get(key) {
        // Check strong cache (LRU)
        if (this._strongCache.has(key)) {
            const item = this._strongCache.get(key);
            // Refresh LRU
            this._strongCache.delete(key);
            this._strongCache.set(key, item);
            this._hits++;
            return item;
        }

        this._misses++;
        return undefined;
    }

    set(key, value) {
        this._addToStrongCache(key, value);
    }

    has(key) {
        return this._strongCache.has(key);
    }

    delete(key) {
        return this._strongCache.delete(key);
    }

    clear() {
        this._strongCache.clear();
        this._hits = 0;
        this._misses = 0;
    }

    setMaxSize(size) {
        this._maxSize = size;
        while (this._strongCache.size > this._maxSize) {
            const oldestKey = this._strongCache.keys().next().value;
            this._strongCache.delete(oldestKey);
        }
    }

    getOldestKey() {
        return this._strongCache.keys().next().value;
    }

    setWithEviction(key, value) {
        let evictedKey = null;

        if (this._strongCache.has(key)) {
            this._strongCache.delete(key);
        } else if (this._strongCache.size >= this._maxSize) {
            evictedKey = this._strongCache.keys().next().value;
            this._strongCache.delete(evictedKey);
        }
        this._strongCache.set(key, value);

        return evictedKey;
    }

    _addToStrongCache(key, value) {
        if (this._strongCache.has(key)) {
            this._strongCache.delete(key);
        } else if (this._strongCache.size >= this._maxSize) {
             const oldestKey = this._strongCache.keys().next().value;
             this._strongCache.delete(oldestKey);
        }
        this._strongCache.set(key, value);
    }
}
