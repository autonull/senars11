
export class RuleInducer {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
        this.episodes = [];
    }

    async induce(trajectories) {
        this.episodes.push(...trajectories);

        for (const ep of trajectories) {
            await this._processEpisode(ep);
        }

        if (this.bridge) {
            await this.bridge.runCycles(100);
        }
    }

    async _processEpisode({ obs, action, nextObs, reward }) {
        if (!this.bridge) return;

        const o = this._formatTerm(obs);
        const n = this._formatTerm(nextObs);

        // Handle action term: if it doesn't start with ^, prepend it
        let a = this._formatTerm(action);
        if (!a.startsWith('^') && !a.startsWith('op_')) {
             a = `^${a}`;
        }

        // 1. Input the events as they happened
        // Note: In NARS, temporal order matters. We input them in sequence.
        // We use :|: to denote occurrence time (current moment)

        // Observation at t
        await this.bridge.input(`<(*, ${o}) --> obs>.`);

        // Action executed at t
        await this.bridge.input(`${a}.`);

        // Result at t+1
        await this.bridge.input(`<(*, ${n}) --> obs>.`);

        // 2. Explicitly feed the temporal implication (optional, speeds up learning)
        const implication = `<(&/, <(*, ${o}) --> obs>, ${a}) ==> <(*, ${n}) --> obs>>.`;
        await this.bridge.input(implication);

        if (reward > 0) {
            await this.bridge.input(`<(*, ${n}) --> achieved>!`);
        }
    }

    _formatTerm(val) {
        return Array.isArray(val) ? `(${val.join(',')})`
             : typeof val === 'object' ? JSON.stringify(val)
             : String(val);
    }
}
