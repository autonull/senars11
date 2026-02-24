import { RLAgent } from '../core/RLAgent.js';
import { MeTTaInterpreter } from '@senars/metta';
import { NarseseUtils } from '../utils/NarseseUtils.js';
import { deepMergeConfig } from '../utils/ConfigHelper.js';

const METTA_AGENT_DEFAULTS = {
    strategyPath: null,
    autoInitialize: true
};

/**
 * MeTTaAgent - Agent with MeTTa-based policy representation
 * Uses MeTTa interpreter for symbolic action selection and learning
 */
export class MeTTaAgent extends RLAgent {
    constructor(env, config = {}) {
        // Handle string config (strategy path) for backward compatibility
        const normalizedConfig = typeof config === 'string' ? { strategyPath: config } : config;
        const mergedConfig = deepMergeConfig(METTA_AGENT_DEFAULTS, normalizedConfig);
        super(env, mergedConfig);

        this.metta = new MeTTaInterpreter();
        this.metta.ground.register('random', () => Math.random());
        this.metta.ground.register('floor', (x) => Math.floor(x));
    }

    get strategyPath() {
        return this.config.strategyPath;
    }

    async onInitialize() {
        await super.onInitialize();

        if (this.config.strategyPath) {
            console.log(`Loading strategy from ${this.config.strategyPath}`);
            try {
                const fs = await import('fs');
                const content = await fs.promises.readFile(this.config.strategyPath, 'utf-8');
                await this.metta.run(content);
                console.log('Strategy loaded');
            } catch (err) {
                console.error(`Failed to load strategy from ${this.config.strategyPath}:`, err);
            }
        }
    }

    async act(observation) {
        // Ensure initialized (Component lifecycle handles this)
        if (!this._initialized) {
            await this.initialize();
        }

        const obsStr = NarseseUtils.valueToMetta(observation);
        const program = `!(agent-act ${obsStr})`;
        const result = await this.metta.run(program);

        const atom = result?.[0];
        if (!atom) return 0;

        const str = atom.toString();
        const val = parseFloat(str);

        // Return number if valid, array if list-like, else string
        if (!isNaN(val)) return val;
        return str.startsWith('(')
            ? str.slice(1, -1).trim().split(/\s+/).map(Number)
            : str;
    }

    async learn(observation, action, reward, nextObservation, done) {
        if (!this._initialized) {
            await this.initialize();
        }

        const obsStr = NarseseUtils.valueToMetta(observation);
        const nextObsStr = NarseseUtils.valueToMetta(nextObservation);
        const actStr = NarseseUtils.valueToMetta(action);

        const program = `!(agent-learn ${obsStr} ${actStr} ${reward} ${nextObsStr} ${done})`;
        await this.metta.run(program);
    }
}
