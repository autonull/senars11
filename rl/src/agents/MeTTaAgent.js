import { RLAgent } from '../core/RLAgent.js';
import { MeTTaInterpreter } from '@senars/metta';
import { NarseseUtils } from '../utils/NarseseUtils.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import fs from 'fs';

const METTA_AGENT_DEFAULTS = {
    strategyPath: null,
    autoInitialize: true
};

export class MeTTaAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        const mergedConfig = mergeConfig(METTA_AGENT_DEFAULTS,
            typeof config === 'string' ? { strategyPath: config } : config
        );
        this.metta = new MeTTaInterpreter();
        this.strategyPath = mergedConfig.strategyPath;
        this.initialized = false;

        this.metta.ground.register('random', () => Math.random());
        this.metta.ground.register('floor', (x) => Math.floor(x));
    }

    async _ensureInitialized() {
        if (this.initialized) return;

        if (this.strategyPath) {
            console.log(`Loading strategy from ${this.strategyPath}`);
            const content = fs.readFileSync(this.strategyPath, 'utf-8');
            await this.metta.run(content);
            console.log('Strategy loaded');
        }
        this.initialized = true;
    }

    async act(observation) {
        await this._ensureInitialized();
        const obsStr = NarseseUtils.valueToMetta(observation);
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
        const obsStr = NarseseUtils.valueToMetta(observation);
        const nextObsStr = NarseseUtils.valueToMetta(nextObservation);
        const actStr = NarseseUtils.valueToMetta(action);

        const program = `!(agent-learn ${obsStr} ${actStr} ${reward} ${nextObsStr} ${done})`;
        await this.metta.run(program);
    }
}
