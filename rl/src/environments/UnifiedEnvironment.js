/**
 * Unified Environment Adapter
 * Seamless operation in both discrete and continuous action domains.
 */
import { RLEnvironment } from '../core/RLEnvironment.js';

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

const ACTION_SPACE_DEFAULTS = {
    shape: null,
    dim: 4,
    low: -1,
    high: 1,
    dtype: 'float32'
};

const OBS_SPACE_DEFAULTS = {
    shape: null,
    dim: 4,
    defaultLow: -Infinity,
    defaultHigh: Infinity
};

const ADAPTER_DEFAULTS = {
    normalizeObservations: true,
    clipActions: true
};

const DISCRETE_WRAPPER_DEFAULTS = {
    numBins: 10,
    perDimension: false
};

const CONTINUOUS_WRAPPER_DEFAULTS = {
    scale: [-1, 1],
    embedding: false
};

const HYBRID_ENV_DEFAULTS = {
    initialMode: 'auto'
};

export class ActionSpace {
    constructor(spec) {
        const config = mergeConfig(ACTION_SPACE_DEFAULTS, spec);
        if (spec.type === 'Discrete') {
            this.type = 'Discrete';
            this.n = spec.n;
            this.shape = [];
        } else if (spec.type === 'Box') {
            this.type = 'Box';
            this.shape = config.shape ?? [config.dim];
            this.low = config.low;
            this.high = config.high;
            this.dtype = config.dtype;
        } else {
            throw new Error(`Unknown action space type: ${spec.type}`);
        }
    }

    sample() {
        if (this.type === 'Discrete') return Math.floor(Math.random() * this.n);

        const size = this.shape.reduce((a, b) => a * b, 1);
        const low = Array.isArray(this.low) ? this.low : new Array(size).fill(this.low);
        const high = Array.isArray(this.high) ? this.high : new Array(size).fill(this.high);
        return low.map((l, i) => l + Math.random() * (high[i] - l));
    }

    contains(action) {
        if (this.type === 'Discrete') {
            return Number.isInteger(action) && action >= 0 && action < this.n;
        }
        if (!Array.isArray(action)) return false;

        const low = Array.isArray(this.low) ? this.low : new Array(action.length).fill(this.low);
        const high = Array.isArray(this.high) ? this.high : new Array(action.length).fill(this.high);
        return action.every((v, i) => v >= low[i] && v <= high[i]);
    }

    toJSON() {
        return {
            type: this.type,
            ...(this.type === 'Discrete' ? { n: this.n } : {
                shape: this.shape, low: this.low, high: this.high
            })
        };
    }
}

export class ObservationSpace {
    constructor(spec) {
        const config = mergeConfig(OBS_SPACE_DEFAULTS, spec);
        if (spec.type === 'Discrete') {
            this.type = 'Discrete';
            this.n = spec.n;
            this.shape = [];
        } else if (spec.type === 'Box') {
            this.type = 'Box';
            this.shape = config.shape ?? [config.dim];
            this.low = spec.low ?? new Array(this.shape[0]).fill(config.defaultLow);
            this.high = spec.high ?? new Array(this.shape[0]).fill(config.defaultHigh);
        } else {
            throw new Error(`Unknown observation space type: ${spec.type}`);
        }
    }

    sample() {
        if (this.type === 'Discrete') return Math.floor(Math.random() * this.n);

        const size = this.shape.reduce((a, b) => a * b, 1);
        const low = Array.isArray(this.low) ? this.low : new Array(size).fill(this.low);
        const high = Array.isArray(this.high) ? this.high : new Array(size).fill(this.high);
        return low.map((l, i) => l + Math.random() * (high[i] - l));
    }

    contains(observation) {
        if (this.type === 'Discrete') {
            return Number.isInteger(observation) && observation >= 0 && observation < this.n;
        }
        if (!Array.isArray(observation)) return false;

        const low = Array.isArray(this.low) ? this.low : new Array(observation.length).fill(this.low);
        const high = Array.isArray(this.high) ? this.high : new Array(observation.length).fill(this.high);
        return observation.every((v, i) => v >= low[i] && v <= high[i]);
    }

    toJSON() {
        return {
            type: this.type,
            ...(this.type === 'Discrete' ? { n: this.n } : {
                shape: this.shape, low: this.low, high: this.high
            })
        };
    }
}

export class EnvironmentAdapter {
    constructor(env, config = {}) {
        this.config = mergeConfig(ADAPTER_DEFAULTS, config);
        this.env = env;
        this.actionSpace = this._createActionSpace(env.actionSpace);
        this.observationSpace = this._createObservationSpace(env.observationSpace);
        this._actionType = this.actionSpace.type;
    }

    _createActionSpace(spec) {
        return spec instanceof ActionSpace ? spec : new ActionSpace(spec);
    }

    _createObservationSpace(spec) {
        return spec instanceof ObservationSpace ? spec : new ObservationSpace(spec);
    }

    get actionType() { return this._actionType; }
    get isDiscrete() { return this._actionType === 'Discrete'; }
    get isContinuous() { return this._actionType === 'Box'; }

    reset(options = {}) {
        const result = this.env.reset(options);
        return {
            observation: this._normalizeObservation(result.observation),
            info: result.info ?? {}
        };
    }

    step(action) {
        const convertedAction = this._convertAction(action);
        const result = this.env.step(convertedAction);
        return {
            observation: this._normalizeObservation(result.observation),
            reward: result.reward ?? 0,
            terminated: result.terminated ?? result.done ?? false,
            truncated: result.truncated ?? false,
            info: result.info ?? {}
        };
    }

    _normalizeObservation(obs) {
        if (!this.config.normalizeObservations || !Array.isArray(obs)) return obs;
        return obs.map(v => typeof v === 'number' ? v : Number(v));
    }

    _convertAction(action) {
        if (this.isDiscrete) return typeof action === 'number' ? Math.floor(action) : 0;
        if (!Array.isArray(action)) return [action];

        if (!this.config.clipActions) return action;
        const low = Array.isArray(this.actionSpace.low)
            ? this.actionSpace.low : new Array(action.length).fill(this.actionSpace.low);
        const high = Array.isArray(this.actionSpace.high)
            ? this.actionSpace.high : new Array(action.length).fill(this.actionSpace.high);
        return action.map((v, i) => Math.max(low[i], Math.min(high[i], v)));
    }

    render() { return this.env.render?.(); }
    close() { return this.env.close?.(); }
    seed(seed) { return this.env.seed?.(seed); }

    wrapAction(action, targetType) {
        if (targetType === this._actionType) return action;

        if (targetType === 'Discrete') {
            if (Array.isArray(action)) {
                const n = 10;
                const normalized = (action[0] - this.actionSpace.low) / (this.actionSpace.high - this.actionSpace.low);
                return Math.floor(normalized * n);
            }
            return Math.floor(action);
        }

        if (targetType === 'Box') {
            const n = this.actionSpace.n;
            const normalized = action / n;
            return [this.actionSpace.low + normalized * (this.actionSpace.high - this.actionSpace.low)];
        }
        return action;
    }

    getInfo() {
        return {
            actionSpace: this.actionSpace.toJSON(),
            observationSpace: this.observationSpace.toJSON(),
            isDiscrete: this.isDiscrete,
            isContinuous: this.isContinuous
        };
    }
}

export class DiscreteWrapper extends EnvironmentAdapter {
    constructor(env, options = {}) {
        super(env);
        const config = mergeConfig(DISCRETE_WRAPPER_DEFAULTS, options);
        this.numBins = config.numBins;
        this.perDimension = config.perDimension;

        if (this.isContinuous) {
            const dim = this.actionSpace.shape[0];
            const totalActions = config.perDimension ? Math.pow(config.numBins, dim) : config.numBins;
            this.actionSpace = new ActionSpace({ type: 'Discrete', n: totalActions });
        }
    }

    step(action) {
        return super.step(this._discreteToContinuous(action));
    }

    _discreteToContinuous(discreteAction) {
        if (!this.isContinuous) return discreteAction;

        const dim = this.actionSpace.shape[0];

        if (this.perDimension) {
            const action = [];
            let remaining = discreteAction;

            for (let i = 0; i < dim; i++) {
                const bin = remaining % this.numBins;
                remaining = Math.floor(remaining / this.numBins);
                const low = Array.isArray(this.env.actionSpace.low)
                    ? this.env.actionSpace.low[i] : this.env.actionSpace.low;
                const high = Array.isArray(this.env.actionSpace.high)
                    ? this.env.actionSpace.high[i] : this.env.actionSpace.high;
                action.push(low + (bin / (this.numBins - 1)) * (high - low));
            }
            return action;
        }

        const low = Array.isArray(this.env.actionSpace.low)
            ? this.env.actionSpace.low[0] : this.env.actionSpace.low;
        const high = Array.isArray(this.env.actionSpace.high)
            ? this.env.actionSpace.high[0] : this.env.actionSpace.high;
        const normalized = discreteAction / (this.numBins - 1);
        const value = low + normalized * (high - low);

        const action = [value];
        for (let i = 1; i < dim; i++) {
            const l = Array.isArray(this.env.actionSpace.low)
                ? this.env.actionSpace.low[i] : this.env.actionSpace.low;
            const h = Array.isArray(this.env.actionSpace.high)
                ? this.env.actionSpace.high[i] : this.env.actionSpace.high;
            action.push((l + h) / 2);
        }
        return action;
    }
}

export class ContinuousWrapper extends EnvironmentAdapter {
    constructor(env, options = {}) {
        super(env);
        const config = mergeConfig(CONTINUOUS_WRAPPER_DEFAULTS, options);
        this.scale = config.scale;
        this.embedding = config.embedding;

        if (this.isDiscrete) {
            const dim = config.embedding ? 8 : 1;
            this.actionSpace = new ActionSpace({
                type: 'Box', shape: [dim], low: config.scale[0], high: config.scale[1]
            });
        }
    }

    step(action) {
        return super.step(this._continuousToDiscrete(action));
    }

    _continuousToDiscrete(continuousAction) {
        if (!this.isDiscrete) return continuousAction;

        const n = this.env.actionSpace.n;

        if (this.embedding) {
            const value = Array.isArray(continuousAction) ? continuousAction[0] : continuousAction;
            const normalized = (value - this.scale[0]) / (this.scale[1] - this.scale[0]);
            return Math.floor(normalized * n);
        }

        const value = Array.isArray(continuousAction) ? continuousAction[0] : continuousAction;
        const normalized = (value - this.scale[0]) / (this.scale[1] - this.scale[0]);
        return Math.min(n - 1, Math.max(0, Math.floor(normalized * n)));
    }
}

export class HybridEnvironment extends RLEnvironment {
    constructor(baseEnv, options = {}) {
        super();
        const config = mergeConfig(HYBRID_ENV_DEFAULTS, options);
        this.baseEnv = baseEnv;
        this.adapter = new EnvironmentAdapter(baseEnv);
        this.discreteWrapper = new DiscreteWrapper(baseEnv, options);
        this.continuousWrapper = new ContinuousWrapper(baseEnv, options);
        this.mode = config.initialMode;
    }

    reset() {
        const result = this.adapter.reset();
        this._lastObservation = result.observation;
        return result;
    }

    step(action, mode = this.mode) {
        const effectiveMode = mode === 'auto'
            ? (this.adapter.isDiscrete ? 'discrete' : 'continuous') : mode;
        const result = effectiveMode === 'discrete'
            ? this.discreteWrapper.step(action) : this.continuousWrapper.step(action);
        this._lastObservation = result.observation;
        return result;
    }

    get actionSpace() {
        return {
            discrete: this.discreteWrapper.actionSpace,
            continuous: this.continuousWrapper.actionSpace,
            hybrid: { type: 'Hybrid', discrete: this.adapter.isDiscrete, continuous: this.adapter.isContinuous }
        };
    }

    get observationSpace() { return this.adapter.observationSpace; }
    setMode(mode) { this.mode = mode; }
    getMode() { return this.mode; }
    render() { return this.adapter.render(); }
    close() { return this.adapter.close(); }
}

/**
 * Environment Registry
 */
export class EnvironmentRegistry {
    constructor() {
        this.environments = new Map();
    }

    register(name, envClass, options = {}) {
        this.environments.set(name, { class: envClass, options });
        return this;
    }

    create(name, config = {}) {
        const entry = this.environments.get(name);
        if (!entry) {
            throw new Error(`Environment not found: ${name}`);
        }
        
        const env = new entry.class(config);
        return new EnvironmentAdapter(env);
    }

    createDiscrete(name, config = {}, wrapperOptions = {}) {
        const env = this.create(name, config);
        return new DiscreteWrapper(env.env, wrapperOptions);
    }

    createContinuous(name, config = {}, wrapperOptions = {}) {
        const env = this.create(name, config);
        return new ContinuousWrapper(env.env, wrapperOptions);
    }

    createHybrid(name, config = {}, wrapperOptions = {}) {
        const env = this.create(name, config).env;
        return new HybridEnvironment(env, wrapperOptions);
    }

    list() {
        return Array.from(this.environments.keys());
    }
}

/**
 * Global environment registry
 */
export const globalEnvRegistry = new EnvironmentRegistry();

// Register built-in environments
try {
    const envs = require('../environments');
    
    if (envs.CartPole) {
        globalEnvRegistry.register('CartPole', envs.CartPole);
    }
    if (envs.GridWorld) {
        globalEnvRegistry.register('GridWorld', envs.GridWorld);
    }
    if (envs.Continuous1D) {
        globalEnvRegistry.register('Continuous1D', envs.Continuous1D);
    }
    if (envs.CompositionalWorld) {
        globalEnvRegistry.register('CompositionalWorld', envs.CompositionalWorld);
    }
} catch (e) {
    // Environments not available
}
