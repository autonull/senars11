
import { RLAgent } from '../core/RLAgent.js';
import { MeTTaInterpreter } from '@senars/metta';
import fs from 'fs';

/**
 * MeTTa-based RL Agent.
 * Delegates reasoning and learning to a MeTTa strategy script.
 */
export class MeTTaAgent extends RLAgent {
    constructor(env, strategyPath) {
        super(env);
        this.metta = new MeTTaInterpreter();
        this.strategyPath = strategyPath;
        this.initialized = false;
    }

    async _ensureInitialized() {
        if (this.initialized) return;

        if (this.strategyPath) {
            const content = fs.readFileSync(this.strategyPath, 'utf-8');
            await this.metta.run(content);
        }
        this.initialized = true;
    }

    _toMetta(obs) {
        return Array.isArray(obs) ? `(${obs.join(' ')})` : `(${obs})`;
    }

    async act(observation) {
        await this._ensureInitialized();
        const obsStr = this._toMetta(observation);
        const program = `!(agent-act ${obsStr})`;
        const result = await this.metta.run(program);

        if (result?.[0]) {
            const atom = result[0];
            const str = atom.toString();

            // Try parsing as number
            const val = parseFloat(str);
            if (!isNaN(val)) return val;

            // Try parsing as list
            if (str.startsWith('(')) {
                return str.slice(1, -1).trim().split(/\s+/).map(Number);
            }

            return str;
        }

        return 0; // Fallback
    }

    async learn(observation, action, reward, nextObservation, done) {
        await this._ensureInitialized();
        const obsStr = this._toMetta(observation);
        const nextObsStr = this._toMetta(nextObservation);
        const actStr = Array.isArray(action) ? `(${action.join(' ')})` : action;

        const program = `!(agent-learn ${obsStr} ${actStr} ${reward} ${nextObsStr} ${done})`;
        await this.metta.run(program);
    }
}
