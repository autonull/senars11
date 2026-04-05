/**
 * Random Agent
 * 
 * Takes random actions. Useful for baseline comparison and data collection.
 * 
 * @implements {import('../interfaces/IAgent.js').IAgent}
 */
import { Agent } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils } from './QNetwork.js';

export class RandomAgent extends Agent {
    constructor(env, config = {}) {
        const mergedConfig = mergeConfig({ seed: null }, config);
        super(env, mergedConfig);
        if (this.config.seed !== null) {
            this._random = AgentFactoryUtils.createSeededRandom(this.config.seed);
        }
    }

    /**
     * Select random action
     * @param {*} observation - Current observation (ignored)
     * @returns {*} Random action from action space
     */
    act(observation) {
        const {actionSpace} = this.env;
        if (actionSpace.type === 'Discrete') {
            return Math.floor(this._random() * actionSpace.n);
        }
        if (actionSpace.type === 'Box') {
            const { shape, low, high } = actionSpace;
            return Array.from({ length: shape[0] }, (_, i) => {
                const l = Array.isArray(low) ? low[i] : low;
                const h = Array.isArray(high) ? high[i] : high;
                return this._random() * (h - l) + l;
            });
        }
        throw new Error('Unknown action space type');
    }

    /**
     * Random agent doesn't learn
     */
    learn() {
        // No-op
    }

    _random() {
        return this._random ?? Math.random;
    }
}
