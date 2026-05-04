/**
 * Enhanced Policy System
 * Unified policy framework leveraging tensor/Module patterns
 */
import {Component} from '../composable/Component.js';
import {Linear, Module, SymbolicTensor, Tensor, TensorLogicBridge} from '@senars/tensor';
import {mergeConfig, MetricsTracker, PolicyUtils} from '../utils/index.js';
import {Logger} from '@senars/core';

const POLICY_DEFAULTS = {
    inputDim: 64,
    hiddenDim: 128,
    outputDim: 4,
    numLayers: 2,
    policyType: 'softmax',
    actionType: 'discrete',
    learningRate: 0.001,
    gamma: 0.99,
    entropyBonus: 0.01,
    l2Regularization: 0.0001,
    gradientClip: 0.5,
    activation: 'relu',
    dropout: 0.0,
    batchNormalization: false,
    useLayerNorm: false
};

/**
 * PolicyNetwork Module - Leverages tensor/Module for parameter management
 */
class PolicyNetworkModule extends Module {
    constructor(inputDim, hiddenDim, outputDim, numLayers, backend) {
        super();
        this.backend = backend;

        // Input layer
        this.module('input', new Linear(inputDim, hiddenDim, {backend}));

        // Hidden layers
        for (let i = 1; i < numLayers; i++) {
            this.module(`hidden${i}`, new Linear(hiddenDim, hiddenDim, {backend}));
        }

        // Output layer
        this.module('output', new Linear(hiddenDim, outputDim, {backend}));

        this.numLayers = numLayers;
        this.hiddenDim = hiddenDim;
        this.activation = 'relu';
    }

    setActivation(activation) {
        this.activation = activation;
        return this;
    }

    forward(input, {training = false} = {}) {
        if (!this.backend) {
            return input;
        }

        let x = input;

        // Input + hidden layers
        for (let i = 0; i < this.numLayers - 1; i++) {
            const layer = this._modules.get(i === 0 ? 'input' : `hidden${i}`);
            x = layer.forward(x);
            x = this._applyActivation(x);
        }

        // Output layer
        const outputLayer = this._modules.get('output');
        return outputLayer.forward(x);
    }

    _applyActivation(x) {
        switch (this.activation) {
            case 'relu':
                return this.backend.relu(x);
            case 'tanh':
                return this.backend.tanh(x);
            case 'sigmoid':
                return this.backend.sigmoid(x);
            case 'gelu':
                return this.backend.gelu?.(x) ?? this.backend.relu(x);
            default:
                return this.backend.relu(x);
        }
    }
}

/**
 * Policy Network with advanced features
 * Now leverages tensor/Module for cleaner parameter management
 */
export class PolicyNetwork extends Component {
    constructor(config = {}) {
        super(mergeConfig(POLICY_DEFAULTS, config));
        this.backend = null;
        this.tensorBridge = new TensorLogicBridge();
        this.network = null;
        this.optimizer = null;
        this._metricsTracker = new MetricsTracker({
            updates: 0,
            totalLoss: 0,
            avgEntropy: 0,
            gradientNorm: 0,
            klDivergence: 0
        });
    }

    get metrics() {
        return this._metricsTracker;
    }

    async onInitialize() {
        try {
            const {torch, AdamOptimizer, SGDOptimizer} = await import('@senars/tensor');
            this.backend = torch;
            this.tensorBridge.backend = this.backend;

            try {
                this.optimizer = new AdamOptimizer(this.config.learningRate, this.backend);
            } catch {
                this.optimizer = new SGDOptizer(this.config.learningRate, this.backend);
            }
        } catch (e) {
            Logger.warn('Failed to load tensor backend:', e.message);
            this.backend = null;
        }

        this._initializeNetwork();
    }

    _initializeNetwork() {
        if (!this.backend) {
            return;
        }

        const {inputDim, hiddenDim, outputDim, numLayers, activation} = this.config;
        this.network = new PolicyNetworkModule(inputDim, hiddenDim, outputDim, numLayers, this.backend);
        this.network.setActivation(activation);
    }

    forward(input, options = {}) {
        const {training = false, returnIntermediate = false} = options;

        if (!this.backend || !this.network) {
            return {output: new SymbolicTensor([0, 0, 0, 0], [4]), intermediate: null};
        }

        const tensorInput = input instanceof SymbolicTensor
            ? input
            : new SymbolicTensor(Array.isArray(input) ? input : [input], [input?.length ?? 1]);

        const output = this.network.forward(tensorInput, {training});

        return {
            output: output instanceof SymbolicTensor ? output : new SymbolicTensor(output.data, output.shape),
            intermediate: returnIntermediate ? [output] : null
        };
    }

    _activation(input) {
        switch (this.config.activation) {
            case 'relu':
                return this.backend.relu(input);
            case 'tanh':
                return this.backend.tanh(input);
            case 'sigmoid':
                return this.backend.sigmoid(input);
            case 'gelu':
                return this.backend.gelu?.(input) ?? this.backend.relu(input);
            default:
                return this.backend.relu(input);
        }
    }

    _dropout(input, rate) {
        if (!this.backend) {
            return input;
        }
        const maskData = Array.from(input.data).map(() => Math.random() > rate ? 1 / (1 - rate) : 0);
        const mask = new Tensor(maskData, {backend: this.backend});
        mask.shape = input.shape;
        return this.backend.mul(input, mask);
    }

    getParameters() {
        if (!this.network) {
            return {};
        }
        return Object.fromEntries(
            Array.from(this.network.namedParameters()).map(([name, param]) => [
                name,
                {data: [...param.data], shape: [...param.shape]}
            ])
        );
    }

    setParameters(params) {
        if (!this.network) {
            return;
        }
        Object.entries(params).forEach(([name, paramData]) => {
            const param = this.network.namedParameters().get(name);
            if (param) {
                param.data = [...paramData.data];
                if (paramData.shape) {
                    param.shape = [...paramData.shape];
                }
            }
        });
    }

    /**
     * Get state dictionary for serialization
     */
    stateDict() {
        return this.network?.stateDict() ?? {};
    }

    /**
     * Load state dictionary
     */
    loadStateDict(dict) {
        this.network?.loadStateDict(dict);
    }
}

/**
 * Multi-Head Attention Policy
 */
export class AttentionPolicy extends Component {
    constructor(config = {}) {
        super(mergeConfig({
            ...POLICY_DEFAULTS,
            numHeads: 4,
            attentionDim: 64
        }, config));
        this.attentionWeights = null;
        this.policyNetwork = new PolicyNetwork(config);
    }

    async onInitialize() {
        await this.policyNetwork.initialize();
    }

    async attendAndAct(state, context = {}) {
        const {output, intermediate} = this.policyNetwork.forward(state, {returnIntermediate: true});

        if (intermediate && intermediate.length > 0) {
            this.attentionWeights = this._computeAttention(intermediate, context);
        }

        const action = this._actionFromOutput(output);
        return {action, attentionWeights: this.attentionWeights};
    }

    _computeAttention(intermediates, context) {
        const numLayers = intermediates.length;
        const weights = new Array(numLayers).fill(0).map(() => Math.random());
        const sum = weights.reduce((a, b) => a + b, 0);
        return weights.map(w => w / sum);
    }

    _actionFromOutput(output) {
        if (this.config.actionType === 'discrete') {
            return PolicyUtils.argmax(output.data);
        }
        return Array.from(output.data);
    }

    getAttentionWeights() {
        return this.attentionWeights;
    }
}

/**
 * Ensemble Policy for uncertainty estimation
 */
export class EnsemblePolicy extends Component {
    constructor(config = {}) {
        super(mergeConfig({
            ...POLICY_DEFAULTS,
            ensembleSize: 5
        }, config));
        this.ensemble = [];
    }

    async onInitialize() {
        for (let i = 0; i < this.config.ensembleSize; i++) {
            const policy = new TensorLogicPolicy({...this.config, seed: i});
            await policy.initialize();
            this.ensemble.push(policy);
        }
    }

    async selectAction(state, options = {}) {
        const results = await Promise.all(
            this.ensemble.map(policy => policy.selectAction(state, options))
        );

        const actions = results.map(r => r.action);
        const actionCounts = new Map();
        actions.forEach(a => actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1));

        const mostCommon = Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
        const uncertainty = 1 - (actionCounts.get(mostCommon) / this.config.ensembleSize);

        return {
            action: mostCommon,
            uncertainty,
            ensembleActions: actions,
            ensembleResults: results
        };
    }

    async update(experience, options = {}) {
        const results = await Promise.all(
            this.ensemble.map(policy => policy.update(experience, options))
        );
        return {
            losses: results.map(r => r.loss),
            avgLoss: results.reduce((s, r) => s + r.loss, 0) / results.length,
            success: results.every(r => r.success)
        };
    }

    getEnsembleStats() {
        return this.ensemble.map(policy => policy.getState());
    }
}

// Re-export TensorLogicPolicy from dedicated file (single source of truth)
export {TensorLogicPolicy, TensorLogicPolicy as Network, TensorLogicPolicy as Policy} from './TensorLogicPolicy.js';
