/**
 * Symbolic Differentiation and World Model Learning
 * Enables gradient-based learning with symbolic explanations.
 */
import { Tensor, TensorFunctor } from '@senars/tensor';
import { SymbolicTensor, TensorLogicBridge } from './TensorLogicBridge.js';
import { Component } from '../composable/Component.js';

/**
 * Symbolic Differentiation Engine.
 * Tracks gradients with symbolic provenance for explainable learning.
 */
export class SymbolicDifferentiation {
    constructor(config = {}) {
        this.config = {
            trackProvenance: true,
            symbolicThreshold: 0.3,
            ...config
        };
        
        this.gradientGraph = new Map();
        this.symbolicGradients = new Map();
        this.bridge = new TensorLogicBridge();
    }

    /**
     * Compute gradient with symbolic tracking.
     */
    gradient(loss, params, context = new Map()) {
        const gradients = [];
        
        for (const param of params) {
            const grad = this.computeGradient(loss, param, context);
            
            if (param instanceof SymbolicTensor) {
                const symbolicGrad = this.annotateGradient(grad, param);
                gradients.push(symbolicGrad);
                this.symbolicGradients.set(param, symbolicGrad);
            } else {
                gradients.push(grad);
            }
        }
        
        return gradients;
    }

    /**
     * Compute gradient for a single parameter.
     */
    computeGradient(loss, param, context) {
        // Numerical gradient approximation with symbolic tracking
        const eps = 1e-5;
        const grad = new Float32Array(param.data.length);
        
        const lossBase = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
        
        for (let i = 0; i < param.data.length; i++) {
            const original = param.data[i];
            
            // Forward difference
            param.data[i] = original + eps;
            const lossPlus = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
            
            grad[i] = (lossPlus - lossBase) / eps;
            
            param.data[i] = original;
        }
        
        if (this.config.trackProvenance) {
            this.trackGradientFlow(param, grad, context);
        }
        
        return grad;
    }

    /**
     * Annotate gradient with symbolic information.
     */
    annotateGradient(grad, param) {
        const symbolicGrad = new SymbolicTensor(grad, param.shape);
        
        // Propagate symbols from parameter to gradient
        for (const [key, symbolInfo] of param.symbols) {
            const idx = typeof key === 'string' ? parseInt(key.split(',')[0]) : key;
            if (!isNaN(idx) && idx < grad.length && Math.abs(grad[idx]) > this.config.symbolicThreshold) {
                symbolicGrad.annotate(
                    idx,
                    `∂${symbolInfo.symbol}`,
                    symbolInfo.confidence * Math.abs(grad[idx])
                );
            }
        }
        
        symbolicGrad.addProvenance('SymbolicDifferentiation', 'annotateGradient', {
            paramSymbols: param.symbols.size
        });
        
        return symbolicGrad;
    }

    /**
     * Track gradient flow through computation graph.
     */
    trackGradientFlow(param, grad, context) {
        const nodeId = `param_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        this.gradientGraph.set(nodeId, {
            param,
            grad,
            context: new Map(context),
            timestamp: Date.now(),
            magnitude: Math.sqrt(grad.reduce((a, b) => a + b * b, 0))
        });
        
        // Prune old entries
        if (this.gradientGraph.size > 1000) {
            const oldest = Array.from(this.gradientGraph.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this.gradientGraph.delete(oldest[0]);
        }
    }

    /**
     * Get gradient flow analysis.
     */
    analyzeGradientFlow() {
        const analysis = {
            totalNodes: this.gradientGraph.size,
            avgMagnitude: 0,
            maxMagnitude: 0,
            vanishingGradients: 0,
            explodingGradients: 0
        };
        
        let totalMag = 0;
        for (const [, node] of this.gradientGraph) {
            const mag = node.magnitude;
            totalMag += mag;
            
            if (mag > analysis.maxMagnitude) {
                analysis.maxMagnitude = mag;
            }
            
            if (mag < 1e-7) analysis.vanishingGradients++;
            if (mag > 100) analysis.explodingGradients++;
        }
        
        analysis.avgMagnitude = totalMag / Math.max(1, this.gradientGraph.size);
        
        return analysis;
    }

    /**
     * Explain gradient in symbolic terms.
     */
    explainGradient(param) {
        if (!(param instanceof SymbolicTensor)) {
            return { explanation: 'No symbolic information available', symbols: [] };
        }
        
        const symbolicGrad = this.symbolicGradients.get(param);
        if (!symbolicGrad) {
            return { explanation: 'Gradient not computed', symbols: [] };
        }
        
        const explanations = [];
        for (const [key, { symbol, confidence }] of symbolicGrad.symbols) {
            const idx = typeof key === 'string' ? parseInt(key) : key;
            const gradValue = symbolicGrad.data[idx] || 0;
            
            explanations.push({
                symbol,
                gradient: gradValue,
                confidence,
                interpretation: this.interpretGradient(gradValue, symbol)
            });
        }
        
        return {
            explanation: this.summarizeExplanations(explanations),
            symbols: explanations
        };
    }

    interpretGradient(grad, symbol) {
        if (Math.abs(grad) < 0.01) return 'negligible_effect';
        if (grad > 0) return `increase_${symbol}`;
        return `decrease_${symbol}`;
    }

    summarizeExplanations(explanations) {
        if (explanations.length === 0) return 'No significant symbolic gradients';
        
        const sorted = [...explanations].sort((a, b) => Math.abs(b.gradient) - Math.abs(a.gradient));
        const top = sorted.slice(0, 3);
        
        return `Top influences: ${top.map(e => `${e.symbol}(${e.gradient.toFixed(3)})`).join(', ')}`;
    }

    /**
     * Clear gradient tracking.
     */
    clear() {
        this.gradientGraph.clear();
        this.symbolicGradients.clear();
    }
}

/**
 * World Model for imagination-based planning.
 * Learns symbolic-neural dynamics models.
 */
export class WorldModel extends Component {
    constructor(config = {}) {
        super({
            modelType: 'neural-symbolic',
            horizon: 10,
            latentDim: 32,
            ensembleSize: 3,
            uncertaintyThreshold: 0.5,
            ...config
        });
        
        this.models = [];
        this.symbolicRules = new Map();
        this.predictionHistory = [];
        this.uncertaintyEstimates = new Map();
        this.bridge = new TensorLogicBridge();
    }

    async onInitialize() {
        // Initialize ensemble of models
        for (let i = 0; i < this.config.ensembleSize; i++) {
            this.models.push(this.createModel());
        }
        
        this.setState('trained', false);
        this.setState('trainingStep', 0);
    }

    createModel() {
        // Simple dynamics model placeholder
        return {
            weights: new Float32Array(this.config.latentDim * this.config.latentDim),
            bias: new Float32Array(this.config.latentDim),
            symbolMap: new Map()
        };
    }

    /**
     * Predict next state given current state and action.
     */
    predict(state, action, horizon = 1) {
        const predictions = [];
        const uncertainties = [];
        
        let currentState = this.encodeState(state);
        
        for (let h = 0; h < horizon; h++) {
            const modelOutputs = this.models.map(model => 
                this.stepModel(model, currentState, action)
            );
            
            // Ensemble mean
            const mean = this.ensembleMean(modelOutputs);
            
            // Ensemble variance (uncertainty)
            const variance = this.ensembleVariance(modelOutputs, mean);
            
            predictions.push(mean);
            uncertainties.push(variance);
            
            // Check uncertainty threshold
            if (variance > this.config.uncertaintyThreshold) {
                break; // Stop imagination at high uncertainty
            }
            
            currentState = mean;
        }
        
        return {
            predictions,
            uncertainties,
            horizon: predictions.length
        };
    }

    /**
     * Encode state to latent representation.
     */
    encodeState(state) {
        if (state instanceof SymbolicTensor) {
            return state;
        }
        
        const data = Array.isArray(state) 
            ? new Float32Array(state)
            : new Float32Array([state]);
        
        return new SymbolicTensor(data, [data.length]);
    }

    /**
     * Step model forward.
     */
    stepModel(model, state, action) {
        // Simple linear dynamics (placeholder for neural network)
        const inputDim = state.data.length + (Array.isArray(action) ? action.length : 1);
        const combined = new Float32Array(inputDim);
        
        combined.set(state.data);
        if (Array.isArray(action)) {
            combined.set(action, state.data.length);
        } else {
            combined[state.data.length] = action;
        }
        
        // Matrix-vector multiply (simplified)
        const output = new Float32Array(this.config.latentDim);
        for (let i = 0; i < this.config.latentDim; i++) {
            let sum = model.bias[i];
            for (let j = 0; j < Math.min(inputDim, this.config.latentDim); j++) {
                sum += model.weights[i * this.config.latentDim + j] * combined[j];
            }
            output[i] = Math.tanh(sum);
        }
        
        return new SymbolicTensor(output, [this.config.latentDim]);
    }

    /**
     * Compute ensemble mean.
     */
    ensembleMean(outputs) {
        const result = new Float32Array(outputs[0].data.length);
        
        for (const output of outputs) {
            for (let i = 0; i < result.length; i++) {
                result[i] += output.data[i];
            }
        }
        
        for (let i = 0; i < result.length; i++) {
            result[i] /= outputs.length;
        }
        
        return new SymbolicTensor(result, outputs[0].shape);
    }

    /**
     * Compute ensemble variance.
     */
    ensembleVariance(outputs, mean) {
        let totalVar = 0;
        
        for (const output of outputs) {
            for (let i = 0; i < output.data.length; i++) {
                const diff = output.data[i] - mean.data[i];
                totalVar += diff * diff;
            }
        }

        return totalVar / (outputs.length * outputs[0].data.length);
    }

    /**
     * Train world model on experience.
     */
    async train(transitions, steps = 100) {
        const { states, actions, nextStates } = this.organizeTransitions(transitions);
        
        for (let step = 0; step < steps; step++) {
            for (const model of this.models) {
                this.trainModelStep(model, states, actions, nextStates);
            }
            
            this.setState('trainingStep', step + 1);
        }
        
        this.setState('trained', true);
        this.extractSymbolicRules();
    }

    /**
     * Organize transitions for batch training.
     */
    organizeTransitions(transitions) {
        return {
            states: transitions.map(t => this.encodeState(t.state)),
            actions: transitions.map(t => t.action),
            nextStates: transitions.map(t => this.encodeState(t.nextState))
        };
    }

    /**
     * Single training step for a model.
     */
    trainModelStep(model, states, actions, nextStates) {
        // Simplified gradient descent (placeholder)
        const lr = 0.01;
        
        for (let i = 0; i < states.length; i++) {
            const predicted = this.stepModel(model, states[i], actions[i]);
            const target = nextStates[i];
            
            // Compute error
            const error = new Float32Array(predicted.data.length);
            for (let j = 0; j < error.length; j++) {
                error[j] = target.data[j] - predicted.data[j];
            }
            
            // Update weights (simplified)
            for (let j = 0; j < model.weights.length && j < error.length; j++) {
                model.weights[j] += lr * error[j % error.length] * states[i].data[j % states[i].data.length];
            }
        }
    }

    /**
     * Extract symbolic rules from learned model.
     */
    extractSymbolicRules() {
        for (let i = 0; i < this.models.length; i++) {
            const model = this.models[i];
            const rules = [];
            
            // Extract rules from weight patterns
            for (let j = 0; j < model.weights.length; j++) {
                const weight = model.weights[j];
                if (Math.abs(weight) > 0.5) {
                    rules.push({
                        from: `feature_${j % this.config.latentDim}`,
                        to: `feature_${Math.floor(j / this.config.latentDim)}`,
                        strength: weight,
                        model: i
                    });
                }
            }
            
            this.symbolicRules.set(`model_${i}`, rules);
        }
    }

    /**
     * Imagine trajectory with symbolic annotations.
     */
    imagine(initialState, actionSequence) {
        const trajectory = [];
        let state = this.encodeState(initialState);
        
        for (const action of actionSequence) {
            const { predictions, uncertainties } = this.predict(state, action, 1);
            
            if (predictions.length === 0) break;
            
            trajectory.push({
                state: state.toNarseseTerm('s'),
                action: this.actionToSymbol(action),
                nextState: predictions[0].toNarseseTerm('s'),
                uncertainty: uncertainties[0]
            });
            
            state = predictions[0];
        }
        
        return {
            trajectory,
            totalUncertainty: trajectory.reduce((a, b) => a + b.uncertainty, 0),
            reliable: trajectory.every(t => t.uncertainty < this.config.uncertaintyThreshold)
        };
    }

    actionToSymbol(action) {
        if (typeof action === 'number') {
            return `a_${action}`;
        }
        if (Array.isArray(action)) {
            return `a(${action.join(',')})`;
        }
        return String(action);
    }

    /**
     * Get model uncertainty for a state-action pair.
     */
    getUncertainty(state, action) {
        const key = `${state}_${action}`;
        if (this.uncertaintyEstimates.has(key)) {
            return this.uncertaintyEstimates.get(key);
        }
        
        const { uncertainties } = this.predict(state, action, 1);
        const uncertainty = uncertainties[0] || 0;
        
        this.uncertaintyEstimates.set(key, uncertainty);
        
        // Prune old estimates
        if (this.uncertaintyEstimates.size > 1000) {
            const oldest = Array.from(this.uncertaintyEstimates.entries())[0];
            this.uncertaintyEstimates.delete(oldest[0]);
        }
        
        return uncertainty;
    }

    /**
     * Get symbolic rules.
     */
    getSymbolicRules() {
        return Array.from(this.symbolicRules.entries());
    }

    serialize() {
        return {
            ...super.serialize(),
            models: this.models.map(m => ({
                weights: Array.from(m.weights),
                bias: Array.from(m.bias)
            })),
            symbolicRules: Array.from(this.symbolicRules.entries()),
            trained: this.getState('trained')
        };
    }
}
