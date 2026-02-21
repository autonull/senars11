/**
 * Unified Configuration and Hyperparameter Management
 * Centralized, parameterized configuration for all RL components.
 */

/**
 * Hyperparameter Space Definition
 */
export class HyperparameterSpace {
    constructor(params = {}) {
        this.params = new Map();
        
        for (const [name, spec] of Object.entries(params)) {
            this.define(name, spec);
        }
    }

    define(name, spec) {
        const {
            type = 'float',
            min = 0,
            max = 1,
            default: def = (min + max) / 2,
            scale = 'linear',
            choices = null
        } = spec;
        
        this.params.set(name, {
            type,
            min,
            max,
            default: def,
            scale,
            choices,
            current: def
        });
        
        return this;
    }

    get(name) {
        return this.params.get(name)?.current ?? this.params.get(name)?.default;
    }

    set(name, value) {
        const param = this.params.get(name);
        if (!param) {
            throw new Error(`Unknown hyperparameter: ${name}`);
        }
        
        // Validate and clamp
        const validated = this.validate(name, value);
        param.current = validated;
        
        return this;
    }

    validate(name, value) {
        const param = this.params.get(name);
        if (!param) return value;
        
        if (param.choices) {
            return param.choices.includes(value) ? value : param.default;
        }
        
        switch (param.type) {
            case 'float':
                return Math.max(param.min, Math.min(param.max, Number(value)));
            case 'int':
                return Math.max(param.min, Math.min(param.max, Math.floor(Number(value))));
            case 'bool':
                return !!value;
            case 'categorical':
                return param.choices?.includes(value) ? value : param.default;
            default:
                return value;
        }
    }

    sample() {
        const config = {};
        
        for (const [name, param] of this.params) {
            config[name] = this.sampleParam(param);
        }
        
        return config;
    }

    sampleParam(param) {
        if (param.choices) {
            return param.choices[Math.floor(Math.random() * param.choices.length)];
        }
        
        const { min, max, scale, type } = param;
        
        let value;
        switch (scale) {
            case 'log':
                value = Math.exp(Math.log(min) + Math.random() * (Math.log(max) - Math.log(min)));
                break;
            case 'linear':
            default:
                value = min + Math.random() * (max - min);
        }
        
        return type === 'int' ? Math.floor(value) : value;
    }

    reset() {
        for (const param of this.params.values()) {
            param.current = param.default;
        }
        return this;
    }

    toJSON() {
        return Object.fromEntries(
            Array.from(this.params.entries()).map(([name, p]) => [name, p.current])
        );
    }

    clone() {
        const clone = new HyperparameterSpace();
        for (const [name, param] of this.params) {
            clone.params.set(name, { ...param });
        }
        return clone;
    }
}

/**
 * Configuration Manager
 * Centralized configuration with validation and hot-reloading.
 */
export class ConfigManager {
    constructor(defaults = {}) {
        this.defaults = { ...defaults };
        this.current = { ...defaults };
        this.overrides = new Map();
        this.validators = new Map();
        this.listeners = new Set();
        this.history = [];
    }

    define(key, defaultValue, validator = null) {
        this.defaults[key] = defaultValue;
        if (validator) {
            this.validators.set(key, validator);
        }
        return this;
    }

    get(key, defaultValue = undefined) {
        // Check overrides first
        for (const override of this.overrides.values()) {
            if (key in override) return override[key];
        }
        
        // Then current config
        if (key in this.current) return this.current[key];
        
        // Finally default
        return defaultValue ?? this.defaults[key];
    }

    set(key, value, options = {}) {
        const { validate = true, persist = false, override = null } = options;
        
        // Validate
        if (validate) {
            const validator = this.validators.get(key);
            if (validator && !validator(value)) {
                throw new Error(`Invalid value for ${key}: ${value}`);
            }
        }
        
        // Apply
        if (override) {
            if (!this.overrides.has(override)) {
                this.overrides.set(override, {});
            }
            this.overrides.get(override)[key] = value;
        } else {
            this.current[key] = value;
        }
        
        // Persist
        if (persist) {
            this.history.push({ key, value, timestamp: Date.now() });
        }
        
        // Notify listeners
        this.notify(key, value);
        
        return this;
    }

    batch(updates, options = {}) {
        for (const [key, value] of Object.entries(updates)) {
            this.set(key, value, options);
        }
        return this;
    }

    reset(key = null) {
        if (key) {
            this.current[key] = this.defaults[key];
            this.overrides.delete(key);
        } else {
            this.current = { ...this.defaults };
            this.overrides.clear();
        }
        return this;
    }

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    notify(key, value) {
        for (const fn of this.listeners) {
            try {
                fn(key, value, this.getAll());
            } catch (e) {
                console.error('Config listener error:', e);
            }
        }
    }

    getAll() {
        return { ...this.defaults, ...this.current };
    }

    getDiff() {
        const diff = {};
        for (const key of Object.keys(this.current)) {
            if (this.current[key] !== this.defaults[key]) {
                diff[key] = this.current[key];
            }
        }
        return diff;
    }

    toJSON() {
        return {
            defaults: { ...this.defaults },
            current: { ...this.current },
            overrides: Object.fromEntries(this.overrides),
            diff: this.getDiff()
        };
    }

    clone() {
        return new ConfigManager(this.defaults).batch(this.current);
    }
}

/**
 * Pre-defined Hyperparameter Spaces
 */
export const HyperparameterSpaces = {
    /**
     * Standard RL hyperparameters
     */
    rl: new HyperparameterSpace({
        learningRate: { type: 'float', min: 1e-5, max: 1e-1, default: 1e-3, scale: 'log' },
        discountFactor: { type: 'float', min: 0.9, max: 0.999, default: 0.99 },
        explorationRate: { type: 'float', min: 0.01, max: 1.0, default: 0.1 },
        explorationDecay: { type: 'float', min: 0.9, max: 0.999, default: 0.995 },
        targetUpdate: { type: 'float', min: 0.001, max: 1.0, default: 0.005 },
        batchSize: { type: 'int', min: 8, max: 512, default: 64 },
        bufferCapacity: { type: 'int', min: 1000, max: 100000, default: 10000 }
    }),

    /**
     * Policy gradient hyperparameters
     */
    policyGradient: new HyperparameterSpace({
        learningRate: { type: 'float', min: 1e-5, max: 1e-2, default: 3e-4, scale: 'log' },
        entropyWeight: { type: 'float', min: 0.001, max: 0.1, default: 0.01 },
        valueWeight: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        gradientClip: { type: 'float', min: 0.1, max: 10.0, default: 0.5 },
        gaeLambda: { type: 'float', min: 0.9, max: 0.99, default: 0.95 }
    }),

    /**
     * World model hyperparameters
     */
    worldModel: new HyperparameterSpace({
        latentDim: { type: 'int', min: 8, max: 256, default: 32 },
        ensembleSize: { type: 'int', min: 2, max: 10, default: 5 },
        horizon: { type: 'int', min: 1, max: 50, default: 15 },
        uncertaintyThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        learningRate: { type: 'float', min: 1e-5, max: 1e-2, default: 1e-3, scale: 'log' }
    }),

    /**
     * Attention hyperparameters
     */
    attention: new HyperparameterSpace({
        heads: { type: 'int', min: 1, max: 16, default: 4 },
        dropout: { type: 'float', min: 0.0, max: 0.5, default: 0.1 },
        attentionDim: { type: 'int', min: 16, max: 256, default: 64 }
    }),

    /**
     * Meta-learning hyperparameters
     */
    metaLearning: new HyperparameterSpace({
        metaLearningRate: { type: 'float', min: 1e-4, max: 0.1, default: 0.01, scale: 'log' },
        explorationRate: { type: 'float', min: 0.1, max: 0.9, default: 0.3 },
        modificationThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        evaluationWindow: { type: 'int', min: 10, max: 500, default: 100 }
    }),

    /**
     * Skill discovery hyperparameters
     */
    skillDiscovery: new HyperparameterSpace({
        bottleneckThreshold: { type: 'float', min: 0.1, max: 0.9, default: 0.3 },
        noveltyThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        minUsageCount: { type: 'int', min: 5, max: 100, default: 10 },
        maxSkills: { type: 'int', min: 10, max: 200, default: 50 }
    })
};

/**
 * Configuration Presets
 */
export const ConfigPresets = {
    /**
     * Fast prototyping
     */
    fast: {
        learningRate: 0.01,
        batchSize: 32,
        explorationRate: 0.2,
        discountFactor: 0.95
    },

    /**
     * Standard training
     */
    standard: {
        learningRate: 0.001,
        batchSize: 64,
        explorationRate: 0.1,
        discountFactor: 0.99
    },

    /**
     * High performance
     */
    performance: {
        learningRate: 0.0003,
        batchSize: 256,
        explorationRate: 0.05,
        discountFactor: 0.995
    },

    /**
     * Maximum exploration
     */
    exploration: {
        learningRate: 0.001,
        batchSize: 64,
        explorationRate: 0.5,
        discountFactor: 0.9
    }
};

/**
 * Hyperparameter Optimizer
 * Simple grid and random search.
 */
export class HyperparameterOptimizer {
    constructor(space, objective) {
        this.space = space instanceof HyperparameterSpace 
            ? space 
            : new HyperparameterSpace(space);
        this.objective = objective;
        this.results = [];
        this.best = null;
    }

    async randomSearch(iterations = 50) {
        for (let i = 0; i < iterations; i++) {
            const config = this.space.sample();
            const score = await this.objective(config);
            
            this.results.push({ config, score, iteration: i });
            
            if (!this.best || score > this.best.score) {
                this.best = { config, score, iteration: i };
            }
        }
        
        return this.best;
    }

    async gridSearch(paramValues) {
        const keys = Object.keys(paramValues);
        const combinations = this.generateCombinations(paramValues);
        
        for (let i = 0; i < combinations.length; i++) {
            const config = combinations[i];
            const score = await this.objective(config);
            
            this.results.push({ config, score, iteration: i });
            
            if (!this.best || score > this.best.score) {
                this.best = { config, score, iteration: i };
            }
        }
        
        return this.best;
    }

    generateCombinations(paramValues) {
        const keys = Object.keys(paramValues);
        if (keys.length === 0) return [{}];
        
        const [firstKey, ...restKeys] = keys;
        const restCombinations = this.generateCombinations(
            Object.fromEntries(restKeys.map(k => [k, paramValues[k]]))
        );
        
        return paramValues[firstKey].flatMap(value =>
            restCombinations.map(rest => ({ [firstKey]: value, ...rest }))
        );
    }

    getResults() {
        return this.results.sort((a, b) => b.score - a.score);
    }

    getImportance() {
        // Simple feature importance based on correlation with score
        const importance = {};
        
        for (const [name] of this.space.params) {
            const values = this.results.map(r => r.config[name]);
            const scores = this.results.map(r => r.score);
            
            importance[name] = this.correlation(values, scores);
        }
        
        return importance;
    }

    correlation(x, y) {
        const n = x.length;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;
        
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }
        
        return num / Math.sqrt(denX * denY) || 0;
    }
}
