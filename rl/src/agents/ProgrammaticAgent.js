import { MeTTaAgent } from './MeTTaAgent.js';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const PROGRAMMATIC_DEFAULTS = {
    strategyPath: null,
    registerTensorPrimitives: true
};

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
