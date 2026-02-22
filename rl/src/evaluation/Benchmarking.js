import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    numEpisodes: 100,
    maxSteps: 1000,
    evaluationInterval: 10,
    metrics: ['reward', 'length', 'success'],
    saveTrajectories: false,
    parallelEnvs: 1
};

export class BenchmarkRunner extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
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

    async run(agent, environments, options = {}) {
        const { numEpisodes = this.config.numEpisodes, maxSteps = this.config.maxSteps, saveTrajectories = this.config.saveTrajectories } = options;

        this.setState('phase', 'running');
        const allResults = [];

        for (const envSpec of environments) {
            const env = await this.createEnvironment(envSpec);
            const envResults = await this.runOnEnvironment(agent, env, { numEpisodes, maxSteps, saveTrajectories });
            allResults.push({ environment: envSpec.name, results: envResults });
        }

        this.setState('phase', 'complete');
        return this.summarizeResults(allResults);
    }

    async createEnvironment(envSpec) {
        if (typeof envSpec === 'string') {
            const mod = await import(`../environments/${envSpec}.js`);
            const EnvClass = mod[envSpec];
            return new EnvClass();
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
                    avgReward: this.calculateRunningAvg(episodeResults)
                });
            }
        }

        return { episodes: episodeResults, trajectories: saveTrajectories ? trajectories : [], summary: this.summarizeEpisodeResults(episodeResults) };
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
                trajectory.push({ state, action, reward: result.reward, nextState: result.observation, done: result.terminated });
            }

            totalReward += result.reward;
            state = result.observation;

            if (result.terminated || result.truncated) break;
        }

        return {
            reward: totalReward,
            steps: trajectory?.length ?? step + 1,
            success: totalReward > 0,
            trajectory
        };
    }

    calculateRunningAvg(results) {
        const recent = results.slice(-10);
        return recent.reduce((a, b) => a + b.reward, 0) / recent.length;
    }

    summarizeEpisodeResults(results) {
        const rewards = results.map(r => r.reward);
        const lengths = results.map(r => r.steps);
        const successes = results.filter(r => r.success).length;

        return {
            meanReward: this.mean(rewards),
            stdReward: this.std(rewards),
            minReward: Math.min(...rewards),
            maxReward: Math.max(...rewards),
            meanLength: this.mean(lengths),
            successRate: successes / results.length
        };
    }

    summarizeResults(allResults) {
        const summary = {
            environments: allResults.map(r => r.environment),
            totalTime: Date.now() - this.startTime,
            environmentResults: {}
        };

        allResults.forEach(({ environment, results, summary: envSummary }) => {
            summary.environmentResults[environment] = envSummary;
        });

        return summary;
    }

    mean(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
    std(arr) {
        if (arr.length < 2) return 0;
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
    }
}

export class MetricsCollector {
    constructor(config = {}) {
        this.config = { windowSize: config.windowSize ?? 100, ...config };
        this.metrics = new Map();
        this.history = new Map();
    }

    record(name, value) {
        if (!this.history.has(name)) this.history.set(name, []);
        const hist = this.history.get(name);
        hist.push({ value, timestamp: Date.now() });
        if (hist.length > this.config.windowSize) hist.shift();

        const stats = this.computeStats(name);
        this.metrics.set(name, { current: value, ...stats });
        return stats;
    }

    computeStats(name) {
        const hist = this.history.get(name) ?? [];
        if (hist.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };

        const values = hist.map(h => h.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);

        return { mean, std, min: Math.min(...values), max: Math.max(...values), count: values.length };
    }

    get(name) { return this.metrics.get(name); }
    getAll() { return Object.fromEntries(this.metrics); }

    reset(name) {
        if (name) {
            this.history.delete(name);
            this.metrics.delete(name);
        } else {
            this.history.clear();
            this.metrics.clear();
        }
    }
}

export class EvaluationSuite {
    constructor(config = {}) {
        this.config = { numSeeds: config.numSeeds ?? 5, ...config };
        this.runners = [];
    }

    async run(agent, environments, options = {}) {
        const results = [];

        for (let seed = 0; seed < this.config.numSeeds; seed++) {
            const runner = new BenchmarkRunner({ ...options, seed });
            await runner.initialize();
            const result = await runner.run(agent, environments, options);
            results.push({ seed, ...result });
            await runner.shutdown();
        }

        return this.aggregateResults(results);
    }

    aggregateResults(results) {
        const allRewards = results.flatMap(r =>
            Object.values(r.environmentResults).map(er => er.meanReward)
        );

        return {
            meanReward: allRewards.reduce((a, b) => a + b, 0) / allRewards.length,
            stdReward: Math.sqrt(allRewards.reduce((s, v) => s + Math.pow(v - this.mean(allRewards), 2), 0) / allRewards.length),
            numSeeds: results.length,
            perSeed: results.map(r => ({ seed: r.seed, meanReward: this.mean(Object.values(r.environmentResults).map(er => er.meanReward)) }))
        };
    }

    mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
}

export const BenchmarkPresets = {
    quick: { numEpisodes: 10, maxSteps: 100, saveTrajectories: false },
    standard: { numEpisodes: 100, maxSteps: 500, saveTrajectories: false },
    thorough: { numEpisodes: 500, maxSteps: 1000, saveTrajectories: true }
};
