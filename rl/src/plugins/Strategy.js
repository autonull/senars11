/**
 * Strategy System
 * Exploration and selection strategies for RL
 */
import { mergeConfig } from '../utils/ConfigHelper.js';

const STRATEGY_DEFAULTS = {
    name: 'Strategy',
    epsilon: 0.1,
    decay: 0.995,
    minEpsilon: 0.01,
    temperature: 1.0,
    k: 5
};

/**
 * Base strategy class
 */
export class Strategy {
    constructor(config = {}) {
        this.config = mergeConfig(STRATEGY_DEFAULTS, config);
        this.steps = 0;
    }

    /**
     * Select action
     * @param {Array} values - Action values
     * @returns {number} Selected action index
     */
    select(values) {
        throw new Error('select() must be implemented');
    }

    /**
     * Update strategy after action
     * @param {number} action - Selected action
     * @param {number} reward - Received reward
     */
    update(action, reward) {
        this.steps++;
    }

    /**
     * Reset strategy
     */
    reset() {
        this.steps = 0;
    }

    /**
     * Get strategy info
     * @returns {object} Strategy info
     */
    getInfo() {
        return {
            name: this.config.name,
            steps: this.steps
        };
    }
}

/**
 * Epsilon-greedy exploration
 */
export class EpsilonGreedy extends Strategy {
    constructor(config = {}) {
        super({ ...config, name: 'EpsilonGreedy' });
    }

    select(values) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * values.length);
        }

        let maxIdx = 0;
        let maxVal = values[0];
        for (let i = 1; i < values.length; i++) {
            if (values[i] > maxVal) {
                maxVal = values[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    update(action, reward) {
        super.update(action, reward);
        this.step();
    }

    step() {
        this.config.epsilon = Math.max(
            this.config.minEpsilon,
            this.config.epsilon * this.config.decay
        );
    }

    get currentEpsilon() {
        return this.config.epsilon;
    }

    getInfo() {
        return {
            ...super.getInfo(),
            epsilon: this.config.epsilon
        };
    }
}

/**
 * Boltzmann (softmax) exploration
 */
export class BoltzmannExploration extends Strategy {
    constructor(config = {}) {
        super({ ...config, name: 'BoltzmannExploration' });
    }

    select(values) {
        const temperature = this.config.temperature;
        const expValues = values.map(v => Math.exp(v / temperature));
        const sumExp = expValues.reduce((a, b) => a + b, 0);
        const probs = expValues.map(e => e / sumExp);

        const r = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (r <= cumsum) return i;
        }
        return probs.length - 1;
    }

    update(action, reward) {
        super.update(action, reward);
        // Cool down temperature
        this.config.temperature *= 0.999;
    }

    getInfo() {
        return {
            ...super.getInfo(),
            temperature: this.config.temperature
        };
    }
}

/**
 * Upper Confidence Bound (UCB)
 */
export class UCB extends Strategy {
    constructor(config = {}) {
        super({ ...config, name: 'UCB' });
        this.counts = [];
        this.values = [];
    }

    select(values) {
        // Initialize
        if (this.counts.length === 0) {
            this.counts = new Array(values.length).fill(0);
            this.values = new Array(values.length).fill(0);
        }

        // Try each action once
        for (let i = 0; i < this.counts.length; i++) {
            if (this.counts[i] === 0) return i;
        }

        // UCB selection
        const total = this.counts.reduce((a, b) => a + b, 0);
        const ucbValues = this.values.map((v, i) =>
            v + Math.sqrt((2 * Math.log(total)) / this.counts[i])
        );

        let maxIdx = 0;
        let maxVal = ucbValues[0];
        for (let i = 1; i < ucbValues.length; i++) {
            if (ucbValues[i] > maxVal) {
                maxVal = ucbValues[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    update(action, reward) {
        super.update(action, reward);
        this.counts[action]++;
        const n = this.counts[action];
        const value = this.values[action];
        this.values[action] = value + (reward - value) / n;
    }

    reset() {
        super.reset();
        this.counts = [];
        this.values = [];
    }
}

/**
 * Thompson Sampling
 */
export class ThompsonSampling extends Strategy {
    constructor(config = {}) {
        super({ ...config, name: 'ThompsonSampling' });
        this.successes = [];
        this.failures = [];
    }

    select(values) {
        // Initialize
        if (this.successes.length === 0) {
            this.successes = new Array(values.length).fill(1);
            this.failures = new Array(values.length).fill(1);
        }

        // Sample from Beta distributions
        const samples = this.successes.map((s, i) =>
            this._sampleBeta(s, this.failures[i])
        );

        let maxIdx = 0;
        let maxVal = samples[0];
        for (let i = 1; i < samples.length; i++) {
            if (samples[i] > maxVal) {
                maxVal = samples[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    _sampleBeta(alpha, beta) {
        // Simple Beta sampling approximation
        const x = this._gamma(alpha);
        const y = this._gamma(beta);
        return x / (x + y);
    }

    _gamma(shape) {
        // Gamma sampling approximation
        if (shape < 1) {
            return this._gamma(shape + 1) * Math.pow(Math.random(), -1 / shape);
        }
        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        while (true) {
            const x = this._normal();
            const v = Math.pow(1 + c * x, 3);
            if (v > 0) {
                const u = Math.random();
                if (u < 1 - 0.0331 * x * x * x * x) {
                    return d * v;
                }
                if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                    return d * v;
                }
            }
        }
    }

    _normal() {
        // Box-Muller transform
        const u = Math.random();
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    update(action, reward) {
        super.update(action, reward);

        if (this.successes.length === 0) {
            this.successes = new Array(action + 1).fill(1);
            this.failures = new Array(action + 1).fill(1);
        }

        if (reward > 0) {
            this.successes[action]++;
        } else {
            this.failures[action]++;
        }
    }

    reset() {
        super.reset();
        this.successes = [];
        this.failures = [];
    }
}

/**
 * Strategy registry
 */
export const Strategies = {
    epsilonGreedy: (config) => new EpsilonGreedy(config),
    boltzmann: (config) => new BoltzmannExploration(config),
    ucb: (config) => new UCB(config),
    thompson: (config) => new ThompsonSampling(config)
};

/**
 * Create strategy by name
 * @param {string} name - Strategy name
 * @param {object} config - Configuration
 * @returns {Strategy} Strategy instance
 */
export function createStrategy(name, config = {}) {
    const factory = Strategies[name.toLowerCase()];
    if (!factory) {
        throw new Error(`Unknown strategy: ${name}`);
    }
    return factory(config);
}
