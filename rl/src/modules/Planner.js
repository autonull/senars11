import {mergeConfig} from '../utils/index.js';

const DEFAULTS = {
    planningHorizon: 3,
    cycles: 50
};

export class Planner {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = mergeConfig(DEFAULTS, config);
    }

    async act(obs, goal = 'goal') {
        if (!this.bridge) {
            return null;
        }

        const term = (val) => Array.isArray(val) ? `(${val.join(',')})` : String(val);

        await this.bridge.input(`<(*, ${term(obs)}) --> obs>.`);
        const result = await this.bridge.achieve(`<(*, ${term(goal)}) --> obs>!`, {cycles: this.config.cycles});

        return result?.executedOperations?.[0] ?? null;
    }
}
