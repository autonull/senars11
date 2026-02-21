
import { SeNARSBridge } from './SeNARSBridge.js';

export class RuleInducer {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
        this.episodes = [];
    }

    /**
     * Induce rules from a set of trajectories.
     * @param {Array} trajectories {(s,a,r,s')}
     */
    induce(trajectories) {
        // Collect episodes
        this.episodes.push(...trajectories);

        // Feed events to SeNARS for temporal learning
        // <(obs) --> [seen]>. :|:
        // <(action) --> [executed]>. :|:
        // NAR will deduce <(&/, <(*, obs, action) --> obs_next>, +10) =/> goal>.

        // Simple iteration
        for (const ep of trajectories) {
            this._processEpisode(ep);
        }

        // Also consolidate
        if (this.bridge) {
            this.bridge.runCycles(100);
        }
    }

    _processEpisode(episode) {
        // Convert JS object to Narsese (simplified)
        // If obs is number: <(val) --> obs>. :|:
        // If array: <(val) --> obs_comp>. :|:

        // Assume episode is {obs, action, nextObs, reward}
        const obs = this._formatTerm(episode.obs);
        const action = this._formatTerm(episode.action);
        const nextObs = this._formatTerm(episode.nextObs);

        // Feed obs
        if (this.bridge) {
             this.bridge.input(`<(*, ${obs}) --> obs>. :|:`);
             this.bridge.input(`<(*, ${action}) --> executed>. :|:`);
             this.bridge.input(`<(*, ${nextObs}) --> obs>. :|:`);

             // If reward is positive, give positive feedback
             if (episode.reward > 0) {
                 this.bridge.input(`<(*, ${nextObs}) --> goal>. :|:`);
             }
        }
    }

    _formatTerm(val) {
        if (Array.isArray(val)) return `(${val.join(',')})`;
        if (typeof val === 'object') return JSON.stringify(val); // Not valid Narsese but placeholder
        return String(val);
    }
}
