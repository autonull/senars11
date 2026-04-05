import {mergeConfig} from '../utils/index.js';

const DEFAULTS = {
    cyclesAfterInduction: 100
};

export class RuleInducer {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = mergeConfig(DEFAULTS, config);
        this.episodes = [];
    }

    async induce(trajectories) {
        this.episodes.push(...trajectories);
        await Promise.all(trajectories.map(ep => this._processEpisode(ep)));
        if (this.bridge) {
            await this.bridge.runCycles(this.config.cyclesAfterInduction);
        }
    }

    async _processEpisode({obs, action, nextObs, reward}) {
        if (!this.bridge) {
            return;
        }

        const o = this._formatTerm(obs);
        const n = this._formatTerm(nextObs);
        const a = this._formatAction(action);

        await Promise.all([
            this.bridge.input(`<(*, ${o}) --> obs>.`),
            this.bridge.input(`${a}.`),
            this.bridge.input(`<(*, ${n}) --> obs>.`),
            this.bridge.input(`<(&/, <(*, ${o}) --> obs>, ${a}) ==> <(*, ${n}) --> obs>>.`),
            ...(reward > 0 ? [this.bridge.input(`<(*, ${n}) --> achieved>!`)] : [])
        ]);
    }

    _formatTerm(val) {
        return Array.isArray(val) ? `(${val.join(',')})`
            : typeof val === 'object' ? JSON.stringify(val)
                : String(val);
    }

    _formatAction(action) {
        const a = this._formatTerm(action);
        return a.startsWith('^') || a.startsWith('op_') ? a : `^${a}`;
    }
}
