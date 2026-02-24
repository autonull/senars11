/**
 * Unified Agent System
 * Leverages tensor/Module patterns for cleaner architecture
 */
import { RLAgent } from '../core/RLAgent.js';
import { Tensor, AdamOptimizer, LossFunctor, Module, Linear, Sequential } from '@senars/tensor';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { PolicyUtils } from '../utils/PolicyUtils.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const AGENT_DEFAULTS = {
    learningRate: 0.001,
    gamma: 0.99,
    hiddenSize: 64,
    batchSize: 64
};

/**
 * Q-Network Module using tensor/Module patterns
 */
class QNetwork extends Module {
    constructor(inputDim, hiddenDim, outputDim, backend) {
        super();
        this.module('fc1', new Linear(inputDim, hiddenDim, { backend }));
        this.module('fc2', new Linear(hiddenDim, outputDim, { backend }));
        this.backend = backend;
    }

    forward(input) {
        let x = input;
        x = this._modules.get('fc1').forward(x);
        x = this.backend.relu(x);
        x = this._modules.get('fc2').forward(x);
        return x;
    }
}

const AgentFactoryUtils = {
    createSeededRandom(seed) {
        let state = seed;
        return () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    },

    getActionDim(actionSpace) {
        if (actionSpace.type === 'Discrete') return actionSpace.n;
        if (actionSpace.type === 'Box') return actionSpace.shape[0];
        throw new Error('Unknown action space type');
    },

    getObsDim(obsSpace) {
        return obsSpace.shape?.[0] ?? 1;
    },

    sampleAction(actionSpace, policy, deterministic = false) {
        if (actionSpace.type === 'Discrete') {
            const probs = policy.softmax();
            return deterministic ? PolicyUtils.argmax(probs.data) : PolicyUtils.sampleCategorical(probs.data);
        }
        const noise = Tensor.randn(policy.shape);
        return policy.add(noise).data;
    },

    createQNetwork(inputDim, hiddenDim, outputDim, backend) {
        return new QNetwork(inputDim, hiddenDim, outputDim, backend);
    }
};

export class NeuralAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig(AGENT_DEFAULTS, config);
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

export class DQNAgent extends NeuralAgent {
    constructor(env, config = {}) {
        super(env, mergeConfig({
            gamma: 0.99,
            epsilon: 1.0,
            epsilonMin: 0.01,
            epsilonDecay: 0.995,
            batchSize: 64,
            memorySize: 10000,
            targetUpdate: 100,
            useCausalIndexing: false
        }, config));

        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.lossFn = new LossFunctor();
        this.targetNet = null;
        this.replayBuffer = new ExperienceBuffer({
            capacity: this.config.memorySize,
            batchSize: this.config.batchSize,
            sampleStrategy: 'random',
            useCausalIndexing: this.config.useCausalIndexing
        });
    }

    async initialize() {
        await super.initialize();
        this._initNetworks();
    }

    _initNetworks() {
        const obsDim = AgentFactoryUtils.getObsDim(this.env.observationSpace);
        const actionDim = AgentFactoryUtils.getActionDim(this.env.actionSpace);
        const { torch } = require('@senars/tensor');
        
        this.qNet = AgentFactoryUtils.createQNetwork(obsDim, this.config.hiddenSize, actionDim, torch);
        this.targetNet = AgentFactoryUtils.createQNetwork(obsDim, this.config.hiddenSize, actionDim, torch);
        this._updateTargetNetwork();
    }

    _updateTargetNetwork() {
        // Copy parameters from qNet to targetNet using Module's state dict
        const stateDict = this.qNet.stateDict();
        this.targetNet.loadStateDict(stateDict);
    }

    act(observation) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * this.env.actionSpace.n);
        }
        const input = new Tensor(observation);
        const qValues = this.qNet.forward(input);
        return PolicyUtils.argmax(qValues.data);
    }

    async learn(obs, action, reward, nextObs, done) {
        await this.replayBuffer.store(new CausalExperience({ state: obs, action, reward, nextState: nextObs, done }));

        if (done && this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }

        if (++this.steps % this.config.targetUpdate === 0) {
            this._updateTargetNetwork();
        }

        if (this.replayBuffer.totalSize >= this.config.batchSize) {
            await this._trainStep();
        }
    }

    async _trainStep() {
        const batch = await this.replayBuffer.sample(this.config.batchSize);
        if (!batch.length) return;

        const { states, nextStates, actions, rewards, dones, obsDim, actionDim, batchSize } =
            this._prepareBatch(batch);

        const nextQ = NetworkBuilder.forward(this.targetNet, nextStates);
        const maxNextQ = this._computeMaxNextQ(nextQ.data, dones, batchSize, actionDim);
        const targets = rewards.map((r, i) => r + this.config.gamma * maxNextQ[i]);

        const currentQ = NetworkBuilder.forward(this.qNet, states);
        const { mask, targetTensor } = this._createTargetTensors(targets, actions, batchSize, actionDim);

        const loss = currentQ.sub(targetTensor).mul(mask).pow(2).mean();
        this.optimizer.zeroGrad(this.qNet.params);
        loss.backward();
        this.optimizer.step(this.qNet.params);
    }

    _prepareBatch(batch) {
        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;
        const batchSize = batch.length;

        const flatStates = new Float32Array(batchSize * obsDim);
        const flatNextStates = new Float32Array(batchSize * obsDim);
        const actions = new Int32Array(batchSize);
        const rewards = new Float32Array(batchSize);
        const dones = new Uint8Array(batchSize);

        for (let i = 0; i < batchSize; i++) {
            const e = batch[i];
            flatStates.set(e.state.length === obsDim ? e.state : this._padState(e.state, obsDim), i * obsDim);
            flatNextStates.set(e.nextState.length === obsDim ? e.nextState : this._padState(e.nextState, obsDim), i * obsDim);
            actions[i] = e.action;
            rewards[i] = e.reward;
            dones[i] = e.done ? 1 : 0;
        }

        return {
            states: new Tensor(flatStates).reshape([batchSize, obsDim]),
            nextStates: new Tensor(flatNextStates).reshape([batchSize, obsDim]),
            actions, rewards, dones, obsDim, actionDim, batchSize
        };
    }

    _padState(state, dim) {
        const padded = new Float32Array(dim);
        for (let j = 0; j < Math.min(state.length, dim); j++) padded[j] = state[j];
        return padded;
    }

    _computeMaxNextQ(nextQData, dones, batchSize, actionDim) {
        const maxQ = new Float32Array(batchSize);
        for (let i = 0; i < batchSize; i++) {
            if (dones[i]) { maxQ[i] = 0; continue; }
            let maxVal = -Infinity;
            for (let j = 0; j < actionDim; j++) {
                const val = nextQData[i * actionDim + j];
                if (val > maxVal) maxVal = val;
            }
            maxQ[i] = maxVal;
        }
        return maxQ;
    }

    _createTargetTensors(targets, actions, batchSize, actionDim) {
        const maskData = new Float32Array(batchSize * actionDim);
        const targetData = new Float32Array(batchSize * actionDim);
        for (let i = 0; i < batchSize; i++) {
            const idx = i * actionDim + actions[i];
            maskData[idx] = 1;
            targetData[idx] = targets[i];
        }
        return {
            mask: new Tensor(maskData).reshape([batchSize, actionDim]),
            targetTensor: new Tensor(targetData).reshape([batchSize, actionDim])
        };
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }
}

export class PPOAgent extends NeuralAgent {
    constructor(env, config = {}) {
        super(env, mergeConfig({
            gamma: 0.99,
            lambda: 0.95,
            epsilonClip: 0.2,
            updateSteps: 200,
            epochs: 4,
            criticLossWeight: 0.5
        }, config));

        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.actor = null;
        this.critic = null;
        this.params = [];
        this.replayBuffer = new ExperienceBuffer({
            capacity: this.config.updateSteps * 10,
            batchSize: this.config.batchSize,
            sampleStrategy: 'random'
        });
    }

    async initialize() {
        await super.initialize();
        this._initNetwork();
    }

    _initNetwork() {
        const obsDim = AgentFactoryUtils.getObsDim(this.env.observationSpace);
        const actionDim = AgentFactoryUtils.getActionDim(this.env.actionSpace);
        this.actor = AgentFactoryUtils.buildNetwork(obsDim, this.config.hiddenSize, actionDim);
        this.critic = AgentFactoryUtils.buildNetwork(obsDim, this.config.hiddenSize, 1);
        this.params = [...this.actor.params, ...this.critic.params];
    }

    act(observation) {
        const obsTensor = new Tensor(observation);
        const logits = NetworkBuilder.forward(this.actor, obsTensor);
        const probs = logits.softmax();
        return NetworkBuilder.sampleAction(probs);
    }

    async learn(obs, action, reward, nextObs, done) {
        await this.replayBuffer.store(new CausalExperience({ state: obs, action, reward, nextState: nextObs, done }));
        if (this.replayBuffer.totalSize >= this.config.updateSteps) {
            await this._update();
        }
    }

    async _update() {
        const batch = await this.replayBuffer.sample(this.replayBuffer.totalSize);
        if (!batch.length) return;

        const { states, actions, rewards, dones, obsDim, actionDim, batchSize } = this._prepareBatch(batch);
        const values = NetworkBuilder.forward(this.critic, states).data;

        const lastNextVal = NetworkBuilder.forward(this.critic, new Tensor(batch[batch.length - 1].nextState)).data[0] ?? 0;
        const { advantages, returns } = NetworkBuilder.computeGAE(
            values, rewards, dones, this.config.gamma, this.config.lambda, lastNextVal
        );

        const actionMask = NetworkBuilder.createActionMask(actions, actionDim, batchSize);
        const advTensor = new Tensor(advantages).reshape([batchSize, 1]);
        const retTensor = new Tensor(returns).reshape([batchSize, 1]);

        for (let epoch = 0; epoch < this.config.epochs; epoch++) {
            const logits = NetworkBuilder.forward(this.actor, states);
            const newValues = NetworkBuilder.forward(this.critic, states);
            const logProbs = logits.softmax().log().mul(actionMask).sum(1);

            const policyLoss = logProbs.mul(advTensor).mean().mul(-1);
            const valueLoss = newValues.sub(retTensor).pow(2).mean();
            const loss = policyLoss.add(valueLoss.mul(this.config.criticLossWeight));

            this.optimizer.zeroGrad(this.params);
            loss.backward();
            this.optimizer.step(this.params);
        }

        this.replayBuffer.clearOld(0);
    }

    _prepareBatch(batch) {
        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;
        const batchSize = batch.length;

        const flatStates = new Float32Array(batchSize * obsDim);
        const actions = new Int32Array(batchSize);
        const rewards = new Float32Array(batchSize);
        const dones = new Uint8Array(batchSize);

        for (let i = 0; i < batchSize; i++) {
            const exp = batch[i];
            flatStates.set(exp.state.length === obsDim ? exp.state : this._padState(exp.state, obsDim), i * obsDim);
            actions[i] = exp.action;
            rewards[i] = exp.reward;
            dones[i] = exp.done ? 1 : 0;
        }

        return {
            states: new Tensor(flatStates).reshape([batchSize, obsDim]),
            actions, rewards, dones, obsDim, actionDim, batchSize
        };
    }

    _padState(state, dim) {
        const padded = new Float32Array(dim);
        for (let j = 0; j < Math.min(state.length, dim); j++) padded[j] = state[j];
        return padded;
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }
}

export class PolicyGradientAgent extends NeuralAgent {
    constructor(env, config = {}) {
        super(env, mergeConfig({
            lr: 0.01,
            gamma: 0.99,
            hiddenSize: 32
        }, config));

        this.logProbs = [];
        this.rewards = [];
    }

    async initialize() {
        await super.initialize();
        this._initNetwork();
    }

    _initNetwork() {
        super._initNetwork();
        this.outputDim = this.network.w2.shape[0];
        this.params = this.network.params;
    }

    act(observation) {
        const logits = NetworkBuilder.forward(this.network, observation, this.outputDim);

        if (this.env.actionSpace.type === 'Discrete') {
            const probs = logits.softmax();
            const action = PolicyUtils.sampleCategorical(probs.data);
            this.logProbs.push({ logits, action, type: 'discrete' });
            return action;
        }

        const actionTensor = this._sampleContinuous(logits);
        this.logProbs.push({ distParams: { mean: logits, std: 1.0 }, action: actionTensor, type: 'continuous' });
        return actionTensor.data;
    }

    _sampleContinuous(mean) {
        const noise = Tensor.randn(mean.shape);
        return mean.add(noise);
    }

    async learn(observation, action, reward, nextObservation, done) {
        this.rewards.push(reward);
        if (done) {
            await this._updatePolicy();
            this.logProbs = [];
            this.rewards = [];
        }
    }

    async _updatePolicy() {
        const returns = this._computeReturns(this.rewards, this.config.gamma);
        let loss = new Tensor([0], { requiresGrad: true });

        this.logProbs.forEach((item, i) => {
            const R_t = returns[i];
            const logProb = item.type === 'discrete'
                ? this._computeLogProbDiscrete(item.logits, item.action)
                : this._computeLogProbContinuous(item.action, item.distParams.mean, item.distParams.std);
            loss = loss.add(logProb.mul(-R_t));
        });

        loss.backward();
        this._updateParams(this.params, this.config.lr);
    }

    _computeLogProbDiscrete(logits, action) {
        const maskData = new Array(logits.shape[0]).fill(0);
        maskData[action] = 1;
        return logits.softmax().log().mul(new Tensor(maskData)).sum();
    }

    _computeLogProbContinuous(action, mean, std = 1.0) {
        const diff = action.sub(mean);
        return diff.pow(2).mul(-0.5).sum();
    }

    _computeReturns(rewards, gamma) {
        const returns = [];
        let R = 0;
        for (let i = rewards.length - 1; i >= 0; i--) {
            R = rewards[i] + gamma * R;
            returns.unshift(R);
        }
        return returns;
    }

    _updateParams(params, lr) {
        params.forEach(p => {
            if (p.grad) {
                p.data.forEach((_, j) => { p.data[j] -= lr * p.grad[j]; });
                p.grad.fill(0);
            }
        });
    }
}

export class RandomAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig({ seed: null }, config);
        if (this.config.seed !== null) {
            this._random = AgentFactoryUtils.createSeededRandom(this.config.seed);
        }
    }

    act(observation) {
        const actionSpace = this.env.actionSpace;
        if (actionSpace.type === 'Discrete') {
            return Math.floor(this._random() * actionSpace.n);
        }
        if (actionSpace.type === 'Box') {
            const { shape, low, high } = actionSpace;
            return Array.from({ length: shape[0] }, (_, i) => {
                const l = Array.isArray(low) ? low[i] : low;
                const h = Array.isArray(high) ? high[i] : high;
                return this._random() * (h - l) + l;
            });
        }
        throw new Error('Unknown action space type');
    }

    learn() { /* Random agent doesn't learn */ }

    _random() {
        return this._random ?? Math.random;
    }
}

export class AgentBuilder {
    constructor(env) {
        this.env = env;
        this.config = {};
    }

    static create(env) {
        return new AgentBuilder(env);
    }

    dqn(config = {}) {
        return new DQNAgent(this.env, config);
    }

    ppo(config = {}) {
        return new PPOAgent(this.env, config);
    }

    policyGradient(config = {}) {
        return new PolicyGradientAgent(this.env, config);
    }

    random(config = {}) {
        return new RandomAgent(this.env, config);
    }

    withConfig(config) {
        this.config = { ...this.config, ...config };
        return this;
    }
}

export { AgentFactoryUtils };
export { AgentFactoryUtils as AgentUtils };

// Re-export specialized agents from standalone files
export { MeTTaAgent } from './MeTTaAgent.js';
export { ProgrammaticAgent } from './ProgrammaticAgent.js';
export { NeuroSymbolicAgent } from './NeuroSymbolicAgent.js';
