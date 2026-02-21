/**
 * Unified Training Loop
 * Multiple learning paradigms with neurosymbolic synergy.
 */
import { Component } from '../composable/Component.js';
import { ConfigManager, HyperparameterSpaces } from '../config/ConfigManager.js';
import { PluginManager, PluginPresets } from '../plugins/PluginSystem.js';
import { ArchitectureFactory } from '../architecture/NeuroSymbolicArchitecture.js';
import { WorldModel } from '../neurosymbolic/WorldModel.js';
import { SkillDiscoveryEngine } from '../skills/HierarchicalSkillSystem.js';
import { CausalReasoner, CausalGraph } from '../reasoning/CausalReasoning.js';

/**
 * Training Configuration
 */
export class TrainingConfig {
    constructor(config = {}) {
        this.episodes = config.episodes ?? 1000;
        this.maxSteps = config.maxSteps ?? 500;
        this.batchSize = config.batchSize ?? 64;
        this.updateFrequency = config.updateFrequency ?? 1;
        this.targetUpdateFrequency = config.targetUpdateFrequency ?? 100;
        this.evalFrequency = config.evalFrequency ?? 50;
        this.saveFrequency = config.saveFrequency ?? 100;
        this.seed = config.seed ?? 42;
        
        // Learning paradigms
        this.paradigms = {
            modelFree: config.modelFree ?? true,
            modelBased: config.modelBased ?? false,
            offline: config.offline ?? false,
            multiTask: config.multiTask ?? false,
            meta: config.meta ?? false,
            hierarchical: config.hierarchical ?? false,
            causal: config.causal ?? false
        };
        
        // Components
        this.useWorldModel = config.useWorldModel ?? false;
        this.useSkillDiscovery = config.useSkillDiscovery ?? false;
        this.useCausalReasoning = config.useCausalReasoning ?? false;
        this.useIntrinsicMotivation = config.useIntrinsicMotivation ?? false;
        
        // Hyperparameters
        this.hyperparams = config.hyperparams ?? {};
    }
}

/**
 * Training Episode Result
 */
export class EpisodeResult {
    constructor(episode, reward, steps, success = false, info = {}) {
        this.episode = episode;
        this.reward = reward;
        this.steps = steps;
        this.success = success;
        this.info = info;
        this.timestamp = Date.now();
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Unified Training Loop
 */
export class TrainingLoop extends Component {
    constructor(agent, env, config = new TrainingConfig()) {
        super(config);
        
        this.agent = agent;
        this.env = env;
        this.config = config;
        
        // Configuration manager
        this.configManager = new ConfigManager({
            learningRate: 0.001,
            explorationRate: 0.1,
            discountFactor: 0.99
        });
        
        // Plugin manager
        this.pluginManager = new PluginManager();
        
        // Optional components
        this.worldModel = config.useWorldModel ? new WorldModel() : null;
        this.skillDiscovery = config.useSkillDiscovery ? new SkillDiscoveryEngine() : null;
        this.causalReasoner = config.useCausalReasoning ? new CausalReasoner() : null;
        
        // Training state
        this.currentEpisode = 0;
        this.totalSteps = 0;
        this.episodeHistory = [];
        this.metrics = {
            rewards: [],
            lengths: [],
            successes: [],
            losses: []
        };
        
        // Callbacks
        this.callbacks = {
            onEpisodeStart: [],
            onEpisodeEnd: [],
            onStep: [],
            onEval: [],
            onSave: []
        };
    }

    /**
     * Initialize training loop.
     */
    async onInitialize() {
        // Initialize agent
        await this.agent?.initialize?.();
        
        // Initialize optional components
        await this.worldModel?.initialize?.();
        await this.skillDiscovery?.initialize?.();
        await this.causalReasoner?.initialize?.();
        
        // Install plugins
        await this.pluginManager.installAll({
            agent: this.agent,
            env: this.env,
            config: this.configManager
        });
        
        // Set random seed
        if (this.config.seed) {
            this.seedRandom(this.config.seed);
        }
        
        this.emit('initialized', { config: this.config });
    }

    /**
     * Run training.
     */
    async train(options = {}) {
        const {
            episodes = this.config.episodes,
            progressCallback = null
        } = options;
        
        this.emit('trainingStart', { episodes });
        
        for (let episode = 0; episode < episodes; episode++) {
            this.currentEpisode = episode;
            
            // Run episode
            const result = await this.runEpisode();
            this.episodeHistory.push(result);
            
            // Update metrics
            this.updateMetrics(result);
            
            // Progress callback
            if (progressCallback) {
                progressCallback({
                    episode,
                    total: episodes,
                    reward: result.reward,
                    avgReward: this.getAverageReward(100)
                });
            }
            
            // Periodic evaluation
            if (episode % this.config.evalFrequency === 0 && episode > 0) {
                const evalResult = await this.evaluate();
                this.emit('evaluation', evalResult);
            }
            
            // Periodic saving
            if (episode % this.config.saveFrequency === 0 && episode > 0) {
                await this.save();
            }
            
            // Early stopping
            if (this.shouldStop()) {
                this.emit('earlyStop', { episode, reason: 'convergence' });
                break;
            }
        }
        
        await this.shutdown();
        
        return this.getTrainingSummary();
    }

    /**
     * Run single episode.
     */
    async runEpisode() {
        // Callbacks
        for (const cb of this.callbacks.onEpisodeStart) {
            await cb({ episode: this.currentEpisode });
        }
        
        let state = this.env.reset();
        let totalReward = 0;
        let steps = 0;
        const trajectory = [];
        
        // Get current exploration rate
        const explorationRate = this.configManager.get('explorationRate');
        
        while (steps < this.config.maxSteps) {
            // Get action
            const action = await this.selectAction(state.observation, explorationRate);
            
            // Step environment
            const result = this.env.step(action);
            
            // Store transition
            const transition = {
                state: state.observation,
                action,
                reward: result.reward,
                nextState: result.observation,
                done: result.terminated,
                info: result.info
            };
            
            trajectory.push(transition);
            totalReward += result.reward;
            steps++;
            
            // Step callback
            for (const cb of this.callbacks.onStep) {
                await cb({ transition, step: steps });
            }
            
            // Learn from transition
            await this.learn(transition);
            
            state = result;
            
            if (result.terminated) break;
        }
        
        this.totalSteps += steps;
        
        // Episode end callbacks
        for (const cb of this.callbacks.onEpisodeEnd) {
            await cb({ episode: this.currentEpisode, result: { totalReward, steps, trajectory } });
        }
        
        return new EpisodeResult(this.currentEpisode, totalReward, steps, state.terminated, {
            trajectory: this.config.paradigms.modelBased ? trajectory : undefined
        });
    }

    /**
     * Select action with exploration.
     */
    async selectAction(observation, explorationRate) {
        // Plugin hook for action selection
        const modified = await this.pluginManager.executeHook('select-action', {
            observation,
            explorationRate,
            episode: this.currentEpisode
        });
        
        // Epsilon-greedy exploration
        if (Math.random() < modified.explorationRate) {
            return this.explore(modified.observation);
        }
        
        return this.agent.act(modified.observation);
    }

    /**
     * Explore (random action).
     */
    explore(observation) {
        const actionSpace = this.env.actionSpace;
        
        if (actionSpace.type === 'Discrete') {
            return Math.floor(Math.random() * actionSpace.n);
        }
        
        // Continuous action space
        return actionSpace.low.map((low, i) => 
            low + Math.random() * (actionSpace.high[i] - low)
        );
    }

    /**
     * Learn from transition.
     */
    async learn(transition) {
        // Plugin hook for learning
        const modified = await this.pluginManager.executeHook('learn', {
            transition,
            episode: this.currentEpisode
        });
        
        // Model-free learning
        if (this.config.paradigms.modelFree) {
            await this.agent.learn?.(
                modified.transition.state,
                modified.transition.action,
                modified.transition.reward,
                modified.transition.nextState,
                modified.transition.done
            );
        }
        
        // World model learning
        if (this.worldModel && this.config.paradigms.modelBased) {
            await this.worldModel.train([modified.transition], 1);
        }
        
        // Skill discovery
        if (this.skillDiscovery) {
            this.skillDiscovery.processTransition(modified.transition);
        }
        
        // Causal learning
        if (this.causalReasoner) {
            this.updateCausalGraph(modified.transition);
        }
        
        // Intrinsic motivation
        if (this.config.useIntrinsicMotivation) {
            const intrinsicReward = await this.computeIntrinsicReward(modified.transition);
            modified.transition.reward += intrinsicReward;
        }
    }

    /**
     * Update causal graph from transition.
     */
    updateCausalGraph(transition) {
        if (!this.causalReasoner) return;
        
        const graph = this.causalReasoner.graph;
        
        // Add nodes for state variables
        const stateVars = this.extractVariables(transition.state);
        const nextVars = this.extractVariables(transition.nextState);
        
        for (const [varId, value] of Object.entries(stateVars)) {
            if (!graph.nodes.has(varId)) {
                graph.addNode(varId, { type: 'state' });
            }
            graph.observe(varId, value);
        }
        
        // Learn causal structure
        if (this.totalSteps % 100 === 0) {
            graph.learnStructure([this.episodeHistory.flatMap(e => e.info.trajectory ?? [])]);
        }
    }

    /**
     * Extract variables from state.
     */
    extractVariables(state) {
        if (Array.isArray(state)) {
            return Object.fromEntries(state.map((v, i) => [`var_${i}`, v]));
        }
        if (typeof state === 'object') {
            return state;
        }
        return { value: state };
    }

    /**
     * Compute intrinsic reward.
     */
    async computeIntrinsicReward(transition) {
        const result = await this.pluginManager.executeHook('reward', 
            transition.reward,
            transition
        );
        return result - transition.reward;
    }

    /**
     * Evaluate agent.
     */
    async evaluate(episodes = 5) {
        const rewards = [];
        const lengths = [];
        
        // Temporarily disable exploration
        const savedExploration = this.configManager.get('explorationRate');
        this.configManager.set('explorationRate', 0);
        
        for (let i = 0; i < episodes; i++) {
            let state = this.env.reset();
            let totalReward = 0;
            let steps = 0;
            
            while (steps < this.config.maxSteps) {
                const action = await this.agent.act(state.observation);
                state = this.env.step(action);
                totalReward += state.reward;
                steps++;
                
                if (state.terminated) break;
            }
            
            rewards.push(totalReward);
            lengths.push(steps);
        }
        
        // Restore exploration
        this.configManager.set('explorationRate', savedExploration);
        
        const result = {
            meanReward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
            stdReward: this.std(rewards),
            meanLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
            episodes
        };
        
        // Eval callbacks
        for (const cb of this.callbacks.onEval) {
            await cb(result);
        }
        
        return result;
    }

    /**
     * Save training state.
     */
    async save() {
        const state = {
            episode: this.currentEpisode,
            totalSteps: this.totalSteps,
            metrics: this.metrics,
            config: this.config
        };
        
        // Save callbacks
        for (const cb of this.callbacks.onSave) {
            await cb(state);
        }
        
        this.emit('saved', state);
        return state;
    }

    /**
     * Update metrics.
     */
    updateMetrics(result) {
        this.metrics.rewards.push(result.reward);
        this.metrics.lengths.push(result.steps);
        this.metrics.successes.push(result.success ? 1 : 0);
        
        // Keep last N episodes
        const keep = 1000;
        if (this.metrics.rewards.length > keep) {
            for (const key of Object.keys(this.metrics)) {
                this.metrics[key] = this.metrics[key].slice(-keep);
            }
        }
    }

    /**
     * Get average reward over last N episodes.
     */
    getAverageReward(n = 100) {
        const recent = this.metrics.rewards.slice(-n);
        return recent.length > 0 
            ? recent.reduce((a, b) => a + b, 0) / recent.length 
            : 0;
    }

    /**
     * Check if training should stop.
     */
    shouldStop() {
        // Convergence check
        if (this.metrics.rewards.length < 100) return false;
        
        const recent = this.metrics.rewards.slice(-50);
        const prev = this.metrics.rewards.slice(-100, -50);
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
        
        // Stop if improvement is less than 1%
        return Math.abs(recentAvg - prevAvg) / (Math.abs(prevAvg) || 1) < 0.01;
    }

    /**
     * Get training summary.
     */
    getTrainingSummary() {
        return {
            episodes: this.currentEpisode,
            totalSteps: this.totalSteps,
            finalReward: this.getAverageReward(100),
            bestReward: Math.max(...this.metrics.rewards),
            successRate: this.metrics.successes.reduce((a, b) => a + b, 0) / this.metrics.successes.length,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Register callback.
     */
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
        return () => {
            const idx = this.callbacks[event].indexOf(callback);
            if (idx >= 0) this.callbacks[event].splice(idx, 1);
        };
    }

    /**
     * Seed random number generator.
     */
    seedRandom(seed) {
        // Simple LCG for reproducibility
        let state = seed;
        Math.random = () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }

    /**
     * Compute standard deviation.
     */
    std(arr) {
        if (arr.length < 2) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }

    async onShutdown() {
        await this.pluginManager.uninstallAll();
        await this.worldModel?.shutdown?.();
        await this.skillDiscovery?.shutdown?.();
        await this.causalReasoner?.shutdown?.();
    }
}

/**
 * Training Presets
 */
export const TrainingPresets = {
    /**
     * Quick prototype training
     */
    prototype: new TrainingConfig({
        episodes: 100,
        maxSteps: 200,
        batchSize: 32,
        evalFrequency: 20
    }),

    /**
     * Standard training
     */
    standard: new TrainingConfig({
        episodes: 1000,
        maxSteps: 500,
        batchSize: 64,
        evalFrequency: 50,
        useWorldModel: false
    }),

    /**
     * Model-based training
     */
    modelBased: new TrainingConfig({
        episodes: 500,
        maxSteps: 500,
        batchSize: 64,
        paradigms: { modelFree: true, modelBased: true },
        useWorldModel: true
    }),

    /**
     * Hierarchical training
     */
    hierarchical: new TrainingConfig({
        episodes: 2000,
        maxSteps: 1000,
        paradigms: { hierarchical: true },
        useSkillDiscovery: true
    }),

    /**
     * Causal-aware training
     */
    causal: new TrainingConfig({
        episodes: 1500,
        maxSteps: 500,
        paradigms: { causal: true },
        useCausalReasoning: true
    })
};
