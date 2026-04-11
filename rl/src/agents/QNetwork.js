/**
 * Q-Network Module
 * Leverages tensor/Module patterns for cleaner architecture
 */
import {Linear, Module, randn, Tensor} from '@senars/tensor';

/**
 * Q-Network for DQN agent
 * Two-layer feedforward network for Q-value estimation
 */
export class QNetwork extends Module {
    /**
     * Create Q-Network
     * @param {number} inputDim - Input dimension (observation size)
     * @param {number} hiddenDim - Hidden layer dimension
     * @param {number} outputDim - Output dimension (action count)
     * @param {Object} backend - Tensor backend
     */
    constructor(inputDim, hiddenDim, outputDim, backend) {
        super();
        this.module('fc1', new Linear(inputDim, hiddenDim, {backend}));
        this.module('fc2', new Linear(hiddenDim, outputDim, {backend}));
        this.backend = backend;
    }

    /**
     * Forward pass through network
     * @param {Tensor} input - Input tensor
     * @returns {Tensor} Q-values for each action
     */
    forward(input) {
        let x = input;
        x = this._modules.get('fc1').forward(x);
        x = this.backend.relu(x);
        x = this._modules.get('fc2').forward(x);
        return x;
    }
}

/**
 * Agent Factory Utilities
 */
export const AgentFactoryUtils = {
    /**
     * Create seeded random function
     * @param {number} seed - Random seed
     * @returns {Function} Seeded random function
     */
    createSeededRandom(seed) {
        let state = seed;
        return () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    },

    /**
     * Get action dimension from action space
     * @param {Object} actionSpace - Action space specification
     * @returns {number} Action dimension
     */
    getActionDim(actionSpace) {
        if (actionSpace.type === 'Discrete') {
            return actionSpace.n;
        }
        if (actionSpace.type === 'Box') {
            return actionSpace.shape[0];
        }
        throw new Error('Unknown action space type');
    },

    /**
     * Get observation dimension from observation space
     * @param {Object} obsSpace - Observation space specification
     * @returns {number} Observation dimension
     */
    getObsDim(obsSpace) {
        return obsSpace.shape?.[0] ?? 1;
    },

    /**
     * Sample action from policy
     * @param {Object} actionSpace - Action space
     * @param {Tensor} policy - Policy tensor (probabilities)
     * @param {boolean} deterministic - Whether to use deterministic selection
     * @returns {*} Sampled action
     */
    sampleAction(actionSpace, policy, deterministic = false) {
        if (actionSpace.type === 'Discrete') {
            const probs = policy.softmax();
            return deterministic
                ? this.argmax(probs.data)
                : this.sampleCategorical(probs.data);
        }
        const noise = randn(policy.shape);
        return policy.add(noise).data;
    },

    /**
     * Create Q-Network
     * @param {number} inputDim - Input dimension
     * @param {number} hiddenDim - Hidden dimension
     * @param {number} outputDim - Output dimension
     * @param {Object} backend - Tensor backend
     * @returns {QNetwork} Q-Network instance
     */
    createQNetwork(inputDim, hiddenDim, outputDim, backend) {
        return new QNetwork(inputDim, hiddenDim, outputDim, backend);
    },

    /**
     * Build simple 2-layer feed-forward network
     * @param {number} inputDim - Input dimension
     * @param {number} hiddenDim - Hidden dimension
     * @param {number} outputDim - Output dimension
     * @returns {Object} Network with w1, b1, w2, b2, params
     */
    buildNetwork(inputDim, hiddenDim, outputDim) {
        const w1 = Tensor.randn([hiddenDim, inputDim]).mul(Math.sqrt(2 / inputDim));
        const b1 = Tensor.zeros([hiddenDim, 1]);
        const w2 = Tensor.randn([outputDim, hiddenDim]).mul(Math.sqrt(2 / hiddenDim));
        const b2 = Tensor.zeros([outputDim, 1]);

        return {
            w1, b1, w2, b2,
            params: [w1, b1, w2, b2]
        };
    },

    /**
     * Argmax helper
     * @param {Float32Array} data - Input data
     * @returns {number} Index of maximum value
     */
    argmax(data) {
        let maxIdx = 0;
        let maxVal = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (data[i] > maxVal) {
                maxVal = data[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    },

    /**
     * Sample from categorical distribution
     * @param {Float32Array} probs - Probability distribution
     * @returns {number} Sampled index
     */
    sampleCategorical(probs) {
        const rand = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (rand < cumsum) {
                return i;
            }
        }
        return probs.length - 1;
    }
};

/**
 * Build simple 2-layer feed-forward network (standalone export)
 * @param {number} inputDim - Input dimension
 * @param {number} hiddenDim - Hidden dimension
 * @param {number} outputDim - Output dimension
 * @returns {Object} Network with w1, b1, w2, b2, params
 */
export function buildNetwork(inputDim, hiddenDim, outputDim) {
    const w1 = Tensor.randn([hiddenDim, inputDim]).mul(Math.sqrt(2 / inputDim));
    const b1 = Tensor.zeros([hiddenDim, 1]);
    const w2 = Tensor.randn([outputDim, hiddenDim]).mul(Math.sqrt(2 / hiddenDim));
    const b2 = Tensor.zeros([outputDim, 1]);

    return {
        w1, b1, w2, b2,
        params: [w1, b1, w2, b2]
    };
}
