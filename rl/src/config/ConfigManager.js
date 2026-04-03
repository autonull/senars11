/**
 * @deprecated Import ConfigManager from '@senars/core' instead.
 * This file re-exports core's ConfigManager and provides RL-specific hyperparameter utilities.
 */
export { ConfigManager, Validators, createConfigManager } from '../../core/src/config/ConfigManager.js';

const ValidationFns = {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    byType(type, value, min, max, choices) {
        if (choices) return choices.includes(value) ? value : null;
        switch (type) {
            case 'float':
            case 'int': {
                const clamped = this.clamp(Number(value), min, max);
                return type === 'int' ? Math.floor(clamped) : clamped;
            }
            case 'bool': return !!value;
            case 'categorical': return choices?.includes(value) ? value : null;
            default: return value;
        }
    },
    sample(param) {
        if (param.choices) return param.choices[Math.floor(Math.random() * param.choices.length)];
        const { min, max, scale, type } = param;
        const value = scale === 'log'
            ? Math.exp(Math.log(min) + Math.random() * (Math.log(max) - Math.log(min)))
            : min + Math.random() * (max - min);
        return type === 'int' ? Math.floor(value) : value;
    }
};

export class HyperparameterSpace {
    #params = new Map();

    constructor(params = {}) {
        Object.entries(params).forEach(([name, spec]) => this.define(name, spec));
    }

    define(name, spec) {
        const { type = 'float', min = 0, max = 1, default: def = (min + max) / 2, scale = 'linear', choices = null } = spec;
        this.#params.set(name, { type, min, max, default: def, scale, choices, current: def });
        return this;
    }

    get(name) { return this.#params.get(name)?.current ?? this.#params.get(name)?.default; }

    set(name, value) {
        const param = this.#params.get(name);
        if (!param) throw new Error(`Unknown hyperparameter: ${name}`);
        param.current = this.validate(name, value);
        return this;
    }

    validate(name, value) {
        const param = this.#params.get(name);
        return param ? ValidationFns.byType(param.type, value, param.min, param.max, param.choices) ?? param.default : value;
    }

    sample() {
        const config = {};
        this.#params.forEach((param, name) => { config[name] = ValidationFns.sample(param); });
        return config;
    }

    reset() { this.#params.forEach(param => param.current = param.default); return this; }

    toJSON() { return Object.fromEntries([...this.#params.entries()].map(([name, p]) => [name, p.current])); }

    clone() {
        const clone = new HyperparameterSpace();
        this.#params.forEach((param, name) => clone.#params.set(name, { ...param }));
        return clone;
    }
}

export const HyperparameterSpaces = {
    rl: new HyperparameterSpace({
        learningRate: { type: 'float', min: 1e-5, max: 1e-1, default: 1e-3, scale: 'log' },
        discountFactor: { type: 'float', min: 0.9, max: 0.999, default: 0.99 },
        explorationRate: { type: 'float', min: 0.01, max: 1.0, default: 0.1 },
        explorationDecay: { type: 'float', min: 0.9, max: 0.999, default: 0.995 },
        targetUpdate: { type: 'float', min: 0.001, max: 1.0, default: 0.005 },
        batchSize: { type: 'int', min: 8, max: 512, default: 64 },
        bufferCapacity: { type: 'int', min: 1000, max: 100000, default: 10000 }
    }),
    policyGradient: new HyperparameterSpace({
        learningRate: { type: 'float', min: 1e-5, max: 1e-2, default: 3e-4, scale: 'log' },
        entropyWeight: { type: 'float', min: 0.001, max: 0.1, default: 0.01 },
        valueWeight: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        gradientClip: { type: 'float', min: 0.1, max: 10.0, default: 0.5 },
        gaeLambda: { type: 'float', min: 0.9, max: 0.99, default: 0.95 }
    }),
    worldModel: new HyperparameterSpace({
        latentDim: { type: 'int', min: 8, max: 256, default: 32 },
        ensembleSize: { type: 'int', min: 2, max: 10, default: 5 },
        horizon: { type: 'int', min: 1, max: 50, default: 15 },
        uncertaintyThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        learningRate: { type: 'float', min: 1e-5, max: 1e-2, default: 1e-3, scale: 'log' }
    }),
    attention: new HyperparameterSpace({
        heads: { type: 'int', min: 1, max: 16, default: 4 },
        dropout: { type: 'float', min: 0.0, max: 0.5, default: 0.1 },
        attentionDim: { type: 'int', min: 16, max: 256, default: 64 }
    }),
    metaLearning: new HyperparameterSpace({
        metaLearningRate: { type: 'float', min: 1e-4, max: 0.1, default: 0.01, scale: 'log' },
        explorationRate: { type: 'float', min: 0.1, max: 0.9, default: 0.3 },
        modificationThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        evaluationWindow: { type: 'int', min: 10, max: 500, default: 100 }
    }),
    skillDiscovery: new HyperparameterSpace({
        bottleneckThreshold: { type: 'float', min: 0.1, max: 0.9, default: 0.3 },
        noveltyThreshold: { type: 'float', min: 0.1, max: 1.0, default: 0.5 },
        minUsageCount: { type: 'int', min: 5, max: 100, default: 10 },
        maxSkills: { type: 'int', min: 10, max: 200, default: 50 }
    })
};

export const ConfigPresets = {
    fast: { learningRate: 0.01, batchSize: 32, explorationRate: 0.2, discountFactor: 0.95 },
    standard: { learningRate: 0.001, batchSize: 64, explorationRate: 0.1, discountFactor: 0.99 },
    performance: { learningRate: 0.0003, batchSize: 256, explorationRate: 0.05, discountFactor: 0.995 },
    exploration: { learningRate: 0.001, batchSize: 64, explorationRate: 0.5, discountFactor: 0.9 }
};

export class HyperparameterOptimizer {
    constructor(space, objective) {
        this.space = space instanceof HyperparameterSpace ? space : new HyperparameterSpace(space);
        this.objective = objective;
        this.results = [];
        this.best = null;
    }

    async randomSearch(iterations = 50) {
        for (let i = 0; i < iterations; i++) {
            const config = this.space.sample();
            const score = await this.objective(config);
            this.results.push({ config, score, iteration: i });
            if (!this.best || score > this.best.score) this.best = { config, score, iteration: i };
        }
        return this.best;
    }

    async gridSearch(paramValues) {
        const combinations = this._generateCombinations(paramValues);
        for (let i = 0; i < combinations.length; i++) {
            const config = combinations[i];
            const score = await this.objective(config);
            this.results.push({ config, score, iteration: i });
            if (!this.best || score > this.best.score) this.best = { config, score, iteration: i };
        }
        return this.best;
    }

    _generateCombinations(paramValues) {
        const keys = Object.keys(paramValues);
        if (keys.length === 0) return [{}];
        const [firstKey, ...restKeys] = keys;
        const restCombinations = this._generateCombinations(Object.fromEntries(restKeys.map(k => [k, paramValues[k]])));
        return paramValues[firstKey].flatMap(value => restCombinations.map(rest => ({ [firstKey]: value, ...rest })));
    }

    getResults() { return this.results.sort((a, b) => b.score - a.score); }

    getImportance() {
        const importance = {};
        const params = this.space.#params || new Map();
        params.forEach((_, name) => {
            const values = this.results.map(r => r.config[name]);
            const scores = this.results.map(r => r.score);
            importance[name] = this._correlation(values, scores);
        });
        return importance;
    }

    _correlation(x, y) {
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
