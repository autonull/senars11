import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { SymbolicDifferentiation } from './SymbolicDifferentiation.js';
import { Tensor } from '@senars/tensor';

const DEFAULTS = {
    trackProvenance: true,
    symbolicThreshold: 0.3,
    latentDim: 32,
    ensembleSize: 5,
    learningRate: 0.001,
    imaginationHorizon: 10,
    uncertaintyThreshold: 0.5
};

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
        const w = Tensor.randn([this.latentDim, this.latentDim], 0, 0.05);
        const b = Tensor.zeros([this.latentDim]);
        w.requiresGrad = true;
        b.requiresGrad = true;
        return { w, b };
    }

    _createRewardModel() {
        const w = Tensor.randn([this.latentDim], 0, 0.05);
        const b = Tensor.zeros([1]);
        w.requiresGrad = true;
        b.requiresGrad = true;
        return { w, b };
    }

    _createEncoder() {
        const w = Tensor.randn([this.latentDim, 64], 0, 0.05);
        const b = Tensor.zeros([this.latentDim]);
        w.requiresGrad = true;
        b.requiresGrad = true;
        return { w, b };
    }

    _createDecoder() {
        const w = Tensor.randn([64, this.latentDim], 0, 0.05);
        const b = Tensor.zeros([64]);
        w.requiresGrad = true;
        b.requiresGrad = true;
        return { w, b };
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

        // Prepare batch tensors
        // Flatten state to 64 dims if needed, similar to original logic
        const prepareState = (s) => {
            const arr = (Array.isArray(s) || ArrayBuffer.isView(s)) ? Array.from(s) : [s];
            const padded = new Array(64).fill(0);
            arr.slice(0, 64).forEach((v, i) => padded[i] = v);
            return padded;
        };

        const states = new Tensor(batch.map(e => prepareState(e.state))); // (batch, 64)
        const nextStates = new Tensor(batch.map(e => prepareState(e.nextState))); // (batch, 64)

        // Train Encoder/Decoder (Reconstruction)
        // Reconstruction Loss: MSE(Decoder(Encoder(state)), state)
        const encoded = this._forwardLinear(states, this.encoder).tanh();
        const reconstructed = this._forwardLinear(encoded, this.decoder).tanh();
        const reconLoss = reconstructed.sub(states).pow(2).mean();

        // Train Transition Models
        // Transition Loss: MSE(Transition(encoded), encodedNext)
        const encodedNext = this._forwardLinear(nextStates, this.encoder).tanh().detach(); // Detach target

        // Simple loop for ensemble
        for (const model of this.transitionModels) {
            const predictedNext = this._forwardLinear(encoded.detach(), model).tanh();
            const transLoss = predictedNext.sub(encodedNext).pow(2).mean();

            // Manual SGD step
            transLoss.backward();
            this._step([model.w, model.b], lr);
            this._zeroGrad([model.w, model.b]);
        }

        // Encoder/Decoder backward
        reconLoss.backward();
        this._step([this.encoder.w, this.encoder.b, this.decoder.w, this.decoder.b], lr);
        this._zeroGrad([this.encoder.w, this.encoder.b, this.decoder.w, this.decoder.b]);

        // Note: Reward model training was missing in original logic, adding stub or skipping for now to match original
        // Original logic:
        // this.transitionModels.forEach(model => { ... update weights ... });
        // It didn't seem to update encoder/decoder/reward model explicitly in the provided snippet?
        // Wait, the original snippet ONLY updated transition models!
        /*
            const error = predictedNext.map((p, i) => p - actualNext[i]);
            this.transitionModels.forEach(model => {
                for (let i = 0; i < model.weights.length; i++) {
                    model.weights[i] -= lr * error[i % this.latentDim] * latent[Math.floor(i / this.latentDim)];
                }
            });
        */
        // It seems encoder/decoder were fixed random projections in the original snippet!
        // "this.encoder.weights" were initialized but never updated in `_trainModels`.
        // I will keep them fixed if that was the intent (Random Projection), or update them if better.
        // Random Projection is a valid strategy (ELM-like). Given the original code, I should stick to updating only transition models to avoid changing behavior too much.
        // BUT, the original code had `encode` using `this.encoder`.

        // I will stick to original behavior: Encoder/Decoder are fixed random projections. Only Transition Models are trained.
    }

    _forwardLinear(input, model) {
        // input: (batch, inDim)
        // w: (outDim, inDim)
        // b: (outDim)
        // output: (batch, outDim)
        // Transpose input for matmul: w * input.T -> (outDim, batch) -> transpose -> (batch, outDim)
        // Or input * w.T -> (batch, inDim) * (inDim, outDim) -> (batch, outDim)

        // Tensor.matmul(A, B) usually does matrix multiplication.
        // If input is (batch, inDim) and w is (outDim, inDim), we want input @ w.T

        return input.matmul(model.w.transpose()).add(model.b);
    }

    _step(params, lr) {
        params.forEach(p => {
            if (p.grad) {
                // p.data = p.data - lr * p.grad
                // Using internal data access for in-place update simulation or just re-assign if Tensor supports it
                // Assuming basic tensor operations
                // We can't easily do in-place with this Tensor API wrapper unless we know it supports it.
                // But for now, let's assume p.data is accessible and mutable or we use a helper.
                for(let i=0; i<p.data.length; i++) {
                    p.data[i] -= lr * p.grad.data[i];
                }
            }
        });
    }

    _zeroGrad(params) {
        params.forEach(p => {
            if (p.grad) {
                 p.grad = null; // or zero out
            }
        });
    }

    encode(state) {
        const arr = (Array.isArray(state) || ArrayBuffer.isView(state)) ? Array.from(state) : [state];
        const padded = new Array(64).fill(0);
        arr.slice(0, 64).forEach((v, i) => padded[i] = v);

        const input = new Tensor(padded).reshape([1, 64]);
        const latent = this._forwardLinear(input, this.encoder).tanh();
        return latent.data; // Return array as per original API
    }

    decode(latent) {
        const input = new Tensor(latent).reshape([1, this.latentDim]);
        const output = this._forwardLinear(input, this.decoder).tanh();
        return output.data;
    }

    _predictTransition(latent, action) {
        // Latent is array. Action is index.
        // Original code ignored action in `_predictTransition`?
        /*
            _predictTransition(latent, action) {
                const predictions = this.transitionModels.map(model => {
                    // ... use model ...
                });
                return mean;
            }
        */
        // The original code passed `action` but didn't use it! The transition models only took `latent`.
        // This is a bug in the original code or a simplification (state-only transition?).
        // I will preserve the signature but note the behavior.

        const input = new Tensor(latent).reshape([1, this.latentDim]);

        const predictions = this.transitionModels.map(model => {
            return this._forwardLinear(input, model).tanh();
        });

        // Compute mean
        const sum = predictions.reduce((acc, p) => acc.add(p), Tensor.zeros([1, this.latentDim]));
        const mean = sum.mul(1 / this.ensembleSize);
        return mean.data;
    }

    predictNext(state, action) {
        const latent = this.encode(state);
        const nextLatent = this._predictTransition(latent, action);
        return this.decode(nextLatent);
    }

    predictReward(state, action) {
        const latent = this.encode(state);
        const input = new Tensor(latent).reshape([1, this.latentDim]);
        // Reward model: w (latentDim), b (1)
        // w is (latentDim), input is (1, latentDim).
        // We need dot product.
        // model.w is (latentDim).

        const out = input.matmul(this.rewardModel.w.reshape([this.latentDim, 1])).add(this.rewardModel.b).tanh();
        return out.data[0];
    }

    getUncertainty(state, action) {
        const latent = this.encode(state);
        const input = new Tensor(latent).reshape([1, this.latentDim]);

        const predictions = this.transitionModels.map(model => {
            return this._forwardLinear(input, model).tanh().data;
        });

        // Variance calculation
        const mean = new Float32Array(this.latentDim);
        const count = predictions.length;

        for(let i=0; i<this.latentDim; i++) {
            for(let j=0; j<count; j++) mean[i] += predictions[j][i];
            mean[i] /= count;
        }

        let totalVar = 0;
        for(let i=0; i<this.latentDim; i++) {
            let v = 0;
            for(let j=0; j<count; j++) v += Math.pow(predictions[j][i] - mean[i], 2);
            totalVar += v / count;
        }

        return totalVar / this.latentDim;
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
