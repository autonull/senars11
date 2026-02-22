import { Component } from '../composable/Component.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { PluginManager } from '../plugins/PluginSystem.js';
import { ArchitectureFactory } from '../architectures/NeuroSymbolicArchitecture.js';
import { WorldModel } from '../neurosymbolic/WorldModel.js';
import { SkillDiscovery } from '../skills/SkillDiscovery.js';
import { CausalReasoner, CausalGraph } from '../reasoning/CausalReasoning.js';
import { ExperienceBuffer } from '../experience/ExperienceBuffer.js';
import { MetaController } from '../meta/MetaController.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    episodes: 1000,
    maxSteps: 500,
    batchSize: 64,
    updateFrequency: 1,
    targetUpdateFrequency: 100,
    evalFrequency: 50,
    saveFrequency: 100,
    seed: 42,
    modelFree: true,
    modelBased: false,
    offline: false,
    multiTask: false,
    meta: false,
    hierarchical: false,
    causal: false,
    useWorldModel: false,
    useSkillDiscovery: false,
    useCausalReasoning: false,
    useIntrinsicMotivation: false
};

export class TrainingConfig {
    constructor(config = {}) {
        const merged = mergeConfig(DEFAULTS, config);
        Object.assign(this, merged);
        this.paradigms = {
            modelFree: merged.modelFree,
            modelBased: merged.modelBased,
            offline: merged.offline,
            multiTask: merged.multiTask,
            meta: merged.meta,
            hierarchical: merged.hierarchical,
            causal: merged.causal
        };
        this.hyperparams = config.hyperparams ?? {};
    }
}

export class EpisodeResult {
    constructor(episode, reward, steps, success = false, info = {}) {
        this.episode = episode;
        this.reward = reward;
        this.steps = steps;
        this.success = success;
        this.info = info;
        this.timestamp = Date.now();
    }

    toJSON() { return { ...this }; }
}

export class TrainingLoop extends Component {
    constructor(agent, env, config = new TrainingConfig()) {
        super(config);
        this.agent = agent;
        this.env = env;
        this.config = config;

        this.configManager = new ConfigManager({ learningRate: 0.001, explorationRate: 0.1, discountFactor: 0.99 });
        this.pluginManager = new PluginManager();
        this.experienceBuffer = new ExperienceBuffer({ capacity: 50000, batchSize: config.batchSize, sampleStrategy: 'prioritized', useCausalIndexing: config.causal });
        this.worldModel = config.useWorldModel ? new WorldModel() : null;
        this.skillDiscovery = config.useSkillDiscovery || config.hierarchical ? new SkillDiscovery() : null;
        this.causalReasoner = config.useCausalReasoning || config.causal ? new CausalReasoner({ graph: new CausalGraph() }) : null;
        this.metaController = config.meta ? new MetaController() : null;

        this.episodeHistory = [];
        this.currentEpisode = 0;
        this.bestReward = -Infinity;
    }

    async onInitialize() {
        await this.pluginManager.installAll({ agent: this.agent, env: this.env });
        await this.experienceBuffer.initialize();
        await this.worldModel?.initialize();
        await this.skillDiscovery?.initialize();
        await this.causalReasoner?.initialize();
        await this.metaController?.initialize();

        this.emit('initialized', { config: this.config });
    }

    async run() {
        this.emit('trainingStarted', { episodes: this.config.episodes });

        for (let ep = 0; ep < this.config.episodes; ep++) {
            this.currentEpisode = ep;
            const result = await this.runEpisode();

            this.episodeHistory.push(result);
            if (result.reward > this.bestReward) this.bestReward = result.reward;

            await this.learn(result);

            if (ep % this.config.evalFrequency === 0) {
                const evalResult = await this.evaluate();
                this.emit('evaluation', { episode: ep, ...evalResult });
            }

            if (ep % this.config.saveFrequency === 0) {
                this.emit('checkpoint', { episode: ep, state: this.getState() });
            }

            if (ep % 10 === 0) {
                this.emit('progress', {
                    episode: ep,
                    reward: result.reward,
                    avgReward: this._runningAvg(10),
                    bestReward: this.bestReward
                });
            }
        }

        this.emit('trainingCompleted', { bestReward: this.bestReward, history: this.episodeHistory });
        return { bestReward: this.bestReward, history: this.episodeHistory };
    }

    async runEpisode() {
        const { observation } = this.env.reset();
        let state = observation;
        let totalReward = 0;
        let steps = 0;

        for (let step = 0; step < this.config.maxSteps; step++) {
            const action = await this.agent.act(state, {
                explorationRate: this.configManager.get('explorationRate'),
                useWorldModel: this.worldModel !== null
            });

            const result = this.env.step(action);
            const { observation: nextState, reward, terminated, truncated } = result;

            await this.agent.learn({ state, action, reward, nextState, done: terminated || truncated }, reward);

            await this.experienceBuffer.store({ state, action, reward, nextState, done: terminated || truncated });

            if (this.worldModel) {
                await this.worldModel.update(state, action, nextState, reward);
            }

            if (this.causalReasoner) {
                await this.causalReasoner.learn(JSON.stringify(state), JSON.stringify(nextState), { action, reward });
            }

            totalReward += reward;
            state = nextState;
            steps++;

            if (terminated || truncated) break;
        }

        return new EpisodeResult(this.currentEpisode, totalReward, steps, totalReward > 0);
    }

    async learn(episodeResult) {
        if (this.currentEpisode % this.config.updateFrequency !== 0) return;

        const batch = await this.experienceBuffer.sample(this.config.batchSize);
        if (batch.length === 0) return;

        for (const experience of batch) {
            await this.agent.learn(experience, experience.reward);
        }

        if (this.worldModel && this.config.modelBased) {
            const imaginedExperiences = await this.worldModel.generateImaginedExperiences(10);
            for (const exp of imaginedExperiences) {
                await this.agent.learn(exp, exp.reward);
            }
        }

        if (this.skillDiscovery) {
            const experiences = batch.map(e => ({ state: e.state, action: e.action, reward: e.reward, nextState: e.nextState }));
            await this.skillDiscovery.discoverSkills(experiences);
        }

        if (this.metaController) {
            await this.metaController.evaluatePerformance(episodeResult.reward);
        }
    }

    async evaluate() {
        const evalEpisodes = [];

        for (let ep = 0; ep < 5; ep++) {
            const { observation } = this.env.reset();
            let state = observation;
            let totalReward = 0;

            for (let step = 0; step < this.config.maxSteps; step++) {
                const action = await this.agent.act(state, { explorationRate: 0 });
                const result = this.env.step(action);
                totalReward += result.reward;
                state = result.observation;
                if (result.terminated || result.truncated) break;
            }

            evalEpisodes.push(totalReward);
        }

        const mean = evalEpisodes.reduce((a, b) => a + b, 0) / evalEpisodes.length;
        const std = Math.sqrt(evalEpisodes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / evalEpisodes.length);

        return { meanReward: mean, stdReward: std, episodes: evalEpisodes };
    }

    _runningAvg(window = 100) {
        const recent = this.episodeHistory.slice(-window);
        return recent.reduce((a, b) => a + b.reward, 0) / recent.length;
    }

    getState() {
        return {
            currentEpisode: this.currentEpisode,
            bestReward: this.bestReward,
            configManager: this.configManager.getAll(),
            episodeHistory: this.episodeHistory.slice(-100)
        };
    }

    async onShutdown() {
        await this.pluginManager.shutdown();
        await this.experienceBuffer.shutdown();
        await this.worldModel?.shutdown();
        await this.skillDiscovery?.shutdown();
        await this.causalReasoner?.shutdown();
        await this.metaController?.shutdown();
    }
}

export class TrainingPresets {
    static dqn(env, config = {}) {
        return new TrainingConfig({
            ...config,
            episodes: 500,
            batchSize: 32,
            useWorldModel: false,
            useSkillDiscovery: false
        });
    }

    static ppo(env, config = {}) {
        return new TrainingConfig({
            ...config,
            episodes: 1000,
            batchSize: 64,
            updateFrequency: 200,
            useWorldModel: false
        });
    }

    static modelBased(env, config = {}) {
        return new TrainingConfig({
            ...config,
            episodes: 500,
            modelBased: true,
            useWorldModel: true
        });
    }

    static hierarchical(env, config = {}) {
        return new TrainingConfig({
            ...config,
            episodes: 2000,
            hierarchical: true,
            useSkillDiscovery: true
        });
    }

    static causal(env, config = {}) {
        return new TrainingConfig({
            ...config,
            episodes: 1000,
            causal: true,
            useCausalReasoning: true
        });
    }
}
