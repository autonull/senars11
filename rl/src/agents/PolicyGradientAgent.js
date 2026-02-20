
import { RLAgent } from './RLAgent.js';
import { Tensor, torch } from '@senars/tensor';
// We might need an optimizer, let's assume one is available or we implement a simple SGD step

/**
 * A simple Policy Gradient (REINFORCE) agent.
 * Supports Discrete and Box (Continuous) action spaces.
 */
export class PolicyGradientAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.lr = config.lr || 0.01;
        this.gamma = config.gamma || 0.99;
        this.hiddenSize = config.hiddenSize || 32;

        // Episode buffer
        this.logProbs = [];
        this.rewards = [];

        this._initNetwork();
    }

    _initNetwork() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionSpace = this.env.actionSpace;

        try {
            this.w1 = Tensor.zeros([this.hiddenSize, obsDim]);
        } catch (e) {
            // Fallback if Tensor.zeros fails
            this.w1 = new Tensor(new Array(this.hiddenSize * obsDim).fill(0));
            this.w1 = this.w1.reshape([this.hiddenSize, obsDim]);
        }
        this.w1.requiresGrad = true;

        this.b1 = Tensor.zeros([this.hiddenSize]);
        this.b1.requiresGrad = true;

        if (actionSpace.type === 'Discrete') {
            this.outputDim = actionSpace.n;
            this.w2 = Tensor.zeros([this.outputDim, this.hiddenSize]);
            this.w2.requiresGrad = true;
            this.b2 = Tensor.zeros([this.outputDim]);
            this.b2.requiresGrad = true;
        } else {
            this.outputDim = actionSpace.shape[0];
            this.w2 = Tensor.zeros([this.outputDim, this.hiddenSize]);
            this.w2.requiresGrad = true;
            this.b2 = Tensor.zeros([this.outputDim]);
            this.b2.requiresGrad = true;
        }

        this.params = [this.w1, this.b1, this.w2, this.b2];
    }

    forward(obs) {
        // Obs to Tensor
        const x = new Tensor(obs, { requiresGrad: false }); // Shape [obsDim] or [1, obsDim]?
        // Let's assume input is [obsDim], we might need to reshape to [obsDim, 1] for matmul
        // If w1 is [hidden, obs], x should be [obs, 1] or handle implicit

        // Let's reshape x to column vector [obsDim, 1]
        const xCol = x.reshape([x.shape[0], 1]);

        // h = relu(w1 @ x + b1)
        // w1: [hidden, obs], x: [obs, 1] -> [hidden, 1]
        // b1: [hidden] -> broadcast?

        // Tensor lib might expect explicit broadcasting or shape matching
        const h = this.w1.matmul(xCol).add(this.b1.reshape([this.hiddenSize, 1])).relu();

        // out = w2 @ h + b2
        const out = this.w2.matmul(h).add(this.b2.reshape([this.outputDim, 1]));

        return out.reshape([this.outputDim]); // Return flat vector
    }

    act(observation) {
        // console.log('PG Act start');
        const logits = this.forward(observation);
        // console.log('PG Act forward done');

        if (this.env.actionSpace.type === 'Discrete') {
            // Softmax
            const probs = logits.softmax();

            // Sample
            const action = this._sampleDiscrete(probs);

            // Store logits and action index.
            // We cannot compute log_prob here reliably because `gather` might be tricky without full advanced indexing support in this minimal Tensor lib.
            // Instead we store logits and compute the loss later using masks.

            this.logProbs.push({
                logits: logits,
                action: action,
                type: 'discrete'
            });

            return action;

        } else {
            // Continuous: Output is Mean.
            // Sample from Normal(Mean, Std=1.0)
            // action = mean + std * randn
            const mean = logits;
            const noise = Tensor.randn(mean.shape); // standard normal
            const actionTensor = mean.add(noise); // std=1.0

            const action = actionTensor.data; // Array

            // Log Prob of Normal distribution
            // -0.5 * ((x - mu)/sigma)^2 - log(sigma * sqrt(2pi))
            // sigma=1 -> -0.5 * (noise)^2 - const
            // We need to store graph nodes

            this.logProbs.push({
                distParams: { mean: mean, std: 1.0 },
                action: actionTensor,
                type: 'continuous'
            });

            return action;
        }
    }

    _sampleDiscrete(probsTensor) {
        const probs = probsTensor.data; // Array
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
        // Calculate Returns (Discounted Rewards)
        const returns = [];
        let R = 0;
        for (let i = this.rewards.length - 1; i >= 0; i--) {
            R = this.rewards[i] + this.gamma * R;
            returns.unshift(R);
        }

        // Normalize returns? Usually helps.
        // const mean = returns.reduce((a,b)=>a+b)/returns.length;
        // const std = Math.sqrt(returns.map(x=>(x-mean)**2).reduce((a,b)=>a+b)/returns.length) + 1e-8;
        // const normReturns = returns.map(r => (r - mean) / std);

        // Compute Loss
        let loss = new Tensor([0], { requiresGrad: true });

        for (let i = 0; i < this.logProbs.length; i++) {
            const R_t = returns[i];
            const item = this.logProbs[i];

            let logProb;
            if (item.type === 'discrete') {
                // Recompute log prob to keep graph alive if needed, or use stored logits
                const logits = item.logits;
                const probs = logits.softmax();
                // Simple indexing: we need to mask.
                // Create mask tensor
                const maskData = new Array(this.outputDim).fill(0);
                maskData[item.action] = 1;
                const mask = new Tensor(maskData);

                // log_prob = sum(log(probs) * mask)
                logProb = probs.log().mul(mask).sum();

            } else {
                // Continuous
                // log_prob = -0.5 * (action - mean)^2 - const
                const mean = item.distParams.mean;
                const action = item.action;
                const diff = action.sub(mean);
                logProb = diff.pow(2).mul(-0.5).sum(); // Excluding constants for gradient
            }

            // Loss = - sum(log_prob * R_t)
            // We want to maximize reward, so minimize negative log_prob * reward
            const term = logProb.mul(-R_t);
            loss = loss.add(term);
        }

        // Backward
        loss.backward();

        // Step (SGD)
        for (const p of this.params) {
            // p.data -= lr * p.grad
            // We assume p.grad is available after backward
            if (p.grad) {
                 // Manual SGD update or use optimizer if available
                 // Tensor lib likely has inplace operations or we create new tensors?
                 // Let's assume we can do: p.sub_(p.grad.mul(this.lr))
                 // Or: p = p - lr * grad

                 // Since we stored params in `this.params`, we need to update them properly.
                 // If Tensor objects are immutable, we need to replace `this.w1`, etc.
                 // If they are mutable/have state, we update data.

                 // Looking at typical JS tensor libs, data might be typed array.
                 for (let j=0; j<p.data.length; j++) {
                     p.data[j] -= this.lr * p.grad[j];
                 }
                 // Zero grad
                 p.grad.fill(0);
            }
        }
    }
}
