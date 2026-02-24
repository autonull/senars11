/**
 * Enhanced Neuro-Symbolic System
 * Unified framework for world models and symbolic differentiation
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge, Tensor } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const WORLD_MODEL_DEFAULTS = {
    trackProvenance: true,
    symbolicThreshold: 0.3,
    latentDim: 32,
    ensembleSize: 5,
    learningRate: 0.001,
    imaginationHorizon: 10,
    uncertaintyThreshold: 0.5
};

const SYMBOLIC_DIFF_DEFAULTS = {
    trackProvenance: true,
    symbolicThreshold: 0.3,
    epsilon: 1e-5
};

/**
 * Enhanced World Model with imagination and uncertainty
 */
export class WorldModel extends Component {
    constructor(config = {}) {
        super(mergeConfig(WORLD_MODEL_DEFAULTS, config));
        this.latentDim = this.config.latentDim;
        this.ensembleSize = this.config.ensembleSize;
        this.learningRate = this.config.learningRate;

        this.transitionModels = [];
        this.rewardModel = null;
        this.encoder = null;
        this.decoder = null;

        this.experienceBuffer = [];
        this.metrics = new MetricsTracker({
            updatesPerformed: 0,
            imaginationsPerformed: 0,
            predictionsMade: 0
        });
    }

    async onInitialize() {
        this._initializeModels();
        this.emit('initialized', { 
            latentDim: this.latentDim, 
            ensembleSize: this.ensembleSize 
        });
    }

    _initializeModels() {
        this.encoder = this._createModel(64, this.latentDim);
        this.decoder = this._createModel(this.latentDim, 64);
        this.transitionModels = Array.from(
            { length: this.ensembleSize }, 
            () => this._createModel(this.latentDim, this.latentDim)
        );
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
        this.experienceBuffer.push({ state, action, nextState, reward, timestamp: Date.now() });
        
        if (this.experienceBuffer.length > 10000) {
            this.experienceBuffer.shift();
        }

        if (this.experienceBuffer.length >= 32) {
            await this._trainModels();
        }

        this.metrics.increment('updatesPerformed');
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

        const states = new Tensor(batch.map(e => prepareState(e.state)));
        const nextStates = new Tensor(batch.map(e => prepareState(e.nextState)));

        // Train Encoder/Decoder
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
        return model.w.matmul(input.transpose()).add(model.b.reshape([model.b.shape[0], 1])).transpose();
    }

    _step(params, lr) {
        params.forEach(p => {
            if (p.grad) {
                p.data.forEach((_, i) => { p.data[i] -= lr * p.grad[i]; });
            }
        });
    }

    _zeroGrad(params) {
        params.forEach(p => { if (p.grad) p.grad.fill(0); });
    }

    async predict(latentState, numSteps = 1) {
        const predictions = [];
        let current = latentState;

        for (let step = 0; step < numSteps; step++) {
            const ensemblePredictions = this.transitionModels.map(model => 
                this._forwardLinear(current, model).tanh()
            );

            const meanPrediction = this._averageTensors(ensemblePredictions);
            const uncertainty = this._computeUncertainty(ensemblePredictions);

            predictions.push({
                latentState: meanPrediction,
                uncertainty,
                step
            });

            current = meanPrediction;
        }

        this.metrics.increment('predictionsMade', numSteps);
        return predictions;
    }

    async imagine(initialState, horizon = null) {
        const h = horizon ?? this.config.imaginationHorizon;
        const encoded = this._forwardLinear(
            new Tensor([initialState].map(s => {
                const arr = Array.isArray(s) ? s : [s];
                const padded = new Float32Array(64);
                arr.slice(0, 64).forEach((v, i) => padded[i] = v);
                return padded;
            })),
            this.encoder
        ).tanh();

        const imaginedTrajectory = await this.predict(encoded, h);
        this.metrics.increment('imaginationsPerformed');

        return {
            trajectory: imaginedTrajectory,
            decoded: await this._decodeTrajectory(imaginedTrajectory)
        };
    }

    async _decodeTrajectory(trajectory) {
        return Promise.all(trajectory.map(async step => {
            const decoded = this._forwardLinear(step.latentState, this.decoder).tanh();
            return { ...step, decoded: decoded.data };
        }));
    }

    _averageTensors(tensors) {
        const sum = tensors.reduce((acc, t) => acc.add(t), tensors[0].zerosLike());
        return sum.div(tensors.length);
    }

    _computeUncertainty(tensors) {
        const mean = this._averageTensors(tensors);
        const variance = tensors.reduce((acc, t) => acc.add(t.sub(mean).pow(2)), tensors[0].zerosLike());
        return variance.div(tensors.length).data;
    }

    getUncertainty(latentState) {
        const predictions = this.transitionModels.map(model =>
            this._forwardLinear(latentState, model).tanh()
        );
        return this._computeUncertainty(predictions);
    }

    shouldTrustPrediction(uncertainty) {
        const avgUncertainty = uncertainty.reduce((a, b) => a + b, 0) / uncertainty.length;
        return avgUncertainty < this.config.uncertaintyThreshold;
    }

    getStats() {
        return {
            experienceBufferSize: this.experienceBuffer.length,
            metrics: this.metrics.getAll(),
            latentDim: this.latentDim,
            ensembleSize: this.ensembleSize
        };
    }

    async onShutdown() {
        this.experienceBuffer = [];
    }

    // Factory methods
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

/**
 * Enhanced Symbolic Differentiation with gradient analysis
 */
export class SymbolicDifferentiation {
    constructor(config = {}) {
        this.config = mergeConfig(SYMBOLIC_DIFF_DEFAULTS, config);
        this.gradientGraph = new Map();
        this.symbolicGradients = new Map();
        this.bridge = new TensorLogicBridge();
        this.metrics = new MetricsTracker({
            gradientsComputed: 0,
            symbolicAnnotations: 0
        });
    }

    gradient(loss, params, context = new Map()) {
        return params.map(param => {
            const grad = this.computeGradient(loss, param, context);
            if (!(param instanceof SymbolicTensor)) return grad;

            const symbolicGrad = this.annotateGradient(grad, param);
            this.symbolicGradients.set(param, symbolicGrad);
            this.metrics.increment('symbolicAnnotations');
            return symbolicGrad;
        });
    }

    computeGradient(loss, param, context) {
        const eps = this.config.epsilon;
        const grad = new Float32Array(param.data.length);
        const getLoss = () => typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
        const lossBase = getLoss();

        for (let i = 0; i < param.data.length; i++) {
            const original = param.data[i];
            try {
                param.data[i] = original + eps;
                grad[i] = (getLoss() - lossBase) / eps;
            } finally {
                param.data[i] = original;
            }
        }

        if (this.config.trackProvenance) {
            this.trackGradientFlow(param, grad, context);
        }

        this.metrics.increment('gradientsComputed');
        return grad;
    }

    annotateGradient(grad, param) {
        const symbolicGrad = new SymbolicTensor(grad, param.shape);
        
        for (const [key, symbolInfo] of param.symbols) {
            const idx = typeof key === 'string' ? parseInt(key.split(',')[0]) : key;
            if (!isNaN(idx) && idx < grad.length && Math.abs(grad[idx]) > this.config.symbolicThreshold) {
                symbolicGrad.annotate(idx, `∂${symbolInfo.symbol}`, symbolInfo.confidence * Math.abs(grad[idx]));
            }
        }
        
        symbolicGrad.addProvenance('SymbolicDifferentiation', 'annotateGradient', { 
            paramSymbols: param.symbols.size,
            threshold: this.config.symbolicThreshold
        });
        
        return symbolicGrad;
    }

    trackGradientFlow(param, grad, context) {
        this.gradientGraph.set(param, { 
            grad, 
            context: new Map(context), 
            timestamp: Date.now() 
        });
    }

    getSymbolicGradient(param) {
        return this.symbolicGradients.get(param);
    }

    getGradientGraph() {
        return new Map(this.gradientGraph);
    }

    explainGradient(param) {
        const symbolicGrad = this.symbolicGradients.get(param);
        if (!symbolicGrad) {
            return { explanation: 'No gradient computed', symbols: [] };
        }

        const symbols = Array.from(symbolicGrad.symbols.values())
            .map(info => ({ symbol: info.symbol, confidence: info.confidence }));

        return {
            explanation: `Gradient influenced by ${symbols.length} symbolic features`,
            symbols,
            topSymbols: symbols.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
        };
    }

    analyzeGradientFlow() {
        const nodes = Array.from(this.gradientGraph.values());
        if (nodes.length === 0) {
            return { totalNodes: 0, avgMagnitude: 0 };
        }

        const { totalMag, count } = nodes.reduce((acc, node) => {
            if (!node.grad) return acc;
            const mag = node.grad.reduce((sum, val) => sum + Math.abs(val), 0);
            return { totalMag: acc.totalMag + mag, count: acc.count + node.grad.length };
        }, { totalMag: 0, count: 0 });

        return {
            totalNodes: this.gradientGraph.size,
            avgMagnitude: count > 0 ? totalMag / count : 0,
            timestamp: Date.now()
        };
    }

    getImportantParameters(threshold = 0.1) {
        const important = [];
        
        for (const [param, gradInfo] of this.gradientGraph) {
            const magnitude = gradInfo.grad.reduce((sum, val) => sum + Math.abs(val), 0);
            if (magnitude > threshold) {
                important.push({ param, magnitude });
            }
        }

        return important.sort((a, b) => b.magnitude - a.magnitude);
    }

    clear() {
        this.gradientGraph.clear();
        this.symbolicGradients.clear();
        this.metrics.reset();
    }

    getStats() {
        return {
            gradientGraphSize: this.gradientGraph.size,
            symbolicGradientsSize: this.symbolicGradients.size,
            metrics: this.metrics.getAll()
        };
    }
}

/**
 * Unified Neuro-Symbolic System
 */
export class NeuroSymbolicSystem extends Component {
    constructor(config = {}) {
        super(config);
        this.worldModel = new WorldModel(config.worldModel ?? {});
        this.symbolicDiff = new SymbolicDifferentiation(config.symbolicDiff ?? {});
        this.bridge = new TensorLogicBridge();
    }

    async onInitialize() {
        await this.worldModel.initialize();
        this.emit('initialized', {
            worldModel: true,
            symbolicDiff: true
        });
    }

    async update(state, action, nextState, reward) {
        await this.worldModel.update(state, action, nextState, reward);
        return { updated: true };
    }

    async imagine(initialState, horizon = 10) {
        return this.worldModel.imagine(initialState, horizon);
    }

    computeGradient(loss, params) {
        return this.symbolicDiff.gradient(loss, params);
    }

    explainGradient(param) {
        return this.symbolicDiff.explainGradient(param);
    }

    getStats() {
        return {
            worldModel: this.worldModel.getStats(),
            symbolicDiff: this.symbolicDiff.getStats()
        };
    }

    async onShutdown() {
        await this.worldModel.shutdown();
        this.symbolicDiff.clear();
    }
}

export { WorldModel as Model };
export { SymbolicDifferentiation as SymbolicGrad };
export { NeuroSymbolicSystem as NeuroSymbolic };
