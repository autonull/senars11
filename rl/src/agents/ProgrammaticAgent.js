import {MeTTaAgent} from './MeTTaAgent.js';
import {registerTensorPrimitives} from '../core/TensorPrimitives.js';
import {deepMergeConfig} from '../utils/ConfigHelper.js';

const PROGRAMMATIC_DEFAULTS = {
    strategyPath: null,
    registerTensorPrimitives: true
};

/**
 * ProgrammaticAgent - MeTTaAgent with tensor primitives registered
 * Extends MeTTaAgent with automatic tensor primitive registration
 */
export class ProgrammaticAgent extends MeTTaAgent {
    constructor(env, config = {}) {
        // Handle string config (strategy path) for backward compatibility
        const normalizedConfig = typeof config === 'string' ? {strategyPath: config} : config;
        const mergedConfig = deepMergeConfig(PROGRAMMATIC_DEFAULTS, normalizedConfig);
        super(env, mergedConfig);
        this.params = new Map();
        this._registerPrimitives = mergedConfig.registerTensorPrimitives;
    }

    async onInitialize() {
        if (this._registerPrimitives) {
            registerTensorPrimitives(this.metta);
        }
        await super.onInitialize();
    }
}
