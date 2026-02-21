
import { Architecture } from '../core/Architecture.js';
import { MeTTaInterpreter } from '@senars/metta';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';
import fs from 'fs';

/**
 * MeTTa Policy Architecture
 * A pure System 1 architecture that relies solely on a MeTTa-defined neural policy.
 * No symbolic reasoning or planning is involved.
 */
export class MeTTaPolicyArchitecture extends Architecture {
    constructor(agent, config = {}) {
        super(agent, config);
        this.metta = new MeTTaInterpreter();
        registerTensorPrimitives(this.metta);
    }

    async initialize() {
        if (this.initialized) return;

        if (this.config.policyScript) {
            try {
                const scriptContent = fs.readFileSync(this.config.policyScript, 'utf8');
                this.metta.run(scriptContent);
            } catch (e) {
                console.error(`Failed to load policy script: ${e.message}`);
            }
        }
        await super.initialize();
    }

    async act(observation, goal) {
        if (!this.initialized) await this.initialize();

        const obsStr = `(${observation.join(' ')})`;
        const result = this.metta.run(`! (get-action ${obsStr})`);

        if (result && result.length > 0) {
             const actionStr = result[0].toString();
             const action = Number(actionStr);
             if (!isNaN(action)) return action;
        }

        // Fallback random
        return Math.floor(Math.random() * 2);
    }

    async learn(observation, action, reward, nextObservation, done) {
        if (!this.initialized) await this.initialize();

        const obsStr = `(${observation.join(' ')})`;
        const target = [0, 0];
        if (typeof action === 'number' && action < target.length) {
             target[action] = reward;
        }
        const targetStr = `(${target.join(' ')})`;
        this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
    }
}
