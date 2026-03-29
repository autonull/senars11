/**
 * Object Pooling for GC Optimization
 * Tier 2 optimization: Reduces GC pressure by reusing short-lived objects
 */

import { METTA_CONFIG } from '../config.js';

export class ObjectPool {
    constructor(factory, reset, initialSize = 100) {
        this.factory = factory;
        this.reset = reset;
        this.pool = Array.from({ length: initialSize }, () => factory());
        this.index = initialSize;
        this.enabled = METTA_CONFIG.pooling ?? true;
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
        this.enabled = options.enabled ?? METTA_CONFIG.pooling;

        // Young generation: short-lived objects (hot path)
        this.youngGen = [];
        this.youngGenSize = 0;
        this.youngGenLimit = options.youngLimit || 500;

        // Old generation: long-lived objects (persistent)
        this.oldGen = [];
        this.oldGenSize = 0;
        this.oldGenLimit = options.oldLimit || 100;

        // Track object age for promotion
        this.ageMap = new WeakMap();
        this.promotionThreshold = options.promotionThreshold || 3;

        // Stats
        this.stats = {
            youngHits: 0,
            oldHits: 0,
            creates: 0,
            promotions: 0
        };
    }

    acquire() {
        if (!this.enabled) return this.factory();

        // Try young gen first (cache-hot)
        if (this.youngGenSize > 0) {
            const obj = this.youngGen[--this.youngGenSize];
            const age = this.ageMap.get(obj) || 0;

            // Promote to old gen if aged
            if (age >= this.promotionThreshold && this.oldGenSize < this.oldGenLimit) {
                this.oldGen[this.oldGenSize++] = obj;
                this.stats.promotions++;
            }

            this.ageMap.set(obj, age + 1);
            this.stats.youngHits++;
            return obj;
        }

        // Try old gen
        if (this.oldGenSize > 0) {
            this.stats.oldHits++;
            return this.oldGen[--this.oldGenSize];
        }

        // Create new
        this.stats.creates++;
        const obj = this.factory();
        this.ageMap.set(obj, 0);
        return obj;
    }

    release(obj) {
        if (!this.enabled) return;

        this.reset(obj);

        const age = this.ageMap.get(obj) || 0;

        // Return to appropriate generation
        if (age >= this.promotionThreshold && this.oldGenSize < this.oldGenLimit) {
            this.oldGen[this.oldGenSize++] = obj;
            this.stats.promotions++;
        } else if (this.youngGenSize < this.youngGenLimit) {
            this.youngGen[this.youngGenSize++] = obj;
        }
        // Else: let GC collect (pool is full)
    }

    compact() {
        // Periodically trim pools to prevent bloat
        if (this.youngGenSize > this.youngGenLimit * 0.8) {
            this.youngGenSize = Math.floor(this.youngGenLimit * 0.5);
        }
    }
}

// Pre-configured pools
export const SUBSTITUTION_POOL = new ObjectPool(
    () => new Map(),
    (m) => m.clear()
);

export const ARRAY_POOL = new ObjectPool(
    () => [],
    (a) => { a.length = 0; }
);
