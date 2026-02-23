import { RLAgent } from '../core/RLAgent.js';

const RANDOM_AGENT_DEFAULTS = {
    seed: null
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class RandomAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig(RANDOM_AGENT_DEFAULTS, config);
        if (this.config.seed !== null) {
            this._seededRandom = this._createSeededRandom(this.config.seed);
        }
    }

    act(observation) {
        const actionSpace = this.env.actionSpace;
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

    learn(observation, action, reward, nextObservation, done) {
        // Random agent doesn't learn
    }

    _random() {
        return this._seededRandom ? this._seededRandom() : Math.random();
    }

    _createSeededRandom(seed) {
        let state = seed;
        return () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }
}
