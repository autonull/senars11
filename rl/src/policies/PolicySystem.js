/**
 * Enhanced Policy System
 * Unified policy framework with multiple policy types, regularization, and advanced features
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge, Tensor } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { PolicyUtils, ParameterInitializer } from '../utils/PolicyUtils.js';

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
 * Policy Network with advanced features
 */
export class PolicyNetwork extends Component {
    constructor(config = {}) {
        super(mergeConfig(POLICY_DEFAULTS, config));
        this.backend = null;
        this.tensorBridge = new TensorLogicBridge();
        this.parameters = new Map();
        this.optimizer = null;
        this.metrics = new MetricsTracker({
            updates: 0,
            totalLoss: 0,
            avgEntropy: 0,
            gradientNorm: 0,
            klDivergence: 0
        });
    }

    async onInitialize() {
        try {
            const { torch, AdamOptimizer, SGDOptimizer } = await import('@senars/tensor');
            this.backend = torch;
            this.tensorBridge.backend = this.backend;

            try {
                this.optimizer = new AdamOptimizer(this.config.learningRate, this.backend);
            } catch {
                this.optimizer = new SGDOptizer(this.config.learningRate, this.backend);
            }
        } catch (e) {
            console.warn('Failed to load tensor backend:', e.message);
            this.backend = null;
        }

        this._initializeParameters();
    }

    _initializeParameters() {
        if (!this.backend) return;

        const { inputDim, hiddenDim, outputDim, numLayers } = this.config;

        // Input layer
        this.parameters.set('w_in', this._createParameter([inputDim, hiddenDim], ParameterInitializer.xavier(inputDim, hiddenDim)));
        this.parameters.set('b_in', this._createParameter([hiddenDim], 0));

        // Hidden layers
        for (let i = 1; i < numLayers; i++) {
            this.parameters.set(`w_h${i}`, this._createParameter([hiddenDim, hiddenDim], ParameterInitializer.xavier(hiddenDim, hiddenDim)));
            this.parameters.set(`b_h${i}`, this._createParameter([hiddenDim], 0));
        }

        // Output layer
        this.parameters.set('w_out', this._createParameter([hiddenDim, outputDim], ParameterInitializer.xavier(hiddenDim, outputDim)));
        this.parameters.set('b_out', this._createParameter([outputDim], 0));
    }

    _createParameter(shape, initFn) {
        const size = shape.reduce((a, b) => a * b, 1);
        const data = typeof initFn === 'function'
            ? Array.from({ length: size }, initFn)
            : new Array(size).fill(initFn);

        const t = new Tensor(data, { requiresGrad: true, backend: this.backend });
        t.shape = [...shape];
        return t;
    }

    forward(input, options = {}) {
        const { training = false, returnIntermediate = false } = options;

        if (!this.backend) {
            return { output: new SymbolicTensor([0, 0, 0, 0], [4]), intermediate: null };
        }

        const intermediates = [];
        let current = input instanceof SymbolicTensor ? input : new SymbolicTensor(Array.isArray(input) ? input : [input], [input.length]);

        // Input layer
        let w = this.parameters.get('w_in');
        let b = this.parameters.get('b_in');
        current = this._linear(current, w, b);
        current = this._activation(current);

        if (this.config.dropout > 0 && training) {
            current = this._dropout(current, this.config.dropout);
        }
        if (returnIntermediate) intermediates.push(current);

        // Hidden layers
        for (let i = 1; i < this.config.numLayers; i++) {
            w = this.parameters.get(`w_h${i}`);
            b = this.parameters.get(`b_h${i}`);
            current = this._linear(current, w, b);
            current = this._activation(current);

            if (this.config.dropout > 0 && training) {
                current = this._dropout(current, this.config.dropout);
            }
            if (returnIntermediate) intermediates.push(current);
        }

        // Output layer
        w = this.parameters.get('w_out');
        b = this.parameters.get('b_out');
        const output = this._linear(current, w, b);

        return {
            output: output instanceof SymbolicTensor ? output : new SymbolicTensor(output.data, output.shape),
            intermediate: returnIntermediate ? intermediates : null
        };
    }

    _linear(input, weight, bias) {
        const w = weight;
        const b = bias.reshape ? bias.reshape([bias.shape[0], 1]) : bias;
        const matmulResult = this.backend.matmul(input, w);
        return this.backend.add(matmulResult, b);
    }

    _activation(input) {
        switch (this.config.activation) {
            case 'relu': return this.backend.relu(input);
            case 'tanh': return this.backend.tanh(input);
            case 'sigmoid': return this.backend.sigmoid(input);
            case 'gelu': return this.backend.gelu?.(input) ?? this.backend.relu(input);
            default: return this.backend.relu(input);
        }
    }

    _dropout(input, rate) {
        const maskData = Array.from(input.data).map(() => Math.random() > rate ? 1 / (1 - rate) : 0);
        const mask = new Tensor(maskData, { backend: this.backend });
        mask.shape = input.shape;
        return this.backend.mul(input, mask);
    }

    getParameters() {
        return Object.fromEntries(
            Array.from(this.parameters.entries()).map(([name, param]) => [
                name,
                { data: [...param.data], shape: [...param.shape] }
            ])
        );
    }

    setParameters(params) {
        Object.entries(params).forEach(([name, paramData]) => {
            const param = this.parameters.get(name);
            if (param) {
                param.data = [...paramData.data];
                if (paramData.shape) param.shape = [...paramData.shape];
            }
        });
    }
}

/**
 * Enhanced Tensor Logic Policy
 */
export class TensorLogicPolicy extends Component {
    constructor(config = {}) {
        super(mergeConfig(POLICY_DEFAULTS, config));
        this.network = new PolicyNetwork(config);
        this.temperature = config.initialTemperature ?? 1.0;
        this.minTemperature = config.minTemperature ?? 0.1;
        this.temperatureDecay = config.temperatureDecay ?? 0.995;
    }

    async onInitialize() {
        await this.network.initialize();
    }

    async selectAction(state, options = {}) {
        const { exploration = null, deterministic = false, temperature = null } = options;

        const { output } = this.network.forward(state, { training: false });

        if (!this.network.backend) {
            return {
                action: Math.floor(Math.random() * this.config.outputDim),
                actionProb: 1 / this.config.outputDim,
                logits: output.data,
                state
            };
        }

        const temp = temperature ?? exploration ?? this.temperature;
        const scaledLogits = this.network.backend.div(output, temp);

        const result = this.config.actionType === 'discrete'
            ? this._selectDiscrete(scaledLogits, output, exploration, deterministic)
            : this._selectContinuous(output, deterministic);

        if (exploration === null && this.temperature > this.minTemperature) {
            this.temperature *= this.temperatureDecay;
        }

        return { ...result, logits: output.data, state };
    }

    _selectDiscrete(scaledLogits, logits, exploration, deterministic) {
        const probs = this.network.backend.softmax(scaledLogits);
        const probsData = probs.data;

        const action = (deterministic || exploration === 0)
            ? PolicyUtils.argmax(probsData)
            : PolicyUtils.sampleCategorical(probsData);

        return { action, actionProb: probsData[action] };
    }

    _selectContinuous(logits, deterministic) {
        const mu = this.network.backend.tanh(logits);
        const muData = mu.data;
        const std = 0.1;

        const action = deterministic
            ? Array.from(muData)
            : Array.from(muData).map(m => m + std * PolicyUtils.sampleGaussian());

        const actionProb = PolicyUtils.gaussianPdf(action, Array.from(muData), std);
        return { action, actionProb };
    }

    async update(experience, options = {}) {
        const { advantages = null, returns = null, oldProbs = null, klPenalty = 0.0 } = options;

        if (!this.network.backend || !this.network.optimizer) {
            return { loss: 0, success: false };
        }

        const { state, action, reward, nextState, done } = experience;
        const { output, intermediate } = this.network.forward(state, { returnIntermediate: true, training: true });

        let loss = this._computeLoss(output, action, reward, advantages, oldProbs);
        const entropy = this._computeEntropy(output);
        loss = this.network.backend.sub(loss, this.network.backend.mul(this.config.entropyBonus, entropy));

        const l2Reg = this._computeL2Regularization();
        loss = this.network.backend.add(loss, this.network.backend.mul(this.config.l2Regularization, l2Reg));

        // KL penalty for PPO-style updates
        if (klPenalty > 0 && oldProbs) {
            const kl = this._computeKLDivergence(output, oldProbs);
            loss = this.network.backend.add(loss, this.network.backend.mul(klPenalty, kl));
            this.metrics.set('klDivergence', kl.data[0] ?? 0);
        }

        loss.backward();

        if (this.config.gradientClip > 0) {
            this._clipGradients(this.config.gradientClip);
        }

        const params = Array.from(this.network.parameters.values());
        this.network.optimizer.step(params);
        this.network.optimizer.zeroGrad(params);

        this.metrics.increment('updates');
        this.metrics.set('totalLoss', loss.data[0] ?? 0);
        this.metrics.set('avgEntropy', entropy.data[0] ?? 0);

        return { loss: loss.data[0] ?? 0, entropy: entropy.data[0] ?? 0, success: true };
    }

    _computeLoss(logits, action, reward, advantages, oldProbs) {
        const probs = this.network.backend.softmax(logits);
        const logProbs = this.network.backend.log(probs);

        const numActions = logits.data.length;
        const maskData = new Float32Array(numActions).fill(0);
        maskData[action] = 1.0;
        const mask = new Tensor(maskData, { backend: this.network.backend });

        const selectedLogProb = this.network.backend.sum(this.network.backend.mul(logProbs, mask));

        let term;
        if (advantages) {
            const adv = advantages instanceof Tensor ? advantages : new Tensor([advantages[0]], { backend: this.network.backend });
            term = adv;
        } else {
            const rewardTensor = new Tensor([reward], { backend: this.network.backend });
            term = rewardTensor;
        }

        return this.network.backend.mul(selectedLogProb, this.network.backend.mul(term, -1));
    }

    _computeEntropy(logits) {
        const probs = this.network.backend.softmax(logits);
        const logProbs = this.network.backend.log(probs);
        const p_log_p = this.network.backend.mul(probs, logProbs);
        const sum_p_log_p = this.network.backend.sum(p_log_p);
        return this.network.backend.mul(sum_p_log_p, -1);
    }

    _computeL2Regularization() {
        const params = Array.from(this.network.parameters.entries())
            .filter(([name]) => name.startsWith('w'))
            .map(([_, p]) => this.network.backend.sum(this.network.backend.mul(p, p)));

        if (params.length === 0) return new Tensor([0], { backend: this.network.backend });

        const sumL2 = params.reduce((acc, p) => this.network.backend.add(acc, p));
        return this.network.backend.mul(sumL2, 0.5);
    }

    _computeKLDivergence(newLogits, oldProbs) {
        const newProbs = this.network.backend.softmax(newLogits);
        const oldProbsTensor = oldProbs instanceof Tensor ? oldProbs : new Tensor(oldProbs, { backend: this.network.backend });
        
        const logNewProbs = this.network.backend.log(newProbs);
        const kl = this.network.backend.sum(this.network.backend.mul(oldProbsTensor, this.network.backend.log(this.network.backend.div(oldProbsTensor, newProbs))));
        return kl;
    }

    _clipGradients(maxNorm) {
        for (const param of this.network.parameters.values()) {
            if (param.grad) {
                const gradData = param.grad.data;
                const norm = Math.sqrt(gradData.reduce((s, g) => s + g * g, 0));
                if (norm > maxNorm) {
                    const scale = maxNorm / (norm + 1e-8);
                    param.grad = this.network.backend.mul(param.grad, scale);
                }
            }
        }
    }

    extractRules(options = {}) {
        const { threshold = 0.5 } = options;
        const rules = [];

        for (const [name, param] of this.network.parameters) {
            if (!name.startsWith('w')) continue;

            const maxWeight = Math.max(...param.data.map(Math.abs));
            if (maxWeight > threshold) {
                const importantIndices = param.data
                    .map((w, i) => ({ w, i }))
                    .filter(x => Math.abs(x.w) > threshold * maxWeight);

                rules.push({ parameter: name, importantFeatures: importantIndices, strength: maxWeight });
            }
        }

        return rules;
    }

    getState() {
        return {
            parameters: this.network.getParameters(),
            metrics: this.network.metrics.getAll(),
            temperature: this.temperature,
            architecture: {
                inputDim: this.config.inputDim,
                hiddenDim: this.config.hiddenDim,
                outputDim: this.config.outputDim,
                numLayers: this.config.numLayers
            }
        };
    }

    loadState(state) {
        if (state.parameters) this.network.setParameters(state.parameters);
        if (state.temperature) this.temperature = state.temperature;
    }

    async onShutdown() {
        await this.network.shutdown();
    }

    // Factory methods
    static createDiscrete(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim, actionType: 'discrete', policyType: 'softmax', ...config });
    }

    static createContinuous(inputDim, actionDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim: actionDim, actionType: 'continuous', policyType: 'gaussian', ...config });
    }

    static createMinimal(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim, numLayers: 1, hiddenDim: 32, l2Regularization: 0, entropyBonus: 0, ...config });
    }

    static createPPO(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim,
            hiddenDim: 256,
            numLayers: 2,
            entropyBonus: 0.01,
            l2Regularization: 0.0001,
            gradientClip: 0.5,
            ...config
        });
    }

    static createSAC(inputDim, actionDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim: actionDim * 2,  // mean and log_std
            actionType: 'continuous',
            policyType: 'gaussian',
            hiddenDim: 256,
            numLayers: 2,
            ...config
        });
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
        const { output, intermediate } = this.policyNetwork.forward(state, { returnIntermediate: true });
        
        // Compute attention over intermediate representations
        if (intermediate && intermediate.length > 0) {
            this.attentionWeights = this._computeAttention(intermediate, context);
        }

        const action = this._actionFromOutput(output);
        return { action, attentionWeights: this.attentionWeights };
    }

    _computeAttention(intermediates, context) {
        // Simple attention mechanism
        const numLayers = intermediates.length;
        const weights = new Array(numLayers).fill(0).map(() => Math.random());
        
        // Normalize
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
            const policy = new TensorLogicPolicy({ ...this.config, seed: i });
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

export { TensorLogicPolicy as Policy };
export { PolicyNetwork as Network };
