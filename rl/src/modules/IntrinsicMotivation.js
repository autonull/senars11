import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    intrinsicMode: 'none',
    intrinsicWeight: 0.1
};

const NoveltyCalculators = {
    countBased(visitCounts, key, weight) {
        const count = visitCounts.get(key) || 0;
        visitCounts.set(key, count + 1);
        return weight / Math.sqrt(count + 1);
    }
};

export class IntrinsicMotivation {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULTS, config);
        this.visitCounts = new Map();
    }

    calculate(transition) {
        const { mode, weight } = this.config;
        if (mode === 'none') return 0;
        if (mode === 'novelty') {
            return this._calculateNovelty(transition.nextObs);
        }
        return 0;
    }

    _calculateNovelty(obs) {
        const key = Array.isArray(obs)
            ? obs.map(x => Math.floor(x * 10)).join('_')
            : String(obs);

        return NoveltyCalculators.countBased(this.visitCounts, key, this.config.intrinsicWeight);
    }
}
