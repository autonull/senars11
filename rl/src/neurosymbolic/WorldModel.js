import { Tensor, TensorFunctor } from '@senars/tensor';
import { SymbolicTensor, TensorLogicBridge } from './TensorLogicBridge.js';
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    trackProvenance: true,
    symbolicThreshold: 0.3,
    latentDim: 32,
    ensembleSize: 5,
    learningRate: 0.001,
    imaginationHorizon: 10,
    uncertaintyThreshold: 0.5
};

export class SymbolicDifferentiation {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULTS, config);
        this.gradientGraph = new Map();
        this.symbolicGradients = new Map();
        this.bridge = new TensorLogicBridge();
    }

    gradient(loss, params, context = new Map()) {
        const gradients = [];
        params.forEach(param => {
            const grad = this.computeGradient(loss, param, context);
            if (param instanceof SymbolicTensor) {
                const symbolicGrad = this.annotateGradient(grad, param);
                gradients.push(symbolicGrad);
                this.symbolicGradients.set(param, symbolicGrad);
            } else {
                gradients.push(grad);
            }
        });
        return gradients;
    }

    computeGradient(loss, param, context) {
        const eps = 1e-5;
        const grad = new Float32Array(param.data.length);
        const lossBase = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;

        for (let i = 0; i < param.data.length; i++) {
            const original = param.data[i];
            param.data[i] = original + eps;
            const lossPlus = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
            grad[i] = (lossPlus - lossBase) / eps;
            param.data[i] = original;
        }

        if (this.config.trackProvenance) this.trackGradientFlow(param, grad, context);
        return grad;
    }

    annotateGradient(grad, param) {
        const symbolicGrad = new SymbolicTensor(grad, param.shape);
        param.symbols.forEach((symbolInfo, key) => {
            const idx = typeof key === 'string' ? parseInt(key.split(',')[0]) : key;
            if (!isNaN(idx) && idx < grad.length && Math.abs(grad[idx]) > this.config.symbolicThreshold) {
                symbolicGrad.annotate(idx, `∂${symbolInfo.symbol}`, symbolInfo.confidence * Math.abs(grad[idx]));
            }
        });
        symbolicGrad.addProvenance('SymbolicDifferentiation', 'annotateGradient', { paramSymbols: param.symbols.size });
        return symbolicGrad;
    }

    trackGradientFlow(param, grad, context) {
        this.gradientGraph.set(param, { grad, context: new Map(context), timestamp: Date.now() });
    }

    getSymbolicGradient(param) { return this.symbolicGradients.get(param); }
    getGradientGraph() { return new Map(this.gradientGraph); }
    clear() { this.gradientGraph.clear(); this.symbolicGradients.clear(); }
}

export class WorldModel extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.latentDim = config.latentDim ?? 32;
        this.ensembleSize = config.ensembleSize ?? 5;
        this.learningRate = config.learningRate ?? 0.001;

        this.transitionModels = [];
        this.rewardModel = null;
        this.encoder = null;
        this.decoder = null;

        this.experienceBuffer = [];
        this.symbolicDiff = new SymbolicDifferentiation(config);
        this.tensorBridge = new TensorLogicBridge();
    }

    async onInitialize() {
        this._initializeModels();
        this.emit('initialized', { latentDim: this.latentDim, ensembleSize: this.ensembleSize });
    }

    _initializeModels() {
        this.transitionModels = Array.from({ length: this.ensembleSize }, () => this._createTransitionModel());
        this.rewardModel = this._createRewardModel();
        this.encoder = this._createEncoder();
        this.decoder = this._createDecoder();
    }

    _createTransitionModel() {
        return {
            weights: new Float32Array(this.latentDim * this.latentDim).map(() => Math.random() * 0.1 - 0.05),
            bias: new Float32Array(this.latentDim).fill(0)
        };
    }

    _createRewardModel() {
        return {
            weights: new Float32Array(this.latentDim).map(() => Math.random() * 0.1 - 0.05),
            bias: 0
        };
    }

    _createEncoder() {
        return {
            weights: new Float32Array(64 * this.latentDim).map(() => Math.random() * 0.1 - 0.05),
            bias: new Float32Array(this.latentDim).fill(0)
        };
    }

    _createDecoder() {
        return {
            weights: new Float32Array(this.latentDim * 64).map(() => Math.random() * 0.1 - 0.05),
            bias: new Float32Array(64).fill(0)
        };
    }

    async update(state, action, nextState, reward) {
        this.experienceBuffer.push({ state, action, nextState, reward });
        if (this.experienceBuffer.length > 10000) this.experienceBuffer.shift();

        if (this.experienceBuffer.length >= 32) {
            await this._trainModels();
        }
    }

    async _trainModels() {
        const batch = this.experienceBuffer.slice(-32);
        const lr = this.learningRate;

        batch.forEach(exp => {
            const latent = this.encode(exp.state);
            const predictedNext = this._predictTransition(latent, exp.action);
            const actualNext = this.encode(exp.nextState);

            const error = predictedNext.map((p, i) => p - actualNext[i]);
            this.transitionModels.forEach(model => {
                for (let i = 0; i < model.weights.length; i++) {
                    model.weights[i] -= lr * error[i % this.latentDim] * latent[Math.floor(i / this.latentDim)];
                }
            });
        });
    }

    encode(state) {
        const data = Array.isArray(state) ? state : [state];
        const padded = new Float32Array(64);
        data.forEach((v, i) => { if (i < 64) padded[i] = v; });

        const latent = new Float32Array(this.latentDim);
        for (let i = 0; i < this.latentDim; i++) {
            let sum = this.encoder.bias[i];
            for (let j = 0; j < 64; j++) {
                sum += this.encoder.weights[i * 64 + j] * padded[j];
            }
            latent[i] = Math.tanh(sum);
        }
        return latent;
    }

    decode(latent) {
        const output = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
            let sum = this.decoder.bias[i];
            for (let j = 0; j < this.latentDim; j++) {
                sum += this.decoder.weights[i * this.latentDim + j] * latent[j];
            }
            output[i] = Math.tanh(sum);
        }
        return output;
    }

    _predictTransition(latent, action) {
        const predictions = this.transitionModels.map(model => {
            const output = new Float32Array(this.latentDim);
            for (let i = 0; i < this.latentDim; i++) {
                let sum = model.bias[i];
                for (let j = 0; j < this.latentDim; j++) {
                    sum += model.weights[i * this.latentDim + j] * latent[j];
                }
                output[i] = Math.tanh(sum);
            }
            return output;
        });

        const mean = new Float32Array(this.latentDim);
        for (let i = 0; i < this.latentDim; i++) {
            mean[i] = predictions.reduce((a, b) => a + b[i], 0) / predictions.length;
        }
        return mean;
    }

    predictNext(state, action) {
        const latent = this.encode(state);
        const nextLatent = this._predictTransition(latent, action);
        return this.decode(nextLatent);
    }

    predictReward(state, action) {
        const latent = this.encode(state);
        let sum = this.rewardModel.bias;
        for (let i = 0; i < this.latentDim; i++) {
            sum += this.rewardModel.weights[i] * latent[i];
        }
        return Math.tanh(sum);
    }

    getUncertainty(state, action) {
        const latent = this.encode(state);
        const predictions = this.transitionModels.map(model => {
            const output = new Float32Array(this.latentDim);
            for (let i = 0; i < this.latentDim; i++) {
                let sum = model.bias[i];
                for (let j = 0; j < this.latentDim; j++) {
                    sum += model.weights[i * this.latentDim + j] * latent[j];
                }
                output[i] = Math.tanh(sum);
            }
            return output;
        });

        const variance = new Float32Array(this.latentDim);
        const mean = new Float32Array(this.latentDim);
        predictions.forEach(pred => {
            for (let i = 0; i < this.latentDim; i++) mean[i] += pred[i];
        });
        for (let i = 0; i < this.latentDim; i++) mean[i] /= predictions.length;

        predictions.forEach(pred => {
            for (let i = 0; i < this.latentDim; i++) {
                variance[i] += Math.pow(pred[i] - mean[i], 2);
            }
        });
        for (let i = 0; i < this.latentDim; i++) variance[i] /= predictions.length;

        return variance.reduce((a, b) => a + b, 0) / this.latentDim;
    }

    async generateImaginedExperiences(count, options = {}) {
        const { horizon = this.config.imaginationHorizon, startState = null } = options;
        const experiences = [];

        for (let i = 0; i < count; i++) {
            let state = startState ?? this._sampleInitialState();

            for (let step = 0; step < horizon; step++) {
                const action = Math.floor(Math.random() * 4);
                const nextState = this.predictNext(state, action);
                const reward = this.predictReward(state, action);

                experiences.push({ state, action, nextState, reward, imagined: true });
                state = nextState;
            }
        }

        return experiences;
    }

    _sampleInitialState() {
        return Array.from({ length: 8 }, () => Math.random() * 2 - 1);
    }

    planWithModel(state, goal, horizon = 10) {
        const bestPlan = { plan: [], value: -Infinity };

        for (let i = 0; i < 100; i++) {
            const plan = Array.from({ length: horizon }, () => Math.floor(Math.random() * 4));
            let currentState = state;
            let totalValue = 0;

            plan.forEach(action => {
                const reward = this.predictReward(currentState, action);
                const uncertainty = this.getUncertainty(currentState, action);

                if (uncertainty > this.config.uncertaintyThreshold) {
                    totalValue -= uncertainty;
                } else {
                    totalValue += reward;
                    currentState = this.predictNext(currentState, action);
                }
            });

            if (totalValue > bestPlan.value) {
                bestPlan.plan = plan;
                bestPlan.value = totalValue;
            }
        }

        return bestPlan.plan;
    }

    explainPrediction(state, action) {
        const latent = this.encode(state);
        const importantFeatures = [];

        for (let i = 0; i < this.latentDim; i++) {
            if (Math.abs(latent[i]) > this.config.symbolicThreshold) {
                importantFeatures.push({ dimension: i, value: latent[i], influence: Math.abs(latent[i]) });
            }
        }

        importantFeatures.sort((a, b) => b.influence - a.influence);

        return {
            latentRepresentation: Array.from(latent),
            importantFeatures: importantFeatures.slice(0, 5),
            predictedReward: this.predictReward(state, action),
            uncertainty: this.getUncertainty(state, action)
        };
    }

    getState() {
        return {
            experienceBufferSize: this.experienceBuffer.length,
            latentDim: this.latentDim,
            ensembleSize: this.ensembleSize
        };
    }

    async onShutdown() {
        this.experienceBuffer = [];
        this.symbolicDiff.clear();
    }
}
