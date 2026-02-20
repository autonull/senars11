
import { RLAgent } from './RLAgent.js';
import { MeTTaInterpreter } from '@senars/metta';
import path from 'path';
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
        if (!this.initialized) {
            // Load the strategy
            if (this.strategyPath) {
                const content = fs.readFileSync(this.strategyPath, 'utf-8');
                // We assume the strategy defines functions:
                // (agent-act $observation) -> $action
                // (agent-learn $obs $act $reward $next_obs $done) -> $result
                await this.metta.run(content);
            }
            this.initialized = true;
        }
    }

    _obsToMetta(obs) {
        // Convert JS observation to MeTTa string
        // If array: (obs-vec 0.1 0.2 ...)
        // If object: (obs-dict (k v) ...)
        if (Array.isArray(obs)) {
            return `(${obs.join(' ')})`;
        }
        return `(${obs})`;
    }

    async act(observation) {
        await this._ensureInitialized();
        const obsStr = this._obsToMetta(observation);
        const program = `!(agent-act ${obsStr})`;

        const result = await this.metta.run(program);
        // Result is a list of atoms. We expect one result which is the action.
        // e.g. [Symbol(0)] or [Value(0.5)]

        if (result && result.length > 0) {
            const atom = result[0];
            // Helper to extract value from atom
            // If it's a number atom (Symbol with number name? or Value?)
            // MeTTa implementation details vary.
            // Let's assume standard behavior: if it looks like a number, it is.
            const val = parseFloat(atom.toString());
            if (!isNaN(val)) return val;

            // If it's a list, it might be a continuous action vector
            if (atom.toString().startsWith('(')) {
                 // Parse list
                 const str = atom.toString().slice(1, -1).trim();
                 return str.split(/\s+/).map(Number);
            }

            return atom.toString();
        }

        // Fallback
        return 0;
    }

    async learn(observation, action, reward, nextObservation, done) {
        await this._ensureInitialized();
        const obsStr = this._obsToMetta(observation);
        const nextObsStr = this._obsToMetta(nextObservation);
        const actStr = Array.isArray(action) ? `(${action.join(' ')})` : action;

        const program = `!(agent-learn ${obsStr} ${actStr} ${reward} ${nextObsStr} ${done})`;
        await this.metta.run(program);
    }
}
