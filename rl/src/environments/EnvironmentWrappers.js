/**
 * Environment Wrappers
 * Composable wrappers for modifying environment behavior
 */
import { Environment } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const WRAPPER_DEFAULTS = {
    trackMetrics: true
};

/**
 * Base environment wrapper
 */
export class EnvironmentWrapper extends Environment {
    constructor(env, config = {}) {
        super(mergeConfig(WRAPPER_DEFAULTS, config));
        this.env = env;
        this._metricsTracker = this.config.trackMetrics ? new MetricsTracker() : null;
    }

    get metrics() {
        return this._metricsTracker;
    }

    async onInitialize() {
        await this.env.initialize?.();
    }

    async onShutdown() {
        await this.env.shutdown?.();
    }

    async reset(options = {}) {
        return this.env.reset(options);
    }

    async step(action) {
        return this.env.step(action);
    }

    render(mode) {
        return this.env.render?.(mode);
    }

    sampleAction() {
        return this.env.sampleAction();
    }

    get observationSpace() {
        return this.env.observationSpace;
    }

    get actionSpace() {
        return this.env.actionSpace;
    }

    get unwrapped() {
        return this.env.unwrapped ?? this.env;
    }
}

/**
 * Normalize observation wrapper
 */
export class NormalizeObservationWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.obsMean = null;
        this.obsStd = null;
        this.numObs = 0;
    }

    async step(action) {
        const result = await super.step(action);
        return {
            ...result,
            observation: this.normalize(result.observation)
        };
    }

    async reset(options = {}) {
        const result = await super.reset(options);
        return {
            ...result,
            observation: this.normalize(result.observation)
        };
    }

    normalize(obs) {
        if (!Array.isArray(obs)) {return obs;}

        // Update running statistics
        this.numObs++;
        const delta = obs.map((v, i) => v - (this.obsMean?.[i] ?? 0));
        
        if (!this.obsMean) {
            this.obsMean = [...obs];
            this.obsStd = new Array(obs.length).fill(0);
        } else {
            this.obsMean = this.obsMean.map((m, i) => m + delta[i] / this.numObs);
            this.obsStd = this.obsStd.map((s, i) => 
                s + delta[i] * (obs[i] - this.obsMean[i])
            );
        }

        // Normalize
        const std = this.obsStd?.map(s => Math.sqrt(s / this.numObs) || 1) || new Array(obs.length).fill(1);
        return obs.map((v, i) => (v - this.obsMean[i]) / (std[i] || 1));
    }
}

/**
 * Clip action wrapper
 */
export class ClipActionWrapper extends EnvironmentWrapper {
    async step(action) {
        const clippedAction = this._clip(action);
        return super.step(clippedAction);
    }

    _clip(action) {
        const space = this.actionSpace;
        if (space.type !== 'Box') {return action;}

        if (Array.isArray(action)) {
            return action.map((v, i) => Math.max(space.low[i], Math.min(space.high[i], v)));
        }
        return Math.max(space.low[0], Math.min(space.high[0], action));
    }
}

/**
 * Time limit wrapper
 */
export class TimeLimitWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.maxSteps = config.maxSteps ?? 1000;
        this.currentStep = 0;
    }

    async reset(options = {}) {
        this.currentStep = 0;
        return super.reset(options);
    }

    async step(action) {
        this.currentStep++;
        const result = await super.step(action);

        if (this.currentStep >= this.maxSteps) {
            result.truncated = true;
        }

        return result;
    }
}

/**
 * Reward scaling wrapper
 */
export class RewardScaleWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.scale = config.scale ?? 1.0;
        this.shift = config.shift ?? 0;
    }

    async step(action) {
        const result = await super.step(action);
        return {
            ...result,
            reward: result.reward * this.scale + this.shift
        };
    }
}

/**
 * Frame stack wrapper
 */
export class FrameStackWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.numFrames = config.numFrames ?? 4;
        this.frames = [];
    }

    async reset(options = {}) {
        this.frames = [];
        const result = await super.reset(options);

        for (let i = 0; i < this.numFrames; i++) {
            this.frames.push(result.observation);
        }

        return {
            ...result,
            observation: this._stack()
        };
    }

    async step(action) {
        const result = await super.step(action);
        this.frames.push(result.observation);
        this.frames.shift();

        return {
            ...result,
            observation: this._stack()
        };
    }

    _stack() {
        return this.frames.flat();
    }
}

/**
 * Discrete to continuous action wrapper
 */
export class DiscreteToContinuousWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.threshold = config.threshold ?? 0.0;
    }

    async step(action) {
        const discreteAction = action > this.threshold ? 1 : 0;
        return super.step(discreteAction);
    }
}

/**
 * Continuous to discrete action wrapper
 */
export class ContinuousToDiscreteWrapper extends EnvironmentWrapper {
    constructor(env, config = {}) {
        super(env, config);
        this.n = config.n ?? 2;
    }

    async step(action) {
        if (typeof action === 'number') {
            action = [action];
        }

        const continuous = action[0] ?? 0;
        const bucketSize = 2 / this.n;
        const discrete = Math.floor((continuous + 1) / bucketSize);

        return super.step(Math.max(0, Math.min(this.n - 1, discrete)));
    }
}
