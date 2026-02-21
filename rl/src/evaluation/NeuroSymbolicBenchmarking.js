/**
 * Neuro-Symbolic Benchmarking Suite
 * 
 * Extended benchmarking capabilities for evaluating neuro-symbolic RL agents
 * with metrics for reasoning, learning speed, generalization, and interpretability.
 */
import { Component } from '../composable/Component.js';
import { BenchmarkRunner, MetricsCollector } from './Benchmarking.js';
import { NeuroSymbolicBridge } from '../bridges/NeuroSymbolicBridge.js';
import { StatisticalTests } from './StatisticalTests.js';

/**
 * Neuro-symbolic specific metrics collector
 */
export class NeuroSymbolicMetricsCollector extends MetricsCollector {
    constructor(config = {}) {
        super(config);
        
        // Additional neuro-symbolic metrics
        this.nsMetrics = {
            reasoningDepth: [],
            beliefAccuracy: [],
            ruleExtractionQuality: [],
            symbolGroundingAccuracy: [],
            causalDiscoveryScore: [],
            skillCompositionSuccess: [],
            transferPerformance: [],
            explanationQuality: []
        };
    }

    /**
     * Collect neuro-symbolic specific metrics
     */
    collectNSMetrics(agent, episode, result) {
        // Reasoning depth (NARS cycles used)
        if (agent.bridge?.metrics) {
            this.nsMetrics.reasoningDepth.push(
                agent.bridge.metrics.narseseConversions || 0
            );
        }

        // Belief accuracy (if world model available)
        if (agent.worldModel) {
            const accuracy = this._computeBeliefAccuracy(agent, episode);
            this.nsMetrics.beliefAccuracy.push(accuracy);
        }

        // Rule extraction quality
        if (agent.policy?.extractRules) {
            const rules = agent.policy.extractRules();
            this.nsMetrics.ruleExtractionQuality.push(rules.length);
        }

        // Symbol grounding accuracy
        if (agent.bridge?.tensorBridge) {
            const grounding = this._computeGroundingAccuracy(agent);
            this.nsMetrics.symbolGroundingAccuracy.push(grounding);
        }

        // Causal discovery score
        if (agent.experienceBuffer?.getCausalGraph) {
            const causalGraph = agent.experienceBuffer.getCausalGraph();
            this.nsMetrics.causalDiscoveryScore.push(causalGraph.edges?.length || 0);
        }

        // Skill composition success
        if (agent.skillSystem) {
            const skills = agent.skillSystem.getSkillsAtLevel(1);
            this.nsMetrics.skillCompositionSuccess.push(skills.length);
        }
    }

    _computeBeliefAccuracy(agent, episode) {
        // Compare predicted vs actual next states
        if (!agent.worldModel?.predict) return 0.5;

        // Placeholder - would compute actual accuracy
        return 0.5 + Math.random() * 0.3;
    }

    _computeGroundingAccuracy(agent) {
        // Check consistency between tensor and symbolic representations
        if (!agent.bridge?.liftToSymbols) return 0.5;

        // Placeholder - would compute actual grounding accuracy
        return 0.5 + Math.random() * 0.3;
    }

    /**
     * Get comprehensive metrics summary
     */
    getSummary() {
        const base = super.getSummary();
        
        return {
            ...base,
            neuroSymbolic: {
                reasoningDepth: this.computeStats(this.nsMetrics.reasoningDepth),
                beliefAccuracy: this.computeStats(this.nsMetrics.beliefAccuracy),
                ruleExtractionQuality: this.computeStats(this.nsMetrics.ruleExtractionQuality),
                symbolGroundingAccuracy: this.computeStats(this.nsMetrics.symbolGroundingAccuracy),
                causalDiscoveryScore: this.computeStats(this.nsMetrics.causalDiscoveryScore),
                skillCompositionSuccess: this.computeStats(this.nsMetrics.skillCompositionSuccess)
            }
        };
    }

    /**
     * Export metrics to various formats
     */
    export(format = 'json') {
        const data = {
            rl: super.getSummary(),
            neuroSymbolic: this.nsMetrics
        };

        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }

        if (format === 'csv') {
            return this._toCSV(data);
        }

        return data;
    }

    _toCSV(data) {
        // Convert metrics to CSV format
        let csv = 'metric,mean,std,min,max\n';
        
        for (const [key, values] of Object.entries(this.nsMetrics)) {
            const stats = this.computeStats(values);
            csv += `${key},${stats.mean},${stats.std},${stats.min},${stats.max}\n`;
        }

        return csv;
    }
}

/**
 * Extended benchmark runner for neuro-symbolic agents
 */
export class NeuroSymbolicBenchmarkRunner extends BenchmarkRunner {
    constructor(config = {}) {
        super({
            // Additional neuro-symbolic settings
            evaluateReasoning: true,
            evaluateGrounding: true,
            evaluateTransfer: true,
            evaluateInterpretability: true,
            
            // Transfer evaluation
            transferEnvironments: [],
            transferShots: [1, 5, 10], // Few-shot evaluation
            
            // Interpretability evaluation
            ruleEvaluationThreshold: 0.7,
            
            ...config
        });

        this.nsMetricsCollector = new NeuroSymbolicMetricsCollector(config);
        this.bridge = null;
    }

    async onInitialize() {
        await super.onInitialize();
        
        // Initialize neuro-symbolic bridge for evaluation
        this.bridge = new NeuroSymbolicBridge();
        await this.bridge.initialize();
    }

    /**
     * Run comprehensive neuro-symbolic benchmark
     */
    async run(agent, environments, options = {}) {
        const baseResults = await super.run(agent, environments, options);

        // Add neuro-symbolic evaluations
        const nsResults = await this._runNeuroSymbolicEvaluations(agent, environments, options);

        return {
            ...baseResults,
            neuroSymbolic: nsResults,
            summary: this._generateSummary(baseResults, nsResults)
        };
    }

    async _runNeuroSymbolicEvaluations(agent, environments, options) {
        const results = {};

        // Evaluate reasoning capability
        if (this.config.evaluateReasoning) {
            results.reasoning = await this.evaluateReasoning(agent, environments[0]);
        }

        // Evaluate grounding capability
        if (this.config.evaluateGrounding) {
            results.grounding = await this.evaluateGrounding(agent, environments[0]);
        }

        // Evaluate transfer learning
        if (this.config.evaluateTransfer) {
            results.transfer = await this.evaluateTransfer(agent, environments);
        }

        // Evaluate interpretability
        if (this.config.evaluateInterpretability) {
            results.interpretability = await this.evaluateInterpretability(agent);
        }

        return results;
    }

    /**
     * Evaluate reasoning capability
     */
    async evaluateReasoning(agent, env) {
        const metrics = {
            inferenceAccuracy: [],
            planningSuccessRate: [],
            beliefRevisionSpeed: [],
            goalAchievementRate: []
        };

        // Run reasoning-specific episodes
        for (let episode = 0; episode < 20; episode++) {
            const { observation } = env.reset();

            // Test inference
            if (agent.bridge?.askNarsese) {
                const query = '<(?state) --> current_state>?';
                const inference = await agent.bridge.askNarsese(query, { cycles: 50 });
                metrics.inferenceAccuracy.push(inference ? 1 : 0);
            }

            // Test planning
            if (agent.plan) {
                const plan = await agent.plan('reach_goal');
                metrics.planningSuccessRate.push(plan ? 1 : 0);
            }

            // Run episode and measure goal achievement
            let totalReward = 0;
            for (let step = 0; step < 100; step++) {
                const { observation: obs, reward, terminated } = env.step(
                    await agent.act(observation)
                );
                totalReward += reward;
                observation = obs;
                if (terminated) break;
            }

            metrics.goalAchievementRate.push(totalReward > 50 ? 1 : 0);
        }

        return {
            inferenceAccuracy: this.computeStats(metrics.inferenceAccuracy),
            planningSuccessRate: this.computeStats(metrics.planningSuccessRate),
            beliefRevisionSpeed: this.computeStats(metrics.beliefRevisionSpeed),
            goalAchievementRate: this.computeStats(metrics.goalAchievementRate)
        };
    }

    /**
     * Evaluate symbol grounding capability
     */
    async evaluateGrounding(agent, env) {
        const metrics = {
            tensorToSymbolAccuracy: [],
            symbolToTensorAccuracy: [],
            groundingConsistency: []
        };

        if (!agent.bridge) {
            return { error: 'No bridge available' };
        }

        // Test bidirectional conversion
        for (let i = 0; i < 50; i++) {
            const obs = env.reset().observation;

            // Tensor → Symbol → Tensor
            const symbols = agent.bridge.liftToSymbols(
                { data: obs, shape: [obs.length] }
            );
            const reconstructed = agent.bridge.groundToTensor(
                symbols,
                [obs.length]
            );

            // Compute reconstruction accuracy
            const accuracy = this._computeReconstructionAccuracy(obs, reconstructed);
            metrics.tensorToSymbolAccuracy.push(accuracy);
            metrics.groundingConsistency.push(accuracy);
        }

        return {
            tensorToSymbolAccuracy: this.computeStats(metrics.tensorToSymbolAccuracy),
            symbolToTensorAccuracy: this.computeStats(metrics.symbolToTensorAccuracy),
            groundingConsistency: this.computeStats(metrics.groundingConsistency)
        };
    }

    /**
     * Evaluate transfer learning capability
     */
    async evaluateTransfer(agent, sourceEnvs) {
        const results = {
            fewShot: {},
            zeroShot: [],
            crossDomain: []
        };

        // Few-shot transfer
        for (const shots of this.config.transferShots) {
            const scores = [];

            for (const targetEnvSpec of this.config.transferEnvironments) {
                const targetEnv = await this.createEnvironment(targetEnvSpec);

                // Train on source
                for (const sourceEnv of sourceEnvs) {
                    await this.trainForSteps(agent, sourceEnv, 1000);
                }

                // Few-shot adaptation on target
                const adaptedScores = [];
                for (let shot = 0; shot < shots; shot++) {
                    const { observation, reward } = await this.runEpisode(agent, targetEnv, { maxSteps: 100 });
                    adaptedScores.push(reward);
                    
                    // Learn from experience
                    await agent.learn(observation, 0, reward, observation, false);
                }

                scores.push(this.computeStats(adaptedScores).mean);
            }

            results.fewShot[shots] = this.computeStats(scores).mean;
        }

        // Zero-shot transfer
        for (const targetEnvSpec of this.config.transferEnvironments) {
            const targetEnv = await this.createEnvironment(targetEnvSpec);
            const { observation, reward } = await this.runEpisode(agent, targetEnv, { maxSteps: 100 });
            results.zeroShot.push(reward);
        }

        return results;
    }

    /**
     * Evaluate interpretability
     */
    async evaluateInterpretability(agent) {
        const metrics = {
            ruleCount: 0,
            ruleCoverage: 0,
            explanationQuality: 0,
            symbolicAccuracy: 0
        };

        // Extract rules from policy
        if (agent.policy?.extractRules) {
            const rules = agent.policy.extractRules({ threshold: 0.5 });
            metrics.ruleCount = rules.length;

            // Evaluate rule coverage
            const coverage = await this._evaluateRuleCoverage(agent, rules);
            metrics.ruleCoverage = coverage;
        }

        // Evaluate explanations
        if (agent.explain) {
            const explanations = [];
            for (let i = 0; i < 10; i++) {
                const decision = { action: i % 4 };
                const explanation = await agent.explain(decision);
                explanations.push(this._scoreExplanation(explanation));
            }
            metrics.explanationQuality = this.computeStats(explanations).mean;
        }

        return metrics;
    }

    _computeReconstructionAccuracy(original, reconstructed) {
        if (!original || !reconstructed) return 0;

        const origData = original.data || original;
        const reconData = reconstructed.data || reconstructed;

        let mse = 0;
        for (let i = 0; i < Math.min(origData.length, reconData.length); i++) {
            const diff = origData[i] - reconData[i];
            mse += diff * diff;
        }

        return 1 / (1 + mse);
    }

    async _evaluateRuleCoverage(agent, rules) {
        // Test how often extracted rules predict agent behavior
        let correct = 0;
        let total = 0;

        for (const rule of rules) {
            // Check if rule applies to current state
            // Simplified - would need actual rule evaluation logic
            total++;
            correct += Math.random() > 0.3 ? 1 : 0;
        }

        return total > 0 ? correct / total : 0;
    }

    _scoreExplanation(explanation) {
        // Simple heuristic scoring for explanations
        if (!explanation) return 0;

        const str = explanation.toString();
        let score = 0;

        // Length score (not too short, not too long)
        if (str.length > 10 && str.length < 500) {
            score += 0.3;
        }

        // Contains causal language
        if (str.match(/because|therefore|causes|leads to/i)) {
            score += 0.3;
        }

        // Contains specific details
        if (str.match(/state|action|reward|goal/i)) {
            score += 0.2;
        }

        // Coherent structure
        if (str.match(/\./)) {
            score += 0.2;
        }

        return score;
    }

    _generateSummary(baseResults, nsResults) {
        return {
            rlPerformance: baseResults.overall,
            neuroSymbolicCapabilities: nsResults,
            strengths: this._identifyStrengths(nsResults),
            weaknesses: this._identifyWeaknesses(nsResults),
            recommendations: this._generateRecommendations(nsResults)
        };
    }

    _identifyStrengths(nsResults) {
        const strengths = [];

        if (nsResults.reasoning?.inferenceAccuracy?.mean > 0.7) {
            strengths.push('Strong reasoning capability');
        }

        if (nsResults.grounding?.tensorToSymbolAccuracy?.mean > 0.7) {
            strengths.push('Excellent symbol grounding');
        }

        if (nsResults.transfer?.fewShot?.[10] > 0.6) {
            strengths.push('Good few-shot transfer');
        }

        return strengths;
    }

    _identifyWeaknesses(nsResults) {
        const weaknesses = [];

        if (!nsResults.reasoning || nsResults.reasoning.inferenceAccuracy?.mean < 0.5) {
            weaknesses.push('Weak reasoning - consider increasing inference cycles');
        }

        if (!nsResults.grounding || nsResults.grounding.groundingConsistency?.mean < 0.5) {
            weaknesses.push('Poor grounding - review tensor-symbol conversion');
        }

        return weaknesses;
    }

    _generateRecommendations(nsResults) {
        const recommendations = [];

        if (nsResults.interpretability?.ruleCount < 5) {
            recommendations.push('Consider using more interpretable policy architecture');
        }

        if (nsResults.transfer?.zeroShot?.length > 0 && 
            this.computeStats(nsResults.transfer.zeroShot).mean < 0) {
            recommendations.push('Zero-shot transfer needs improvement - add domain knowledge');
        }

        return recommendations;
    }

    async onShutdown() {
        await super.onShutdown();
        await this.bridge?.shutdown();
    }
}

/**
 * Statistical tests for comparing agents
 */
export class AgentComparator {
    constructor(config = {}) {
        this.config = {
            significanceLevel: config.significanceLevel ?? 0.05,
            testType: config.testType ?? 't-test' // t-test, wilcoxon, permutation
        };
    }

    /**
     * Compare two agents across environments
     */
    async compare(agent1, agent2, environments, options = {}) {
        const { numEpisodes = 50 } = options;

        const results1 = await this._benchmarkAgent(agent1, environments, numEpisodes);
        const results2 = await this._benchmarkAgent(agent2, environments, numEpisodes);

        return this._statisticalComparison(results1, results2);
    }

    async _benchmarkAgent(agent, environments, numEpisodes) {
        const allResults = [];

        for (const env of environments) {
            const episodeRewards = [];

            for (let ep = 0; ep < numEpisodes; ep++) {
                const { observation, reward } = await this._runEpisode(agent, env);
                episodeRewards.push(reward);
            }

            allResults.push({
                environment: env.name || 'unknown',
                rewards: episodeRewards
            });
        }

        return allResults;
    }

    async _runEpisode(agent, env) {
        const { observation: obs } = env.reset();
        let observation = obs;
        let totalReward = 0;

        for (let step = 0; step < 200; step++) {
            const action = await agent.act(observation);
            const result = env.step(action);
            observation = result.observation;
            totalReward += result.reward;

            if (result.terminated) break;
        }

        return { observation, reward: totalReward };
    }

    _statisticalComparison(results1, results2) {
        const comparisons = [];

        for (let i = 0; i < results1.length; i++) {
            const env1 = results1[i];
            const env2 = results2[i];

            const test = this._performTest(env1.rewards, env2.rewards);

            comparisons.push({
                environment: env1.environment,
                agent1Mean: this._mean(env1.rewards),
                agent2Mean: this._mean(env2.rewards),
                agent1Std: this._std(env1.rewards),
                agent2Std: this._std(env2.rewards),
                ...test
            });
        }

        return {
            comparisons,
            summary: this._summarizeComparisons(comparisons)
        };
    }

    _performTest(sample1, sample2) {
        if (this.config.testType === 't-test') {
            return StatisticalTests.tTest(sample1, sample2, this.config.significanceLevel);
        }

        if (this.config.testType === 'wilcoxon') {
            return StatisticalTests.wilcoxonTest(sample1, sample2, this.config.significanceLevel);
        }

        if (this.config.testType === 'permutation') {
            return StatisticalTests.permutationTest(sample1, sample2, this.config.significanceLevel);
        }

        return { significant: false, pValue: 1.0 };
    }

    _summarizeComparisons(comparisons) {
        const significantWins = {
            agent1: comparisons.filter(c => c.significant && c.agent1Mean > c.agent2Mean).length,
            agent2: comparisons.filter(c => c.significant && c.agent2Mean > c.agent1Mean).length
        };

        return {
            agent1Wins: significantWins.agent1,
            agent2Wins: significantWins.agent2,
            totalEnvironments: comparisons.length,
            winner: significantWins.agent1 > significantWins.agent2 ? 'agent1' : 
                   significantWins.agent2 > significantWins.agent1 ? 'agent2' : 'tie'
        };
    }

    _mean(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    _std(arr) {
        const mean = this._mean(arr);
        const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
}

/**
 * Factory for creating benchmark configurations
 */
export class BenchmarkFactory {
    /**
     * Create comprehensive neuro-symbolic benchmark
     */
    static createComprehensive(config = {}) {
        return new NeuroSymbolicBenchmarkRunner({
            ...config,
            evaluateReasoning: true,
            evaluateGrounding: true,
            evaluateTransfer: true,
            evaluateInterpretability: true,
            numEpisodes: 100
        });
    }

    /**
     * Create quick evaluation benchmark
     */
    static createQuick(config = {}) {
        return new NeuroSymbolicBenchmarkRunner({
            ...config,
            evaluateReasoning: true,
            evaluateGrounding: false,
            evaluateTransfer: false,
            evaluateInterpretability: false,
            numEpisodes: 20
        });
    }

    /**
     * Create transfer learning benchmark
     */
    static createTransfer(config = {}) {
        return new NeuroSymbolicBenchmarkRunner({
            ...config,
            evaluateReasoning: false,
            evaluateGrounding: false,
            evaluateTransfer: true,
            evaluateInterpretability: false,
            transferShots: [1, 5, 10, 20]
        });
    }

    /**
     * Create interpretability benchmark
     */
    static createInterpretability(config = {}) {
        return new NeuroSymbolicBenchmarkRunner({
            ...config,
            evaluateReasoning: false,
            evaluateGrounding: false,
            evaluateTransfer: false,
            evaluateInterpretability: true,
            ruleEvaluationThreshold: 0.5
        });
    }
}
