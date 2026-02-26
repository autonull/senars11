/**
 * Neuro-Symbolic Architecture
 * Main architecture class for neuro-symbolic processing
 */
import { Component } from '../composable/Component.js';
import { CompositionEngine } from '../composable/CompositionEngine.js';
import { SymbolicTensor } from '@senars/tensor';
import { PolicyUtils } from '../utils/PolicyUtils.js';
import { ArchitectureConfig } from './ArchitectureConfig.js';

/**
 * Neuro-symbolic architecture with layered processing
 */
export class NeuroSymbolicArchitecture extends Component {
    constructor(config = new ArchitectureConfig()) {
        super(config);
        this.config = config;
        this.layers = new Map();
        this.executionOrder = [];
        this.compositionEngine = new CompositionEngine();
    }

    async onInitialize() {
        await Promise.all(
            Array.from(this.layers.values()).map(layer => layer.initialize())
        );
        this.buildExecutionOrder();
    }

    /**
     * Add a layer to the architecture
     * @param {string} name - Layer name
     * @param {Component} layer - Layer instance
     * @returns {NeuroSymbolicArchitecture} this
     */
    addLayer(name, layer) {
        this.layers.set(name, layer);
        this.executionOrder.push(name);
        return this;
    }

    getLayer(name) {
        return this.layers.get(name);
    }

    buildExecutionOrder() {
        this.executionOrder = Array.from(this.layers.keys());
    }

    /**
     * Process input through all layers
     * @param {any} input - Input data
     * @param {object} context - Processing context
     * @returns {Promise<object>} Output and layer activations
     */
    async process(input, context = {}) {
        let current = input;
        const activations = new Map();

        for (const layerName of this.executionOrder) {
            const layer = this.layers.get(layerName);
            if (!layer) continue;

            const output = await layer.process(current, {
                ...context,
                layer: layerName
            });
            activations.set(layerName, output);
            current = output;
        }

        return {
            output: current,
            activations: Object.fromEntries(activations)
        };
    }

    /**
     * Select action from observation
     * @param {any} observation - Observation input
     * @param {any} goal - Optional goal
     * @returns {Promise<any>} Selected action
     */
    async act(observation, goal = null) {
        const context = goal
            ? { goal, lift: true, ground: true }
            : { lift: true, ground: true };

        const result = await this.process(observation, context);

        return result.output instanceof SymbolicTensor
            ? this._extractAction(result.output)
            : result.output;
    }

    _extractAction(tensor) {
        return PolicyUtils.argmax(tensor.data);
    }

    /**
     * Learn from transition
     * @param {object} transition - Experience transition
     * @param {number} reward - Reward signal
     */
    async learn(transition, reward) {
        [...this.executionOrder].reverse().forEach(layerName => {
            const layer = this.layers.get(layerName);
            layer?.learn?.(transition, reward);
        });
        this.emit('learning', { transition, reward });
    }

    /**
     * Serialize architecture
     * @returns {object} Serialized architecture
     */
    serialize() {
        return {
            config: this.config.toJSON(),
            layers: Array.from(this.layers.entries()).map(
                ([name, layer]) => ({ name, config: layer.config })
            ),
            executionOrder: this.executionOrder
        };
    }
}
