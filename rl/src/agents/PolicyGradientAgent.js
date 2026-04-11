/**
 * Policy Gradient Agent
 *
 * Implements REINFORCE algorithm with baseline.
 *
 * @implements {import('../interfaces/IAgent.js').IAgent}
 */
import {NeuralAgent} from './NeuralAgent.js';
import {Tensor} from '@senars/tensor';
import {deepMergeConfig} from '../utils/ConfigHelper.js';
import {NetworkBuilder, PolicyUtils} from '../utils/index.js';

const PG_DEFAULTS = {
    lr: 0.01,
    gamma: 0.99,
    hiddenSize: 32
};

/**
 * Policy Gradient Agent (REINFORCE)
 */
export class PolicyGradientAgent extends NeuralAgent {
    constructor(env, config = {}) {
        super(env, deepMergeConfig(PG_DEFAULTS, config));

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

    /**
     * Select action using policy
     * @param {*} observation - Current observation
     * @returns {*} Selected action
     */
    act(observation) {
        const logits = NetworkBuilder.forward(this.network, observation, this.outputDim);

        if (this.env.actionSpace.type === 'Discrete') {
            const probs = logits.softmax();
            const action = PolicyUtils.sampleCategorical(probs.data);
            this.logProbs.push({logits, action, type: 'discrete'});
            return action;
        }

        const actionTensor = this._sampleContinuous(logits);
        this.logProbs.push({distParams: {mean: logits, std: 1.0}, action: actionTensor, type: 'continuous'});
        return actionTensor.data;
    }

    _sampleContinuous(mean) {
        const noise = Tensor.randn(mean.shape);
        return mean.add(noise);
    }

    /**
     * Learn from experience (episodic update)
     * @param {*} observation - Current observation
     * @param {*} action - Action taken
     * @param {number} reward - Reward received
     * @param {*} nextObservation - Next observation
     * @param {boolean} done - Whether episode terminated
     */
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
        let loss = new Tensor([0], {requiresGrad: true});

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
                p.data.forEach((_, j) => {
                    p.data[j] -= lr * p.grad[j];
                });
                p.grad.fill(0);
            }
        });
    }
}
