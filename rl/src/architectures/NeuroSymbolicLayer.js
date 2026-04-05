/**
 * Neuro-Symbolic Layer
 * Layer of neuro-symbolic units with aggregation
 */
import {Component} from '../composable/Component.js';
import {SymbolicTensor} from '@senars/tensor';
import {mergeConfig} from '../utils/index.js';
import {NeuroSymbolicUnit} from './NeuroSymbolicUnit.js';
import {LAYER_CONFIG_DEFAULTS} from './ArchitectureConfig.js';

/**
 * Layer of neuro-symbolic units with output aggregation
 */
export class NeuroSymbolicLayer extends Component {
    constructor(config = {}) {
        super(mergeConfig(LAYER_CONFIG_DEFAULTS, config));
        this.units = [];
        this.connections = new Map();
    }

    async onInitialize() {
        this.units = Array.from({length: this.config.units}, (_, i) => {
            const unit = new NeuroSymbolicUnit({
                ...this.config,
                id: `unit_${i}`
            });
            unit.initialize();
            return unit;
        });
    }

    /**
     * Process inputs through all units and aggregate
     * @param {any} inputs - Input data
     * @param {object} context - Processing context
     * @returns {Promise<any>} Aggregated output
     */
    async process(inputs, context = {}) {
        const outputs = await Promise.all(
            this.units.map(unit => unit.process(inputs, context))
        );
        return this._aggregate(outputs);
    }

    _aggregate(outputs) {
        if (!(outputs[0] instanceof SymbolicTensor)) {
            return outputs;
        }

        const aggregated = outputs[0].clone();
        outputs.slice(1).forEach(output => {
            output.data.forEach((val, i) => {
                aggregated.data[i] += val;
            });
        });
        aggregated.data.forEach((_, i) => {
            aggregated.data[i] /= outputs.length;
        });
        return aggregated;
    }

    /**
     * Connect this layer to a source layer
     * @param {NeuroSymbolicLayer} sourceLayer - Source layer
     * @param {number} targetUnitIdx - Optional specific unit index
     * @returns {NeuroSymbolicLayer} this
     */
    connect(sourceLayer, targetUnitIdx = null) {
        this.connections.set(
            `${sourceLayer.config.id || 'source'}->${this.config.id || 'target'}`,
            {
                source: sourceLayer,
                targetUnits: targetUnitIdx !== null ? [targetUnitIdx] : null
            }
        );
        return this;
    }

    /**
     * Learn from transition
     * @param {object} transition - Experience transition
     * @param {number} reward - Reward signal
     */
    async learn(transition, reward) {
        this.units.forEach(unit => unit.learn?.(transition, reward));
    }
}
