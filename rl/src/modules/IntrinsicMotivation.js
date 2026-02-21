
/**
 * Intrinsic Motivation Module
 * Calculates intrinsic rewards to drive exploration (curiosity, novelty).
 */
export class IntrinsicMotivation {
    constructor(config = {}) {
        this.config = config;
        this.mode = config.intrinsicMode || 'none'; // 'none', 'novelty', 'prediction_error'
        this.weight = config.intrinsicWeight || 0.1;
        this.visitCounts = new Map(); // Simple count-based novelty
    }

    /**
     * Calculate intrinsic reward for a transition.
     * @param {Object} transition {obs, action, nextObs}
     * @returns {number} Intrinsic reward
     */
    calculate(transition) {
        if (this.mode === 'none') return 0;

        if (this.mode === 'novelty') {
            return this._calculateNovelty(transition.nextObs);
        }

        // Add other modes (e.g. prediction error) here
        return 0;
    }

    _calculateNovelty(obs) {
        // Hashing observation (simplified)
        const key = Array.isArray(obs) ? obs.map(x => Math.floor(x * 10)).join('_') : String(obs);

        const count = this.visitCounts.get(key) || 0;
        this.visitCounts.set(key, count + 1);

        // Inverse count bonus: 1 / sqrt(count)
        return this.weight / Math.sqrt(count + 1);
    }
}
