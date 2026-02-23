import { MeTTaAgent } from './MeTTaAgent.js';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';

const PROGRAMMATIC_DEFAULTS = {
    strategyPath: null,
    registerTensorPrimitives: true
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class ProgrammaticAgent extends MeTTaAgent {
    constructor(env, config = {}) {
        const mergedConfig = mergeConfig(PROGRAMMATIC_DEFAULTS,
            typeof config === 'string' ? { strategyPath: config } : config
        );
        super(env, mergedConfig);
        this.params = new Map();
        this._registerPrimitives = mergedConfig.registerTensorPrimitives;
    }

    async _ensureInitialized() {
        if (!this.initialized) {
            if (this._registerPrimitives) registerTensorPrimitives(this.metta);
            await super._ensureInitialized();
        }
    }
}
