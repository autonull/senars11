/**
 * Environment Factory and Registry
 * Factory pattern for creating and managing environments
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
 * Enhanced environment with metrics and episode recording
 */
export class EnhancedEnvironment extends RLEnvironment {
    constructor(env, config = {}) {
        super(mergeConfig(ENV_DEFAULTS, config));
        this.env = env;
        this._metricsTracker = new MetricsTracker({
            episodes: 0,
            totalReward: 0,
            bestReward: -Infinity,
            avgReward: 0
        });
        this.episodeHistory = [];
        this.currentEpisode = [];
    }

    get metrics() {
        return this._metricsTracker;
    }

    async onInitialize() {
        await this.env.initialize?.();
    }

    async reset(options = {}) {
        this.currentEpisode = [];
        const result = await this.env.reset(options);
        return result;
    }

    async step(action) {
        const result = await this.env.step(action);
        this.currentEpisode.push({
            observation: result.observation,
            action,
            reward: result.reward
        });

        if (result.terminated || result.truncated) {
            this._episodeComplete(result.reward);
        }

        return result;
    }

    _episodeComplete(reward) {
        this._metricsTracker.increment('episodes');
        this._metricsTracker.add('totalReward', reward);
        
        if (reward > this._metricsTracker.get('bestReward')) {
            this._metricsTracker.set('bestReward', reward);
        }

        const episodes = this._metricsTracker.get('episodes');
        const total = this._metricsTracker.get('totalReward');
        this._metricsTracker.set('avgReward', total / episodes);

        this.episodeHistory.push({
            episode: episodes,
            reward,
            steps: this.currentEpisode.length,
            trajectory: this.config.recordEpisodes ? [...this.currentEpisode] : null
        });
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

    getEpisodeHistory() {
        return [...this.episodeHistory];
    }

    async onShutdown() {
        await this.env.shutdown?.();
    }
}

/**
 * Environment factory
 */
export class EnvironmentFactory {
    static environments = new Map();
    static wrappers = new Map();

    /**
     * Register environment
     * @param {string} name - Environment name
     * @param {Function} factory - Factory function
     */
    static register(name, factory) {
        this.environments.set(name, factory);
    }

    /**
     * Register wrapper
     * @param {string} name - Wrapper name
     * @param {Function} wrapperClass - Wrapper class
     */
    static registerWrapper(name, wrapperClass) {
        this.wrappers.set(name, wrapperClass);
    }

    /**
     * Create environment
     * @param {string} name - Environment name
     * @param {object} config - Configuration
     * @returns {Promise<RLEnvironment>} Environment instance
     */
    static async create(name, config = {}) {
        const factory = this.environments.get(name);
        if (!factory) {
            throw new Error(`Unknown environment: ${name}`);
        }

        const env = await factory(config);
        return this.applyWrappers(env, config.wrappers);
    }

    /**
     * Apply wrappers to environment
     * @param {RLEnvironment} env - Environment
     * @param {Array} wrappers - Wrapper configs
     * @returns {RLEnvironment} Wrapped environment
     */
    static applyWrappers(env, wrappers = []) {
        let wrapped = env;

        for (const wrapper of wrappers) {
            const WrapperClass = this.wrappers.get(wrapper.name);
            if (!WrapperClass) {
                throw new Error(`Unknown wrapper: ${wrapper.name}`);
            }
            wrapped = new WrapperClass(wrapped, wrapper.config);
        }

        return wrapped;
    }

    /**
     * Wrap existing environment
     * @param {RLEnvironment} env - Environment
     * @param {Array} wrappers - Wrapper configs
     * @returns {RLEnvironment} Wrapped environment
     */
    static wrap(env, wrappers = []) {
        return this.applyWrappers(env, wrappers);
    }

    /**
     * List registered environments
     * @returns {string[]} Environment names
     */
    static list() {
        return Array.from(this.environments.keys());
    }

    /**
     * List registered wrappers
     * @returns {string[]} Wrapper names
     */
    static listWrappers() {
        return Array.from(this.wrappers.keys());
    }

    /**
     * Clear all registrations
     */
    static clear() {
        this.environments.clear();
        this.wrappers.clear();
    }
}

/**
 * Environment registry (singleton)
 */
export class EnvironmentRegistry {
    constructor() {
        this.factories = new Map();
        this.environments = new Map();
    }

    register(name, factory) {
        this.factories.set(name, factory);
    }

    async get(name, config = {}) {
        const factory = this.factories.get(name);
        if (!factory) {
            throw new Error(`Unknown environment: ${name}`);
        }

        const env = await factory(config);
        this.environments.set(name, env);
        return env;
    }

    has(name) {
        return this.factories.has(name);
    }

    list() {
        return Array.from(this.factories.keys());
    }

    clear() {
        this.factories.clear();
        this.environments.clear();
    }
}

export const globalEnvRegistry = new EnvironmentRegistry();

/**
 * Convenience functions
 */
export const wrapEnv = (env, wrappers) => EnvironmentFactory.wrap(env, wrappers);
export const makeEnv = (name, config = {}) => EnvironmentFactory.create(name, config);
