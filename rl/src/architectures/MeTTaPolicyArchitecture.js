import {Architecture} from '../core/RLCore.js';
import {MeTTaInterpreter} from '@senars/metta';
import {registerTensorPrimitives} from '../core/TensorPrimitives.js';
import {mergeConfig, NarseseUtils} from '../utils/index.js';
import fs from 'fs';
import {Logger} from '@senars/core';

const METTA_POLICY_DEFAULTS = {
    policyScript: null,
    fallbackActionSpace: 2
};

export class MeTTaPolicyArchitecture extends Architecture {
    constructor(agent, config = {}) {
        super(agent, mergeConfig(METTA_POLICY_DEFAULTS, config));
        this.metta = new MeTTaInterpreter();
        registerTensorPrimitives(this.metta);
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        if (this.config.policyScript) {
            try {
                const scriptContent = fs.readFileSync(this.config.policyScript, 'utf8');
                this.metta.run(scriptContent);
            } catch (e) {
                Logger.error(`Failed to load policy script: ${e.message}`);
            }
        }
        await super.initialize();
    }

    async act(observation, goal) {
        if (!this.initialized) {
            await this.initialize();
        }

        const obsStr = NarseseUtils.valueToMetta(observation);
        const result = this.metta.run(`! (get-action ${obsStr})`);

        if (result?.length > 0) {
            const action = Number(result[0].toString());
            if (!isNaN(action)) {
                return action;
            }
        }

        return Math.floor(Math.random() * this.config.fallbackActionSpace);
    }

    async learn(observation, action, reward, nextObservation, done) {
        if (!this.initialized) {
            await this.initialize();
        }

        const obsStr = NarseseUtils.valueToMetta(observation);
        const target = [0, 0];
        if (typeof action === 'number' && action < target.length) {
            target[action] = reward;
        }
        const targetStr = NarseseUtils.valueToMetta(target);
        this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
    }
}
