
import { RLAgent } from '../core/RLAgent.js';
import { Tensor } from '@senars/tensor';

export class PolicyGradientAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.lr = config.lr || 0.01;
        this.gamma = config.gamma || 0.99;
        this.hiddenSize = config.hiddenSize || 32;

        this.logProbs = [];
        this.rewards = [];
        this._initNetwork();
    }

    _initNetwork() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionSpace = this.env.actionSpace;

        try {
            this.w1 = Tensor.zeros([this.hiddenSize, obsDim]);
        } catch {
            this.w1 = new Tensor(new Array(this.hiddenSize * obsDim).fill(0)).reshape([this.hiddenSize, obsDim]);
        }
        this.w1.requiresGrad = true;
        this.b1 = Tensor.zeros([this.hiddenSize]);
        this.b1.requiresGrad = true;

        this.outputDim = actionSpace.type === 'Discrete' ? actionSpace.n : actionSpace.shape[0];
        this.w2 = Tensor.zeros([this.outputDim, this.hiddenSize]);
        this.w2.requiresGrad = true;
        this.b2 = Tensor.zeros([this.outputDim]);
        this.b2.requiresGrad = true;

        this.params = [this.w1, this.b1, this.w2, this.b2];
    }

    forward(obs) {
        const x = new Tensor(obs, { requiresGrad: false });
        const xCol = x.reshape([x.shape[0], 1]);
        const h = this.w1.matmul(xCol).add(this.b1.reshape([this.hiddenSize, 1])).relu();
        return this.w2.matmul(h).add(this.b2.reshape([this.outputDim, 1])).reshape([this.outputDim]);
    }

    act(observation) {
        const logits = this.forward(observation);

        if (this.env.actionSpace.type === 'Discrete') {
            const probs = logits.softmax();
            const action = this._sampleDiscrete(probs);
            this.logProbs.push({ logits, action, type: 'discrete' });
            return action;
        }

        const mean = logits;
        const noise = Tensor.randn(mean.shape);
        const actionTensor = mean.add(noise);
        this.logProbs.push({ distParams: { mean, std: 1.0 }, action: actionTensor, type: 'continuous' });
        return actionTensor.data;
    }

    _sampleDiscrete(probsTensor) {
        const probs = probsTensor.data;
        const rand = Math.random();
        let sum = 0;
        for (let i = 0; i < probs.length; i++) {
            sum += probs[i];
            if (rand < sum) return i;
        }
        return probs.length - 1;
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
        const returns = [];
        let R = 0;
        for (let i = this.rewards.length - 1; i >= 0; i--) {
            R = this.rewards[i] + this.gamma * R;
            returns.unshift(R);
        }

        let loss = new Tensor([0], { requiresGrad: true });

        this.logProbs.forEach((item, i) => {
            const R_t = returns[i];
            let logProb;

            if (item.type === 'discrete') {
                const maskData = new Array(this.outputDim).fill(0);
                maskData[item.action] = 1;
                logProb = item.logits.softmax().log().mul(new Tensor(maskData)).sum();
            } else {
                const diff = item.action.sub(item.distParams.mean);
                logProb = diff.pow(2).mul(-0.5).sum();
            }
            loss = loss.add(logProb.mul(-R_t));
        });

        loss.backward();

        for (const p of this.params) {
            if (p.grad) {
                for (let j = 0; j < p.data.length; j++) {
                    p.data[j] -= this.lr * p.grad[j];
                }
                p.grad.fill(0);
            }
        }
    }
}
