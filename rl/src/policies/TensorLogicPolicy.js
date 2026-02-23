import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge, Tensor } from '@senars/tensor';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

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

const InitFns = {
    xavier(fanIn, fanOut) {
        const limit = Math.sqrt(6 / (fanIn + fanOut));
        return () => (Math.random() * 2 - 1) * limit;
    }
};

const PolicyUtils = {
    argmax(array) {
        return array.reduce((maxIdx, val, i) => val > array[maxIdx] ? i : maxIdx, 0);
    },

    sampleCategorical(probs) {
        const rand = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (rand < cumsum) return i;
        }
        return probs.length - 1;
    },

    sampleGaussian() {
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },

    gaussianPdf(x, mu, std) {
        if (Array.isArray(x)) {
            return x.reduce((prod, xi, i) => prod * this.gaussianPdf(xi, mu[i], std), 1);
        }
        const coeff = 1 / (std * Math.sqrt(2 * Math.PI));
        const exponent = -0.5 * Math.pow((x - mu) / std, 2);
        return coeff * Math.exp(exponent);
    },

    findStateActionPatterns(pairs) {
        const correlations = new Map();

        pairs.forEach(({ state, action }) => {
            state.forEach((val, i) => {
                const key = `feature_${i}_action_${action}`;
                const prev = correlations.get(key) ?? { count: 0, sum: 0 };
                correlations.set(key, { count: prev.count + 1, sum: prev.sum + val });
            });
        });

        return Array.from(correlations.entries())
            .filter(([_, stats]) => stats.count > 5)
            .map(([pattern, stats]) => ({
                type: 'correlation',
                pattern,
                avgFeatureValue: stats.sum / stats.count,
                frequency: stats.count
            }));
    }
};

export class TensorLogicPolicy extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));

        this.backend = null;
        this.tensorBridge = new TensorLogicBridge();
        this.parameters = new Map();
        this.optimizer = null;
        this.metta = this.config.mettaInterpreter;
        this.policyTrace = [];
        this.temperature = this.config.initialTemperature;
        this.metrics = new MetricsTracker({ updates: 0, totalLoss: 0, avgEntropy: 0, gradientNorm: 0 });
    }

    async onInitialize() {
        try {
            const { torch } = await import('@senars/tensor');
            this.backend = torch;
            this.tensorBridge.backend = this.backend;
        } catch (e) {
            console.warn('Failed to load tensor backend:', e);
            this.backend = null;
        }

        try {
            const { AdamOptimizer } = await import('@senars/tensor');
            this.optimizer = new AdamOptimizer(this.config.learningRate, this.backend);
        } catch {
            try {
                const { SGDOptimizer } = await import('@senars/tensor');
                this.optimizer = new SGDOptimizer(this.config.learningRate, this.backend);
            } catch (e) {
                console.warn('Failed to load optimizer:', e);
            }
        }

        this._initializeParameters();

        if (this.config.policyScript) {
            await this._loadPolicyScript();
        }

        this.emit('initialized', { parameters: this.parameters.size, backend: !!this.backend, metta: !!this.metta });
    }

    _initializeParameters() {
        if (!this.backend) return;

        const { inputDim, hiddenDim, outputDim, numLayers } = this.config;

        for (let i = 0; i < numLayers; i++) {
            const fanIn = i === 0 ? inputDim : hiddenDim;
            this.parameters.set(`w${i}`, this._createParameter([fanIn, hiddenDim], InitFns.xavier(fanIn, hiddenDim)));
            this.parameters.set(`b${i}`, this._createParameter([hiddenDim], 0));
        }

        this.parameters.set(`w${numLayers}`, this._createParameter([hiddenDim, outputDim], InitFns.xavier(hiddenDim, outputDim)));
        this.parameters.set(`b${numLayers}`, this._createParameter([outputDim], 0));
    }

    _createParameter(shape, initFn) {
        const size = shape.reduce((a, b) => a * b, 1);
        const data = typeof initFn === 'function' ? Array.from({ length: size }, initFn) : Array(size).fill(initFn);
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
            // Silently continue
        }
    }

    forward(state, options = {}) {
        const { trackGradient = true, returnIntermediate = false } = options;

        if (!this.backend) {
            return { logits: new SymbolicTensor([0, 0, 0, 0], [4]), hidden: null };
        }

        const intermediates = [];
        let input = new SymbolicTensor(Array.isArray(state) ? state : Array.from(state), [state.length], { requiresGrad: trackGradient });
        const numLayers = this.config.numLayers;

        for (let i = 0; i < numLayers; i++) {
            const w = this.parameters.get(`w${i}`);
            const b = this.parameters.get(`b${i}`);

            const linear = this.backend.add(this.backend.matmul(input, w), b);
            const activated = this.backend.relu(linear);

            intermediates.push({ layer: i, linear, activated });
            input = activated;
        }

        const wOut = this.parameters.get(`w${numLayers}`);
        const bOut = this.parameters.get(`b${numLayers}`);
        const logits = this.backend.add(this.backend.matmul(input, wOut), bOut);

        // logits is already a Tensor from operations
        return {
            logits: logits instanceof SymbolicTensor ? logits : new SymbolicTensor(logits.data, logits.shape),
            hidden: returnIntermediate ? intermediates : null,
            intermediates: returnIntermediate ? intermediates : null
        };
    }

    async selectAction(state, options = {}) {
        const { exploration = null, deterministic = false } = options;

        if (this.config.policyType === 'metta' && this.metta) {
            return this.executeMettaPolicy(state, options);
        }

        const { logits } = this.forward(state);

        const temp = exploration ?? this.temperature;
        // logits is a Tensor
        const scaledLogits = this.backend.div(logits, temp);

        let action, actionProb;

        if (this.config.actionType === 'discrete') {
            if (this.config.policyType === 'softmax') {
                const probs = this.backend.softmax(scaledLogits); // Returns Tensor
                const probsData = probs.data;
                if (deterministic || exploration === 0) {
                    action = PolicyUtils.argmax(probsData);
                    actionProb = probsData[action];
                } else {
                    action = PolicyUtils.sampleCategorical(probsData);
                    actionProb = probsData[action];
                }
            } else {
                if (Math.random() < (exploration ?? 0.1)) {
                    action = Math.floor(Math.random() * this.config.outputDim);
                    actionProb = 1 / this.config.outputDim;
                } else {
                    action = PolicyUtils.argmax(logits.data);
                    actionProb = 1.0;
                }
            }
        } else {
            const mu = this.backend.tanh(logits); // Returns Tensor
            const muData = mu.data;
            const std = 0.1;

            action = deterministic
                ? Array.from(muData)
                : Array.from(muData).map(m => m + std * PolicyUtils.sampleGaussian());
            actionProb = PolicyUtils.gaussianPdf(action, Array.from(muData), std);
        }

        if (exploration === null && this.temperature > this.config.minTemperature) {
            this.temperature *= this.config.temperatureDecay;
        }

        return { action, actionProb, logits: logits.data, state };
    }

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

        return { loss: loss.data[0] ?? 0, entropy: entropy.data[0] ?? 0, success: true };
    }

    _computeLoss(logits, action, reward, advantages, oldProbs) {
        const probs = this.backend.softmax(logits);
        const logProbs = this.backend.log(probs);

        const maskData = new Array(probs.size).fill(0);
        maskData[action] = 1;
        const mask = new Tensor(maskData, {backend: this.backend});
        const selectedLogProb = this.backend.sum(this.backend.mul(logProbs, mask));

        if (advantages) {
            return this.backend.mul(selectedLogProb, -advantages[0]);
        }

        if (oldProbs) {
            const oldLogProbVal = Math.log(oldProbs[action] + 1e-8);
            const oldLogProb = new Tensor([oldLogProbVal], {backend: this.backend});
            const ratio = this.backend.exp(this.backend.sub(selectedLogProb, oldLogProb));

            // Simplified PPO-like clip
            const eps = 0.2;
            const surr1 = this.backend.mul(ratio, reward);
            const surr2 = this.backend.clamp(ratio, 1 - eps, 1 + eps); // Simplified logic
            // Note: implementing full PPO loss graph here is complex without more ops.
            // For now, defaulting to standard policy gradient for oldProbs case if complex ops missing
            return this.backend.mul(selectedLogProb, -reward);
        }

        return this.backend.mul(selectedLogProb, -reward);
    }

    _computeEntropy(logits) {
        const probs = this.backend.softmax(logits);
        const logProbs = this.backend.log(probs);
        let entropy = 0;
        // This is not differentiable if using loop over values.
        // Should use tensor ops: -sum(probs * logProbs)
        const ent = this.backend.sum(this.backend.mul(probs, logProbs));
        return this.backend.mul(ent, -1);
    }

    _computeL2Regularization() {
        let l2 = 0;
        // Again, should be tensor graph.
        // sum(w^2)
        const params = Array.from(this.parameters.entries())
            .filter(([name]) => name.startsWith('w'))
            .map(([_, p]) => this.backend.sum(this.backend.mul(p, p)));

        if (params.length === 0) return new Tensor([0], {backend: this.backend});

        const sumL2 = params.reduce((acc, p) => this.backend.add(acc, p), new Tensor([0], {backend: this.backend}));
        return this.backend.mul(sumL2, 0.5);
    }

    _clipGradients(maxNorm) {
        this.parameters.forEach(param => {
            if (param.grad) {
                // grad is a Tensor
                const gradData = param.grad.data;
                const norm = Math.sqrt(gradData.reduce((s, g) => s + g * g, 0));
                if (norm > maxNorm) {
                    const scale = maxNorm / (norm + 1e-8);
                    param.grad = this.backend.mul(param.grad, scale);
                }
            }
        });
    }

    async executeMettaPolicy(state, options = {}) {
        if (!this.metta) return this.selectAction(state, { ...options, policyType: 'softmax' }); // Avoid recursion

        const stateExpr = `(${Array.isArray(state) ? state.join(' ') : state})`;
        // For simple Metta policy, we assume the script is loaded and defines (get-action $obs)
        // or (policy $obs $action-values)

        let action = 0;
        try {
            // Try standard interface first: (get-action $obs)
            const result = await this.metta.run(`! (get-action ${stateExpr})`);
            if (result && result.length > 0) {
                 const val = parseFloat(result[0].toString());
                 if (!isNaN(val)) action = Math.floor(val);
            } else {
                // Fallback to previous behavior if needed, or just return random
            }
        } catch (e) {
            console.warn('Metta policy execution failed:', e);
        }

        return { action, state };
    }

    async updateMettaPolicy(transition, options = {}) {
        if (!this.metta) return { success: false };

        const { learningRate = this.config.learningRate, gamma = this.config.gamma } = options;
        const { state, action, reward, nextState, done } = transition;

        const obsStr = `(${Array.isArray(state) ? state.join(' ') : state})`;
        const target = done ? reward : reward + gamma * reward;
        const targetStr = `(${action} ${target})`; // Simple (action value) tuple

        try {
            const result = await this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    extractRules(options = {}) {
        const { threshold = 0.5 } = options;
        const rules = [];

        this.parameters.forEach((param, name) => {
            if (!name.startsWith('w')) return;

            const maxWeight = Math.max(...param.data.map(Math.abs));
            if (maxWeight > threshold) {
                const importantIndices = param.data
                    .map((w, i) => ({ w, i }))
                    .filter(x => Math.abs(x.w) > threshold * maxWeight);

                rules.push({ parameter: name, importantFeatures: importantIndices, strength: maxWeight });
            }
        });

        if (this.policyTrace.length > 0) {
            rules.push(...PolicyUtils.findStateActionPatterns(this.policyTrace.map(t => ({ state: t.state, action: t.result }))));
        }

        return rules;
    }

    getParameters() {
        return Object.fromEntries(
            Array.from(this.parameters.entries()).map(([name, param]) => [name, { data: [...param.data], shape: [...param.shape] }])
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

    loadState(state) {
        if (state.parameters) this.setParameters(state.parameters);
        if (state.metrics) this.metrics.reset();
        if (state.temperature) this.temperature = state.temperature;
    }

    async onShutdown() {
        this.parameters.clear();
        this.optimizer = null;
        this.policyTrace = [];
    }

    static createDiscrete(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim, actionType: 'discrete', policyType: 'softmax', ...config });
    }

    static createContinuous(inputDim, actionDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim: actionDim, actionType: 'continuous', policyType: 'gaussian', ...config });
    }

    static createMettaPolicy(inputDim, outputDim, mettaInterpreter, policyScript, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim, mettaInterpreter, policyScript, actionType: 'discrete', policyType: 'softmax', ...config });
    }

    static createMinimal(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({ inputDim, outputDim, numLayers: 1, hiddenDim: 32, l2Regularization: 0, entropyBonus: 0, ...config });
    }
}
