import { Tensor } from '@senars/tensor';
import { PolicyUtils } from './PolicyUtils.js';

export const NetworkBuilder = {
    /**
     * Builds a simple Multi-Layer Perceptron (MLP)
     * @param {number} inputDim - Input dimension
     * @param {number} hiddenDim - Hidden layer dimension
     * @param {number} outputDim - Output dimension
     * @param {number} [numLayers=1] - Number of hidden layers
     * @returns {object} The model object containing parameters
     */
    buildMLP(inputDim, hiddenDim, outputDim, numLayers = 1) {
        // Simple 2-layer MLP (Input -> Hidden -> Output)
        const w1 = Tensor.randn([hiddenDim, inputDim], 0, 0.1);
        const b1 = Tensor.zeros([hiddenDim]);
        const w2 = Tensor.randn([outputDim, hiddenDim], 0, 0.1);
        const b2 = Tensor.zeros([outputDim]);

        const params = [w1, b1, w2, b2];
        for (const p of params) p.requiresGrad = true;

        return { w1, b1, w2, b2, params };
    },

    /**
     * Performs a forward pass through the MLP
     * @param {object} model - The model object
     * @param {Tensor} x - Input tensor
     * @returns {Tensor} Output tensor
     */
    forward(model, x) {
        // Handle input shape: ensure (batch, inputDim)
        const input = x.ndim === 1 ? x.reshape([x.shape[0], 1]) : x.transpose();

        // Layer 1
        const h = model.w1.matmul(input).add(model.b1.reshape([model.b1.shape[0], 1])).relu();

        // Layer 2
        const out = model.w2.matmul(h).add(model.b2.reshape([model.b2.shape[0], 1]));

        // Return shape (batch, outputDim) or (outputDim,)
        return x.ndim > 1 ? out.transpose() : out.reshape([out.shape[0]]);
    },

    /**
     * Samples an action from probabilities
     * @param {Tensor} probs - Probability tensor
     * @returns {number} The sampled action index
     */
    sampleAction(probs) {
        return PolicyUtils.sampleCategorical(probs.data);
    },

    /**
     * Creates a one-hot action mask tensor
     * @param {number[]} actions - Array of action indices
     * @param {number} actionDim - Number of possible actions
     * @param {number} batchLen - Batch size
     * @returns {Tensor} Mask tensor
     */
    createActionMask(actions, actionDim, batchLen) {
        const maskData = new Float32Array(batchLen * actionDim);

        for (let i = 0; i < batchLen; i++) {
            maskData[i * actionDim + actions[i]] = 1;
        }

        return new Tensor(maskData).reshape([batchLen, actionDim]);
    },

    /**
     * Computes Generalized Advantage Estimation (GAE)
     * @param {number[]} values - Value estimates
     * @param {number[]} rewards - Rewards
     * @param {boolean[]} dones - Done flags
     * @param {number} gamma - Discount factor
     * @param {number} lambda - GAE lambda
     * @param {number} [lastNextVal=0] - Value of the state after the last step
     * @returns {object} { advantages, returns }
     */
    computeGAE(values, rewards, dones, gamma, lambda, lastNextVal = 0) {
        const len = values.length;
        const advantages = new Float32Array(len);
        const returns = new Float32Array(len);

        let lastGaeLam = 0;
        for (let t = len - 1; t >= 0; t--) {
            const nextVal = t === len - 1 ? lastNextVal : values[t + 1];
            const mask = dones[t] ? 0 : 1;
            const delta = rewards[t] + gamma * nextVal * mask - values[t];

            lastGaeLam = delta + gamma * lambda * mask * lastGaeLam;
            advantages[t] = lastGaeLam;
            returns[t] = advantages[t] + values[t];
        }

        return { advantages, returns };
    }
};
