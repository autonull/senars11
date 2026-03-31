import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    name: 'Strategy',
    epsilon: 0.1,
    decay: 0.995,
    minEpsilon: 0.01,
    temperature: 1.0,
    softmaxTemperature: 1.0,
    k: 5,
    capacity: 1000,
    retrieval: 'similarity'
};

export class Strategy {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULTS, config);
        this.name = config.name ?? this.constructor.name;
    }

    execute(...args) { throw new Error('Strategy must implement execute()'); }
    canHandle(...args) { return true; }
    withConfig(config) { return new this.constructor({ ...this.config, ...config }); }
}

export class StrategyRegistry {
    constructor() {
        this.strategies = new Map();
        this.defaultStrategy = null;
    }

    register(name, strategy, options = {}) {
        const { priority = 0, predicate = null } = options;
        this.strategies.set(name, { strategy, priority, predicate });
        return this;
    }

    setDefault(name) { this.defaultStrategy = name; return this; }
    get(name) { return this.strategies.get(name)?.strategy ?? null; }

    select(...args) {
        const candidates = Array.from(this.strategies.entries())
            .filter(([, { strategy, predicate }]) => {
                const canHandle = strategy.canHandle?.(...args) ?? true;
                const matchesPredicate = predicate?.(...args) ?? true;
                return canHandle && matchesPredicate;
            })
            .sort(([, a], [, b]) => b.priority - a.priority);

        if (candidates.length === 0) return this.defaultStrategy ? this.get(this.defaultStrategy) : null;
        return candidates[0][1].strategy;
    }

    execute(name, ...args) {
        const strategy = this.get(name);
        if (!strategy) throw new Error(`Strategy not found: ${name}`);
        return strategy.execute(...args);
    }

    executeBest(...args) {
        const strategy = this.select(...args);
        if (!strategy) throw new Error('No suitable strategy found');
        return strategy.execute(...args);
    }

    list() { return Array.from(this.strategies.keys()); }
}

export class ExplorationStrategy extends Strategy {
    select(actionValues, state = null) { throw new Error('Must implement select()'); }
}

export class EpsilonGreedy extends ExplorationStrategy {
    constructor(config = {}) {
        super({ epsilon: 0.1, decay: 0.995, minEpsilon: 0.01, ...config });
        this.currentEpsilon = config.epsilon ?? 0.1;
    }

    select(actionValues, state = null) {
        if (Math.random() < this.currentEpsilon) {
            return Math.floor(Math.random() * actionValues.length);
        }
        return actionValues.indexOf(Math.max(...actionValues));
    }

    decay() {
        this.currentEpsilon = Math.max(this.config.minEpsilon, this.currentEpsilon * this.config.decay);
        return this.currentEpsilon;
    }

    reset() { this.currentEpsilon = this.config.epsilon; return this; }
}

export class BoltzmannExploration extends ExplorationStrategy {
    select(actionValues, state = null) {
        const { temperature = this.config.temperature } = state ?? {};
        const scaled = actionValues.map(v => v / temperature);
        const maxVal = Math.max(...scaled, -Infinity);
        const expVals = scaled.map(v => Math.exp(v - maxVal));
        const sum = expVals.reduce((a, b) => a + b, 0) || 1;
        const probs = expVals.map(e => e / sum);

        const r = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (r <= cumsum) return i;
        }
        return probs.length - 1;
    }
}

export class UpperConfidenceBound extends ExplorationStrategy {
    constructor(config = {}) {
        super({ c: config.c ?? 2, ...config });
        this.actionCounts = new Map();
        this.actionValues = new Map();
    }

    select(actionValues, state = null) {
        const total = Array.from(this.actionCounts.values()).reduce((a, b) => a + b, 0) || 1;

        const ucbValues = actionValues.map((v, i) => {
            const count = this.actionCounts.get(i) ?? 0;
            if (count === 0) return Infinity;
            return v + this.config.c * Math.sqrt(Math.log(total) / count);
        });

        const action = ucbValues.indexOf(Math.max(...ucbValues));
        this.actionCounts.set(action, (this.actionCounts.get(action) ?? 0) + 1);
        this.actionValues.set(action, actionValues[action]);

        return action;
    }

    reset() {
        this.actionCounts.clear();
        this.actionValues.clear();
        return this;
    }
}

export class ThompsonSampling extends ExplorationStrategy {
    constructor(config = {}) {
        super(config);
        this.successes = new Map();
        this.failures = new Map();
    }

    select(actionValues, state = null) {
        const samples = actionValues.map((_, i) => {
            const alpha = (this.successes.get(i) ?? 1) + 1;
            const beta = (this.failures.get(i) ?? 1) + 1;
            return this._betaSample(alpha, beta);
        });

        return samples.indexOf(Math.max(...samples));
    }

    update(action, success) {
        if (success) {
            this.successes.set(action, (this.successes.get(action) ?? 0) + 1);
        } else {
            this.failures.set(action, (this.failures.get(action) ?? 0) + 1);
        }
    }

    _betaSample(alpha, beta) {
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.pow(u1, 1 / alpha) / (Math.pow(u1, 1 / alpha) + Math.pow(u2, 1 / beta));
    }

    reset() {
        this.successes.clear();
        this.failures.clear();
        return this;
    }
}

export class OptimizationStrategy extends Strategy {
    optimize(params, gradients, config = {}) { throw new Error('Must implement optimize()'); }
}

export class SGD extends OptimizationStrategy {
    constructor(config = {}) {
        super({ learningRate: config.learningRate ?? 0.01, ...config });
    }

    optimize(params, gradients) {
        return params.map((p, i) => p - this.config.learningRate * gradients[i]);
    }
}

export class Adam extends OptimizationStrategy {
    constructor(config = {}) {
        super({
            learningRate: config.learningRate ?? 0.001,
            beta1: config.beta1 ?? 0.9,
            beta2: config.beta2 ?? 0.999,
            epsilon: config.epsilon ?? 1e-8,
            ...config
        });
        this.m = new Map();
        this.v = new Map();
        this.t = 0;
    }

    optimize(params, gradients) {
        this.t++;
        const { learningRate, beta1, beta2, epsilon } = this.config;

        return params.map((p, i) => {
            const g = gradients[i];
            const mPrev = this.m.get(i) ?? 0;
            const vPrev = this.v.get(i) ?? 0;

            const m = beta1 * mPrev + (1 - beta1) * g;
            const v = beta2 * vPrev + (1 - beta2) * g * g;

            this.m.set(i, m);
            this.v.set(i, v);

            const mHat = m / (1 - Math.pow(beta1, this.t));
            const vHat = v / (1 - Math.pow(beta2, this.t));

            return p - learningRate * mHat / (Math.sqrt(vHat) + epsilon);
        });
    }

    reset() {
        this.m.clear();
        this.v.clear();
        this.t = 0;
        return this;
    }
}

export class RetrievalStrategy extends Strategy {
    retrieve(query, memories, config = {}) { throw new Error('Must implement retrieve()'); }
}

export class SimilarityRetrieval extends RetrievalStrategy {
    retrieve(query, memories) {
        const { k = this.config.k } = this.config;
        return memories
            .map(m => ({ memory: m, similarity: this._cosine(query, m) }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, k);
    }

    _cosine(a, b) {
        const aData = a.state?.data ?? a.state ?? a;
        const bData = b.state?.data ?? b.state ?? b;
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(Array.isArray(aData) ? aData.length : 1, Array.isArray(bData) ? bData.length : 1);

        for (let i = 0; i < len; i++) {
            dot += (aData[i] ?? aData) * (bData[i] ?? bData);
            normA += (aData[i] ?? aData) ** 2;
            normB += (bData[i] ?? bData) ** 2;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }
}

export class PriorityRetrieval extends RetrievalStrategy {
    retrieve(query, memories) {
        const { k = this.config.k } = this.config;
        return memories
            .map(m => ({ memory: m, priority: m.priority ?? m.info?.priority ?? 1 }))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, k);
    }
}

export class RecencyRetrieval extends RetrievalStrategy {
    retrieve(query, memories) {
        const { k = this.config.k } = this.config;
        return memories
            .map(m => ({ memory: m, timestamp: m.timestamp ?? m.info?.timestamp ?? 0 }))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, k);
    }
}

export class CEMPlanning extends Strategy {
    constructor(config = {}) {
        super({
            numSamples: 10,
            numElites: 2,
            horizon: 5,
            iterations: 3,
            ...config
        });
    }

    execute(model, startState) {
        // Simple placeholder implementation of Cross-Entropy Method for planning
        let bestPlan = [];
        let bestReturn = -Infinity;

        // Simplified for now - just random shooting as placeholder
        for (let i = 0; i < this.config.numSamples; i++) {
            const plan = Array.from({ length: this.config.horizon }, () => Math.floor(Math.random() * 4));
            // In real CEM, we would simulate and refine. Here we just return random.
            bestPlan = plan;
        }
        return bestPlan;
    }
}

export const StrategyPresets = {
    exploration: {
        greedy: new EpsilonGreedy({ epsilon: 0.1 }),
        boltzmann: new BoltzmannExploration({ temperature: 1.0 }),
        ucb: new UpperConfidenceBound({ c: 2 }),
        thompson: new ThompsonSampling()
    },
    optimization: {
        sgd: new SGD({ learningRate: 0.01 }),
        adam: new Adam({ learningRate: 0.001 })
    },
    retrieval: {
        similarity: new SimilarityRetrieval({ k: 5 }),
        priority: new PriorityRetrieval({ k: 5 }),
        recency: new RecencyRetrieval({ k: 5 })
    },
    planning: {
        cem: new CEMPlanning()
    }
};
