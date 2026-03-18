/**
 * Example: Self-Improving Neuro-Symbolic Agent
 * 
 * This example demonstrates a complete self-improving RL agent that:
 * - Uses meta-learning to modify its own architecture
 * - Discovers and composes skills automatically
 * - Learns a world model for imagination-based planning
 * - Scales training across multiple workers
 */

import {
    NeuroSymbolicAgent,
    MetaController,
    WorldModel,
    SkillDiscoveryEngine,
    SkillLibrary,
    WorkerPool,
    BenchmarkRunner,
    MetricsCollector,
    CompositionalWorld,
    ComponentRegistry
} from '../src/index.js';

// Configuration
const CONFIG = {
    metaLearning: {
        metaLearningRate: 0.1,
        explorationRate: 0.3,
        modificationThreshold: 0.5,
        evaluationWindow: 50
    },
    worldModel: {
        horizon: 10,
        latentDim: 32,
        ensembleSize: 3,
        uncertaintyThreshold: 0.5
    },
    skillDiscovery: {
        discoveryMode: 'online',
        minUsageCount: 10,
        bottleneckThreshold: 0.3
    },
    training: {
        generations: 100,
        episodesPerGeneration: 8,
        rolloutSteps: 500,
        benchmarkInterval: 20,
        numWorkers: 4
    }
};

async function main() {
    console.log('🚀 Starting Self-Improving Neuro-Symbolic Agent...\n');
    
    // Create environment
    const env = new CompositionalWorld({ size: 10, numObjects: 5 });
    
    // Create base agent
    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process',
        reasoning: 'metta',
        planning: true,
        skillDiscovery: true,
        intrinsicMode: 'novelty'
    });
    
    // Create meta-controller for self-improvement
    const metaController = new MetaController(CONFIG.metaLearning);
    
    // Create world model for imagination
    const worldModel = new WorldModel(CONFIG.worldModel);
    
    // Create skill discovery engine
    const skillDiscovery = new SkillDiscoveryEngine(CONFIG.skillDiscovery);
    
    // Create skill library
    const skillLibrary = new SkillLibrary({ capacity: 50 });
    
    // Create worker pool for parallel rollouts
    const workerPool = new WorkerPool({
        numWorkers: CONFIG.training.numWorkers,
        workerType: 'thread'
    });
    
    // Create metrics collector
    const metrics = new MetricsCollector({ windowSize: 100 });
    
    // Initialize all components
    console.log('📦 Initializing components...');
    await agent.initialize();
    await metaController.initialize();
    await worldModel.initialize();
    await skillDiscovery.initialize();
    await workerPool.initialize();
    
    // Set initial architecture
    metaController.setArchitecture({
        stages: [
            { id: 'perception', component: agent.grounding, config: {} },
            { id: 'world_model', component: worldModel, config: {} },
            { id: 'reasoning', component: agent.bridge, config: { cycles: 50 } },
            { id: 'planning', component: agent.planner, config: { horizon: 5 } },
            { id: 'action', component: skillLibrary, config: {} }
        ]
    });
    
    // Subscribe to skill discovery events
    skillDiscovery.subscribe('skillDiscovered', ({ skill, source }) => {
        console.log(`✨ Discovered ${source} skill: ${skill.config.name}`);
        skillLibrary.register(skill.config.name, skill);
        metrics.record('skill_discovered', 1, { source, skill: skill.config.name });
    });
    
    // Subscribe to bottleneck detection
    skillDiscovery.subscribe('bottleneckDetected', ({ state }) => {
        console.log(`🎯 Detected bottleneck state: ${state}`);
        metrics.record('bottleneck_detected', 1);
    });
    
    // Subscribe to meta-controller events
    metaController.subscribe('modification', ({ modification }) => {
        console.log(`🔧 Architecture modification: ${modification.type} (${modification.reason})`);
        metrics.record('architecture_modified', 1, { type: modification.type });
    });
    
    const collectedTransitions = [];
    
    // Training loop with self-improvement
    console.log('\n📚 Starting training loop...\n');
    
    for (let generation = 0; generation < CONFIG.training.generations; generation++) {
        const genStart = performance.now();
        
        // Collect experience in parallel
        const experiences = await workerPool.submitBatch(
            Array(CONFIG.training.episodesPerGeneration).fill(null).map(() => ({
                type: 'rollout',
                env: 'CompositionalWorld',
                envConfig: { size: 10, numObjects: 5 },
                policy: agent,
                steps: CONFIG.training.rolloutSteps
            }))
        );
        
        let genReward = 0;
        let genSteps = 0;
        
        // Process experience
        for (const exp of experiences) {
            if (exp.success) {
                genReward += exp.result.totalReward;
                genSteps += exp.result.steps;
                
                for (const transition of exp.result.trajectory) {
                    // Learn from transition
                    await agent.learn(
                        transition.state,
                        transition.action,
                        transition.reward,
                        transition.nextState,
                        transition.done
                    );
                    
                    // Store for world model training
                    collectedTransitions.push(transition);
                    
                    // Update world model
                    worldModel.processTransition?.(transition);
                    
                    // Discover skills
                    skillDiscovery.processTransition(transition);
                }
            }
        }
        
        // Record metrics
        metrics.record('generation_reward', genReward / CONFIG.training.episodesPerGeneration, { generation });
        metrics.record('steps_per_episode', genSteps / CONFIG.training.episodesPerGeneration, { generation });
        
        // Train world model periodically
        if (generation % 5 === 0 && collectedTransitions.length > 0) {
            console.log(`🧠 Training world model on ${collectedTransitions.length} transitions...`);
            await worldModel.train(collectedTransitions.slice(-1000), 50);
            collectedTransitions.length = 0; // Clear buffer
        }
        
        // Evaluate performance
        const evaluation = metaController.evaluate();
        metaController.onPerformance({ score: evaluation.score });
        
        // Self-modify architecture periodically
        if (generation % 10 === 0 && generation > 0) {
            console.log(`🔄 Generation ${generation}: Evaluating architecture...`);
            const modification = metaController.proposeModification();
            if (modification) {
                const success = metaController.applyModification(modification);
                console.log(`   Modification ${success ? 'applied' : 'failed'}: ${modification.type}`);
            }
        }
        
        // Benchmark periodically
        if (generation % CONFIG.training.benchmarkInterval === 0 && generation > 0) {
            console.log(`📊 Generation ${generation}: Running benchmark...`);
            const runner = new BenchmarkRunner({ numEpisodes: 20, maxSteps: 500 });
            await runner.initialize();
            const results = await runner.run(agent, [{ name: 'CompositionalWorld', config: { size: 10 } }]);
            
            console.log(`   Avg Reward: ${results.overall.avgReward.toFixed(2)}`);
            console.log(`   Success Rate: ${(results.overall.avgSuccessRate * 100).toFixed(1)}%`);
            
            metrics.record('benchmark_reward', results.overall.avgReward, { generation });
            metrics.record('benchmark_success', results.overall.avgSuccessRate, { generation });
        }
        
        const genDuration = ((performance.now() - genStart) / 1000).toFixed(2);
        console.log(`✓ Generation ${generation}: Reward=${genReward.toFixed(1)}, Time=${genDuration}s`);
    }
    
    // Final benchmark
    console.log('\n📊 Running final benchmark...\n');
    const finalRunner = new BenchmarkRunner({ numEpisodes: 50, maxSteps: 500 });
    await finalRunner.initialize();
    const finalResults = await finalRunner.run(agent, [
        { name: 'CompositionalWorld', config: { size: 10, numObjects: 5 } },
        { name: 'GridWorld', config: { size: 15 } }
    ]);
    
    console.log('Final Results:');
    for (const [env, results] of Object.entries(finalResults.environments)) {
        console.log(`  ${env}:`);
        console.log(`    Reward: ${results.reward.mean.toFixed(2)} ± ${results.reward.std.toFixed(2)}`);
        console.log(`    Success Rate: ${(results.successRate * 100).toFixed(1)}%`);
    }
    
    // Export metrics
    console.log('\n📈 Training Summary:');
    const rewardStats = metrics.stats('generation_reward');
    if (rewardStats) {
        console.log(`  Reward - Mean: ${rewardStats.mean.toFixed(2)}, Std: ${rewardStats.std.toFixed(2)}`);
    }
    
    const skillCount = skillLibrary.list().length;
    console.log(`  Skills Discovered: ${skillCount}`);
    
    const modHistory = metaController.getModificationHistory();
    console.log(`  Architecture Modifications: ${modHistory.length}`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await workerPool.shutdown();
    await skillDiscovery.shutdown();
    await worldModel.shutdown();
    await metaController.shutdown();
    await agent.close();
    
    console.log('\n✅ Done!\n');
    
    // Return results for programmatic access
    return {
        finalResults,
        metrics: metrics.toJSON(),
        skills: skillLibrary.list(),
        modifications: modHistory
    };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

export { main };
