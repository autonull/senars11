/**
 * Action Space
 * Defines and validates action spaces for RL environments
 */

/**
 * Action space class with utilities
 */
export class ActionSpace {
    constructor(spec) {
        if (spec.type === 'Discrete') {
            this.type = 'Discrete';
            this.n = spec.n;
            this.shape = [];
            this.dtype = 'int32';
        } else if (spec.type === 'Box') {
            this.type = 'Box';
            this.shape = spec.shape ?? [spec.dim ?? 4];
            this.low = this._normalizeBound(spec.low, this.shape[0], -1);
            this.high = this._normalizeBound(spec.high, this.shape[0], 1);
            this.dtype = spec.dtype ?? 'float32';
        } else {
            throw new Error(`Unknown action space type: ${spec.type}`);
        }
    }

    _normalizeBound(bound, size, defaultVal) {
        if (Array.isArray(bound)) {return bound;}
        if (typeof bound === 'number') {return new Array(size).fill(bound);}
        return new Array(size).fill(defaultVal);
    }

    /**
     * Sample random action
     * @returns {number|number[]} Random action
     */
    sample() {
        if (this.type === 'Discrete') {
            return Math.floor(Math.random() * this.n);
        }
        return this.low.map((l, i) => l + Math.random() * (this.high[i] - l));
    }

    /**
     * Check if value is valid action
     * @param {any} value - Value to check
     * @returns {boolean} True if valid
     */
    contains(value) {
        if (this.type === 'Discrete') {
            return Number.isInteger(value) && value >= 0 && value < this.n;
        }
        if (!Array.isArray(value)) {return false;}
        return value.every((v, i) => v >= this.low[i] && v <= this.high[i]);
    }

    /**
     * Normalize action to [0, 1]
     * @param {number[]} value - Action value
     * @returns {number[]} Normalized action
     */
    normalize(value) {
        if (this.type !== 'Box') {return value;}
        const range = this.high.map((h, i) => h - this.low[i]);
        return value.map((v, i) => (v - this.low[i]) / range[i]);
    }

    /**
     * Denormalize action from [0, 1]
     * @param {number[]} value - Normalized action
     * @returns {number[]} Denormalized action
     */
    denormalize(value) {
        if (this.type !== 'Box') {return value;}
        const range = this.high.map((h, i) => h - this.low[i]);
        return value.map((v, i) => this.low[i] + v * range[i]);
    }

    toJSON() {
        return {
            type: this.type,
            ...(this.type === 'Discrete' ? { n: this.n } : {
                shape: this.shape, low: this.low, high: this.high, dtype: this.dtype
            })
        };
    }

    static discrete(n) {
        return new ActionSpace({ type: 'Discrete', n });
    }

    static box(shape, low = -1, high = 1) {
        return new ActionSpace({ type: 'Box', shape, low, high });
    }
}
