/**
 * Observation Space
 * Defines and validates observation spaces for RL environments
 */

/**
 * Observation space class with utilities
 */
export class ObservationSpace {
    constructor(spec) {
        if (spec.type === 'Discrete') {
            this.type = 'Discrete';
            this.n = spec.n;
            this.shape = [];
        } else if (spec.type === 'Box') {
            this.type = 'Box';
            this.shape = spec.shape ?? [spec.dim ?? 4];
            this.low = this._normalizeBound(spec.low, this.shape[0], -Infinity);
            this.high = this._normalizeBound(spec.high, this.shape[0], Infinity);
            this.dtype = spec.dtype ?? 'float32';
        } else {
            throw new Error(`Unknown observation space type: ${spec.type}`);
        }
    }

    _normalizeBound(bound, size, defaultVal) {
        if (Array.isArray(bound)) {return bound;}
        if (typeof bound === 'number') {return new Array(size).fill(bound);}
        return new Array(size).fill(defaultVal);
    }

    /**
     * Sample random observation
     * @returns {number|number[]} Random observation
     */
    sample() {
        if (this.type === 'Discrete') {
            return Math.floor(Math.random() * this.n);
        }
        return this.low.map((l, i) => {
            const h = this.high[i];
            return l + Math.random() * (h - l);
        });
    }

    /**
     * Check if value is valid observation
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
     * Normalize observation to [0, 1]
     * @param {number[]} value - Observation value
     * @returns {number[]} Normalized observation
     */
    normalize(value) {
        if (this.type !== 'Box') {return value;}
        const range = this.high.map((h, i) => h - this.low[i]);
        return value.map((v, i) => {
            if (range[i] === 0) {return 0.5;}
            return (v - this.low[i]) / range[i];
        });
    }

    /**
     * Denormalize observation from [0, 1]
     * @param {number[]} value - Normalized observation
     * @returns {number[]} Denormalized observation
     */
    denormalize(value) {
        if (this.type !== 'Box') {return value;}
        const range = this.high.map((h, i) => h - this.low[i]);
        return value.map((v, i) => this.low[i] + v * range[i]);
    }

    /**
     * Clip observation to bounds
     * @param {number[]} value - Observation value
     * @returns {number[]} Clipped observation
     */
    clip(value) {
        if (this.type !== 'Box') {return value;}
        return value.map((v, i) => Math.max(this.low[i], Math.min(this.high[i], v)));
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
        return new ObservationSpace({ type: 'Discrete', n });
    }

    static box(shape, low = -Infinity, high = Infinity) {
        return new ObservationSpace({ type: 'Box', shape, low, high });
    }
}
