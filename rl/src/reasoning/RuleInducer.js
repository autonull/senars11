
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
        const a = this._formatTerm(action);
        const n = this._formatTerm(nextObs);

        await this.bridge.input(`<(*, ${o}) --> obs>. :|:`);
        await this.bridge.input(`<(*, ${a}) --> executed>. :|:`);
        await this.bridge.input(`<(*, ${n}) --> obs>. :|:`);

        if (reward > 0) {
            await this.bridge.input(`<(*, ${n}) --> goal>. :|:`);
        }
    }

    _formatTerm(val) {
        return Array.isArray(val) ? `(${val.join(',')})`
             : typeof val === 'object' ? JSON.stringify(val)
             : String(val);
    }
}
