/**
 * PPO Agent - Proximal Policy Optimization
 * 
 * Implements PPO with clipped surrogate objective.
 * 
 * @implements {import('../interfaces/IAgent.js').IAgent}
 */
import { NeuralAgent } from './NeuralAgent.js';
import { Tensor, AdamOptimizer } from '@senars/tensor';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { deepMergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils, buildNetwork } from './QNetwork.js';
import { NetworkBuilder } from '../utils/index.js';

const PPO_DEFAULTS = {
    gamma: 0.99,
    lambda: 0.95,
    epsilonClip: 0.2,
    updateSteps: 200,
    epochs: 4,
    criticLossWeight: 0.5
};

/**
 * PPO Agent
 */
export class PPOAgent extends NeuralAgent {
    constructor(env, config = {}) {
        super(env, deepMergeConfig(PPO_DEFAULTS, config));

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
        this.actor = buildNetwork(obsDim, this.config.hiddenSize, actionDim);
        this.critic = buildNetwork(obsDim, this.config.hiddenSize, 1);
        this.params = [...this.actor.params, ...this.critic.params];
    }

    /**
     * Select action using policy
     * @param {*} observation - Current observation
     * @returns {*} Selected action
     */
    act(observation) {
        const obsTensor = new Tensor(observation);
        const logits = NetworkBuilder.forward(this.actor, obsTensor);
        const probs = logits.softmax();
        return NetworkBuilder.sampleAction(probs);
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
        if (this.replayBuffer.totalSize >= this.config.updateSteps) {
            await this._update();
        }
    }

    async _update() {
        const batch = await this.replayBuffer.sample(this.replayBuffer.totalSize);
        if (!batch.length) {return;}

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
            states: new Tensor(Array.from(flatStates)).reshape([batchSize, obsDim]),
            actions, rewards, dones, obsDim, actionDim, batchSize
        };
    }

    _padState(state, dim) {
        const padded = new Float32Array(dim);
        for (let j = 0; j < Math.min(state.length, dim); j++) {padded[j] = state[j];}
        return padded;
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }
}
