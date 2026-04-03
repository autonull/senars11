import { Agent } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils } from './QNetwork.js';

const AGENT_DEFAULTS = {
    learningRate: 0.001,
    gamma: 0.99,
    hiddenSize: 64,
    batchSize: 64
};

export class NeuralAgent extends Agent {
    constructor(env, config = {}) {
        const mergedConfig = mergeConfig(AGENT_DEFAULTS, config);
        super(env, mergedConfig);
        this.optimizer = null;
        this.network = null;
        this.experienceBuffer = null;
        this.steps = 0;
    }

    async initialize() {
        await this.experienceBuffer?.initialize();
    }

    _initNetwork() {
        const obsDim = AgentFactoryUtils.getObsDim(this.env.observationSpace);
        const actionDim = AgentFactoryUtils.getActionDim(this.env.actionSpace);
        this.network = AgentFactoryUtils.buildNetwork(obsDim, this.config.hiddenSize, actionDim);
    }

    act(observation) {
        throw new Error('act() must be implemented by subclass');
    }

    learn(obs, action, reward, nextObs, done) {
        throw new Error('learn() must be implemented by subclass');
    }

    async close() {
        await this.experienceBuffer?.shutdown();
    }
}
