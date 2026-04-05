const HISTORY_LIMIT = 1000;

const StatsCalculator = {
    compute(history) {
        if (!history.length) {
            return null;
        }

        const sum = history.reduce((a, b) => a + b, 0);
        const mean = sum / history.length;
        const variance = history.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / history.length;

        return {
            mean,
            std: Math.sqrt(variance),
            min: Math.min(...history),
            max: Math.max(...history),
            count: history.length
        };
    }
};

/**
 * MetricsTracker - Standalone metrics tracking utility
 * Does not extend Component to avoid conflicts with BaseComponent
 */
export class MetricsTracker {
    constructor(initialMetrics = {}) {
        this.metrics = {...initialMetrics};
        this.history = new Map();
    }

    increment(key, delta = 1) {
        this.metrics[key] = (this.metrics[key] ?? 0) + delta;
        this._record(key, this.metrics[key]);
    }

    set(key, value) {
        this.metrics[key] = value;
        this._record(key, value);
    }

    get(key) {
        return this.metrics[key];
    }

    getAll() {
        return {...this.metrics};
    }

    getStats(key) {
        return StatsCalculator.compute(this.history.get(key) ?? []);
    }

    reset(key) {
        if (key) {
            this.metrics[key] = 0;
            this.history.delete(key);
        } else {
            this.metrics = {};
            this.history.clear();
        }
    }

    _record(key, value) {
        if (!this.history.has(key)) {
            this.history.set(key, []);
        }
        const history = this.history.get(key);
        history.push(value);
        if (history.length > HISTORY_LIMIT) {
            history.shift();
        }
    }
}
