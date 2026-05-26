/**
 * Architecture Builder
 * Fluent builder for constructing neuro-symbolic architectures
 */
import {NeuroSymbolicLayer} from './NeuroSymbolicLayer.js';
import {NeuroSymbolicArchitecture} from './NeuroSymbolicArchitecture.js';
import {ArchitectureConfig, LAYER_DEFAULTS} from './ArchitectureConfig.js';

/**
 * Fluent builder for neuro-symbolic architectures
 */
export class ArchitectureBuilder {
    constructor() {
        this.layers = [];
        this.connections = [];
        this.config = new ArchitectureConfig();
    }

    /**
     * Set architecture configuration
     * @param {object} config - Architecture configuration
     * @returns {ArchitectureBuilder} this
     */
    withConfig(config) {
        this.config = new ArchitectureConfig(config);
        return this;
    }

    /**
     * Add a layer to the architecture
     * @param {string} type - Layer type
     * @param {object} options - Layer options
     * @returns {ArchitectureBuilder} this
     */
    addLayer(type, options = {}) {
        this.layers.push(new NeuroSymbolicLayer({
            type,
            id: `layer_${this.layers.length}`,
            ...options
        }));
        return this;
    }

    /**
     * Add perception layer
     * @param {object} options - Layer options
     * @returns {ArchitectureBuilder} this
     */
    addPerceptionLayer(options = {}) {
        return this.addLayer('perception', {...LAYER_DEFAULTS.perception, ...options});
    }

    /**
     * Add reasoning layer
     * @param {object} options - Layer options
     * @returns {ArchitectureBuilder} this
     */
    addReasoningLayer(options = {}) {
        return this.addLayer('reasoning', {...LAYER_DEFAULTS.reasoning, ...options});
    }

    /**
     * Add planning layer
     * @param {object} options - Layer options
     * @returns {ArchitectureBuilder} this
     */
    addPlanningLayer(options = {}) {
        return this.addLayer('planning', {...LAYER_DEFAULTS.planning, ...options});
    }

    /**
     * Add action layer
     * @param {object} options - Layer options
     * @returns {ArchitectureBuilder} this
     */
    addActionLayer(options = {}) {
        return this.addLayer('action', {...LAYER_DEFAULTS.action, ...options});
    }

    /**
     * Connect two layers
     * @param {number} fromIdx - Source layer index
     * @param {number} toIdx - Target layer index
     * @param {number[]} targetUnits - Optional specific target units
     * @returns {ArchitectureBuilder} this
     */
    connect(fromIdx, toIdx, targetUnits = null) {
        this.connections.push({from: fromIdx, to: toIdx, targetUnits});
        return this;
    }

    /**
     * Chain all layers sequentially
     * @returns {ArchitectureBuilder} this
     */
    chain() {
        this.layers.slice(0, -1).forEach((_, i) => this.connect(i, i + 1));
        return this;
    }

    /**
     * Add residual connections (skip connections)
     * @returns {ArchitectureBuilder} this
     */
    withResidualConnections() {
        this.layers.slice(0, -2).forEach((_, i) => this.connect(i, i + 2));
        return this;
    }

    /**
     * Enable attention for all layers
     * @returns {ArchitectureBuilder} this
     */
    withAttention() {
        this.layers.forEach(layer => {
            layer.config.attention = true;
        });
        return this;
    }

    /**
     * Build the architecture
     * @returns {Promise<NeuroSymbolicArchitecture>} Built architecture
     */
    async build() {
        const architecture = new NeuroSymbolicArchitecture(this.config);

        for (const layer of this.layers) {
            architecture.addLayer(layer.config.id, layer);
        }

        for (const conn of this.connections) {
            const fromLayer = this.layers[conn.from];
            const toLayer = this.layers[conn.to];
            toLayer.connect(fromLayer, conn.targetUnits);
        }

        return architecture;
    }
}
