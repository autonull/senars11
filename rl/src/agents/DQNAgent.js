/**
 * DQN Agent - Deep Q-Network
 * 
 * Implements Deep Q-Learning with experience replay and target network.
 * 
 * @implements {import('../interfaces/IAgent.js').IAgent}
 */
import { NeuralAgent } from './AgentSystem.js';
import { Tensor, AdamOptimizer, LossFunctor } from '@senars/tensor';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { PolicyUtils } from '../utils/PolicyUtils.js';
import { deepMergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils, QNetwork } from './QNetwork.js';
import { torch } from '@senars/tensor';

const DQN_DEFAULTS = {
    gamma: 0.99,
    epsilon: 1.0,
    epsilonMin: 0.01,
    epsilonDecay: 0.995,
    batchSize: 64,
    memorySize: 10000,
    targetUpdate: 100,
    useCausalIndexing: false
};

/**
 * Deep Q-Network Agent
 */
export class DQNAgent extends NeuralAgent {
    /**
     * Create DQN Agent
     * @param {import('../interfaces/IEnvironment.js').IEnvironment} env - Environment
     * @param {Object} config - Configuration
     * @param {number} config.gamma - Discount factor
     * @param {number} config.epsilon - Exploration rate
     * @param {number} config.epsilonMin - Minimum exploration rate
     * @param {number} config.epsilonDecay - Exploration decay rate
     * @param {number} config.batchSize - Training batch size
     * @param {number} config.memorySize - Replay buffer capacity
     * @param {number} config.targetUpdate - Target network update frequency
     * @param {boolean} config.useCausalIndexing - Use causal indexing
     */
    constructor(env, config = {}) {
        super(env, deepMergeConfig(DQN_DEFAULTS, config));

        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.lossFn = new LossFunctor();
        this.targetNet = null;
        this.qNet = null;
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

        this.qNet = AgentFactoryUtils.createQNetwork(obsDim, this.config.hiddenSize, actionDim, torch);
        this.targetNet = AgentFactoryUtils.createQNetwork(obsDim, this.config.hiddenSize, actionDim, torch);
        this._updateTargetNetwork();
    }

    _updateTargetNetwork() {
        const stateDict = this.qNet.stateDict();
        this.targetNet.loadStateDict(stateDict);
    }

    /**
     * Select action using epsilon-greedy policy
     * @param {*} observation - Current observation
     * @returns {number} Selected action
     */
    act(observation) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * this.env.actionSpace.n);
        }
        const input = new Tensor(observation);
        const qValues = this.qNet.forward(input);
        return PolicyUtils.argmax(qValues.data);
    }

    /**
     * Learn from experience
     * @param {*} obs - Observation
     * @param {*} action - Action taken
     * @param {number} reward - Reward received
     * @param {*} nextObs - Next observation
     * @param {boolean} done - Whether episode terminated
     */
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
        if (!batch || batch.length < this.config.batchSize) {return;}

        const { states, nextStates, actions, rewards, dones, obsDim, actionDim, batchSize } =
            this._prepareBatch(batch);

        const nextQ = this.targetNet.forward(nextStates);
        const maxNextQ = this._computeMaxNextQ(nextQ.data, dones, batchSize, actionDim);
        const targets = rewards.map((r, i) => r + this.config.gamma * maxNextQ[i]);

        const loss = this._computeQ_loss(states, targets, actions, batchSize, actionDim);
        this.optimizer.zeroGrad(this.qNet.parameters());
        loss.backward();
        this.optimizer.step(this.qNet.parameters());
    }

    _computeQ_loss(states, targets, actions, batchSize, actionDim) {
        const currentQ = this.qNet.forward(states);
        const currentQData = currentQ.data;
        
        let totalLoss = 0;
        for (let i = 0; i < batchSize; i++) {
            const qValue = currentQData[i * actionDim + actions[i]];
            const target = targets[i];
            const diff = qValue - target;
            totalLoss += diff * diff;
        }
        
        return new Tensor([totalLoss / batchSize]);
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
            const stateArr = Array.isArray(e.state) ? e.state : [e.state];
            const nextStateArr = Array.isArray(e.nextState) ? e.nextState : [e.nextState];
            flatStates.set(stateArr.length === obsDim ? stateArr : this._padState(stateArr, obsDim), i * obsDim);
            flatNextStates.set(nextStateArr.length === obsDim ? nextStateArr : this._padState(nextStateArr, obsDim), i * obsDim);
            actions[i] = e.action;
            rewards[i] = e.reward;
            dones[i] = e.done ? 1 : 0;
        }

        return {
            states: new Tensor(Array.from(flatStates)).reshape([batchSize, obsDim]),
            nextStates: new Tensor(Array.from(flatNextStates)).reshape([batchSize, obsDim]),
            actions, rewards, dones, obsDim, actionDim, batchSize
        };
    }

    _padState(state, dim) {
        const padded = new Float32Array(dim);
        for (let j = 0; j < Math.min(state.length, dim); j++) {padded[j] = state[j];}
        return padded;
    }

    _computeMaxNextQ(nextQData, dones, batchSize, actionDim) {
        const maxQ = new Float32Array(batchSize);
        for (let i = 0; i < batchSize; i++) {
            if (dones[i]) { maxQ[i] = 0; continue; }
            let maxVal = -Infinity;
            for (let j = 0; j < actionDim; j++) {
                const val = nextQData[i * actionDim + j];
                if (val > maxVal) {maxVal = val;}
            }
            maxQ[i] = maxVal;
        }
        return maxQ;
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }
}
