import {BaseComponent} from '../util/BaseComponent.js';

export class TermCache extends BaseComponent {
    constructor(config = {}) {
        super(config, 'TermCache');
        this._strongCache = new Map();
        this._weakCache = new Map();
        this._maxSize = config.maxSize || 5000;
        this._hits = 0;
        this._misses = 0;

        // Registry to clean up weak cache keys when terms are garbage collected
        this._registry = new FinalizationRegistry(key => {
            const ref = this._weakCache.get(key);
            // Only delete if the reference is indeed gone or matches the collected one
            // (We can't easily check identity of collected object, but if it's in weakCache, it's likely the one)
            // Ideally we check if deref returns undefined.
            if (ref && !ref.deref()) {
                this._weakCache.delete(key);
            }
        });
    }

    get size() {
        return this._strongCache.size;
    }

    get stats() {
        const total = this._hits + this._misses;
        return {
            size: this._strongCache.size,
            weakSize: this._weakCache.size,
            maxSize: this._maxSize,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? this._hits / total : 0
        };
    }

    get(key) {
        // 1. Check strong cache (LRU)
        if (this._strongCache.has(key)) {
            const item = this._strongCache.get(key);
            // Refresh LRU
            this._strongCache.delete(key);
            this._strongCache.set(key, item);
            this._hits++;
            return item;
        }

        // 2. Check weak cache
        const ref = this._weakCache.get(key);
        if (ref) {
            const item = ref.deref();
            if (item) {
                // Resurrect to strong cache
                this._addToStrongCache(key, item);
                this._hits++;
                return item;
            } else {
                // Cleanup dead ref
                this._weakCache.delete(key);
            }
        }

        this._misses++;
        return undefined;
    }

    set(key, value) {
        this._addToStrongCache(key, value);

        // Always update weak cache to ensure we have a canonical reference
        // if it drops out of strong cache later.
        if (!this._weakCache.has(key) || !this._weakCache.get(key).deref()) {
             this._weakCache.set(key, new WeakRef(value));
             this._registry.register(value, key);
        }
    }

    has(key) {
        if (this._strongCache.has(key)) return true;
        const ref = this._weakCache.get(key);
        return !!(ref && ref.deref());
    }

    delete(key) {
        const s = this._strongCache.delete(key);
        const w = this._weakCache.delete(key);
        // We can't unregister from FinalizationRegistry easily without the token,
        // but it will just run the callback and find nothing to delete, which is fine.
        return s || w;
    }

    clear() {
        this._strongCache.clear();
        this._weakCache.clear();
        this._hits = 0;
        this._misses = 0;
        // Registry cleans up over time
    }

    setMaxSize(size) {
        this._maxSize = size;
        while (this._strongCache.size > this._maxSize) {
            const oldestKey = this._strongCache.keys().next().value;
            this._strongCache.delete(oldestKey);
            // It remains in weak cache
        }
    }

    getOldestKey() {
        return this._strongCache.keys().next().value;
    }

    setWithEviction(key, value) {
        let evictedKey = null;

        // Logic: Add to strong cache. If we evict from strong cache, return that key.
        // This signals to the factory to clear *strong* metadata (like complexity scores for fast lookup).
        // The term itself remains in weak cache.

        if (this._strongCache.has(key)) {
            this._strongCache.delete(key);
        } else if (this._strongCache.size >= this._maxSize) {
            evictedKey = this._strongCache.keys().next().value;
            this._strongCache.delete(evictedKey);
        }
        this._strongCache.set(key, value);

        // Update weak cache
        if (!this._weakCache.has(key) || !this._weakCache.get(key).deref()) {
             this._weakCache.set(key, new WeakRef(value));
             this._registry.register(value, key);
        }

        return evictedKey;
    }

    _addToStrongCache(key, value) {
        if (this._strongCache.has(key)) {
            this._strongCache.delete(key);
        } else if (this._strongCache.size >= this._maxSize) {
             const oldestKey = this._strongCache.keys().next().value;
             this._strongCache.delete(oldestKey);
             // We don't return evicted key here as this is internal helper,
             // use setWithEviction if you need to know.
        }
        this._strongCache.set(key, value);
    }
}
