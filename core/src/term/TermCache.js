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
        if (this._strongCache.has(key)) {
            // Refresh LRU position by re-inserting
            const item = this._strongCache.get(key);
            this._strongCache.delete(key);
            this._strongCache.set(key, item);
            this._hits++;
            return item;
        }

        this._misses++;
        return undefined;
    }

    /**
     * Adds an item to the cache, evicting the oldest if necessary.
     * @param {string} key
     * @param {any} value
     * @returns {string|null} The key of the evicted item, or null if nothing was evicted.
     */
    put(key, value) {
        let evictedKey = null;

        // If updating existing, remove it first to update position
        if (this._strongCache.has(key)) {
            this._strongCache.delete(key);
        } else if (this._strongCache.size >= this._maxSize) {
            // Evict oldest (first in Map iterator)
            evictedKey = this._strongCache.keys().next().value;
            this._strongCache.delete(evictedKey);
        }

        this._strongCache.set(key, value);
        return evictedKey;
    }

    set(key, value) {
        this.put(key, value);
    }

    // For backward compatibility if needed, though TermFactory uses put now.
    setWithEviction(key, value) {
        return this.put(key, value);
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
}
