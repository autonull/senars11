/**
 * Tensor Logic Policy Network
 * 
 * Policy networks expressed as MeTTa programs with tensor operations and autodiff.
 * Enables interpretable, self-modifying policies with gradient-based learning.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { Experience } from '../experience/ExperienceSystem.js';

/**
 * Policy network with tensor operations and symbolic execution
 */
export class TensorLogicPolicy extends Component {
    constructor(config = {}) {
        super({
            // Architecture
            inputDim: config.inputDim ?? 64,
            hiddenDim: config.hiddenDim ?? 128,
            outputDim: config.outputDim ?? 4,
            numLayers: config.numLayers ?? 2,
            
            // Policy type
            policyType: config.policyType ?? 'softmax', // softmax, gaussian, categorical
            actionType: config.actionType ?? 'discrete', // discrete, continuous
            
            // MeTTa integration
            mettaInterpreter: config.mettaInterpreter ?? null,
            policyScript: config.policyScript ?? null,
            
            // Learning
            learningRate: config.learningRate ?? 0.001,
            gamma: config.gamma ?? 0.99,
            entropyBonus: config.entropyBonus ?? 0.01,
            
            // Regularization
            l2Regularization: config.l2Regularization ?? 0.0001,
            gradientClip: config.gradientClip ?? 0.5,
            
            // Exploration
            initialTemperature: config.initialTemperature ?? 1.0,
            minTemperature: config.minTemperature ?? 0.1,
            temperatureDecay: config.temperatureDecay ?? 0.995,
            
            ...config
        });

        // Tensor backend
        this.backend = null;
        this.tensorBridge = new TensorLogicBridge();
        
        // Parameters (will be initialized)
        this.parameters = new Map();
        this.optimizer = null;
        
        // MeTTa policy
        this.metta = this.config.mettaInterpreter;
        this.policyTrace = [];
        
        // Temperature for exploration
        this.temperature = this.config.initialTemperature;
        
        // Metrics
        this.metrics = {
            updates: 0,
            totalLoss: 0,
            avgEntropy: 0,
            gradientNorm: 0
        };
    }

    async onInitialize() {
        // Initialize tensor backend
        try {
            const { NativeBackend } = await import('@senars/tensor');
            this.backend = new NativeBackend();
            this.tensorBridge.backend = this.backend;
        } catch (e) {
            console.warn('Tensor backend not available:', e.message);
            this.backend = null;
        }

        // Initialize optimizer
        try {
            const { AdamOptimizer } = await import('@senars/tensor');
            this.optimizer = new AdamOptimizer(this.config.learningRate, this.backend);
        } catch (e) {
            console.warn('Adam optimizer not available, using SGD');
            const { SGDOptimizer } = await import('@senars/tensor');
            this.optimizer = new SGDOptimizer(this.config.learningRate, this.backend);
        }

        // Initialize parameters
        this._initializeParameters();

        // Load policy script if provided
        if (this.config.policyScript) {
            await this._loadPolicyScript();
        }

        this.emit('initialized', {
            parameters: this.parameters.size,
            backend: !!this.backend,
            metta: !!this.metta
        });
    }

    _initializeParameters() {
        if (!this.backend) return;

        const { inputDim, hiddenDim, outputDim, numLayers } = this.config;

        // Xavier initialization
        const xavier = (fanIn, fanOut) => {
            const limit = Math.sqrt(6 / (fanIn + fanOut));
            return () => (Math.random() * 2 - 1) * limit;
        };

        // Hidden layers
        for (let i = 0; i < numLayers; i++) {
            const fanIn = i === 0 ? inputDim : hiddenDim;
            const fanOut = hiddenDim;

            this.parameters.set(`w${i}`, this._createParameter([fanIn, fanOut], xavier(fanIn, fanOut)));
            this.parameters.set(`b${i}`, this._createParameter([fanOut], 0));
        }

        // Output layer
        this.parameters.set(
            `w${numLayers}`,
            this._createParameter([hiddenDim, outputDim], xavier(hiddenDim, outputDim))
        );
        this.parameters.set(`b${numLayers}`, this._createParameter([outputDim], 0));
    }

    _createParameter(shape, initFn) {
        const data = typeof initFn === 'function'
            ? Array.from({ length: shape.reduce((a, b) => a * b, 1) }, initFn)
            : Array(shape.reduce((a, b) => a * b, 1)).fill(initFn);

        return {
            data,
            shape,
            requiresGrad: true
        };
    }

    async _loadPolicyScript() {
        if (!this.metta || !this.config.policyScript) return;

        try {
            const fs = await import('fs');
            const script = fs.readFileSync(this.config.policyScript, 'utf-8');
            await this.metta.run(script);
            this.emit('policy:loaded', this.config.policyScript);
        } catch (e) {
            console.warn('Failed to load policy script:', e.message);
        }
    }

    // =========================================================================
    // Forward Pass
    // =========================================================================

    /**
     * Forward pass through policy network
     */
    forward(state, options = {}) {
        const { trackGradient = true, returnIntermediate = false } = options;

        if (!this.backend) {
            // Fallback: random action
            return {
                logits: new SymbolicTensor([0, 0, 0, 0], [4]),
                hidden: null
            };
        }

        const intermediates = [];
        let input = new SymbolicTensor(
            Array.isArray(state) ? state : Array.from(state),
            [state.length],
            { requiresGrad: trackGradient }
        );

        const numLayers = this.config.numLayers;

        // Hidden layers
        for (let i = 0; i < numLayers; i++) {
            const w = this.parameters.get(`w${i}`);
            const b = this.parameters.get(`b${i}`);

            // Linear: Wx + b
            let linear = this.backend.matmul(input.data, w.data);
            linear = this.backend.add(linear, b.data);

            // ReLU activation
            const activated = this.backend.relu(linear);

            intermediates.push({ layer: i, linear, activated });
            input = activated;
        }

        // Output layer
        const wOut = this.parameters.get(`w${numLayers}`);
        const bOut = this.parameters.get(`b${numLayers}`);

        let logits = this.backend.matmul(input.data, wOut.data);
        logits = this.backend.add(logits, bOut.data);

        const output = {
            logits: new SymbolicTensor(logits, [this.config.outputDim]),
            hidden: intermediates
        };

        if (returnIntermediate) {
            output.intermediates = intermediates;
        }

        return output;
    }

    /**
     * Select action from state
     */
    async selectAction(state, options = {}) {
        const { exploration = null, deterministic = false } = options;

        // Forward pass
        const { logits } = this.forward(state);

        // Apply temperature
        const temp = exploration !== null ? exploration : this.temperature;
        const scaledLogits = this.backend.div(logits.data, temp);

        // Action selection based on policy type
        let action;
        let actionProb;

        if (this.config.actionType === 'discrete') {
            if (this.config.policyType === 'softmax') {
                const probs = this.backend.softmax(scaledLogits);
                
                if (deterministic || exploration === 0) {
                    // Argmax
                    action = this._argmax(probs);
                    actionProb = probs[action];
                } else {
                    // Sample from categorical
                    action = this._sampleCategorical(probs);
                    actionProb = probs[action];
                }
            } else {
                // Epsilon-greedy
                if (Math.random() < (exploration ?? 0.1)) {
                    action = Math.floor(Math.random() * this.config.outputDim);
                    actionProb = 1 / this.config.outputDim;
                } else {
                    action = this._argmax(logits.data);
                    actionProb = 1.0;
                }
            }
        } else if (this.config.actionType === 'continuous') {
            // Gaussian policy for continuous actions
            const mu = this.backend.tanh(logits.data); // Bound to [-1, 1]
            const std = 0.1; // Fixed std for now
            
            if (deterministic) {
                action = Array.from(mu);
            } else {
                // Sample from Gaussian
                action = Array.from(mu).map(m => m + std * this._sampleGaussian());
            }
            actionProb = this._gaussianPdf(action, Array.from(mu), std);
        }

        // Decay temperature
        if (exploration === null && this.temperature > this.config.minTemperature) {
            this.temperature *= this.config.temperatureDecay;
        }

        return {
            action,
            actionProb,
            logits: logits.data,
            state
        };
    }

    _argmax(array) {
        let maxIdx = 0;
        let maxVal = array[0];
        for (let i = 1; i < array.length; i++) {
            if (array[i] > maxVal) {
                maxVal = array[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    _sampleCategorical(probs) {
        const rand = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (rand < cumsum) return i;
        }
        return probs.length - 1;
    }

    _sampleGaussian() {
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    _gaussianPdf(x, mu, std) {
        if (Array.isArray(x)) {
            return x.reduce((prod, xi, i) => 
                prod * this._gaussianPdf(xi, mu[i], std), 1
            );
        }
        const coeff = 1 / (std * Math.sqrt(2 * Math.PI));
        const exponent = -0.5 * Math.pow((x - mu) / std, 2);
        return coeff * Math.exp(exponent);
    }

    // =========================================================================
    // Learning
    // =========================================================================

    /**
     * Update policy from experience
     */
    async update(experience, options = {}) {
        const { 
            advantages = null, 
            returns = null,
            oldProbs = null 
        } = options;

        if (!this.backend || !this.optimizer) return { loss: 0, success: false };

        const { state, action, reward, nextState, done } = experience;

        // Forward pass
        const { logits, intermediates } = this.forward(state, { returnIntermediate: true });

        // Compute loss based on algorithm
        let loss;
        if (this.config.policyType === 'softmax' && advantages) {
            // Policy gradient with advantage
            loss = this._computePolicyGradientLoss(logits, action, advantages);
        } else if (oldProbs) {
            // PPO-style clipped loss
            loss = this._computePPOLoss(logits, action, reward, oldProbs);
        } else {
            // Simple REINFORCE loss
            loss = this._computeReinforceLoss(logits, action, reward);
        }

        // Add entropy bonus
        const entropy = this._computeEntropy(logits);
        loss = this.backend.sub(loss, this.backend.mul([this.config.entropyBonus, entropy]));

        // Add L2 regularization
        const l2Reg = this._computeL2Regularization();
        loss = this.backend.add(loss, this.backend.mul([this.config.l2Regularization, l2Reg]));

        // Backward pass
        loss.backward();

        // Gradient clipping
        if (this.config.gradientClip > 0) {
            this._clipGradients(this.config.gradientClip);
        }

        // Optimizer step
        const params = Array.from(this.parameters.values());
        this.optimizer.step(params);

        // Zero gradients
        this.optimizer.zeroGrad(params);

        // Update metrics
        this.metrics.updates++;
        this.metrics.totalLoss += loss.data[0] || 0;
        this.metrics.avgEntropy = entropy.data[0] || 0;

        return {
            loss: loss.data[0] || 0,
            entropy: entropy.data[0] || 0,
            success: true
        };
    }

    _computePolicyGradientLoss(logits, action, advantage) {
        const logProbs = this.backend.logSoftmax(logits);
        const actionLogProb = logProbs[action];
        
        // Negative log prob * advantage (minimize negative = maximize positive)
        const loss = this.backend.mul([actionLogProb, -advantage]);
        return loss;
    }

    _computeReinforceLoss(logits, action, reward) {
        const logProbs = this.backend.logSoftmax(logits);
        const actionLogProb = logProbs[action];
        
        // Negative log prob * discounted reward
        const loss = this.backend.mul([actionLogProb, -reward]);
        return loss;
    }

    _computePPOLoss(logits, action, reward, oldProbs) {
        const logProbs = this.backend.logSoftmax(logits);
        const actionLogProb = logProbs[action];
        
        const oldLogProb = Math.log(oldProbs[action] + 1e-8);
        const ratio = Math.exp(actionLogProb - oldLogProb);
        
        const eps = 0.2;
        const surr1 = ratio * reward;
        const surr2 = Math.max(Math.min((1 + eps) * reward, (1 - eps) * reward), -10);
        
        const clippedRatio = Math.min(surr1, surr2);
        return this.backend.scalar(-clippedRatio);
    }

    _computeEntropy(logits) {
        const probs = this.backend.softmax(logits);
        const logProbs = this.backend.log(probs);
        
        let entropy = 0;
        for (let i = 0; i < probs.length; i++) {
            entropy -= probs[i] * logProbs[i];
        }
        
        return this.backend.scalar(entropy);
    }

    _computeL2Regularization() {
        let l2 = 0;
        for (const [name, param] of this.parameters) {
            if (name.startsWith('w')) {
                for (const val of param.data) {
                    l2 += val * val;
                }
            }
        }
        return this.backend.scalar(l2 * 0.5);
    }

    _clipGradients(maxNorm) {
        for (const [name, param] of this.parameters) {
            if (param.grad) {
                let norm = 0;
                for (const g of param.grad) {
                    norm += g * g;
                }
                norm = Math.sqrt(norm);

                if (norm > maxNorm) {
                    const scale = maxNorm / (norm + 1e-8);
                    param.grad = param.grad.map(g => g * scale);
                }
            }
        }
    }

    // =========================================================================
    // MeTTa Integration
    // =========================================================================

    /**
     * Execute policy as MeTTa program
     */
    async executeMettaPolicy(state, options = {}) {
        if (!this.metta) {
            return this.selectAction(state, options);
        }

        // Convert state to MeTTa format
        const stateExpr = `(state ${state.join(' ')})`;

        // Get policy parameters as MeTTa bindings
        const paramBindings = Array.from(this.parameters.entries())
            .map(([name, param]) => `(bind ${name} ${JSON.stringify(param.data)})`)
            .join('\n');

        // Policy program
        const policyProgram = `
            ${paramBindings}
            (let observation ${stateExpr})
            (policy observation action-values)
        `;

        // Execute
        const result = await this.metta.run(policyProgram);
        this.policyTrace.push({ state, result, timestamp: Date.now() });

        // Parse result
        if (result?.[0]) {
            const actionStr = result[0].toString();
            const action = parseFloat(actionStr);
            return {
                action: isNaN(action) ? 0 : action,
                mettaResult: result[0],
                trace: this.policyTrace[this.policyTrace.length - 1]
            };
        }

        return this.selectAction(state, options);
    }

    /**
     * Extract symbolic rules from policy
     */
    extractRules(options = {}) {
        const { threshold = 0.5 } = options;
        const rules = [];

        // Analyze parameter magnitudes
        for (const [name, param] of this.parameters) {
            if (!name.startsWith('w')) continue;

            const weights = param.data;
            const maxWeight = Math.max(...weights.map(Math.abs));

            if (maxWeight > threshold) {
                const importantIndices = weights
                    .map((w, i) => ({ w, i }))
                    .filter(x => Math.abs(x.w) > threshold * maxWeight);

                rules.push({
                    parameter: name,
                    importantFeatures: importantIndices,
                    strength: maxWeight
                });
            }
        }

        // Analyze policy traces
        if (this.policyTrace.length > 0) {
            const stateActionPairs = this.policyTrace.map(t => ({
                state: t.state,
                action: t.result
            }));

            // Find patterns
            const patterns = this._findStateActionPatterns(stateActionPairs);
            rules.push(...patterns);
        }

        return rules;
    }

    _findStateActionPatterns(pairs) {
        const patterns = [];
        
        // Simple pattern: which features correlate with which actions
        const featureActionCorrelation = new Map();

        for (const { state, action } of pairs) {
            for (let i = 0; i < state.length; i++) {
                const key = `feature_${i}_action_${action}`;
                const prev = featureActionCorrelation.get(key) || { count: 0, sum: 0 };
                featureActionCorrelation.set(key, {
                    count: prev.count + 1,
                    sum: prev.sum + state[i]
                });
            }
        }

        // Extract significant patterns
        for (const [key, stats] of featureActionCorrelation) {
            if (stats.count > 5) {
                patterns.push({
                    type: 'correlation',
                    pattern: key,
                    avgFeatureValue: stats.sum / stats.count,
                    frequency: stats.count
                });
            }
        }

        return patterns;
    }

    /**
     * Get policy trace for introspection
     */
    getPolicyTrace() {
        return [...this.policyTrace];
    }

    /**
     * Clear policy trace
     */
    clearTrace() {
        this.policyTrace = [];
    }

    // =========================================================================
    // State Management
    // =========================================================================

    /**
     * Get policy parameters
     */
    getParameters() {
        const params = {};
        for (const [name, param] of this.parameters) {
            params[name] = {
                data: [...param.data],
                shape: [...param.shape]
            };
        }
        return params;
    }

    /**
     * Set policy parameters
     */
    setParameters(params) {
        for (const [name, paramData] of Object.entries(params)) {
            if (this.parameters.has(name)) {
                const param = this.parameters.get(name);
                param.data = [...paramData.data];
                if (paramData.shape) {
                    param.shape = [...paramData.shape];
                }
            }
        }
    }

    /**
     * Get comprehensive policy state
     */
    getState() {
        return {
            parameters: this.getParameters(),
            metrics: { ...this.metrics },
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
     */
    loadState(state) {
        if (state.parameters) {
            this.setParameters(state.parameters);
        }
        if (state.metrics) {
            this.metrics = { ...state.metrics };
        }
        if (state.temperature) {
            this.temperature = state.temperature;
        }
    }

    async onShutdown() {
        this.parameters.clear();
        this.optimizer = null;
        this.policyTrace = [];
    }
}

/**
 * Factory for creating specialized policy configurations
 */
export class TensorLogicPolicyFactory {
    /**
     * Create policy for discrete action spaces
     */
    static createDiscrete(inputDim, outputDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim,
            actionType: 'discrete',
            policyType: 'softmax',
            ...config
        });
    }

    /**
     * Create policy for continuous action spaces
     */
    static createContinuous(inputDim, actionDim, config = {}) {
        return new TensorLogicPolicy({
            inputDim,
            outputDim: actionDim,
            actionType: 'continuous',
            policyType: 'gaussian',
            ...config
        });
    }

    /**
     * Create policy with MeTTa integration
     */
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

    /**
     * Create minimal policy for resource-constrained environments
     */
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
