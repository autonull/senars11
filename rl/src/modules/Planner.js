import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    planningHorizon: 3,
    cycles: 50
};

export class Planner {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = mergeConfig(DEFAULTS, config);
    }

    async act(obs, goal) {
        if (!this.bridge) return null;

        const obsTerm = this._term(obs);
        await this.bridge.input(`<(*, ${obsTerm}) --> obs>.`);

        const goalTerm = `<(*, ${this._term(goal || 'goal')}) --> obs>`;
        const result = await this.bridge.achieve(`${goalTerm}!`, { cycles: this.config.cycles });

        return result?.executedOperations?.[0] ?? null;
    }

    _term(val) {
        return Array.isArray(val) ? `(${val.join(',')})` : String(val);
    }
}
