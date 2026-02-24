/**
 * Enhanced Environment System
 * Unified environment framework with composition, wrappers, and factory patterns
 */
import { RLEnvironment } from '../core/RLEnvironment.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const ENV_DEFAULTS = {
    maxSteps: 1000,
    renderMode: null,
    seed: null,
    normalizeObservations: true,
    clipActions: true,
    recordEpisodes: false
};

/**
 * Enhanced Action Space with advanced utilities
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
        if (Array.isArray(bound)) return bound;
        if (typeof bound === 'number') return new Array(size).fill(bound);
        return new Array(size).fill(defaultVal);
    }

    sample() {
        if (this.type === 'Discrete') {
            return Math.floor(Math.random() * this.n);
        }
        return this.low.map((l, i) => l + Math.random() * (this.high[i] - l));
    }

    contains(value) {
        if (this.type === 'Discrete') {
            return Number.isInteger(value) && value >= 0 && value < this.n;
        }
        if (!Array.isArray(value)) return false;
        return value.every((v, i) => v >= this.low[i] && v <= this.high[i]);
    }

    normalize(value) {
        if (this.type !== 'Box') return value;
        const range = this.high.map((h, i) => h - this.low[i]);
        return value.map((v, i) => (v - this.low[i]) / range[i]);
    }

    denormalize(value) {
        if (this.type !== 'Box') return value;
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

/**
 * Enhanced Observation Space
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
        } else {
            throw new Error(`Unknown observation space type: ${spec.type}`);
        }
    }

    _normalizeBound(bound, size, defaultVal) {
        if (Array.isArray(bound)) return bound;
        if (typeof bound === 'number') return new Array(size).fill(bound);
        return new Array(size).fill(defaultVal);
    }

    sample() {
        if (this.type === 'Discrete') return Math.floor(Math.random() * this.n);
        return this.low.map((l, i) => {
            const h = this.high[i];
            return l === -Infinity && h === Infinity ? Math.random() * 10 - 5 : l + Math.random() * (h - l);
        });
    }

    contains(value) {
        if (this.type === 'Discrete') {
            return Number.isInteger(value) && value >= 0 && value < this.n;
        }
        if (!Array.isArray(value)) return false;
        return value.every((v, i) => v >= this.low[i] && v <= this.high[i]);
    }

    normalize(value) {
        if (this.type !== 'Box') return value;
        const finiteLow = this.low.map((l, i) => l === -Infinity ? -10 : l);
        const finiteHigh = this.high.map((h, i) => h === Infinity ? 10 : h);
        const range = finiteHigh.map((h, i) => h - finiteLow[i]);
        return value.map((v, i) => (v - finiteLow[i]) / range[i]);
    }

    toJSON() {
        return {
            type: this.type,
            ...(this.type === 'Discrete' ? { n: this.n } : {
                shape: this.shape, low: this.low, high: this.high
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

/**
 * Environment Wrapper Base Class
 */
export class EnvironmentWrapper extends RLEnvironment {
    constructor(env) {
        super();
        this.env = env;
        this._actionSpace = null;
        this._observationSpace = null;
    }

    reset(options = {}) {
        return this.env.reset(options);
    }

    step(action) {
        return this.env.step(action);
    }

    render() {
        return this.env.render?.();
    }

    close() {
        return this.env.close?.();
    }

    seed(seed) {
        return this.env.seed?.(seed);
    }

    get actionSpace() {
        return this._actionSpace ?? this.env.actionSpace;
    }

    set actionSpace(value) {
        this._actionSpace = value;
    }

    get observationSpace() {
        return this._observationSpace ?? this.env.observationSpace;
    }

    set observationSpace(value) {
        this._observationSpace = value;
    }

    get unwrapped() {
        return this.env.unwrapped ?? this.env;
    }
}

/**
 * Observation Normalization Wrapper
 */
export class NormalizeObservationWrapper extends EnvironmentWrapper {
    constructor(env, epsilon = 1e-8) {
        super(env);
        this.epsilon = epsilon;
        this.mean = null;
        this.var = null;
        this.count = 0;
    }

    reset(options = {}) {
        const result = this.env.reset(options);
        this._updateStats(result.observation);
        return {
            observation: this._normalize(result.observation),
            info: result.info
        };
    }

    step(action) {
        const result = this.env.step(action);
        if (!result.terminated && !result.truncated) {
            this._updateStats(result.observation);
        }
        return {
            ...result,
            observation: this._normalize(result.observation)
        };
    }

    _updateStats(obs) {
        if (!Array.isArray(obs)) return;
        
        this.count++;
        const obsArr = obs;

        if (this.mean === null) {
            this.mean = new Array(obs.length).fill(0);
            this.var = new Array(obs.length).fill(0);
        }

        for (let i = 0; i < obs.length; i++) {
            const delta = obsArr[i] - this.mean[i];
            this.mean[i] += delta / this.count;
            const delta2 = obsArr[i] - this.mean[i];
            this.var[i] += delta * delta2;
        }
    }

    _normalize(obs) {
        if (!Array.isArray(obs) || !this.mean) return obs;
        
        const std = this.var.map((v, i) => Math.sqrt(v / this.count) + this.epsilon);
        return obs.map((v, i) => (v - this.mean[i]) / std[i]);
    }
}

/**
 * Action Clipping Wrapper
 */
export class ClipActionWrapper extends EnvironmentWrapper {
    constructor(env) {
        super(env);
    }

    step(action) {
        if (this.actionSpace.type === 'Box') {
            const clipped = action.map((v, i) => 
                Math.max(this.actionSpace.low[i], Math.min(this.actionSpace.high[i], v))
            );
            return this.env.step(clipped);
        }
        return this.env.step(action);
    }
}

/**
 * Time Limit Wrapper
 */
export class TimeLimitWrapper extends EnvironmentWrapper {
    constructor(env, maxSteps) {
        super(env);
        this.maxSteps = maxSteps;
        this.currentStep = 0;
    }

    reset(options = {}) {
        this.currentStep = 0;
        return this.env.reset(options);
    }

    step(action) {
        this.currentStep++;
        const result = this.env.step(action);
        
        return {
            ...result,
            truncated: result.truncated || this.currentStep >= this.maxSteps
        };
    }
}

/**
 * Reward Scaling Wrapper
 */
export class RewardScaleWrapper extends EnvironmentWrapper {
    constructor(env, scale = 1.0, offset = 0.0) {
        super(env);
        this.scale = scale;
        this.offset = offset;
    }

    step(action) {
        const result = this.env.step(action);
        return {
            ...result,
            reward: result.reward * this.scale + this.offset
        };
    }
}

/**
 * Frame Stack Wrapper
 */
export class FrameStackWrapper extends EnvironmentWrapper {
    constructor(env, numFrames) {
        super(env);
        this.numFrames = numFrames;
        this.frames = [];
        this._originalObsSpace = this.env.observationSpace;
    }

    reset(options = {}) {
        const result = this.env.reset(options);
        this.frames = Array.from({ length: this.numFrames }, () => result.observation);
        return {
            observation: this._getStackedObs(),
            info: result.info
        };
    }

    step(action) {
        const result = this.env.step(action);
        this.frames.push(result.observation);
        this.frames.shift();

        return {
            ...result,
            observation: this._getStackedObs()
        };
    }

    _getStackedObs() {
        return this.frames.flat();
    }

    get observationSpace() {
        const orig = this._originalObsSpace;
        if (orig.type === 'Box') {
            return new ObservationSpace({
                type: 'Box',
                shape: [orig.shape[0] * this.numFrames],
                low: orig.low,
                high: orig.high
            });
        }
        return orig;
    }
}

/**
 * Discrete to Continuous Action Wrapper
 */
export class DiscreteToContinuousWrapper extends EnvironmentWrapper {
    constructor(env, numBins = 10, scale = [-1, 1]) {
        super(env);
        this.numBins = numBins;
        this.scale = scale;
        
        if (env.actionSpace.type === 'Discrete') {
            this._originalActionSpace = env.actionSpace;
            const dim = 1;
            this._actionSpace = new ActionSpace({
                type: 'Box',
                shape: [dim],
                low: scale[0],
                high: scale[1]
            });
        }
    }

    step(action) {
        if (this._originalActionSpace) {
            const continuousAction = Array.isArray(action) ? action[0] : action;
            const normalized = (continuousAction - this.scale[0]) / (this.scale[1] - this.scale[0]);
            const discreteAction = Math.floor(normalized * this._originalActionSpace.n);
            return this.env.step(Math.min(this._originalActionSpace.n - 1, Math.max(0, discreteAction)));
        }
        return this.env.step(action);
    }
}

/**
 * Continuous to Discrete Action Wrapper
 */
export class ContinuousToDiscreteWrapper extends EnvironmentWrapper {
    constructor(env, numBinsPerDim = 10) {
        super(env);
        this.numBinsPerDim = numBinsPerDim;
        
        if (env.actionSpace.type === 'Box') {
            this._originalActionSpace = env.actionSpace;
            const dim = env.actionSpace.shape[0];
            const n = Math.pow(numBinsPerDim, dim);
            this._actionSpace = new ActionSpace({ type: 'Discrete', n });
        }
    }

    step(discreteAction) {
        if (this._originalActionSpace) {
            const continuousAction = this._discreteToContinuous(discreteAction);
            return this.env.step(continuousAction);
        }
        return this.env.step(discreteAction);
    }

    _discreteToContinuous(discreteAction) {
        const dim = this._originalActionSpace.shape[0];
        const action = [];
        let remaining = discreteAction;

        for (let i = 0; i < dim; i++) {
            const bin = remaining % this.numBinsPerDim;
            remaining = Math.floor(remaining / this.numBinsPerDim);
            
            const low = this._originalActionSpace.low[i];
            const high = this._originalActionSpace.high[i];
            action.push(low + (bin / (this.numBinsPerDim - 1)) * (high - low));
        }

        return action;
    }
}

/**
 * Enhanced Environment with metrics and episode recording
 */
export class EnhancedEnvironment extends RLEnvironment {
    constructor(env, config = {}) {
        super();
        this.env = env;
        this.config = mergeConfig(ENV_DEFAULTS, config);
        
        this.metrics = new MetricsTracker({
            episodesCompleted: 0,
            totalSteps: 0,
            totalReward: 0,
            bestReward: -Infinity
        });

        this.currentEpisodeReward = 0;
        this.currentEpisodeSteps = 0;
        this.episodeHistory = [];
        this.currentEpisode = null;
    }

    reset(options = {}) {
        const result = this.env.reset(options);
        
        if (this.currentEpisode) {
            this.currentEpisode.reward = this.currentEpisodeReward;
            this.currentEpisode.steps = this.currentEpisodeSteps;
            this.episodeHistory.push(this.currentEpisode);
        }

        this.currentEpisode = {
            startTime: Date.now(),
            reward: 0,
            steps: 0,
            transitions: []
        };
        this.currentEpisodeReward = 0;
        this.currentEpisodeSteps = 0;

        return result;
    }

    step(action) {
        const result = this.env.step(action);
        
        this.currentEpisodeReward += result.reward;
        this.currentEpisodeSteps++;
        this.metrics.increment('totalSteps');
        this.metrics.set('totalReward', this.metrics.get('totalReward') + result.reward);

        if (this.config.recordEpisodes && this.currentEpisode) {
            this.currentEpisode.transitions.push({
                action,
                reward: result.reward,
                observation: result.observation,
                done: result.terminated || result.truncated
            });
        }

        if (result.terminated || result.truncated) {
            this.metrics.increment('episodesCompleted');
            if (this.currentEpisodeReward > this.metrics.get('bestReward')) {
                this.metrics.set('bestReward', this.currentEpisodeReward);
            }
        }

        return result;
    }

    render() {
        return this.env.render?.();
    }

    close() {
        return this.env.close?.();
    }

    get actionSpace() {
        return this.env.actionSpace;
    }

    get observationSpace() {
        return this.env.observationSpace;
    }

    getStats() {
        return {
            episodesCompleted: this.metrics.get('episodesCompleted'),
            totalSteps: this.metrics.get('totalSteps'),
            totalReward: this.metrics.get('totalReward'),
            bestReward: this.metrics.get('bestReward'),
            avgReward: this.metrics.get('totalReward') / Math.max(1, this.metrics.get('episodesCompleted')),
            episodeHistory: this.episodeHistory.slice(-100)
        };
    }

    getEpisodeHistory() {
        return this.episodeHistory;
    }

    resetMetrics() {
        this.metrics.reset();
        this.episodeHistory = [];
    }
}

/**
 * Environment Factory with builder pattern
 */
export class EnvironmentFactory {
    static create(name, config = {}) {
        const factories = {
            'GridWorld': () => this.gridWorld(config),
            'CartPole': () => this.cartPole(config),
            'Continuous1D': () => this.continuous1D(config),
            'CompositionalWorld': () => this.compositionalWorld(config)
        };

        const factory = factories[name];
        if (!factory) {
            throw new Error(`Unknown environment: ${name}. Available: ${Object.keys(factories).join(', ')}`);
        }

        return factory();
    }

    static gridWorld(config = {}) {
        const { GridWorld } = require('../environments/GridWorld.js');
        return new GridWorld(config);
    }

    static cartPole(config = {}) {
        const { CartPole } = require('../environments/CartPole.js');
        return new CartPole();
    }

    static continuous1D(config = {}) {
        const { Continuous1D } = require('../environments/Continuous1D.js');
        return new Continuous1D(config);
    }

    static compositionalWorld(config = {}) {
        const { CompositionalWorld } = require('../environments/CompositionalWorld.js');
        return new CompositionalWorld(config);
    }

    static wrap(env, wrappers = []) {
        let wrapped = env;
        for (const Wrapper of wrappers) {
            wrapped = new Wrapper(wrapped);
        }
        return wrapped;
    }

    static createWithWrappers(name, config = {}, wrappers = []) {
        const env = this.create(name, config);
        return this.wrap(env, wrappers);
    }

    static createNormalized(name, config = {}) {
        return this.createWithWrappers(name, config, [NormalizeObservationWrapper]);
    }

    static createClipped(name, config = {}) {
        return this.createWithWrappers(name, config, [ClipActionWrapper]);
    }

    static createLimited(name, config = {}, maxSteps = 1000) {
        return this.createWithWrappers(name, config, [TimeLimitWrapper, ClipActionWrapper]);
    }

    static createStacked(name, config = {}, numFrames = 4) {
        return this.createWithWrappers(name, config, [FrameStackWrapper]);
    }

    static createEnhanced(name, config = {}) {
        const env = this.create(name, config);
        return new EnhancedEnvironment(env, config);
    }
}

/**
 * Environment Registry for dynamic registration
 */
export class EnvironmentRegistry {
    constructor() {
        this.environments = new Map();
        this.factories = new Map();
    }

    register(name, envClass, options = {}) {
        this.environments.set(name, { class: envClass, options });
        return this;
    }

    registerFactory(name, factory) {
        this.factories.set(name, factory);
        return this;
    }

    create(name, config = {}) {
        const entry = this.environments.get(name);
        if (entry) {
            return new entry.class({ ...entry.options, ...config });
        }

        const factory = this.factories.get(name);
        if (factory) {
            return factory(config);
        }

        throw new Error(`Environment not found: ${name}`);
    }

    createEnhanced(name, config = {}) {
        const env = this.create(name, config);
        return new EnhancedEnvironment(env, config);
    }

    list() {
        return Array.from(this.environments.keys());
    }

    listFactories() {
        return Array.from(this.factories.keys());
    }
}

export const globalEnvRegistry = new EnvironmentRegistry();

// Utility functions
export const wrapEnv = (env, wrappers) => EnvironmentFactory.wrap(env, wrappers);
export const makeEnv = (name, config = {}) => EnvironmentFactory.create(name, config);
