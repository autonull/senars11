/**
 * Enhanced Core System
 * Unified framework for RL agents, environments, and core abstractions
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const AGENT_DEFAULTS = {
    training: true,
    explorationRate: 0.1,
    discountFactor: 0.99,
    learningRate: 0.001,
    savePath: './models',
    loadPath: './models'
};

const ENV_DEFAULTS = {
    maxSteps: 1000,
    renderMode: null,
    seed: null
};

const ARCH_DEFAULTS = {
    autoInitialize: true,
    trackMetrics: true
};

/**
 * Enhanced RL Agent with metrics and state management
 */
export class RLAgent extends Component {
    constructor(env, config = {}) {
        super(mergeConfig(AGENT_DEFAULTS, config));
        this.env = env;
        this.training = this.config.training;
        this.metrics = new MetricsTracker({
            episodesCompleted: 0,
            totalSteps: 0,
            totalReward: 0,
            bestReward: -Infinity
        });
        this.currentEpisodeReward = 0;
    }

    async onInitialize() {
        this.emit('initialized', { env: this.env?.constructor?.name ?? 'Unknown' });
    }

    /**
     * Select action given observation
     * @param {*} observation - Current observation
     * @param {*} options - Additional options (exploration, goal, etc.)
     * @returns {*} Selected action
     */
    act(observation, options = {}) {
        throw new Error('act(observation, options) must be implemented by subclass');
    }

    /**
     * Learn from transition
     * @param {*} observation - Current observation
     * @param {*} action - Taken action
     * @param {*} reward - Received reward
     * @param {*} nextObservation - Next observation
     * @param {*} done - Whether episode terminated
     * @returns {*} Learning result
     */
    async learn(observation, action, reward, nextObservation, done, options = {}) {
        this.currentEpisodeReward += reward;
        this.metrics.increment('totalSteps');
        this.metrics.set('totalReward', this.metrics.get('totalReward') + reward);

        if (done) {
            this.metrics.increment('episodesCompleted');
            if (this.currentEpisodeReward > this.metrics.get('bestReward')) {
                this.metrics.set('bestReward', this.currentEpisodeReward);
            }
            this.currentEpisodeReward = 0;
        }

        return { learned: true };
    }

    /**
     * Save agent to disk
     * @param {string} path - Save path
     * @returns {*} Save result
     */
    async save(path = this.config.savePath) {
        return { saved: true, path };
    }

    /**
     * Load agent from disk
     * @param {string} path - Load path
     * @returns {*} Load result
     */
    async load(path = this.config.loadPath) {
        return { loaded: true, path };
    }

    /**
     * Set training mode
     * @param {boolean} training - Training mode
     */
    setTraining(training) {
        this.training = training;
        this.emit('trainingChanged', { training });
    }

    /**
     * Get agent statistics
     * @returns {*} Agent statistics
     */
    getStats() {
        return {
            training: this.training,
            metrics: this.metrics.getAll(),
            currentEpisodeReward: this.currentEpisodeReward
        };
    }

    /**
     * Reset agent state for new episode
     */
    reset() {
        this.currentEpisodeReward = 0;
        this.emit('reset', {});
    }

    async onShutdown() {
        this.emit('shutdown', {});
    }

    // Factory methods
    static create(env, config = {}) {
        return new RLAgent(env, config);
    }

    static createTraining(env, config = {}) {
        return new RLAgent(env, { ...config, training: true });
    }

    static createEvaluation(env, config = {}) {
        return new RLAgent(env, { ...config, training: false });
    }
}

/**
 * Enhanced RL Environment with metrics and wrappers
 */
export class RLEnvironment extends Component {
    constructor(config = {}) {
        super(mergeConfig(ENV_DEFAULTS, config));
        this.currentSteps = 0;
        this.totalSteps = 0;
        this.totalEpisodes = 0;
        this.metrics = new MetricsTracker({
            episodesCompleted: 0,
            totalSteps: 0,
            totalReward: 0
        });
    }

    async onInitialize() {
        this.emit('initialized', { name: this.constructor?.name ?? 'Environment' });
    }

    /**
     * Reset environment to initial state
     * @param {*} options - Reset options
     * @returns {{observation: *, info: Object}} Initial observation and info
     */
    reset(options = {}) {
        this.currentSteps = 0;
        this.totalEpisodes++;
        this.metrics.increment('episodesCompleted');
        return { observation: null, info: {} };
    }

    /**
     * Execute action in environment
     * @param {*} action - Action to execute
     * @returns {{observation: *, reward: number, terminated: boolean, truncated: boolean, info: Object}}
     */
    step(action) {
        this.currentSteps++;
        this.totalSteps++;
        this.metrics.increment('totalSteps');
        return {
            observation: null,
            reward: 0,
            terminated: false,
            truncated: this.currentSteps >= this.config.maxSteps,
            info: {}
        };
    }

    /**
     * Render environment
     * @param {string} mode - Render mode
     * @returns {*} Render output
     */
    render(mode = this.config.renderMode) {
        return null;
    }

    /**
     * Close environment and release resources
     */
    close() {
        this.emit('closed', {});
    }

    /**
     * Seed environment for reproducibility
     * @param {number} seed - Random seed
     * @returns {*} Seed result
     */
    seed(seed = this.config.seed) {
        return { seeded: true, seed };
    }

    /**
     * Get observation space
     * @returns {Object} Observation space specification
     */
    get observationSpace() {
        throw new Error('observationSpace getter must be implemented by subclass');
    }

    /**
     * Get action space
     * @returns {Object} Action space specification
     */
    get actionSpace() {
        throw new Error('actionSpace getter must be implemented by subclass');
    }

    /**
     * Get environment statistics
     * @returns {*} Environment statistics
     */
    getStats() {
        return {
            currentSteps: this.currentSteps,
            totalSteps: this.totalSteps,
            totalEpisodes: this.totalEpisodes,
            metrics: this.metrics.getAll()
        };
    }

    /**
     * Check if action is valid
     * @param {*} action - Action to check
     * @returns {boolean} Whether action is valid
     */
    isValidAction(action) {
        return this.actionSpace.contains?.(action) ?? true;
    }

    /**
     * Sample random action
     * @returns {*} Random action
     */
    sampleAction() {
        return this.actionSpace.sample?.() ?? 0;
    }

    /**
     * Sample random observation
     * @returns {*} Random observation
     */
    sampleObservation() {
        return this.observationSpace.sample?.() ?? null;
    }

    // Factory methods
    static create(config = {}) {
        return new RLEnvironment(config);
    }

    static createDiscrete(actionN, obsDim = 4, config = {}) {
        return new DiscreteEnvironment(actionN, obsDim, config);
    }

    static createContinuous(actionDim, obsDim = 4, config = {}) {
        return new ContinuousEnvironment(actionDim, obsDim, config);
    }
}

/**
 * Simple discrete environment for testing
 */
export class DiscreteEnvironment extends RLEnvironment {
    constructor(actionN = 4, obsDim = 4, config = {}) {
        super(config);
        this._actionN = actionN;
        this._obsDim = obsDim;
        this._state = new Array(obsDim).fill(0);
    }

    reset(options = {}) {
        super.reset(options);
        this._state = Array.from({ length: this._obsDim }, () => Math.random() * 2 - 1);
        return { observation: [...this._state], info: {} };
    }

    step(action) {
        super.step(action);
        const reward = Math.random() * 2 - 1;
        this._state = Array.from({ length: this._obsDim }, () => Math.random() * 2 - 1);
        const terminated = Math.random() < 0.1;
        
        return {
            observation: [...this._state],
            reward,
            terminated,
            truncated: this.currentSteps >= this.config.maxSteps,
            info: {}
        };
    }

    get observationSpace() {
        return {
            type: 'Box',
            shape: [this._obsDim],
            low: -1,
            high: 1
        };
    }

    get actionSpace() {
        return {
            type: 'Discrete',
            n: this._actionN
        };
    }
}

/**
 * Simple continuous environment for testing
 */
export class ContinuousEnvironment extends RLEnvironment {
    constructor(actionDim = 2, obsDim = 4, config = {}) {
        super(config);
        this._actionDim = actionDim;
        this._obsDim = obsDim;
        this._state = new Array(obsDim).fill(0);
    }

    reset(options = {}) {
        super.reset(options);
        this._state = Array.from({ length: this._obsDim }, () => Math.random() * 2 - 1);
        return { observation: [...this._state], info: {} };
    }

    step(action) {
        super.step(action);
        const reward = Math.random() * 2 - 1;
        this._state = Array.from({ length: this._obsDim }, () => Math.random() * 2 - 1);
        const terminated = Math.random() < 0.1;
        
        return {
            observation: [...this._state],
            reward,
            terminated,
            truncated: this.currentSteps >= this.config.maxSteps,
            info: {}
        };
    }

    get observationSpace() {
        return {
            type: 'Box',
            shape: [this._obsDim],
            low: -1,
            high: 1
        };
    }

    get actionSpace() {
        return {
            type: 'Box',
            shape: [this._actionDim],
            low: -1,
            high: 1
        };
    }
}

/**
 * Enhanced Architecture base class
 */
export class Architecture extends Component {
    constructor(agent, config = {}) {
        super(mergeConfig(ARCH_DEFAULTS, config));
        this.agent = agent;
        this.initialized = false;
        this.metrics = this.config.trackMetrics ? new MetricsTracker() : null;
    }

    async onInitialize() {
        this.initialized = true;
        this.emit('initialized', { agent: this.agent?.constructor?.name ?? 'Unknown' });
    }

    /**
     * Select action given observation and optional goal
     * @param {*} observation - Current observation
     * @param {*} goal - Optional goal
     * @returns {Promise<*>} Selected action
     */
    async act(observation, goal = null) {
        throw new Error('act(observation, goal) must be implemented by subclass');
    }

    /**
     * Learn from transition
     * @param {*} observation - Current observation
     * @param {*} action - Taken action
     * @param {*} reward - Received reward
     * @param {*} nextObservation - Next observation
     * @param {*} done - Whether episode terminated
     * @returns {*} Learning result
     */
    async learn(observation, action, reward, nextObservation, done) {
        if (this.metrics) {
            this.metrics.increment('learningSteps');
        }
        return { learned: true };
    }

    /**
     * Close architecture and release resources
     */
    async close() {
        this.initialized = false;
        this.emit('closed', {});
    }

    /**
     * Get architecture statistics
     * @returns {*} Architecture statistics
     */
    getStats() {
        return {
            initialized: this.initialized,
            metrics: this.metrics?.getAll() ?? {}
        };
    }

    // Factory methods
    static create(agent, config = {}) {
        return new Architecture(agent, config);
    }

    static createWithMetrics(agent, config = {}) {
        return new Architecture(agent, { ...config, trackMetrics: true });
    }
}

/**
 * Enhanced Grounding base class
 */
export class Grounding extends Component {
    constructor(config = {}) {
        super(config);
        this.metrics = new MetricsTracker({ liftsPerformed: 0, groundingsPerformed: 0 });
    }

    /**
     * Lift raw observation to symbolic representation
     * @param {*} raw - Raw observation
     * @returns {string|Object} Symbolic representation
     */
    lift(raw) {
        this.metrics.increment('liftsPerformed');
        throw new Error('lift(raw) must be implemented by subclass');
    }

    /**
     * Ground symbolic representation to raw data/action
     * @param {*} symbol - Symbolic representation
     * @returns {*} Raw data or action
     */
    ground(symbol) {
        this.metrics.increment('groundingsPerformed');
        throw new Error('ground(symbol) must be implemented by subclass');
    }

    /**
     * Update grounding with new observation-symbol pair
     * @param {*} raw - Raw observation
     * @param {*} symbol - Symbolic representation
     */
    update(raw, symbol) {
        this.metrics.increment('updatesPerformed');
    }

    /**
     * Get grounding statistics
     * @returns {*} Grounding statistics
     */
    getStats() {
        return { metrics: this.metrics.getAll() };
    }

    // Factory methods
    static create(config = {}) {
        return new Grounding(config);
    }

    static createLearned(config = {}) {
        return new LearnedGrounding(config);
    }

    static createSymbolic(config = {}) {
        return new SymbolicGrounding(config);
    }
}

/**
 * Simple symbolic grounding
 */
export class SymbolicGrounding extends Grounding {
    lift(raw) {
        super.lift(raw);
        return typeof raw === 'number' ? `val_${raw}` : `obs_${JSON.stringify(raw)}`;
    }

    ground(symbol) {
        super.ground(symbol);
        if (typeof symbol === 'string' && symbol.startsWith('val_')) {
            return parseFloat(symbol.slice(4));
        }
        return symbol;
    }
}

/**
 * Simple learned grounding
 */
export class LearnedGrounding extends Grounding {
    constructor(config = {}) {
        super(config);
        this.conceptMap = new Map();
        this.counter = 0;
    }

    lift(raw) {
        super.lift(raw);
        const key = Array.isArray(raw) ? raw.join('_') : String(raw);
        if (!this.conceptMap.has(key)) {
            this.conceptMap.set(key, `concept_${this.counter++}`);
        }
        return this.conceptMap.get(key);
    }

    ground(symbol) {
        super.ground(symbol);
        for (const [key, sym] of this.conceptMap) {
            if (sym === symbol) {
                return key.split('_').map(Number);
            }
        }
        return symbol;
    }

    update(raw, symbol) {
        super.update(raw, symbol);
        const key = Array.isArray(raw) ? raw.join('_') : String(raw);
        this.conceptMap.set(key, symbol);
    }

    clear() {
        this.conceptMap.clear();
        this.counter = 0;
    }
}

/**
 * Tensor primitives registration
 */
export class TensorPrimitives {
    static register(metta) {
        if (!metta?.ground) return false;

        const { Tensor, TensorFunctor } = require('@senars/tensor');
        const functor = new TensorFunctor();
        const ground = metta.ground;

        const ops = [
            'matmul', 'add', 'sub', 'mul', 'div',
            'relu', 'sigmoid', 'tanh', 'softmax',
            'sum', 'mean', 'max', 'min',
            'exp', 'log', 'pow',
            'reshape', 'transpose'
        ];

        ops.forEach(name => {
            ground.register(`&${name}`, (...args) => {
                const unwrapped = args.map(a => TensorPrimitives._unwrap(a));
                return TensorPrimitives._wrap(functor.evaluate({ operator: name, components: unwrapped }, new Map()));
            });
        });

        ground.register('&tensor', list => {
            const shape = list.toString().slice(1, -1).trim().split(/\s+/).map(Number);
            return TensorPrimitives._wrap(new Tensor(new Array(shape.reduce((a, b) => a * b, 1)).fill(0), { shape }));
        });

        return true;
    }

    static _wrap(t) {
        return { type: 'Value', value: t, toString: () => t?.toString() ?? '' };
    }

    static _unwrap(atom) {
        if (!atom) return null;
        if (atom.type === 'Value' && atom.value) return atom.value;
        if (atom.type === 'Symbol') {
            const name = atom.name;
            if (name.startsWith('(')) {
                const { Tensor } = require('@senars/tensor');
                return new Tensor(name.slice(1, -1).trim().split(/\s+/).map(Number));
            }
        }
        return atom;
    }
}

// Aliases for backward compatibility
export { RLAgent as Agent };
export { RLEnvironment as Environment };
export { Architecture as Arch };
export { Grounding as Ground };
