/**
 * Metrics Collector Module
 * Collects, aggregates, and analyzes evaluation metrics
 */
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { MathUtils } from './StatisticalTests.js';

const COLLECTOR_DEFAULTS = {
    metrics: ['reward', 'length', 'success'],
    windowSize: 100,
    saveHistory: true
};

/**
 * Metrics collector for evaluation
 */
export class MetricsCollector {
    constructor(config = {}) {
        this.config = mergeConfig(COLLECTOR_DEFAULTS, config);
        this.metrics = new MetricsTracker();
        this.history = new Map();
        this.currentEpisode = null;
    }

    /**
     * Start recording an episode
     * @param {number} episodeNum - Episode number
     */
    startEpisode(episodeNum) {
        this.currentEpisode = {
            episode: episodeNum,
            startTime: Date.now(),
            steps: 0,
            rewards: [],
            actions: [],
            observations: []
        };
    }

    /**
     * Record a step
     * @param {object} step - Step data
     */
    recordStep(step) {
        if (!this.currentEpisode) return;

        this.currentEpisode.steps++;
        this.currentEpisode.rewards.push(step.reward);
        this.currentEpisode.actions.push(step.action);
        if (step.observation) {
            this.currentEpisode.observations.push(step.observation);
        }
    }

    /**
     * End current episode
     * @param {object} result - Episode result
     * @returns {object} Episode summary
     */
    endEpisode(result = {}) {
        if (!this.currentEpisode) return null;

        const episode = {
            ...this.currentEpisode,
            endTime: Date.now(),
            duration: Date.now() - this.currentEpisode.startTime,
            totalReward: this.currentEpisode.rewards.reduce((a, b) => a + b, 0),
            avgReward: MathUtils.mean(this.currentEpisode.rewards),
            ...result
        };

        // Store in history
        if (this.config.saveHistory) {
            if (!this.history.has('episodes')) {
                this.history.set('episodes', []);
            }
            this.history.get('episodes').push(episode);
        }

        // Update aggregate metrics
        this.metrics.increment('totalEpisodes');
        this.metrics.add('totalReward', episode.totalReward);
        this.metrics.add('totalSteps', episode.steps);

        const count = this.metrics.get('totalEpisodes');
        this.metrics.set('avgReward', this.metrics.get('totalReward') / count);
        this.metrics.set('avgSteps', this.metrics.get('totalSteps') / count);

        if (episode.success) {
            this.metrics.increment('successfulEpisodes');
            this.metrics.set('successRate', this.metrics.get('successfulEpisodes') / count);
        }

        this.currentEpisode = null;
        return episode;
    }

    /**
     * Get current metrics
     * @returns {object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics.getAll(),
            currentEpisode: this.currentEpisode ? {
                episode: this.currentEpisode.episode,
                steps: this.currentEpisode.steps,
                totalReward: this.currentEpisode.rewards.reduce((a, b) => a + b, 0)
            } : null
        };
    }

    /**
     * Get episode history
     * @returns {Array} Episode history
     */
    getHistory() {
        return this.history.get('episodes') || [];
    }

    /**
     * Get rolling window statistics
     * @param {number} window - Window size
     * @returns {object} Rolling statistics
     */
    getRollingStats(window = this.config.windowSize) {
        const episodes = this.history.get('episodes') || [];
        const recent = episodes.slice(-window);

        if (recent.length === 0) {
            return { count: 0, avgReward: 0, successRate: 0 };
        }

        const rewards = recent.map(e => e.totalReward);
        const successes = recent.filter(e => e.success).length;

        return {
            count: recent.length,
            avgReward: MathUtils.mean(rewards),
            stdReward: MathUtils.std(rewards),
            minReward: Math.min(...rewards),
            maxReward: Math.max(...rewards),
            successRate: successes / recent.length,
            avgSteps: MathUtils.mean(recent.map(e => e.steps))
        };
    }

    /**
     * Get trend analysis
     * @param {number} window - Window size for comparison
     * @returns {object} Trend analysis
     */
    getTrend(window = 50) {
        const episodes = this.history.get('episodes') || [];
        if (episodes.length < window * 2) {
            return { trend: 'insufficient_data' };
        }

        const recent = episodes.slice(-window);
        const older = episodes.slice(-window * 2, -window);

        const recentAvg = MathUtils.mean(recent.map(e => e.totalReward));
        const olderAvg = MathUtils.mean(older.map(e => e.totalReward));
        const change = recentAvg - olderAvg;
        const percentChange = (change / olderAvg) * 100;

        return {
            trend: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable',
            change,
            percentChange,
            recentAvg,
            olderAvg
        };
    }

    /**
     * Export metrics to JSON
     * @returns {object} Exportable data
     */
    toJSON() {
        return {
            metrics: this.metrics.getAll(),
            episodeCount: this.history.get('episodes')?.length || 0,
            rollingStats: this.getRollingStats(),
            trend: this.getTrend()
        };
    }

    /**
     * Clear all data
     */
    clear() {
        this.metrics = new MetricsTracker();
        this.history.clear();
        this.currentEpisode = null;
    }
}

/**
 * Performance analyzer for deep metrics
 */
export class PerformanceAnalyzer {
    constructor() {
        this.timings = new Map();
        this.counts = new Map();
    }

    /**
     * Start timing an operation
     * @param {string} name - Operation name
     */
    start(name) {
        this.timings.set(name, { start: performance.now(), count: (this.counts.get(name) || 0) + 1 });
    }

    /**
     * End timing and record
     * @param {string} name - Operation name
     * @returns {number} Duration in ms
     */
    end(name) {
        const timing = this.timings.get(name);
        if (!timing) return 0;

        const duration = performance.now() - timing.start;
        this.counts.set(name, timing.count);

        // Store for aggregation
        if (!this.timings.has(`${name}_durations`)) {
            this.timings.set(`${name}_durations`, []);
        }
        this.timings.get(`${name}_durations`).push(duration);

        return duration;
    }

    /**
     * Get statistics for an operation
     * @param {string} name - Operation name
     * @returns {object} Timing statistics
     */
    getStats(name) {
        const durations = this.timings.get(`${name}_durations`) || [];
        if (durations.length === 0) {
            return { count: 0, avg: 0, min: 0, max: 0, total: 0 };
        }

        return {
            count: durations.length,
            avg: MathUtils.mean(durations),
            min: Math.min(...durations),
            max: Math.max(...durations),
            total: durations.reduce((a, b) => a + b, 0),
            std: MathUtils.std(durations)
        };
    }

    /**
     * Get all performance statistics
     * @returns {object} All performance stats
     */
    getAllStats() {
        const stats = {};
        for (const [key, value] of this.timings) {
            if (!key.endsWith('_durations')) continue;
            const name = key.replace('_durations', '');
            stats[name] = this.getStats(name);
        }
        return stats;
    }

    /**
     * Clear all timings
     */
    clear() {
        this.timings.clear();
        this.counts.clear();
    }
}
