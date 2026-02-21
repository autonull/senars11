
import { MeTTaAgent } from './MeTTaAgent.js';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';

export class ProgrammaticAgent extends MeTTaAgent {
    constructor(env, strategyPath) {
        super(env, strategyPath);
        this.params = new Map();
    }

    async _ensureInitialized() {
        if (!this.initialized) {
            registerTensorPrimitives(this.metta);
            await super._ensureInitialized();
        }
    }
}
