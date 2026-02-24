import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    intrinsicMode: 'none',
    intrinsicWeight: 0.1
};

const NoveltyCalculators = {
    countBased: (counts, key, weight) => {
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);
        return weight / Math.sqrt(count);
    }
};

export class IntrinsicMotivation {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULTS, config);
        this.visitCounts = new Map();
    }

    calculate(transition) {
        if (this.config.mode === 'none') return 0;

        return this.config.mode === 'novelty'
            ? this._calculateNovelty(transition.nextObs)
            : 0;
    }

    _calculateNovelty(obs) {
        const key = Array.isArray(obs)
            ? obs.map(x => Math.floor(x * 10)).join('_')
            : `${obs}`;

        return NoveltyCalculators.countBased(this.visitCounts, key, this.config.intrinsicWeight);
    }
}
