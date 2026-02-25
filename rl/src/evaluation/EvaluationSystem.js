/**
 * Enhanced Evaluation and Benchmarking System
 * Unified framework for comprehensive RL evaluation with statistical analysis
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const BENCHMARK_DEFAULTS = {
    numEpisodes: 100,
    maxSteps: 1000,
    evaluationInterval: 10,
    metrics: ['reward', 'length', 'success'],
    saveTrajectories: false,
    parallelEnvs: 1,
    confidenceLevel: 0.95,
    statisticalTests: true
};

const MathUtils = {
    mean(arr) {
        return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },

    variance(arr, mean) {
        const m = mean ?? this.mean(arr);
        return arr.length < 2 ? 0 : arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
    },

    std(arr, mean) {
        return Math.sqrt(this.variance(arr, mean));
    },

    sem(arr) {
        return arr.length < 2 ? 0 : this.std(arr) / Math.sqrt(arr.length);
    },

    confidenceInterval(arr, confidence = 0.95) {
        if (arr.length < 2) return { lower: 0, upper: 0, margin: 0 };
        
        const mean = this.mean(arr);
        const sem = this.sem(arr);
        const zScores = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
        const z = zScores[confidence] ?? 1.96;
        const margin = z * sem;

        return {
            lower: mean - margin,
            upper: mean + margin,
            margin,
            mean,
            confidence
        };
    },

    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - prob : prob;
    },

    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }
};

/**
 * Statistical Tests for rigorous comparison
 */
export class StatisticalTests {
    static tTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) return { significant: false, pValue: 1.0, error: 'Sample sizes too small' };

        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        if (se === 0) return { significant: false, pValue: 1.0, tStatistic: 0 };

        const t = (mean1 - mean2) / se;
        const df = n1 + n2 - 2;
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(t)));

        return {
            significant: pValue < alpha,
            pValue,
            tStatistic: t,
            degreesOfFreedom: df,
            mean1,
            mean2,
            effectSize: (mean1 - mean2) / Math.sqrt((var1 + var2) / 2),
            confidenceInterval: MathUtils.confidenceInterval([...sample1, ...sample2])
        };
    }

    static welchTTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) return { significant: false, pValue: 1.0, error: 'Sample sizes too small' };

        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        if (se === 0) return { significant: false, pValue: 1.0, tStatistic: 0 };

        const t = (mean1 - mean2) / se;
        
        // Welch-Satterthwaite degrees of freedom
        const num = Math.pow(var1 / n1 + var2 / n2, 2);
        const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
        const df = num / denom;
        
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(t)));

        return {
            significant: pValue < alpha,
            pValue,
            tStatistic: t,
            degreesOfFreedom: df,
            mean1,
            mean2,
            effectSize: (mean1 - mean2) / Math.sqrt((var1 + var2) / 2)
        };
    }

    static wilcoxonTest(sample1, sample2, alpha = 0.05) {
        if (sample1.length !== sample2.length) {
            return { significant: false, pValue: 1.0, error: 'Samples must be paired' };
        }

        const n = sample1.length;
        if (n < 5) return { significant: false, pValue: 1.0, error: 'Sample size too small' };

        const differences = sample1
            .map((v, i) => ({ diff: v - sample2[i], absDiff: Math.abs(v - sample2[i]) }))
            .filter(d => d.diff !== 0);

        if (differences.length === 0) return { significant: false, pValue: 1.0 };

        differences.sort((a, b) => a.absDiff - b.absDiff);
        differences.forEach((d, i) => d.rank = i + 1);

        const { wPlus, wMinus } = differences.reduce(
            (acc, d) => ({
                wPlus: acc.wPlus + (d.diff > 0 ? d.rank : 0),
                wMinus: acc.wMinus + (d.diff <= 0 ? d.rank : 0)
            }),
            { wPlus: 0, wMinus: 0 }
        );

        const w = Math.min(wPlus, wMinus);
        const nNonZero = differences.length;
        const mu = nNonZero * (nNonZero + 1) / 4;
        const sigma = Math.sqrt(nNonZero * (nNonZero + 1) * (2 * nNonZero + 1) / 24);
        const z = (w - mu) / sigma;
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(z)));

        return { significant: pValue < alpha, pValue, wStatistic: w, zScore: z };
    }

    static permutationTest(sample1, sample2, alpha = 0.05, permutations = 10000) {
        const n1 = sample1.length;
        const n2 = sample2.length;
        const combined = [...sample1, ...sample2];
        const obsDiff = MathUtils.mean(sample1) - MathUtils.mean(sample2);

        let extreme = 0;
        for (let p = 0; p < permutations; p++) {
            const shuffled = [...combined].sort(() => Math.random() - 0.5);
            const permDiff = MathUtils.mean(shuffled.slice(0, n1)) - MathUtils.mean(shuffled.slice(n1));
            if (Math.abs(permDiff) >= Math.abs(obsDiff)) extreme++;
        }

        const pValue = extreme / permutations;
        return { significant: pValue < alpha, pValue, obsDiff, permutations };
    }

    static anova(...samples) {
        if (samples.length < 2) return { significant: false, error: 'Need at least 2 samples' };

        const k = samples.length;
        const allData = samples.flat();
        const grandMean = MathUtils.mean(allData);
        const N = allData.length;

        // Between-group sum of squares
        let ssBetween = 0;
        for (const sample of samples) {
            const groupMean = MathUtils.mean(sample);
            ssBetween += sample.length * Math.pow(groupMean - grandMean, 2);
        }

        // Within-group sum of squares
        let ssWithin = 0;
        for (const sample of samples) {
            const groupMean = MathUtils.mean(sample);
            ssWithin += sample.reduce((sum, x) => sum + Math.pow(x - groupMean, 2), 0);
        }

        const dfBetween = k - 1;
        const dfWithin = N - k;
        const msBetween = ssBetween / dfBetween;
        const msWithin = ssWithin / dfWithin;
        const f = msWithin > 0 ? msBetween / msWithin : Infinity;

        // Approximate p-value
        const pValue = MathUtils.fDistributionPValue(f, dfBetween, dfWithin);

        return {
            significant: pValue < 0.05,
            pValue,
            fStatistic: f,
            degreesOfFreedom: { between: dfBetween, within: dfWithin },
            ssBetween,
            ssWithin
        };
    }

    static fDistributionPValue(f, df1, df2) {
        const x = df2 / (df2 + df1 * f);
        return Math.pow(x, df2 / 2);
    }

    static bootstrapCI(sample, statistic = 'mean', confidence = 0.95, iterations = 1000) {
        const n = sample.length;
        const stats = [];

        for (let i = 0; i < iterations; i++) {
            const resample = Array.from({ length: n }, () => sample[Math.floor(Math.random() * n)]);
            if (statistic === 'mean') {
                stats.push(MathUtils.mean(resample));
            } else if (statistic === 'median') {
                stats.push(MathUtils.median(resample));
            } else if (statistic === 'std') {
                stats.push(MathUtils.std(resample));
            }
        }

        stats.sort((a, b) => a - b);
        const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
        const upperIdx = Math.ceil((1 + confidence) / 2 * iterations);

        return {
            lower: stats[lowerIdx],
            upper: stats[upperIdx],
            mean: MathUtils.mean(stats),
            confidence,
            iterations
        };
    }
}

/**
 * Enhanced Benchmark Runner
 */
export class BenchmarkRunner extends Component {
    constructor(config = {}) {
        super(mergeConfig(BENCHMARK_DEFAULTS, config));
        this.results = [];
        this.metrics = new MetricsTracker();
        this.benchmarks = [];
        this.startTime = null;
    }

    async onInitialize() {
        this.startTime = Date.now();
        this.setState('currentEpisode', 0);
        this.setState('phase', 'initialization');
    }

    async run(agent, environments, options = {}) {
        const { 
            numEpisodes = this.config.numEpisodes, 
            maxSteps = this.config.maxSteps, 
            saveTrajectories = this.config.saveTrajectories 
        } = options;

        this.setState('phase', 'running');
        const allResults = [];

        for (const envSpec of environments) {
            const env = await this._createEnvironment(envSpec);
            const envResults = await this.runOnEnvironment(agent, env, { numEpisodes, maxSteps, saveTrajectories });
            allResults.push({ environment: envSpec.name ?? envSpec.constructor?.name ?? 'Unknown', results: envResults });
        }

        this.setState('phase', 'complete');
        return this.summarizeResults(allResults);
    }

    async _createEnvironment(envSpec) {
        if (typeof envSpec === 'string') {
            try {
                const mod = await import(`../environments/${envSpec}.js`);
                const EnvClass = mod[envSpec];
                return EnvClass ? new EnvClass() : envSpec;
            } catch {
                return envSpec;
            }
        }
        if (typeof envSpec === 'function') return new envSpec();
        return envSpec;
    }

    async runOnEnvironment(agent, env, options) {
        const { numEpisodes, maxSteps, saveTrajectories } = options;
        const episodeResults = [];
        const trajectories = [];

        for (let ep = 0; ep < numEpisodes; ep++) {
            this.setState('currentEpisode', ep);
            const result = await this.runEpisode(agent, env, { maxSteps, saveTrajectory: saveTrajectories });
            episodeResults.push(result);
            if (result.trajectory) trajectories.push(result.trajectory);

            if (ep % this.config.evaluationInterval === 0) {
                this.emit('evaluationProgress', {
                    episode: ep,
                    numEpisodes,
                    avgReward: MathUtils.mean(episodeResults.map(r => r.reward))
                });
            }
        }

        return { 
            episodes: episodeResults, 
            trajectories: saveTrajectories ? trajectories : [], 
            summary: this.summarizeEpisodeResults(episodeResults) 
        };
    }

    async runEpisode(agent, env, options) {
        const { maxSteps, saveTrajectory } = options;
        const { observation } = env.reset();

        let state = observation;
        let totalReward = 0;
        const trajectory = saveTrajectory ? [] : null;

        for (let step = 0; step < maxSteps; step++) {
            const action = await agent.act(state);
            const result = env.step(action);

            if (saveTrajectory) {
                trajectory.push({ 
                    step,
                    state, 
                    action, 
                    reward: result.reward, 
                    nextState: result.observation, 
                    done: result.terminated || result.truncated 
                });
            }

            totalReward += result.reward;
            state = result.observation;

            if (result.terminated || result.truncated) break;
        }

        return {
            reward: totalReward,
            steps: trajectory ? trajectory.length : 0,
            success: totalReward > 0,
            trajectory
        };
    }

    summarizeEpisodeResults(results) {
        const rewards = results.map(r => r.reward);
        const lengths = results.map(r => r.steps);
        const successes = results.filter(r => r.success).length;

        return {
            numEpisodes: results.length,
            reward: {
                mean: MathUtils.mean(rewards),
                std: MathUtils.std(rewards),
                median: MathUtils.median(rewards),
                min: Math.min(...rewards),
                max: Math.max(...rewards),
                ci95: MathUtils.confidenceInterval(rewards, 0.95)
            },
            length: {
                mean: MathUtils.mean(lengths),
                std: MathUtils.std(lengths),
                median: MathUtils.median(lengths)
            },
            successRate: successes / results.length,
            percentiles: {
                p25: MathUtils.percentile(rewards, 25),
                p50: MathUtils.percentile(rewards, 50),
                p75: MathUtils.percentile(rewards, 75),
                p90: MathUtils.percentile(rewards, 90),
                p95: MathUtils.percentile(rewards, 95)
            }
        };
    }

    summarizeResults(allResults) {
        const summary = {
            environments: allResults.map(r => ({
                name: r.environment,
                summary: r.results.summary,
                numEpisodes: r.results.episodes.length
            })),
            overall: this._computeOverallStats(allResults),
            timestamp: Date.now(),
            duration: Date.now() - this.startTime
        };

        this.results.push(summary);
        return summary;
    }

    _computeOverallStats(allResults) {
        const allRewards = allResults.flatMap(r => r.results.episodes.map(e => e.reward));
        
        return {
            avgReward: MathUtils.mean(allRewards),
            totalEpisodes: allRewards.length,
            avgSuccessRate: MathUtils.mean(allResults.map(r => r.results.summary.successRate))
        };
    }

    compareAgents(agentResults, options = {}) {
        const { statisticalTests = this.config.statisticalTests } = options;
        const comparison = {
            agents: Object.keys(agentResults),
            metrics: {},
            statisticalComparisons: []
        };

        // Compare rewards
        const rewards = Object.entries(agentResults).map(([name, results]) => ({
            name,
            rewards: results.map(r => r.reward)
        }));

        comparison.metrics.reward = rewards.map(r => ({
            name: r.name,
            mean: MathUtils.mean(r.rewards),
            std: MathUtils.std(r.rewards),
            ci95: MathUtils.confidenceInterval(r.rewards)
        }));

        // Statistical tests between all pairs
        if (statisticalTests) {
            for (let i = 0; i < rewards.length; i++) {
                for (let j = i + 1; j < rewards.length; j++) {
                    const tTest = StatisticalTests.tTest(rewards[i].rewards, rewards[j].rewards);
                    comparison.statisticalComparisons.push({
                        agent1: rewards[i].name,
                        agent2: rewards[j].name,
                        test: 't-test',
                        ...tTest
                    });
                }
            }
        }

        return comparison;
    }

    getResults() {
        return this.results;
    }

    exportResults(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.results, null, 2);
        }
        return this.results;
    }
}

/**
 * Metrics Collector for comprehensive tracking
 */
export class MetricsCollector extends Component {
    constructor(config = {}) {
        super(config);
        this.metrics = new Map();
        this.history = new Map();
        this.startTime = Date.now();
    }

    record(name, value, metadata = {}) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
            this.history.set(name, []);
        }

        const record = {
            value,
            timestamp: Date.now(),
            ...metadata
        };

        this.metrics.get(name).push(value);
        this.history.get(name).push(record);

        this.emit('metricRecorded', { name, value, metadata });
        return this;
    }

    get(name) {
        return this.metrics.get(name) ?? [];
    }

    getStats(name) {
        const values = this.get(name);
        if (values.length === 0) return null;

        return {
            count: values.length,
            mean: MathUtils.mean(values),
            std: MathUtils.std(values),
            median: MathUtils.median(values),
            min: Math.min(...values),
            max: Math.max(...values),
            ci95: MathUtils.confidenceInterval(values),
            percentiles: {
                p25: MathUtils.percentile(values, 25),
                p50: MathUtils.percentile(values, 50),
                p75: MathUtils.percentile(values, 75)
            }
        };
    }

    getAllStats() {
        const stats = {};
        for (const name of this.metrics.keys()) {
            stats[name] = this.getStats(name);
        }
        return stats;
    }

    getHistory(name) {
        return this.history.get(name) ?? [];
    }

    getTrend(name, window = 100) {
        const values = this.get(name);
        if (values.length < window) return null;

        const recent = values.slice(-window);
        const older = values.slice(-window * 2, -window);

        if (older.length === 0) return null;

        const recentMean = MathUtils.mean(recent);
        const olderMean = MathUtils.mean(older);
        const change = recentMean - olderMean;
        const percentChange = olderMean !== 0 ? (change / olderMean) * 100 : 0;

        return {
            direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
            change,
            percentChange,
            recentMean,
            olderMean
        };
    }

    reset(name) {
        if (name) {
            this.metrics.delete(name);
            this.history.delete(name);
        } else {
            this.metrics.clear();
            this.history.clear();
            this.startTime = Date.now();
        }
        return this;
    }

    export(format = 'json') {
        const data = {
            startTime: this.startTime,
            duration: Date.now() - this.startTime,
            metrics: Object.fromEntries(this.metrics),
            stats: this.getAllStats()
        };

        return format === 'json' ? JSON.stringify(data, null, 2) : data;
    }
}

/**
 * Agent Comparator for systematic comparison
 */
export class AgentComparator {
    constructor(config = {}) {
        this.config = mergeConfig(BENCHMARK_DEFAULTS, config);
        this.runner = new BenchmarkRunner(config);
        this.results = new Map();
    }

    async compare(agents, environments, options = {}) {
        const { numEpisodes = this.config.numEpisodes } = options;
        const agentResults = {};

        for (const [name, agent] of Object.entries(agents)) {
            console.log(`Evaluating agent: ${name}`);
            const results = await this.runner.run(agent, environments, { numEpisodes });
            agentResults[name] = results;
            this.results.set(name, results);
        }

        return this.runner.compareAgents(
            Object.fromEntries(
                Object.entries(agentResults).map(([name, r]) => [
                    name,
                    r.environments.flatMap(e => e.results.episodes)
                ])
            )
        );
    }

    getResults(agentName) {
        return this.results.get(agentName);
    }

    getAllResults() {
        return Object.fromEntries(this.results);
    }
}

/**
 * Power Analysis for sample size determination
 */
export class PowerAnalysis {
    static calculateSampleSize(effectSize, power = 0.8, alpha = 0.05) {
        // Approximation using normal distribution
        const zAlpha = 1.96; // for alpha = 0.05 (two-tailed)
        const zBeta = 0.84;  // for power = 0.8

        const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);
        return Math.ceil(n);
    }

    static calculatePower(sampleSize, effectSize, alpha = 0.05) {
        const zAlpha = 1.96;
        const se = Math.sqrt(2 / sampleSize);
        const zBeta = (effectSize / se) - zAlpha;
        
        // Approximate power using normal CDF
        return MathUtils.normalCDF(zBeta);
    }

    static calculateEffectSize(mean1, mean2, std1, std2) {
        const pooledStd = Math.sqrt((std1 * std1 + std2 * std2) / 2);
        return pooledStd > 0 ? Math.abs(mean1 - mean2) / pooledStd : 0;
    }
}

/**
 * Multiple Comparison Correction
 */
export class MultipleComparisonCorrection {
    static bonferroni(pValues, alpha = 0.05) {
        const m = pValues.length;
        const correctedAlpha = alpha / m;
        
        return pValues.map((p, i) => ({
            index: i,
            pValue: p,
            correctedPValue: Math.min(p * m, 1.0),
            significant: p < correctedAlpha
        }));
    }

    static benjaminiHochberg(pValues, alpha = 0.05) {
        const m = pValues.length;
        const indexed = pValues.map((p, i) => ({ p, i }));
        indexed.sort((a, b) => a.p - b.p);

        let rejectionThreshold = -1;
        for (let i = m - 1; i >= 0; i--) {
            const threshold = ((i + 1) / m) * alpha;
            if (indexed[i].p <= threshold) {
                rejectionThreshold = indexed[i].p;
                break;
            }
        }

        return pValues.map((p, i) => ({
            index: i,
            pValue: p,
            significant: rejectionThreshold >= 0 && p <= rejectionThreshold
        }));
    }
}

export { BenchmarkRunner as Evaluator };
export { MetricsCollector as Collector };
export { StatisticalTests as Statistics };

// Monitoring and metrics export
export { MetricsExporter, TrainingMonitor, createMonitor, createMonitorCallback } from './MonitoringSystem.js';
