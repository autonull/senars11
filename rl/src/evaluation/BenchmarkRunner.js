/**
 * Benchmark Runner Module
 * Comprehensive benchmarking framework for RL evaluation
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { StatisticalTests, MathUtils, DescriptiveStats } from './StatisticalTests.js';
import { MetricsCollector, PerformanceAnalyzer } from './MetricsCollector.js';

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

/**
 * Benchmark runner for comprehensive evaluation
 */
export class BenchmarkRunner extends Component {
    constructor(config = {}) {
        super(mergeConfig(BENCHMARK_DEFAULTS, config));
        this.results = [];
        this.metrics = new MetricsTracker();
        this.benchmarks = [];
        this.startTime = null;
        this.collector = new MetricsCollector();
        this.perfAnalyzer = new PerformanceAnalyzer();
    }

    async onInitialize() {
        this.startTime = Date.now();
        this.setState('currentEpisode', 0);
        this.setState('phase', 'initialization');
    }

    /**
     * Run benchmark on agent across environments
     * @param {Agent} agent - Agent to evaluate
     * @param {Array} environments - Environments to test on
     * @param {object} options - Benchmark options
     * @returns {object} Benchmark summary
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
            const env = await this._createEnvironment(envSpec);
            const envResults = await this.runOnEnvironment(agent, env, {
                numEpisodes,
                maxSteps,
                saveTrajectories
            });
            allResults.push({
                environment: envSpec.name ?? envSpec.constructor?.name ?? 'Unknown',
                results: envResults
            });
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

    /**
     * Run agent on single environment
     * @param {Agent} agent - Agent to evaluate
     * @param {Environment} env - Environment
     * @param {object} options - Episode options
     * @returns {object} Environment results
     */
    async runOnEnvironment(agent, env, options) {
        const { numEpisodes, maxSteps, saveTrajectories } = options;
        const episodeResults = [];
        const trajectories = [];

        for (let ep = 0; ep < numEpisodes; ep++) {
            this.setState('currentEpisode', ep);
            this.perfAnalyzer.start('episode');

            const result = await this.runEpisode(agent, env, {
                maxSteps,
                saveTrajectory: saveTrajectories
            });

            const duration = this.perfAnalyzer.end('episode');
            result.duration = duration;

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

    /**
     * Run single episode
     * @param {Agent} agent - Agent
     * @param {Environment} env - Environment
     * @param {object} options - Episode options
     * @returns {object} Episode result
     */
    async runEpisode(agent, env, options) {
        const { maxSteps, saveTrajectory } = options;
        const { observation } = env.reset();

        let state = observation;
        let totalReward = 0;
        const trajectory = saveTrajectory ? [] : null;

        for (let step = 0; step < maxSteps; step++) {
            this.perfAnalyzer.start('agent.act');
            const action = await agent.act(state);
            this.perfAnalyzer.end('agent.act');

            this.perfAnalyzer.start('env.step');
            const result = env.step(action);
            this.perfAnalyzer.end('env.step');

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

    /**
     * Summarize episode results
     * @param {Array} results - Episode results
     * @returns {object} Summary statistics
     */
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

    /**
     * Summarize all results
     * @param {Array} allResults - All environment results
     * @returns {object} Overall summary
     */
    summarizeResults(allResults) {
        const summary = {
            environments: allResults.map(r => ({
                name: r.environment,
                summary: r.results.summary,
                numEpisodes: r.results.episodes.length
            })),
            overall: this._computeOverallStats(allResults),
            performance: this.perfAnalyzer.getAllStats(),
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

    /**
     * Compare multiple agents
     * @param {object} agentResults - Results by agent name
     * @param {object} options - Comparison options
     * @returns {object} Comparison results
     */
    compareAgents(agentResults, options = {}) {
        const { statisticalTests = this.config.statisticalTests } = options;
        const comparison = {
            agents: Object.keys(agentResults),
            metrics: {},
            statisticalComparisons: []
        };

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

    /**
     * Get all results
     * @returns {Array} Results
     */
    getResults() {
        return this.results;
    }

    /**
     * Export results
     * @param {string} format - Export format
     * @returns {any} Exported data
     */
    exportResults(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.results, null, 2);
        }
        return this.results;
    }

    /**
     * Get performance stats
     * @returns {object} Performance statistics
     */
    getPerformanceStats() {
        return this.perfAnalyzer.getAllStats();
    }

    async onShutdown() {
        this.perfAnalyzer.clear();
    }
}
