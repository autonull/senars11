/**
 * Strategy Pattern System
 * Interchangeable algorithms and components for maximum flexibility.
 */
import { compose, pipe, Maybe, Either, Stream } from '../functional/FunctionalUtils.js';

/**
 * Base Strategy Interface
 */
export class Strategy {
    constructor(config = {}) {
        this.config = config;
        this.name = config.name ?? this.constructor.name;
    }

    execute(...args) {
        throw new Error('Strategy must implement execute()');
    }

    canHandle(...args) {
        return true;
    }

    withConfig(config) {
        return new this.constructor({ ...this.config, ...config });
    }
}

/**
 * Strategy Registry for dynamic selection
 */
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

    setDefault(name) {
        this.defaultStrategy = name;
        return this;
    }

    get(name) {
        const entry = this.strategies.get(name);
        return entry?.strategy ?? null;
    }

    select(...args) {
        // Find strategies that can handle the input
        const candidates = Array.from(this.strategies.entries())
            .filter(([, { strategy, predicate }]) => {
                const canHandle = strategy.canHandle?.(...args) ?? true;
                const matchesPredicate = predicate?.(...args) ?? true;
                return canHandle && matchesPredicate;
            })
            .sort(([, a], [, b]) => b.priority - a.priority);

        if (candidates.length === 0) {
            return this.defaultStrategy ? this.get(this.defaultStrategy) : null;
        }

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

    list() {
        return Array.from(this.strategies.keys());
    }
}

/**
 * Exploration Strategies
 */
export class ExplorationStrategy extends Strategy {
    select(actionValues, state = null) {
        throw new Error('Must implement select()');
    }
}

export class EpsilonGreedy extends ExplorationStrategy {
    constructor(config = {}) {
        super({ epsilon: 0.1, decay: 0.995, minEpsilon: 0.01, ...config });
        this.currentEpsilon = config.epsilon;
    }

    select(actionValues) {
        if (Math.random() < this.currentEpsilon) {
            return Math.floor(Math.random() * actionValues.length);
        }
        return actionValues.indexOf(Math.max(...actionValues));
    }

    step() {
        this.currentEpsilon = Math.max(
            this.config.minEpsilon,
            this.currentEpsilon * this.config.decay
        );
    }

    canHandle(actionValues) {
        return Array.isArray(actionValues) && actionValues.length > 0;
    }
}

export class Softmax extends ExplorationStrategy {
    constructor(config = {}) {
        super({ temperature: 1.0, decay: 0.99, minTemperature: 0.1, ...config });
        this.temperature = config.temperature;
    }

    select(actionValues) {
        const expValues = actionValues.map(v => Math.exp(v / this.temperature));
        const sum = expValues.reduce((a, b) => a + b, 0);
        const probs = expValues.map(e => e / sum);
        
        const r = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (r <= cumsum) return i;
        }
        return probs.length - 1;
    }

    step() {
        this.temperature = Math.max(
            this.config.minTemperature,
            this.temperature * this.config.decay
        );
    }
}

export class UCB extends ExplorationStrategy {
    constructor(config = {}) {
        super({ c: 2.0, ...config });
        this.counts = [];
        this.values = [];
    }

    select(actionValues, totalSteps = 1) {
        // Initialize counts
        while (this.counts.length < actionValues.length) {
            this.counts.push(0);
            this.values.push(0);
        }

        // Find unvisited actions
        const unvisited = this.counts
            .map((c, i) => c === 0 ? i : -1)
            .filter(i => i >= 0);

        if (unvisited.length > 0) {
            return unvisited[0];
        }

        // UCB formula
        const ucbValues = actionValues.map((v, i) => 
            v + this.config.c * Math.sqrt(Math.log(totalSteps) / this.counts[i])
        );

        return ucbValues.indexOf(Math.max(...ucbValues));
    }

    update(action, reward) {
        this.counts[action]++;
        this.values[action] += (reward - this.values[action]) / this.counts[action];
    }
}

/**
 * Learning Rate Schedules
 */
export class LearningRateSchedule extends Strategy {
    get(step) {
        throw new Error('Must implement get()');
    }
}

export class ConstantLR extends LearningRateSchedule {
    constructor(config = {}) {
        super({ lr: 0.001, ...config });
    }

    get(step) {
        return this.config.lr;
    }
}

export class StepDecayLR extends LearningRateSchedule {
    constructor(config = {}) {
        super({ lr: 0.01, decay: 0.5, stepSize: 1000, ...config });
    }

    get(step) {
        const numDecays = Math.floor(step / this.config.stepSize);
        return this.config.lr * Math.pow(this.config.decay, numDecays);
    }
}

export class ExponentialDecayLR extends LearningRateSchedule {
    constructor(config = {}) {
        super({ lr: 0.01, decay: 0.9999, ...config });
    }

    get(step) {
        return this.config.lr * Math.pow(this.config.decay, step);
    }
}

export class CosineAnnealingLR extends LearningRateSchedule {
    constructor(config = {}) {
        super({ lr: 0.01, minLr: 0.0001, period: 10000, ...config });
    }

    get(step) {
        const progress = (step % this.config.period) / this.config.period;
        return this.config.minLr + 0.5 * (this.config.lr - this.config.minLr) * 
               (1 + Math.cos(Math.PI * progress));
    }
}

/**
 * Reward Shaping Strategies
 */
export class RewardShapingStrategy extends Strategy {
    shape(reward, state, nextState, action) {
        return reward;
    }
}

export class PotentialBasedShaping extends RewardShapingStrategy {
    constructor(config = {}) {
        super({ gamma: 0.99, ...config });
        this.potentialFn = config.potentialFn ?? ((s) => 0);
    }

    shape(reward, state, nextState) {
        const F = this.potentialFn(nextState) - this.config.gamma * this.potentialFn(state);
        return reward + F;
    }

    withPotential(fn) {
        return new PotentialBasedShaping({ ...this.config, potentialFn: fn });
    }
}

export class IntrinsicShaping extends RewardShapingStrategy {
    constructor(config = {}) {
        super({ noveltyWeight: 0.1, predictionWeight: 0.1, ...config });
        this.visits = new Map();
        this.predictionErrors = [];
    }

    shape(reward, state, nextState, action) {
        const novelty = this.computeNovelty(nextState);
        const prediction = this.computePredictionError(nextState);
        
        return reward + 
               this.config.noveltyWeight * novelty + 
               this.config.predictionWeight * prediction;
    }

    computeNovelty(state) {
        const key = JSON.stringify(state);
        const count = this.visits.get(key) ?? 0;
        this.visits.set(key, count + 1);
        return 1 / Math.sqrt(count + 1);
    }

    computePredictionError(state) {
        if (this.predictionErrors.length === 0) return 0;
        return this.predictionErrors[this.predictionErrors.length - 1];
    }

    recordPrediction(error) {
        this.predictionErrors.push(error);
        if (this.predictionErrors.length > 100) {
            this.predictionErrors.shift();
        }
    }
}

/**
 * Planning Strategies
 */
export class PlanningStrategy extends Strategy {
    plan(state, model, horizon = 10) {
        throw new Error('Must implement plan()');
    }
}

export class RandomShooting extends PlanningStrategy {
    constructor(config = {}) {
        super({ numSamples: 100, ...config });
    }

    plan(state, model, horizon) {
        let bestSequence = null;
        let bestValue = -Infinity;

        for (let i = 0; i < this.config.numSamples; i++) {
            const sequence = this.sampleSequence(horizon, model.actionSpace);
            const value = this.evaluateSequence(state, sequence, model);
            
            if (value > bestValue) {
                bestValue = value;
                bestSequence = sequence;
            }
        }

        return bestSequence?.[0] ?? this.randomAction(model.actionSpace);
    }

    sampleSequence(horizon, actionSpace) {
        return Array.from({ length: horizon }, () => 
            Math.floor(Math.random() * actionSpace.n)
        );
    }

    evaluateSequence(state, sequence, model) {
        let totalReward = 0;
        let currentState = state;

        for (const action of sequence) {
            const result = model.step(currentState, action);
            totalReward += result.reward;
            currentState = result.nextState;
        }

        return totalReward;
    }

    randomAction(actionSpace) {
        return Math.floor(Math.random() * actionSpace.n);
    }
}

export class CEMPlanning extends PlanningStrategy {
    constructor(config = {}) {
        super({ 
        numSamples: 50, 
        numElites: 10, 
        iterations: 5,
        ...config 
        });
    }

    plan(state, model, horizon) {
        const actionSpace = model.actionSpace.n;
        
        // Initialize distribution (probabilities for each action at each timestep)
        let probs = Array.from({ length: horizon }, () => 
            Array(actionSpace).fill(1 / actionSpace)
        );

        for (let iter = 0; iter < this.config.iterations; iter++) {
            // Sample sequences
            const sequences = Array.from({ length: this.config.numSamples }, () =>
                this.sampleFromDistribution(probs)
            );

            // Evaluate sequences
            const evaluations = sequences.map(seq => ({
                sequence: seq,
                value: this.evaluateSequence(state, seq, model)
            }));

            // Select elites
            evaluations.sort((a, b) => b.value - a.value);
            const elites = evaluations.slice(0, this.config.numElites);

            // Update distribution
            probs = this.updateDistribution(probs, elites.map(e => e.sequence));
        }

        // Return best action from final distribution
        return probs[0].indexOf(Math.max(...probs[0]));
    }

    sampleFromDistribution(probs) {
        return probs.map(p => {
            const r = Math.random();
            let cumsum = 0;
            for (let i = 0; i < p.length; i++) {
                cumsum += p[i];
                if (r <= cumsum) return i;
            }
            return p.length - 1;
        });
    }

    updateDistribution(probs, sequences) {
        return probs.map((_, t) => {
            const actionCounts = Array(probs[0].length).fill(0);
            for (const seq of sequences) {
                actionCounts[seq[t]]++;
            }
            return actionCounts.map(c => c / sequences.length);
        });
    }

    evaluateSequence(state, sequence, model) {
        let totalReward = 0;
        let currentState = state;

        for (const action of sequence) {
            const result = model.step(currentState, action);
            totalReward += result.reward;
            currentState = result.nextState;
        }

        return totalReward;
    }
}

/**
 * Memory Strategies
 */
export class MemoryStrategy extends Strategy {
    store(memory) {
        throw new Error('Must implement store()');
    }

    retrieve(query, k = 1) {
        throw new Error('Must implement retrieve()');
    }
}

export class UniformReplay extends MemoryStrategy {
    constructor(config = {}) {
        super({ capacity: 10000, ...config });
        this.buffer = [];
    }

    store(memory) {
        if (this.buffer.length >= this.config.capacity) {
            this.buffer.shift();
        }
        this.buffer.push(memory);
    }

    retrieve(query, k = 1) {
        const indices = new Set();
        while (indices.size < Math.min(k, this.buffer.length)) {
            indices.add(Math.floor(Math.random() * this.buffer.length));
        }
        return Array.from(indices).map(i => this.buffer[i]);
    }

    size() {
        return this.buffer.length;
    }

    clear() {
        this.buffer = [];
    }
}

export class PrioritizedReplay extends MemoryStrategy {
    constructor(config = {}) {
        super({ 
            capacity: 10000, 
            alpha: 0.6, 
            beta: 0.4,
            betaIncrement: 0.001,
            ...config 
        });
        this.buffer = [];
        this.priorities = [];
        this.maxPriority = 1.0;
    }

    store(memory, priority = null) {
        if (this.buffer.length >= this.config.capacity) {
            this.buffer.shift();
            this.priorities.shift();
        }

        this.buffer.push(memory);
        this.priorities.push(priority ?? this.maxPriority);
        this.maxPriority = Math.max(this.maxPriority, priority ?? 1);
    }

    retrieve(query, k = 1) {
        this.beta = Math.min(1.0, this.beta + this.config.betaIncrement);
        
        const priorities = this.priorities.map(p => Math.pow(p, this.config.alpha));
        const total = priorities.reduce((a, b) => a + b, 0);
        
        const indices = [];
        const segmentSize = total / k;
        
        for (let i = 0; i < k; i++) {
            const segmentStart = segmentSize * i;
            const target = segmentStart + Math.random() * segmentSize;
            
            let cumsum = 0;
            for (let j = 0; j < priorities.length; j++) {
                cumsum += priorities[j];
                if (cumsum >= target) {
                    indices.push(j);
                    break;
                }
            }
        }

        // Compute importance sampling weights
        const minProb = Math.min(...priorities) / total;
        const weights = indices.map(i => {
            const prob = priorities[i] / total;
            return Math.pow(prob / minProb, this.beta);
        });

        // Normalize weights
        const maxWeight = Math.max(...weights);
        const normalizedWeights = weights.map(w => w / maxWeight);

        return {
            samples: indices.map(i => this.buffer[i]),
            indices,
            weights: normalizedWeights
        };
    }

    updatePriorities(indices, newPriorities) {
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            if (idx < this.priorities.length) {
                this.priorities[idx] = newPriorities[i];
                this.maxPriority = Math.max(this.maxPriority, newPriorities[i]);
            }
        }
    }

    size() {
        return this.buffer.length;
    }
}

/**
 * Attention Strategies
 */
export class AttentionStrategy extends Strategy {
    attend(query, keys, values) {
        throw new Error('Must implement attend()');
    }
}

export class DotProductAttention extends AttentionStrategy {
    constructor(config = {}) {
        super({ scaled: true, ...config });
    }

    attend(query, keys, values) {
        let scores = query.map((q, i) => 
            keys.reduce((sum, k, j) => sum + (i === j ? q * k : 0), 0)
        );

        if (this.config.scaled) {
            const scale = 1 / Math.sqrt(query.length);
            scores = scores.map(s => s * scale);
        }

        const weights = this.softmax(scores);
        
        return values.map((v, i) => v * weights[i]);
    }

    softmax(scores) {
        const maxScore = Math.max(...scores);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sum = expScores.reduce((a, b) => a + b, 0);
        return expScores.map(e => e / sum);
    }
}

export class MultiHeadAttention extends AttentionStrategy {
    constructor(config = {}) {
        super({ heads: 8, ...config });
        this.heads = config.heads;
    }

    attend(query, keys, values) {
        const headDim = Math.floor(query.length / this.heads);
        const outputs = [];

        for (let h = 0; h < this.heads; h++) {
            const qHead = query.slice(h * headDim, (h + 1) * headDim);
            const kHead = keys.slice(h * headDim, (h + 1) * headDim);
            const vHead = values.slice(h * headDim, (h + 1) * headDim);

            const attention = new DotProductAttention({ scaled: true });
            outputs.push(...attention.attend(qHead, kHead, vHead));
        }

        return outputs;
    }
}

/**
 * Strategy Combinators
 */
export const composeStrategies = (...strategies) => ({
    execute: (...args) => {
        let result = strategies[0].execute(...args);
        for (let i = 1; i < strategies.length; i++) {
            result = strategies[i].execute(result, ...args);
        }
        return result;
    },
    canHandle: (...args) => strategies.every(s => s.canHandle?.(...args) ?? true)
});

export const chooseStrategy = (predicate, trueStrategy, falseStrategy) => ({
    execute: (...args) => 
        predicate(...args) 
            ? trueStrategy.execute(...args) 
            : falseStrategy.execute(...args),
    canHandle: (...args) => 
        trueStrategy.canHandle?.(...args) ?? falseStrategy.canHandle?.(...args) ?? true
});

export const withRetry = (strategy, maxRetries = 3, fallback = null) => ({
    execute: (...args) => {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return Either.right(strategy.execute(...args));
            } catch (e) {
                lastError = e;
            }
        }
        return fallback ? Either.right(fallback.execute(...args)) : Either.left(lastError);
    },
    canHandle: (...args) => strategy.canHandle?.(...args) ?? true
});

export const withCaching = (strategy, cache = new Map()) => ({
    execute: (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = strategy.execute(...args);
        cache.set(key, result);
        return result;
    },
    canHandle: (...args) => strategy.canHandle?.(...args) ?? true
});

/**
 * Pre-built Strategy Configurations
 */
export const StrategyPresets = {
    exploration: {
        greedy: new EpsilonGreedy({ epsilon: 0 }),
        balanced: new EpsilonGreedy({ epsilon: 0.1, decay: 0.995 }),
        exploratory: new EpsilonGreedy({ epsilon: 0.3, decay: 0.99 }),
        softmax: new Softmax({ temperature: 1.0 }),
        ucb: new UCB({ c: 2.0 })
    },

    learningRate: {
        constant: new ConstantLR({ lr: 0.001 }),
        stepDecay: new StepDecayLR({ lr: 0.01, stepSize: 1000 }),
        exponential: new ExponentialDecayLR({ lr: 0.01, decay: 0.9999 }),
        cosine: new CosineAnnealingLR({ lr: 0.01, period: 10000 })
    },

    planning: {
        random: new RandomShooting({ numSamples: 50 }),
        cem: new CEMPlanning({ numSamples: 50, numElites: 10, iterations: 5 })
    },

    memory: {
        uniform: new UniformReplay({ capacity: 10000 }),
        prioritized: new PrioritizedReplay({ capacity: 10000, alpha: 0.6 })
    }
};
