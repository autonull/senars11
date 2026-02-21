/**
 * Comprehensive Benchmarking and Evaluation Framework
 * For measuring RL agent performance across multiple dimensions.
 */
import { Component } from '../composable/Component.js';
import { RLEnvironment } from '../core/RLEnvironment.js';

/**
 * Benchmark Runner for systematic evaluation.
 */
export class BenchmarkRunner extends Component {
    constructor(config = {}) {
        super({
            numEpisodes: 100,
            maxSteps: 1000,
            evaluationInterval: 10,
            metrics: ['reward', 'length', 'success'],
            saveTrajectories: false,
            parallelEnvs: 1,
            ...config
        });
        
        this.results = [];
        this.metrics = new Map();
        this.benchmarks = [];
        this.startTime = null;
    }

    async onInitialize() {
        this.startTime = Date.now();
        this.setState('currentEpisode', 0);
        this.setState('phase', 'initialization');
    }

    /**
     * Run full benchmark suite.
     */
    async run(agent, environments, options = {}) {
        const {
            numEpisodes = this.config.numEpisodes,
            maxSteps = this.config.maxSteps,
            saveTrajectories = this.config.saveTrajectories
        } = options;

        this.setState('phase', 'running');
        const allResults = [];

        for (const envSpec of environments) {
            const env = await this.createEnvironment(envSpec);
            const envResults = await this.runOnEnvironment(agent, env, {
                numEpisodes,
                maxSteps,
                saveTrajectories
            });
            
            allResults.push({
                environment: envSpec.name,
                results: envResults
            });
        }

        this.setState('phase', 'complete');
        return this.summarizeResults(allResults);
    }

    /**
     * Run benchmark on single environment.
     */
    async runOnEnvironment(agent, env, options) {
        const { numEpisodes, maxSteps, saveTrajectories } = options;
        const episodeResults = [];
        const trajectories = [];

        for (let ep = 0; ep < numEpisodes; ep++) {
            this.setState('currentEpisode', ep);
            
            const result = await this.runEpisode(agent, env, {
                maxSteps,
                saveTrajectory: saveTrajectories
            });
            
            episodeResults.push(result);
            
            if (result.trajectory) {
                trajectories.push(result.trajectory);
            }

            // Periodic evaluation callback
            if (ep % this.config.evaluationInterval === 0) {
                this.emit('evaluationProgress', {
                    episode: ep,
                    numEpisodes,
                    avgReward: this.calculateRunningAvg(episodeResults)
                });
            }
        }

        return {
            episodes: episodeResults,
            trajectories: saveTrajectories ? trajectories : [],
            summary: this.summarizeEpisodes(episodeResults)
        };
    }

    /**
     * Run single episode.
     */
    async runEpisode(agent, env, options) {
        const { maxSteps, saveTrajectory } = options;
        
        let state = env.reset();
        const trajectory = saveTrajectory ? [] : null;
        let totalReward = 0;
        let steps = 0;
        const startTime = performance.now();

        for (let step = 0; step < maxSteps; step++) {
            const action = await agent.act(state.observation);
            const result = env.step(action);
            
            totalReward += result.reward;
            steps++;
            
            if (saveTrajectory) {
                trajectory.push({
                    step,
                    observation: state.observation,
                    action,
                    reward: result.reward,
                    nextState: result.observation,
                    done: result.terminated
                });
            }
            
            state = result;
            
            if (result.terminated) break;
        }

        const endTime = performance.now();
        
        return {
            totalReward,
            steps,
            duration: endTime - startTime,
            success: this.evaluateSuccess(state, env),
            trajectory: saveTrajectory ? trajectory : null
        };
    }

    /**
     * Evaluate success criteria.
     */
    evaluateSuccess(state, env) {
        // Default: consider episode successful if terminated naturally
        return state.terminated;
    }

    /**
     * Create environment from spec.
     */
    async createEnvironment(spec) {
        const { name, config = {} } = spec;
        
        // Import environment dynamically using computed property
        const envModule = await import(`../environments/${name}.js`);
        const EnvironmentClass = envModule[name];
        
        if (!EnvironmentClass) {
            throw new Error(`Environment class '${name}' not found`);
        }
        
        return new EnvironmentClass(config);
    }

    /**
     * Summarize episode results.
     */
    summarizeEpisodes(episodes) {
        const rewards = episodes.map(e => e.totalReward);
        const lengths = episodes.map(e => e.steps);
        const successes = episodes.filter(e => e.success).length;

        return {
            reward: {
                mean: this.mean(rewards),
                std: this.std(rewards),
                min: Math.min(...rewards),
                max: Math.max(...rewards),
                median: this.median(rewards)
            },
            length: {
                mean: this.mean(lengths),
                std: this.std(lengths),
                min: Math.min(...lengths),
                max: Math.max(...lengths)
            },
            successRate: successes / episodes.length,
            numEpisodes: episodes.length
        };
    }

    /**
     * Summarize all benchmark results.
     */
    summarizeResults(allResults) {
        const summary = {
            environments: {},
            overall: {
                totalEpisodes: 0,
                avgReward: 0,
                avgSuccessRate: 0
            },
            duration: Date.now() - this.startTime,
            timestamp: new Date().toISOString()
        };

        for (const { environment, results } of allResults) {
            summary.environments[environment] = results.summary;
            summary.overall.totalEpisodes += results.episodes.length;
        }

        // Calculate overall averages
        const envCount = Object.keys(summary.environments).length;
        if (envCount > 0) {
            summary.overall.avgReward = Object.values(summary.environments)
                .reduce((sum, e) => sum + e.reward.mean, 0) / envCount;
            summary.overall.avgSuccessRate = Object.values(summary.environments)
                .reduce((sum, e) => sum + e.successRate, 0) / envCount;
        }

        this.results = summary;
        return summary;
    }

    /**
     * Calculate running average.
     */
    calculateRunningAvg(episodes) {
        const window = Math.min(10, episodes.length);
        const recent = episodes.slice(-window);
        return recent.reduce((sum, e) => sum + e.totalReward, 0) / window;
    }

    /**
     * Statistical utilities.
     */
    mean(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    std(arr) {
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
    }

    median(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Get benchmark results.
     */
    getResults() {
        return this.results;
    }

    /**
     * Export results to JSON.
     */
    toJSON() {
        return {
            results: this.results,
            config: this.config,
            duration: Date.now() - this.startTime
        };
    }
}

/**
 * Performance Metrics Collector.
 */
export class MetricsCollector extends Component {
    constructor(config = {}) {
        super({
            sampleRate: 1.0,
            windowSize: 100,
            metrics: ['reward', 'loss', 'gradient_norm', 'fps'],
            ...config
        });
        
        this.metrics = new Map();
        this.history = new Map();
        this.aggregations = new Map();
    }

    /**
     * Record a metric value.
     */
    record(name, value, tags = {}) {
        const key = this.makeKey(name, tags);
        
        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                name,
                tags,
                values: [],
                count: 0,
                sum: 0,
                min: Infinity,
                max: -Infinity,
                lastValue: null,
                lastUpdate: Date.now()
            });
        }
        
        const metric = this.metrics.get(key);
        metric.values.push({ value, timestamp: Date.now() });
        metric.count++;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        metric.lastValue = value;
        metric.lastUpdate = Date.now();
        
        // Keep window bounded
        if (metric.values.length > this.config.windowSize) {
            metric.values.shift();
        }
        
        // Update history
        if (!this.history.has(name)) {
            this.history.set(name, []);
        }
        this.history.get(name).push({ value, tags, timestamp: Date.now() });
        
        this.emit('metricRecorded', { name, value, tags });
    }

    /**
     * Get current metric value.
     */
    get(name, tags = {}) {
        const key = this.makeKey(name, tags);
        return this.metrics.get(key)?.lastValue || null;
    }

    /**
     * Get metric history.
     */
    getHistory(name, tags = null) {
        if (tags) {
            const key = this.makeKey(name, tags);
            return this.metrics.get(key)?.values || [];
        }
        return this.history.get(name) || [];
    }

    /**
     * Calculate metric statistics.
     */
    stats(name, tags = {}) {
        const key = this.makeKey(name, tags);
        const metric = this.metrics.get(key);
        
        if (!metric || metric.count === 0) {
            return null;
        }
        
        const values = metric.values.map(v => v.value);
        
        return {
            count: metric.count,
            mean: metric.sum / metric.count,
            min: metric.min,
            max: metric.max,
            last: metric.lastValue,
            std: this.calculateStd(values, metric.sum / metric.count),
            p50: this.percentile(values, 50),
            p90: this.percentile(values, 90),
            p99: this.percentile(values, 99)
        };
    }

    /**
     * Aggregate metrics over time window.
     */
    aggregate(name, windowMs = 60000, fn = 'mean') {
        const history = this.history.get(name) || [];
        const cutoff = Date.now() - windowMs;
        
        const values = history
            .filter(h => h.timestamp >= cutoff)
            .map(h => h.value);
        
        if (values.length === 0) return null;
        
        switch (fn) {
            case 'mean':
                return values.reduce((a, b) => a + b, 0) / values.length;
            case 'sum':
                return values.reduce((a, b) => a + b, 0);
            case 'max':
                return Math.max(...values);
            case 'min':
                return Math.min(...values);
            default:
                return values.reduce((a, b) => a + b, 0) / values.length;
        }
    }

    /**
     * Make unique key from name and tags.
     */
    makeKey(name, tags) {
        const tagStr = Object.entries(tags)
            .sort()
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return tagStr ? `${name}:${tagStr}` : name;
    }

    /**
     * Calculate standard deviation.
     */
    calculateStd(values, mean) {
        if (values.length < 2) return 0;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    /**
     * Calculate percentile.
     */
    percentile(values, p) {
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }

    /**
     * Get all metric names.
     */
    getMetricNames() {
        return Array.from(this.history.keys());
    }

    /**
     * Export metrics to JSON.
     */
    toJSON() {
        return {
            metrics: Array.from(this.metrics.entries()).map(([key, m]) => ({
                key,
                name: m.name,
                tags: m.tags,
                stats: this.stats(m.name, m.tags)
            })),
            history: Object.fromEntries(
                Array.from(this.history.entries()).map(([name, h]) => [name, h.slice(-100)])
            )
        };
    }
}

/**
 * Comparative Evaluator for comparing multiple agents.
 */
export class ComparativeEvaluator extends Component {
    constructor(config = {}) {
        super({
            statisticalTest: 't-test',
            confidenceLevel: 0.95,
            numRuns: 30,
            ...config
        });
        
        this.comparisons = [];
    }

    /**
     * Compare two agents on same environment.
     */
    async compare(agentA, agentB, env, options = {}) {
        const { numRuns = this.config.numRuns } = options;
        
        const resultsA = await this.runMultiple(agentA, env, numRuns);
        const resultsB = await this.runMultiple(agentB, env, numRuns);
        
        const comparison = {
            agentA: {
                name: agentA.constructor.name,
                results: resultsA
            },
            agentB: {
                name: agentB.constructor.name,
                results: resultsB
            },
            statisticalTest: this.runStatisticalTest(resultsA, resultsB),
            effectSize: this.calculateEffectSize(resultsA, resultsB),
            timestamp: Date.now()
        };
        
        this.comparisons.push(comparison);
        return comparison;
    }

    /**
     * Run agent multiple times.
     */
    async runMultiple(agent, env, numRuns) {
        const rewards = [];
        
        for (let i = 0; i < numRuns; i++) {
            let state = env.reset();
            let totalReward = 0;
            
            while (!state.terminated) {
                const action = await agent.act(state.observation);
                state = env.step(action);
                totalReward += state.reward;
            }
            
            rewards.push(totalReward);
        }
        
        return rewards;
    }

    /**
     * Run statistical test.
     */
    runStatisticalTest(resultsA, resultsB) {
        // Simplified t-test implementation
        const n1 = resultsA.length;
        const n2 = resultsB.length;
        const mean1 = resultsA.reduce((a, b) => a + b, 0) / n1;
        const mean2 = resultsB.reduce((a, b) => a + b, 0) / n2;
        
        const var1 = resultsA.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
        const var2 = resultsB.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
        
        const pooledSe = Math.sqrt(var1 / n1 + var2 / n2);
        const tStat = (mean1 - mean2) / pooledSe;
        
        // Approximate p-value (simplified)
        const df = n1 + n2 - 2;
        const pValue = this.approximatePValue(tStat, df);
        
        return {
            tStat,
            df,
            pValue,
            significant: pValue < (1 - this.config.confidenceLevel),
            meanDiff: mean1 - mean2
        };
    }

    /**
     * Calculate Cohen's d effect size.
     */
    calculateEffectSize(resultsA, resultsB) {
        const n1 = resultsA.length;
        const n2 = resultsB.length;
        const mean1 = resultsA.reduce((a, b) => a + b, 0) / n1;
        const mean2 = resultsB.reduce((a, b) => a + b, 0) / n2;
        
        const var1 = resultsA.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
        const var2 = resultsB.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
        
        const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
        
        return (mean1 - mean2) / pooledStd;
    }

    /**
     * Approximate p-value from t-statistic.
     */
    approximatePValue(tStat, df) {
        // Simplified approximation using normal distribution for large df
        const z = Math.abs(tStat);
        return 2 * (1 - this.normalCdf(z));
    }

    /**
     * Normal CDF approximation.
     */
    normalCdf(x) {
        return 0.5 * (1 + Math.erf(x / Math.sqrt(2)));
    }

    /**
     * Get comparison history.
     */
    getComparisons() {
        return this.comparisons;
    }

    // Backward compatibility aliases
    static get NeuroSymbolicBenchmarkRunner() {
        return this;
    }

    static get BenchmarkFactory() {
        return this;
    }

    static createComprehensive(config = {}) {
        return new BenchmarkRunner({ ...config, numEpisodes: 100, saveTrajectories: true });
    }

    static createQuick(config = {}) {
        return new BenchmarkRunner({ ...config, numEpisodes: 20 });
    }

    static createTransfer(config = {}) {
        return new BenchmarkRunner({ ...config, numEpisodes: 50 });
    }
}
