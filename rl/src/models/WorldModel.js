import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { SymbolicDifferentiation } from './SymbolicDifferentiation.js';
import { Tensor } from '@senars/tensor';

const DEFAULTS = {
    trackProvenance: true,
    symbolicThreshold: 0.3,
    latentDim: 32,
    ensembleSize: 5,
    learningRate: 0.001,
    imaginationHorizon: 10,
    uncertaintyThreshold: 0.5,
    trackMetrics: true
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
        this.metrics = this.config.trackMetrics ? new MetricsTracker({
            updatesPerformed: 0,
            imaginationsPerformed: 0,
            predictionsMade: 0
        }) : null;
    }

    async onInitialize() {
        this._initializeModels();
        this.emit('initialized', { latentDim: this.latentDim, ensembleSize: this.ensembleSize });
    }

    _initializeModels() {
        // encoder: 64 inputs -> latent outputs
        this.encoder = this._createModel(64, this.latentDim);
        // decoder: latent inputs -> 64 outputs
        this.decoder = this._createModel(this.latentDim, 64);
        // transition: latent inputs -> latent outputs
        this.transitionModels = Array.from({ length: this.ensembleSize }, () => this._createModel(this.latentDim, this.latentDim));
        // reward: latent inputs -> 1 output
        this.rewardModel = this._createModel(this.latentDim, 1);
    }

    _createModel(inDim, outDim, initScale = 0.05) {
        const w = Tensor.randn([outDim, inDim], 0, initScale);
        const b = Tensor.zeros([outDim]);
        w.requiresGrad = true;
        b.requiresGrad = true;
        return { w, b };
    }

    async update(state, action, nextState, reward) {
        this.experienceBuffer.push({ state, action, nextState, reward });
        if (this.experienceBuffer.length > 10000) {this.experienceBuffer.shift();}

        if (this.experienceBuffer.length >= 32) {
            await this._trainModels();
        }
        this.metrics?.increment('updatesPerformed');
        return { updated: true };
    }

    async _trainModels() {
        const batch = this.experienceBuffer.slice(-32);
        const lr = this.learningRate;

        const prepareState = (s) => {
            const arr = (Array.isArray(s) || ArrayBuffer.isView(s)) ? Array.from(s) : [s];
            const padded = new Float32Array(64);
            arr.slice(0, 64).forEach((v, i) => padded[i] = v);
            return padded;
        };

        const states = new Tensor(batch.map(e => prepareState(e.state))); // (batch, 64)
        const nextStates = new Tensor(batch.map(e => prepareState(e.nextState))); // (batch, 64)

        // Train Encoder/Decoder (Reconstruction)
        const encoded = this._forwardLinear(states, this.encoder).tanh();
        const reconstructed = this._forwardLinear(encoded, this.decoder).tanh();
        const reconLoss = reconstructed.sub(states).pow(2).mean();

        const encodedNext = this._forwardLinear(nextStates, this.encoder).tanh().detach();

        for (const model of this.transitionModels) {
            const predictedNext = this._forwardLinear(encoded.detach(), model).tanh();
            const transLoss = predictedNext.sub(encodedNext).pow(2).mean();

            transLoss.backward();
            this._step([model.w, model.b], lr);
            this._zeroGrad([model.w, model.b]);
        }

        reconLoss.backward();
        this._step([this.encoder.w, this.encoder.b, this.decoder.w, this.decoder.b], lr);
        this._zeroGrad([this.encoder.w, this.encoder.b, this.decoder.w, this.decoder.b]);
    }

    _forwardLinear(input, model) {
        return input.matmul(model.w.transpose()).add(model.b);
    }

    _step(params, lr) {
        for (const p of params) {
            if (p.grad) {
                for(let i = 0; i < p.data.length; i++) {
                    p.data[i] -= lr * p.grad.data[i];
                }
            }
        }
    }

    _zeroGrad(params) {
        for (const p of params) {
            if (p.grad) {p.grad = null;}
        }
    }

    encode(state) {
        const arr = (Array.isArray(state) || ArrayBuffer.isView(state)) ? Array.from(state) : [state];
        const padded = new Float32Array(64);
        arr.slice(0, 64).forEach((v, i) => padded[i] = v);

        const input = new Tensor(padded).reshape([1, 64]);
        const latent = this._forwardLinear(input, this.encoder).tanh();
        return latent.data;
    }

    decode(latent) {
        const input = new Tensor(latent).reshape([1, this.latentDim]);
        const output = this._forwardLinear(input, this.decoder).tanh();
        return output.data;
    }

    _predictTransition(latent, action) {
        const input = new Tensor(latent).reshape([1, this.latentDim]);

        const sum = this.transitionModels.reduce((acc, model) =>
            acc.add(this._forwardLinear(input, model).tanh()),
            Tensor.zeros([1, this.latentDim])
        );

        return sum.mul(1 / this.ensembleSize).data;
    }

    predictNext(state, action) {
        const latent = this.encode(state);
        const nextLatent = this._predictTransition(latent, action);
        return this.decode(nextLatent);
    }

    predictReward(state, action) {
        const latent = this.encode(state);
        const input = new Tensor(latent).reshape([1, this.latentDim]);
        const out = this._forwardLinear(input, this.rewardModel).tanh();
        return out.data[0];
    }

    getUncertainty(state, action) {
        const latent = this.encode(state);
        const input = new Tensor(latent).reshape([1, this.latentDim]);

        const predictions = this.transitionModels.map(model =>
            this._forwardLinear(input, model).tanh().data
        );

        const count = predictions.length;
        const mean = new Float32Array(this.latentDim);

        for (const pred of predictions) {
            for (let i = 0; i < this.latentDim; i++) {mean[i] += pred[i];}
        }
        for (let i = 0; i < this.latentDim; i++) {mean[i] /= count;}

        const totalVar = predictions.reduce((acc, pred) => {
            let v = 0;
            for(let i=0; i<this.latentDim; i++) {v += Math.pow(pred[i] - mean[i], 2);}
            return acc + v / count;
        }, 0);

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
        let bestPlan = [];
        let bestValue = -Infinity;

        for (let i = 0; i < 100; i++) {
            const plan = Array.from({ length: horizon }, () => Math.floor(Math.random() * 4));
            let currentState = state;
            let totalValue = 0;

            for (const action of plan) {
                const reward = this.predictReward(currentState, action);
                const uncertainty = this.getUncertainty(currentState, action);

                if (uncertainty > this.config.uncertaintyThreshold) {
                    totalValue -= uncertainty;
                } else {
                    totalValue += reward;
                    currentState = this.predictNext(currentState, action);
                }
            }

            if (totalValue > bestValue) {
                bestPlan = plan;
                bestValue = totalValue;
            }
        }

        return bestPlan;
    }

    explainPrediction(state, action) {
        const latent = this.encode(state);

        const importantFeatures = Array.from(latent)
            .map((value, i) => ({ dimension: i, value, influence: Math.abs(value) }))
            .filter(f => f.influence > this.config.symbolicThreshold)
            .sort((a, b) => b.influence - a.influence)
            .slice(0, 5);

        return {
            latentRepresentation: Array.from(latent),
            importantFeatures,
            predictedReward: this.predictReward(state, action),
            uncertainty: this.getUncertainty(state, action)
        };
    }

    getState() {
        return {
            experienceBufferSize: this.experienceBuffer.length,
            latentDim: this.latentDim,
            ensembleSize: this.ensembleSize,
            metrics: this.metrics?.getAll() ?? {}
        };
    }

    getStats() {
        return this.getState();
    }

    async onShutdown() {
        this.experienceBuffer = [];
        this.symbolicDiff.clear();
    }

    static create(config = {}) {
        return new WorldModel(config);
    }

    static createImaginationFocused(config = {}) {
        return new WorldModel({ ...config, imaginationHorizon: 20, ensembleSize: 3 });
    }

    static createUncertaintyAware(config = {}) {
        return new WorldModel({ ...config, ensembleSize: 10, uncertaintyThreshold: 0.3 });
    }
}
