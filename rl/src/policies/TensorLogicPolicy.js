/**
 * Tensor Logic Policy
 * Policy networks using @senars/tensor with MeTTa integration
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { PolicyUtils, ParameterInitializer } from '../utils/PolicyUtils.js';
import { Tensor, SymbolicTensor } from '@senars/tensor';
import {Logger} from '@senars/core';

const DEFAULTS = {
    inputDim: 64,
    hiddenDim: 128,
    outputDim: 4,
    numLayers: 2,
    policyType: 'softmax',
    actionType: 'discrete',
    mettaInterpreter: null,
    policyScript: null,
    learningRate: 0.001,
    gamma: 0.99,
    entropyBonus: 0.01,
    l2Regularization: 0.0001,
    gradientClip: 0.5,
    initialTemperature: 1.0,
    minTemperature: 0.1,
    temperatureDecay: 0.995
};

export class TensorLogicPolicy extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));

        this.backend = null;
        this.tensorBridge = null;
        this.parameters = new Map();
        this.optimizer = null;
        this.metta = this.config.mettaInterpreter;
        this.temperature = this.config.initialTemperature;
        this.metrics = new MetricsTracker({
            updates: 0,
            totalLoss: 0,
            avgEntropy: 0,
            gradientNorm: 0
        });
    }

    async onInitialize() {
        await this._initializeTensorBackend();
        this._initializeParameters();

        if (this.config.policyScript) {
            await this._loadPolicyScript();
        }

        this.emit('initialized', {
            parameters: this.parameters.size,
            backend: !!this.backend,
            metta: !!this.metta
        });
    }

    async _initializeTensorBackend() {
        try {
            const tensor = await import('@senars/tensor');
            this.backend = tensor.torch;
            this.tensorBridge = new tensor.TensorLogicBridge();
            this.tensorBridge.backend = this.backend;

            try {
                this.optimizer = new tensor.AdamOptimizer(this.config.learningRate, this.backend);
            } catch {
                this.optimizer = new tensor.SGDOptimizer(this.config.learningRate, this.backend);
            }
        } catch (e) {
            Logger.warn('Failed to load tensor backend:', e);
            this.backend = null;
        }
    }

    _initializeParameters() {
        if (!this.backend) return;

        const { inputDim, hiddenDim, outputDim, numLayers } = this.config;

        for (let i = 0; i < numLayers; i++) {
            const fanIn = i === 0 ? inputDim : hiddenDim;
            const initVal = ParameterInitializer.xavier(fanIn, hiddenDim);

            this.parameters.set(`w${i}`, this._createParameter([fanIn, hiddenDim], initVal));
            this.parameters.set(`b${i}`, this._createParameter([hiddenDim], 0));
        }

        const initOut = ParameterInitializer.xavier(hiddenDim, outputDim);
        this.parameters.set(`w${numLayers}`, this._createParameter([hiddenDim, outputDim], initOut));
        this.parameters.set(`b${numLayers}`, this._createParameter([outputDim], 0));
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

    async _loadPolicyScript() {
        if (!this.metta || !this.config.policyScript) return;

        try {
            const fs = await import('fs');
            const script = fs.readFileSync(this.config.policyScript, 'utf-8');
            await this.metta.run(script);
            this.emit('policy:loaded', this.config.policyScript);
        } catch {
            // Silent fail
        }
    }

    /**
     * Forward pass through policy network
     * @param {Array|SymbolicTensor} state - Input state
     * @param {Object} options - Options (trackGradient, returnIntermediate)
     * @returns {Object} Forward result (logits, hidden, intermediates)
     */
    forward(state, options = {}) {
        const { trackGradient = true, returnIntermediate = false } = options;

        if (!this.backend) {
            return {
                logits: new SymbolicTensor([0, 0, 0, 0], [4]),
                hidden: null
            };
        }

        const intermediates = [];
        let input = state instanceof SymbolicTensor
            ? state
            : new SymbolicTensor(
                Array.isArray(state) ? state : Array.from(state),
                [state.length],
                { requiresGrad: trackGradient }
            );

        const numLayers = this.config.numLayers;

        for (let i = 0; i < numLayers; i++) {
            const w = this.parameters.get(`w${i}`);
            const b = this.parameters.get(`b${i}`);

            const linear = this.backend.add(this.backend.matmul(input, w), b);
            const activated = this.backend.relu(linear);

            if (returnIntermediate) {
                intermediates.push({ layer: i, linear, activated });
            }
            input = activated;
        }

        const wOut = this.parameters.get(`w${numLayers}`);
        const bOut = this.parameters.get(`b${numLayers}`);
        const logits = this.backend.add(this.backend.matmul(input, wOut), bOut);

        return {
            logits: logits instanceof SymbolicTensor ? logits : new SymbolicTensor(logits.data, logits.shape),
            hidden: returnIntermediate ? intermediates : null,
            intermediates: returnIntermediate ? intermediates : null
        };
    }

    /**
     * Select action given state
     * @param {Array|SymbolicTensor} state - Input state
     * @param {Object} options - Options (exploration, deterministic)
     * @returns {Object} Action selection result
     */
    async selectAction(state, options = {}) {
        const { exploration = null, deterministic = false } = options;

        if (this.config.policyType === 'metta' && this.metta) {
            return this.executeMettaPolicy(state, options);
        }

        const { logits } = this.forward(state);

        if (!this.backend) {
            return {
                action: Math.floor(Math.random() * this.config.outputDim),
                actionProb: 1 / this.config.outputDim,
                logits: logits.data,
                state
            };
        }

        const temp = exploration ?? this.temperature;
        const scaledLogits = this.backend.div(logits, temp);

        const result = this.config.actionType === 'discrete'
            ? this._selectDiscrete(scaledLogits, logits, exploration, deterministic)
            : this._selectContinuous(logits, deterministic);

        if (exploration === null && this.temperature > this.config.minTemperature) {
            this.temperature *= this.config.temperatureDecay;
        }

        return { ...result, logits: logits.data, state };
    }

    _selectDiscrete(scaledLogits, logits, exploration, deterministic) {
        

        if (this.config.policyType === 'softmax') {
            const probs = this.backend.softmax(scaledLogits);
            const probsData = probs.data;
            const action = (deterministic || exploration === 0)
                ? PolicyUtils.argmax(probsData)
                : PolicyUtils.sampleCategorical(probsData);
            return { action, actionProb: probsData[action] };
        }

        if (Math.random() < (exploration ?? 0.1)) {
            return {
                action: Math.floor(Math.random() * this.config.outputDim),
                actionProb: 1 / this.config.outputDim
            };
        }

        return {
            action: PolicyUtils.argmax(logits.data),
            actionProb: 1.0
        };
    }

    _selectContinuous(logits, deterministic) {
        
        const mu = this.backend.tanh(logits);
        const muData = mu.data;
        const std = 0.1;

        const action = deterministic
            ? Array.from(muData)
            : Array.from(muData).map(m => m + std * PolicyUtils.sampleGaussian());

        const actionProb = PolicyUtils.gaussianPdf(action, Array.from(muData), std);
        return { action, actionProb };
    }

    /**
     * Update policy from experience
     * @param {Object} experience - Experience (state, action, reward, nextState, done)
     * @param {Object} options - Options (advantages, returns, oldProbs)
     * @returns {Object} Update result
     */
    async update(experience, options = {}) {
        const { advantages = null, returns = null, oldProbs = null } = options;

        if (this.config.policyType === 'metta' && this.metta) {
            return this.updateMettaPolicy(experience, options);
        }

        if (!this.backend || !this.optimizer) {
            return { loss: 0, success: false };
        }

        
        const { state, action, reward, nextState, done } = experience;
        const { logits } = this.forward(state, { returnIntermediate: true });

        let loss = this._computeLoss(logits, action, reward, advantages, oldProbs);
        const entropy = this._computeEntropy(logits);
        loss = this.backend.sub(loss, this.backend.mul(this.config.entropyBonus, entropy));

        const l2Reg = this._computeL2Regularization();
        loss = this.backend.add(loss, this.backend.mul(this.config.l2Regularization, l2Reg));

        loss.backward();

        if (this.config.gradientClip > 0) {
            this._clipGradients(this.config.gradientClip);
        }

        const params = Array.from(this.parameters.values());
        this.optimizer.step(params);
        this.optimizer.zeroGrad(params);

        this.metrics.increment('updates');
        this.metrics.set('totalLoss', loss.data[0] ?? 0);
        this.metrics.set('avgEntropy', entropy.data[0] ?? 0);

        return {
            loss: loss.data[0] ?? 0,
            entropy: entropy.data[0] ?? 0,
            success: true
        };
    }

    _computeLoss(logits, action, reward, advantages, oldProbs) {
        
        const probs = this.backend.softmax(logits);
        const logProbs = this.backend.log(probs);

        const numActions = logits.data.length;
        const maskData = new Float32Array(numActions).fill(0);
        maskData[action] = 1.0;
        const mask = new Tensor(maskData, { backend: this.backend });

        const selectedLogProb = this.backend.sum(this.backend.mul(logProbs, mask));

        let term;
        if (advantages) {
            const adv = advantages instanceof Tensor
                ? advantages
                : new Tensor([advantages[0]], { backend: this.backend });
            term = adv;
        } else {
            const rewardTensor = new Tensor([reward], { backend: this.backend });
            term = rewardTensor;
        }

        return this.backend.mul(selectedLogProb, this.backend.mul(term, -1));
    }

    _computeEntropy(logits) {
        const probs = this.backend.softmax(logits);
        const logProbs = this.backend.log(probs);
        const p_log_p = this.backend.mul(probs, logProbs);
        const sum_p_log_p = this.backend.sum(p_log_p);
        return this.backend.mul(sum_p_log_p, -1);
    }

    _computeL2Regularization() {
        
        const params = Array.from(this.parameters.entries())
            .filter(([name]) => name.startsWith('w'))
            .map(([_, p]) => this.backend.sum(this.backend.mul(p, p)));

        if (params.length === 0) {
            return new Tensor([0], { backend: this.backend });
        }

        const sumL2 = params.reduce((acc, p) => this.backend.add(acc, p));
        return this.backend.mul(sumL2, 0.5);
    }

    _clipGradients(maxNorm) {
        for (const param of this.parameters.values()) {
            if (param.grad) {
                const gradData = param.grad.data;
                const norm = Math.sqrt(gradData.reduce((s, g) => s + g * g, 0));
                if (norm > maxNorm) {
                    const scale = maxNorm / (norm + 1e-8);
                    param.grad = this.backend.mul(param.grad, scale);
                }
            }
        }
    }

    /**
     * Execute MeTTa policy
     * @param {Array|SymbolicTensor} state - Input state
     * @param {Object} options - Options
     * @returns {Object} Action result
     */
    async executeMettaPolicy(state, options = {}) {
        if (!this.metta) {
            return this.selectAction(state, { ...options, policyType: 'softmax' });
        }

        const stateExpr = `(${Array.isArray(state) ? state.join(' ') : state})`;
        let action = 0;

        try {
            const result = await this.metta.run(`! (get-action ${stateExpr})`);
            if (result && result.length > 0) {
                const val = parseFloat(result[0].toString());
                if (!isNaN(val)) action = Math.floor(val);
            }
        } catch (e) {
            Logger.warn('Metta policy execution failed:', e);
        }

        return { action, state };
    }

    /**
     * Update MeTTa policy
     * @param {Object} transition - Transition
     * @param {Object} options - Options
     * @returns {Object} Update result
     */
    async updateMettaPolicy(transition, options = {}) {
        if (!this.metta) return { success: false };

        const { gamma = this.config.gamma } = options;
        const { state, action, reward, done } = transition;

        const obsStr = `(${Array.isArray(state) ? state.join(' ') : state})`;
        const target = done ? reward : reward + gamma * reward;
        const targetStr = `(${action} ${target})`;

        try {
            const result = await this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Extract symbolic rules from policy
     * @param {Object} options - Options (threshold)
     * @returns {Array} Extracted rules
     */
    extractRules(options = {}) {
        const { threshold = 0.5 } = options;
        const rules = [];

        for (const [name, param] of this.parameters) {
            if (!name.startsWith('w')) continue;

            const maxWeight = Math.max(...param.data.map(Math.abs));
            if (maxWeight > threshold) {
                const importantIndices = param.data
                    .map((w, i) => ({ w, i }))
                    .filter(x => Math.abs(x.w) > threshold * maxWeight);

                rules.push({
                    parameter: name,
                    importantFeatures: importantIndices,
                    strength: maxWeight
                });
            }
        }

        return rules;
    }

    /**
     * Get policy parameters
     * @returns {Object} Parameters
     */
    getParameters() {
        return Object.fromEntries(
            Array.from(this.parameters.entries()).map(([name, param]) => [
                name,
                { data: [...param.data], shape: [...param.shape] }
            ])
        );
    }

    /**
     * Set policy parameters
     * @param {Object} params - Parameters
     */
    setParameters(params) {
        Object.entries(params).forEach(([name, paramData]) => {
            const param = this.parameters.get(name);
            if (param) {
                param.data = [...paramData.data];
                if (paramData.shape) param.shape = [...paramData.shape];
            }
        });
    }

    /**
     * Get policy state
     * @returns {Object} Policy state
     */
    getState() {
        return {
            parameters: this.getParameters(),
            metrics: this.metrics.getAll(),
            temperature: this.temperature,
            architecture: {
                inputDim: this.config.inputDim,
                hiddenDim: this.config.hiddenDim,
                outputDim: this.config.outputDim,
                numLayers: this.config.numLayers
            }
        };
    }

    /**
     * Load policy state
     * @param {Object} state - State to load
     */
    loadState(state) {
        if (state.parameters) this.setParameters(state.parameters);
        if (state.metrics) this.metrics.reset();
        if (state.temperature) this.temperature = state.temperature;
    }

    async onShutdown() {
        this.parameters.clear();
        this.optimizer = null;
    }

    static createDiscrete(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim,
            actionType: 'discrete',
            policyType: 'softmax',
            ...config
        });
    }

    static createContinuous(inputDim, actionDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim: actionDim,
            actionType: 'continuous',
            policyType: 'gaussian',
            ...config
        });
    }

    static createMettaPolicy(inputDim, outputDim, mettaInterpreter, policyScript, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim,
            mettaInterpreter,
            policyScript,
            actionType: 'discrete',
            policyType: 'softmax',
            ...config
        });
    }

    static createMinimal(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim,
            numLayers: 1,
            hiddenDim: 32,
            l2Regularization: 0,
            entropyBonus: 0,
            ...config
        });
    }
}

// Alias for backward compatibility
export { TensorLogicPolicy as Network };
