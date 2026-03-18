/**
 * Object Pooling for GC Optimization
 * Tier 2 optimization: Reduces GC pressure by reusing short-lived objects
 */

import { configManager } from '../config/config.js';

export class ObjectPool {
    constructor(factory, reset, initialSize = 100) {
        this.factory = factory;
        this.reset = reset;
        this.pool = Array.from({ length: initialSize }, () => factory());
        this.index = initialSize;
        this.enabled = configManager.get('pooling');
    }

    acquire() {
        if (!this.enabled) return this.factory();

        if (this.index > 0) {
            return this.pool[--this.index];
        }
        return this.factory();
    }

    release(obj) {
        if (!this.enabled) return;

        this.reset(obj);
        if (this.index < this.pool.length) {
            this.pool[this.index++] = obj;
        }
    }
}

/**
 * Generational object pooling
 * Customized from SeNARS pattern but optimized for MeTTa
 */
export class GenerationalPool {
    constructor(factory, reset, options = {}) {
        this.factory = factory;
        this.reset = reset;
        this.enabled = options.enabled ?? configManager.get('pooling');

        // Young generation: short-lived objects (hot path)
        this.youngGen = [];
        this.youngGenSize = 0;
        this.youngGenLimit = options.youngLimit || 500;

        // Old generation: long-lived objects
        this.oldGen = [];
        this.oldGenSize = 0;
        this.oldGenLimit = options.oldLimit || 2000;

        // Statistics
        this.stats = { allocations: 0, collections: 0, youngToOld: 0 };
    }

    acquire() {
        if (!this.enabled) {
            this.stats.allocations++;
            return this.factory();
        }

        // Try young gen first
        if (this.youngGen.length > 0) {
            return this.youngGen.pop();
        }

        // Then old gen
        if (this.oldGen.length > 0) {
            return this.oldGen.pop();
        }

        this.stats.allocations++;
        return this.factory();
    }

    release(obj, isLongLived = false) {
        if (!this.enabled) return;

        this.reset(obj);

        if (isLongLived && this.oldGen.length < this.oldGenLimit) {
            this.oldGen.push(obj);
            this.oldGenSize++;
        } else if (this.youngGen.length < this.youngLimit) {
            this.youngGen.push(obj);
            this.youngGenSize++;
        }
    }

    collectYoung() {
        if (!this.enabled) return;

        this.stats.collections++;

        // Promote survivors to old gen
        for (const obj of this.youngGen) {
            if (this.oldGen.length < this.oldGenLimit) {
                this.oldGen.push(obj);
                this.oldGenSize++;
                this.stats.youngToOld++;
            }
        }

        this.youngGen = [];
        this.youngGenSize = 0;
    }

    getStats() {
        return {
            ...this.stats,
            youngGenSize: this.youngGenSize,
            oldGenSize: this.oldGenSize,
            totalPooled: this.youngGenSize + this.oldGenSize
        };
    }
}

// Pre-configured pools for common MeTTa objects
export const SUBSTITUTION_POOL = new GenerationalPool(
    () => new Map(),
    (map) => map.clear(),
    { youngLimit: 200, oldLimit: 50 }
);

export const ARRAY_POOL = new ObjectPool(
    () => [],
    (arr) => { arr.length = 0; },
    500
);
