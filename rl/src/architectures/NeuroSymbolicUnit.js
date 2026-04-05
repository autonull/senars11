/**
 * Neuro-Symbolic Unit
 * Base processing unit for neuro-symbolic architectures
 */
import { Component } from '../composable/Component.js';
import { TensorLogicBridge, SymbolicTensor } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { UNIT_DEFAULTS } from './ArchitectureConfig.js';

/**
 * Neuro-symbolic processing unit
 * Handles encoding, lifting to symbols, attention, and grounding
 */
export class NeuroSymbolicUnit extends Component {
    constructor(config = {}) {
        super(mergeConfig(UNIT_DEFAULTS, config));
        this.bridge = new TensorLogicBridge();
        this.state = null;
        this.symbols = new Map();
    }

    async onInitialize() {
        this.state = {
            neural: new Float32Array(this.config.inputDim),
            symbolic: new Map(),
            attention: new Float32Array(this.config.inputDim).fill(1)
        };
    }

    /**
     * Process input through neuro-symbolic pipeline
     * @param {any} input - Input data (tensor or array)
     * @param {object} context - Processing options
     * @returns {Promise<SymbolicTensor|Float32Array>} Processed output
     */
    async process(input, context = {}) {
        const { lift = true, ground = false, attend = false } = context;
        const encoded = this._encode(input);
        const lifted = lift ? this._lift(encoded) : encoded;
        const attended = attend ? this._applyAttention(lifted) : lifted;
        const processed = await this.symbolicProcess(attended);
        return ground ? this._ground(processed) : processed;
    }

    _encode(input) {
        if (input instanceof SymbolicTensor) {return input;}
        const data = Array.isArray(input)
            ? new Float32Array(input)
            : new Float32Array([input]);
        return new SymbolicTensor(data, [data.length]);
    }

    _lift(tensor) {
        return this.bridge.liftToSymbols(tensor, { threshold: 0.3 });
    }

    _ground(symbols) {
        return this.bridge.groundToTensor(symbols, [this.config.outputDim]);
    }

    _applyAttention(tensor) {
        if (!tensor.symbols?.size) {return tensor;}
        const mask = this.bridge.createAttentionMask(
            tensor,
            new Set(Array.from(tensor.symbols.values()).map(s => s.symbol))
        );
        return this.bridge.symbolicMul(tensor, mask, 'intersection');
    }

    /**
     * Symbolic processing - override in subclasses
     * @param {SymbolicTensor} input - Symbolic input
     * @returns {Promise<SymbolicTensor>} Processed output
     */
    async symbolicProcess(input) {
        return input;
    }

    /**
     * Set unit state
     * @param {Float32Array} neural - Neural state
     * @param {Map} symbolic - Symbolic state
     */
    setState(neural, symbolic = null) {
        this.state.neural = neural;
        if (symbolic) {this.state.symbolic = symbolic;}
        this.emit('stateUpdate', { neural, symbolic: this.state.symbolic });
    }

    getState() {
        return { ...this.state };
    }

    /**
     * Learn from transition - override in subclasses
     * @param {object} transition - Experience transition
     * @param {number} reward - Reward signal
     */
    async learn(transition, reward) {
        // Placeholder for learning
    }
}
