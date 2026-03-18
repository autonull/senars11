/**
 * Architecture Configuration
 * Configuration classes and templates for neuro-symbolic architectures
 */
import { mergeConfig } from '../utils/ConfigHelper.js';

const ARCH_DEFAULTS = {
    architecture: 'dual-process',
    reasoning: 'metta',
    grounding: 'learned',
    planning: true,
    skillDiscovery: false,
    worldModel: false,
    intrinsicMotivation: 'none',
    distributed: false,
    metaLearning: false,
    hyperparams: {
        learningRate: 0.001,
        discountFactor: 0.99,
        explorationRate: 0.1,
        planningHorizon: 5,
        worldModelHorizon: 10,
        skillThreshold: 0.5
    }
};

const LAYER_DEFAULTS = {
    perception: { units: 32, symbolic: true, attention: true },
    reasoning: { units: 64, symbolic: true, attention: false },
    planning: { units: 48, symbolic: true, attention: true },
    action: { units: 16, symbolic: false, attention: false },
    input: { units: 16, symbolic: false },
    hidden: { units: 64, symbolic: false },
    output: { units: 16, symbolic: false },
    encoder: { units: 64, symbolic: true, attention: true },
    decoder: { units: 32, symbolic: true },
    dynamics: { units: 64, symbolic: true },
    predictor: { units: 32, symbolic: true },
    actor: { units: 16, symbolic: true },
    reactive: { units: 16, symbolic: false },
    deliberative: { units: 32, symbolic: true },
    strategic: { units: 24, symbolic: true },
    attention: { units: 64, symbolic: true, attention: true }
};

const UNIT_DEFAULTS = {
    inputDim: 16,
    outputDim: 16,
    symbolic: true,
    attention: false,
    learningRate: 0.001
};

const LAYER_CONFIG_DEFAULTS = {
    units: 32,
    type: 'feedforward',
    symbolic: false,
    attention: false,
    id: null
};

/**
 * Architecture configuration class
 */
export class ArchitectureConfig {
    constructor(config = {}) {
        const { hyperparams = {}, ...rest } = mergeConfig(ARCH_DEFAULTS, config);
        Object.assign(this, rest);
        this.hyperparams = mergeConfig(ARCH_DEFAULTS.hyperparams, hyperparams);
    }

    clone(overrides = {}) {
        return new ArchitectureConfig({ ...this, ...overrides });
    }

    toJSON() {
        return { ...this, hyperparams: { ...this.hyperparams } };
    }
}

/**
 * Architecture templates for common patterns
 */
export const ArchitectureTemplates = {
    dualProcess(config = {}) {
        return {
            config: { ...config, architecture: 'dual-process' },
            layers: [
                { type: 'perception', ...LAYER_DEFAULTS.perception, units: 32 },
                { type: 'reasoning', ...LAYER_DEFAULTS.reasoning, units: 64 },
                { type: 'planning', ...LAYER_DEFAULTS.planning, units: 48 },
                { type: 'action', ...LAYER_DEFAULTS.action, units: 16 }
            ],
            residual: true
        };
    },

    neural(config = {}) {
        return {
            config: { ...config, architecture: 'neural' },
            layers: [
                { type: 'input', ...LAYER_DEFAULTS.input, units: 16, symbolic: false },
                { type: 'feedforward', ...LAYER_DEFAULTS.hidden, units: 64, symbolic: false },
                { type: 'feedforward', ...LAYER_DEFAULTS.hidden, units: 64, symbolic: false },
                { type: 'output', ...LAYER_DEFAULTS.output, units: 16, symbolic: false }
            ],
            residual: false
        };
    },

    symbolic(config = {}) {
        return {
            config: { ...config, architecture: 'symbolic' },
            layers: [
                { type: 'symbolic', ...LAYER_DEFAULTS.perception, units: 32, attention: true },
                { type: 'symbolic', ...LAYER_DEFAULTS.reasoning, units: 64 },
                { type: 'symbolic', ...LAYER_DEFAULTS.action, units: 16 }
            ],
            residual: false
        };
    },

    hierarchical(config = {}) {
        return {
            config: { ...config, architecture: 'hierarchical' },
            layers: [
                { type: 'reactive', ...LAYER_DEFAULTS.reactive, units: 16, symbolic: false },
                { type: 'deliberative', ...LAYER_DEFAULTS.deliberative, units: 32, symbolic: true },
                { type: 'strategic', ...LAYER_DEFAULTS.strategic, units: 24, symbolic: true }
            ],
            residual: true
        };
    },

    attention(config = {}) {
        return {
            config: { ...config, architecture: 'attention' },
            layers: [
                { type: 'encoder', ...LAYER_DEFAULTS.encoder, units: 64 },
                { type: 'attention', ...LAYER_DEFAULTS.attention, units: 64 },
                { type: 'decoder', ...LAYER_DEFAULTS.decoder, units: 32 }
            ],
            residual: false
        };
    },

    'world-model': (config = {}) => ({
        config: { ...config, architecture: 'world-model' },
        layers: [
            { type: 'encoder', ...LAYER_DEFAULTS.encoder, units: 32 },
            { type: 'dynamics', ...LAYER_DEFAULTS.dynamics, units: 64, symbolic: true },
            { type: 'predictor', ...LAYER_DEFAULTS.predictor, units: 32 },
            { type: 'actor', ...LAYER_DEFAULTS.actor, units: 16 }
        ],
        residual: false
    })
};

export { LAYER_DEFAULTS, UNIT_DEFAULTS, LAYER_CONFIG_DEFAULTS };
