/**
 * Architecture Factory and Templates
 * Factory pattern for creating pre-configured architectures
 */
import {ArchitectureBuilder} from './ArchitectureBuilder.js';
import {ArchitectureTemplates} from './ArchitectureConfig.js';

/**
 * Factory for creating neuro-symbolic architectures
 */
export class ArchitectureFactory {
    /**
     * Create architecture from template
     * @param {string} name - Architecture name
     * @param {object} config - Configuration overrides
     * @returns {Promise} Built architecture
     */
    static async create(name, config = {}) {
        const template = ArchitectureTemplates[name];
        if (!template) {
            throw new Error(
                `Unknown architecture: ${name}. Available: ${Object.keys(ArchitectureTemplates).join(', ')}`
            );
        }

        const builderFn = typeof template === 'function' ? template : () => template;
        const templateConfig = builderFn(config);

        const builder = new ArchitectureBuilder()
            .withConfig(templateConfig.config);

        for (const layerConfig of templateConfig.layers) {
            builder.addLayer(layerConfig.type, layerConfig);
        }

        builder.chain();
        if (templateConfig.residual) {
            builder.withResidualConnections();
        }

        return builder.build();
    }

    /**
     * Register custom architecture template
     * @param {string} name - Architecture name
     * @param {Function} builderFn - Template builder function
     */
    static register(name, builderFn) {
        ArchitectureTemplates[name] = builderFn;
    }

    /**
     * List available architecture templates
     * @returns {string[]} Available architecture names
     */
    static list() {
        return Object.keys(ArchitectureTemplates);
    }
}

/**
 * Pre-built architecture templates for quick access
 */
export const Architectures = {
    /**
     * Dual-process architecture (perception → reasoning → planning → action)
     */
    dualProcess: (config) => ArchitectureFactory.create('dualProcess', config),

    /**
     * Pure neural architecture (input → hidden → hidden → output)
     */
    neural: (config) => ArchitectureFactory.create('neural', config),

    /**
     * Pure symbolic architecture
     */
    symbolic: (config) => ArchitectureFactory.create('symbolic', config),

    /**
     * Hierarchical architecture (reactive → deliberative → strategic)
     */
    hierarchical: (config) => ArchitectureFactory.create('hierarchical', config),

    /**
     * Attention-based architecture
     */
    attention: (config) => ArchitectureFactory.create('attention', config),

    /**
     * World model architecture (encoder → dynamics → predictor → actor)
     */
    worldModel: (config) => ArchitectureFactory.create('world-model', config)
};
