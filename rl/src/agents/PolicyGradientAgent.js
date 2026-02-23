import { RLAgent } from '../core/RLAgent.js';
import { Tensor } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    lr: 0.01,
    gamma: 0.99,
    hiddenSize: 32
};

const PolicyUtils = {
    buildNetwork(obsDim, hiddenSize, outputDim) {
        const w1 = Tensor.zeros([hiddenSize, obsDim]);
        const b1 = Tensor.zeros([hiddenSize]);
        const w2 = Tensor.zeros([outputDim, hiddenSize]);
        const b2 = Tensor.zeros([outputDim]);

        [w1, b1, w2, b2].forEach(p => p.requiresGrad = true);

        return { w1, b1, w2, b2, params: [w1, b1, w2, b2] };
    },

    forward(model, obs, outputDim) {
        const x = new Tensor(obs, { requiresGrad: false });
        const xCol = x.reshape([x.shape[0], 1]);
        const h = model.w1.matmul(xCol).add(model.b1.reshape([model.b1.shape[0], 1])).relu();
        return model.w2.matmul(h).add(model.b2.reshape([outputDim, 1])).reshape([outputDim]);
    },

    sampleDiscrete(probsTensor) {
        const probs = probsTensor.data;
        const rand = Math.random();
        let sum = 0;
        for (let i = 0; i < probs.length; i++) {
            sum += probs[i];
            if (rand < sum) return i;
        }
        return probs.length - 1;
    },

    sampleContinuous(mean, std = 1.0) {
        const noise = Tensor.randn(mean.shape);
        return mean.add(noise);
    },

    computeLogProbDiscrete(logits, action) {
        const maskData = new Array(logits.shape[0]).fill(0);
        maskData[action] = 1;
        return logits.softmax().log().mul(new Tensor(maskData)).sum();
    },

    computeLogProbContinuous(action, mean, std = 1.0) {
        const diff = action.sub(mean);
        return diff.pow(2).mul(-0.5).sum();
    },

    computeReturns(rewards, gamma) {
        const returns = [];
        let R = 0;
        for (let i = rewards.length - 1; i >= 0; i--) {
            R = rewards[i] + gamma * R;
            returns.unshift(R);
        }
        return returns;
    },

    updateParams(params, lr) {
        params.forEach(p => {
            if (p.grad) {
                p.data.forEach((_, j) => {
                    p.data[j] -= lr * p.grad[j];
                });
                p.grad.fill(0);
            }
        });
    }
};

export class PolicyGradientAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig(DEFAULTS, config);

        this.logProbs = [];
        this.rewards = [];
        this._initNetwork();
    }

    _initNetwork() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionSpace = this.env.actionSpace;

        this.network = PolicyUtils.buildNetwork(obsDim, this.config.hiddenSize, 
            actionSpace.type === 'Discrete' ? actionSpace.n : actionSpace.shape[0]
        );
        this.outputDim = this.network.w2.shape[0];
        this.params = this.network.params;
    }

    act(observation) {
        const logits = PolicyUtils.forward(this.network, observation, this.outputDim);

        if (this.env.actionSpace.type === 'Discrete') {
            const probs = logits.softmax();
            const action = PolicyUtils.sampleDiscrete(probs);
            this.logProbs.push({ logits, action, type: 'discrete' });
            return action;
        }

        const actionTensor = PolicyUtils.sampleContinuous(logits);
        this.logProbs.push({ distParams: { mean: logits, std: 1.0 }, action: actionTensor, type: 'continuous' });
        return actionTensor.data;
    }

    learn(observation, action, reward, nextObservation, done) {
        this.rewards.push(reward);
        if (done) {
            this._updatePolicy();
            this.logProbs = [];
            this.rewards = [];
        }
    }

    _updatePolicy() {
        const returns = PolicyUtils.computeReturns(this.rewards, this.config.gamma);

        let loss = new Tensor([0], { requiresGrad: true });

        this.logProbs.forEach((item, i) => {
            const R_t = returns[i];
            let logProb;

            if (item.type === 'discrete') {
                logProb = PolicyUtils.computeLogProbDiscrete(item.logits, item.action);
            } else {
                logProb = PolicyUtils.computeLogProbContinuous(item.action, item.distParams.mean, item.distParams.std);
            }
            loss = loss.add(logProb.mul(-R_t));
        });

        loss.backward();
        PolicyUtils.updateParams(this.params, this.config.lr);
    }
}
