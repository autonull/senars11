/**
 * Unified Neuro-Symbolic RL Agent Demo
 * 
 * Demonstrates the full integration of NARS, MeTTa, and Tensor Logic
 * for general-purpose performant neuro-symbolic reinforcement learning.
 */
import {
    // Core components
    NeuroSymbolicAgent,
    
    // Bridges
    NeuroSymbolicBridge,
    NeuroSymbolicBridgeFactory,
    
    // Policies
    TensorLogicPolicy,
    TensorLogicPolicyFactory,
    
    // Skills
    HierarchicalSkillSystem,
    SkillSystemFactory,
    Skill,
    
    // Experience
    DistributedExperienceBuffer,
    ExperienceBufferFactory,
    CausalExperience,
    
    // Meta-controller
    MetaController,
    MetaControllerFactory,
    ModificationOperator,
    
    // Benchmarking
    NeuroSymbolicBenchmarkRunner,
    BenchmarkFactory,
    NeuroSymbolicMetricsCollector,
    StatisticalTests,
    AgentComparator,
    
    // Environments
    CartPole,
    GridWorld,
    CompositionalWorld
} from '../src/index.js';

/**
 * Demo 1: Basic Neuro-Symbolic Agent
 */
async function demo1_BasicAgent() {
    console.log('\n=== Demo 1: Basic Neuro-Symbolic Agent ===\n');

    // Create environment
    const env = new CartPole({ maxSteps: 200 });
    
    // Create neuro-symbolic agent
    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process',
        reasoning: 'metta',
        planning: true,
        skillDiscovery: true
    });

    // Initialize
    await agent.initialize();
    console.log('✓ Agent initialized');

    // Run single episode
    const { observation } = env.reset();
    let totalReward = 0;

    for (let step = 0; step < 200; step++) {
        const action = await agent.act(observation, {
            useReasoning: true,
            usePolicy: true,
            explorationRate: 0.1
        });

        const { observation: nextObs, reward, terminated } = env.step(action);

        await agent.learn(observation, action, reward, nextObs, terminated);

        totalReward += reward;
        observation = nextObs;

        if (terminated) break;
    }

    console.log(`✓ Episode completed: Reward = ${totalReward}`);
    console.log(`✓ Agent stats:`, agent.getStats());

    await agent.close();
    return totalReward;
}

/**
 * Demo 2: Neuro-Symbolic Bridge Operations
 */
async function demo2_BridgeOperations() {
    console.log('\n=== Demo 2: Neuro-Symbolic Bridge Operations ===\n');

    // Create bridge
    const bridge = NeuroSymbolicBridgeFactory.createBalanced({
        maxReasoningCycles: 50,
        cacheInference: true
    });

    await bridge.initialize();
    console.log('✓ Bridge initialized');

    // Tensor → Symbol conversion
    const tensor = { data: [0.8, 0.2, 0.9, 0.1], shape: [4] };
    const symbolic = bridge.liftToSymbols(tensor, { threshold: 0.5 });
    console.log('✓ Tensor → Symbol:', symbolic.symbols);

    // Symbol → Narsese
    const narsese = bridge.observationToNarsese(tensor.data);
    console.log('✓ Symbol → Narsese:', narsese.substring(0, 100) + '...');

    // Narsese input and query
    await bridge.inputNarsese('<feature_0 --> observed>.');
    await bridge.inputNarsese('<feature_2 --> observed>.');

    const answer = await bridge.askNarsese('<(?x) --> observed>?');
    console.log('✓ Query result:', answer);

    // Causal learning
    await bridge.learnCausal({
        state: [0.8, 0.2, 0.9, 0.1],
        action: 1,
        nextState: [0.7, 0.3, 0.8, 0.2],
        reward: 1.0
    });
    console.log('✓ Causal relationship learned');

    // Prediction
    const prediction = bridge.predictCausal([0.8, 0.2, 0.9, 0.1], 1);
    console.log('✓ Causal prediction:', prediction);

    await bridge.shutdown();
    console.log('\n✓ Bridge operations demo complete');
}

/**
 * Demo 3: Tensor Logic Policy Network
 */
async function demo3_TensorPolicy() {
    console.log('\n=== Demo 3: Tensor Logic Policy Network ===\n');

    // Create policy
    const policy = TensorLogicPolicyFactory.createDiscrete(
        64,  // input dimension
        4,   // output dimension (actions)
        {
            hiddenDim: 128,
            numLayers: 2,
            learningRate: 0.001
        }
    );

    await policy.initialize();
    console.log('✓ Policy initialized');

    // Forward pass
    const state = Array.from({ length: 64 }, () => Math.random());
    const output = policy.forward(state);
    console.log('✓ Forward pass completed');
    console.log('  Output shape:', output.logits.shape);

    // Action selection
    const { action, actionProb } = await policy.selectAction(state, {
        exploration: 0.1
    });
    console.log(`✓ Action selected: ${action} (prob: ${actionProb.toFixed(3)})`);

    // Training update
    const experience = {
        state,
        action,
        reward: 1.0,
        nextState: state,
        done: false
    };

    const { loss, entropy } = await policy.update(experience, {
        advantages: [1.0]
    });
    console.log(`✓ Policy updated: Loss = ${loss.toFixed(4)}, Entropy = ${entropy.toFixed(4)}`);

    // Rule extraction
    const rules = policy.extractRules({ threshold: 0.3 });
    console.log(`✓ Extracted ${rules.length} rules from policy`);

    await policy.shutdown();
    console.log('\n✓ Tensor policy demo complete');
}

/**
 * Demo 4: Hierarchical Skill Discovery
 */
async function demo4_SkillDiscovery() {
    console.log('\n=== Demo 4: Hierarchical Skill Discovery ===\n');

    // Create skill system
    const skillSystem = SkillSystemFactory.createManipulation({
        minSupport: 3,
        maxLevels: 4
    });

    await skillSystem.initialize();
    console.log('✓ Skill system initialized');

    // Generate synthetic experiences
    const experiences = [];
    for (let i = 0; i < 50; i++) {
        experiences.push({
            state: Array.from({ length: 8 }, () => Math.random()),
            action: Math.floor(Math.random() * 4),
            reward: Math.random() * 2 - 1,
            nextState: Array.from({ length: 8 }, () => Math.random()),
            done: false
        });
    }

    // Discover skills
    const newSkills = await skillSystem.discoverSkills(experiences, {
        consolidate: true
    });
    console.log(`✓ Discovered ${newSkills.length} new skills`);

    // Get skill hierarchy
    const hierarchy = skillSystem.getHierarchy();
    console.log('✓ Skill hierarchy:', Object.keys(hierarchy).length, 'composite skills');

    // Get applicable skills
    const testState = Array.from({ length: 8 }, () => Math.random());
    const applicable = skillSystem.getApplicableSkills(testState);
    console.log(`✓ Found ${applicable.length} applicable skills`);

    // Export to MeTTa
    const mettaSkills = skillSystem.exportToMetta();
    console.log('✓ Exported skills to MeTTa format');
    console.log('  MeTTa length:', mettaSkills.length, 'characters');

    await skillSystem.shutdown();
    console.log('\n✓ Skill discovery demo complete');
}

/**
 * Demo 5: Distributed Experience Buffer
 */
async function demo5_ExperienceBuffer() {
    console.log('\n=== Demo 5: Distributed Experience Buffer ===\n');

    // Create buffer
    const buffer = ExperienceBufferFactory.createCausal(10000, {
        batchSize: 32,
        useCausalIndexing: true
    });

    await buffer.initialize();
    console.log('✓ Experience buffer initialized');

    // Store experiences
    const experiences = [];
    for (let i = 0; i < 100; i++) {
        experiences.push(new CausalExperience({
            state: Array.from({ length: 8 }, () => Math.random()),
            action: Math.floor(Math.random() * 4),
            reward: Math.random() * 2 - 1,
            nextState: Array.from({ length: 8 }, () => Math.random()),
            done: Math.random() < 0.1
        }));
    }

    await buffer.storeBatch(experiences);
    console.log('✓ Stored 100 experiences');

    // Sample with different strategies
    const randomSample = await buffer.sample(10, { strategy: 'random' });
    console.log(`✓ Random sample: ${randomSample.length} experiences`);

    const prioritizedSample = await buffer.sample(10, { strategy: 'prioritized' });
    console.log(`✓ Prioritized sample: ${prioritizedSample.length} experiences`);

    // Get causal graph
    const causalGraph = buffer.getCausalGraph();
    console.log('✓ Causal graph:', causalGraph.edges?.length || 0, 'edges');

    // Get statistics
    const stats = buffer.getStats();
    console.log('✓ Buffer stats:', stats);

    await buffer.shutdown();
    console.log('\n✓ Experience buffer demo complete');
}

/**
 * Demo 6: Meta-Controller Architecture Search
 */
async function demo6_MetaController() {
    console.log('\n=== Demo 6: Meta-Controller Architecture Search ===\n');

    // Create meta-controller
    const metaController = MetaControllerFactory.createArchitectureSearch({
        populationSize: 10,
        mutationRate: 0.3,
        useImagination: true
    });

    await metaController.initialize();
    console.log('✓ Meta-controller initialized');

    // Set initial architecture (simplified)
    const initialArchitecture = {
        components: [
            { id: 'perception', type: 'sensor' },
            { id: 'reasoning', type: 'inference' },
            { id: 'action', type: 'policy' }
        ]
    };
    metaController.setArchitecture(initialArchitecture);
    console.log('✓ Initial architecture set');

    // Simulate performance feedback
    for (let i = 0; i < 5; i++) {
        const performance = 50 + Math.random() * 50;
        const result = await metaController.evaluatePerformance(performance);
        
        if (result.modified) {
            console.log(`✓ Generation ${i + 1}: Architecture modified`);
        } else {
            console.log(`✓ Generation ${i + 1}: No modification needed`);
        }
    }

    // Get meta-controller state
    const state = metaController.getState();
    console.log('✓ Meta-controller state:', state);

    await metaController.shutdown();
    console.log('\n✓ Meta-controller demo complete');
}

/**
 * Demo 7: Comprehensive Benchmarking
 */
async function demo7_Benchmarking() {
    console.log('\n=== Demo 7: Comprehensive Benchmarking ===\n');

    // Create benchmark runner
    const runner = BenchmarkFactory.createComprehensive({
        numEpisodes: 20,
        evaluateReasoning: true,
        evaluateGrounding: true
    });

    await runner.initialize();
    console.log('✓ Benchmark runner initialized');

    // Create agent and environment
    const env = new CartPole({ maxSteps: 200 });
    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process',
        reasoning: 'metta'
    });

    await agent.initialize();
    console.log('✓ Agent initialized');

    // Run benchmark
    console.log('Running benchmark...');
    const results = await runner.run(agent, [{ name: 'CartPole', env }]);

    console.log('\n✓ Benchmark Results:');
    console.log('  Overall reward:', results.overall?.avgReward?.toFixed(2));
    console.log('  Success rate:', results.overall?.successRate?.toFixed(2));

    if (results.neuroSymbolic) {
        console.log('\n  Neuro-Symbolic Metrics:');
        if (results.neuroSymbolic.reasoning) {
            console.log('    Inference accuracy:', 
                results.neuroSymbolic.reasoning.inferenceAccuracy?.mean?.toFixed(2));
        }
        if (results.neuroSymbolic.grounding) {
            console.log('    Grounding consistency:', 
                results.neuroSymbolic.grounding.groundingConsistency?.mean?.toFixed(2));
        }
    }

    await agent.close();
    await runner.shutdown();
    console.log('\n✓ Benchmarking demo complete');
}

/**
 * Demo 8: Statistical Comparison
 */
async function demo8_StatisticalComparison() {
    console.log('\n=== Demo 8: Statistical Comparison ===\n');

    // Create comparator
    const comparator = new AgentComparator({
        significanceLevel: 0.05,
        testType: 't-test'
    });

    // Create sample performance data
    const agent1Performance = [80, 85, 90, 78, 92, 88, 85, 91, 87, 89];
    const agent2Performance = [75, 78, 82, 80, 85, 79, 81, 77, 83, 80];

    // Perform statistical test
    const tTest = StatisticalTests.tTest(
        agent1Performance, 
        agent2Performance, 
        0.05
    );

    console.log('✓ T-Test Results:');
    console.log('  Agent 1 mean:', tTest.mean1?.toFixed(2));
    console.log('  Agent 2 mean:', tTest.mean2?.toFixed(2));
    console.log('  T-statistic:', tTest.tStatistic?.toFixed(3));
    console.log('  P-value:', tTest.pValue?.toFixed(4));
    console.log('  Significant:', tTest.significant);
    console.log('  Effect size (Cohen\'s d):', tTest.effectSize?.toFixed(3));

    // Confidence interval
    const ci = StatisticalTests.confidenceInterval(agent1Performance, 0.95);
    console.log('\n✓ 95% Confidence Interval:');
    console.log('  Mean:', ci.mean?.toFixed(2));
    console.log('  CI: [', ci.lower?.toFixed(2), ',', ci.upper?.toFixed(2), ']');

    console.log('\n✓ Statistical comparison demo complete');
}

/**
 * Demo 9: Full Training Loop
 */
async function demo9_FullTraining() {
    console.log('\n=== Demo 9: Full Training Loop ===\n');

    // Create environment
    const env = new CartPole({ maxSteps: 500 });

    // Create agent
    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process',
        reasoning: 'metta',
        planning: true,
        skillDiscovery: true
    });

    await agent.initialize();
    console.log('✓ Agent initialized');

    // Training parameters
    const numEpisodes = 50;
    const rewards = [];

    console.log('Starting training...\n');

    for (let episode = 0; episode < numEpisodes; episode++) {
        const { observation } = env.reset();
        let totalReward = 0;
        let steps = 0;

        for (let step = 0; step < 500; step++) {
            const action = await agent.act(observation, {
                useReasoning: true,
                usePolicy: true,
                explorationRate: Math.max(0.01, 0.5 * (1 - episode / numEpisodes))
            });

            const { observation: nextObs, reward, terminated } = env.step(action);

            await agent.learn(observation, action, reward, nextObs, terminated);

            totalReward += reward;
            observation = nextObs;
            steps++;

            if (terminated) break;
        }

        rewards.push(totalReward);

        // Progress reporting
        if ((episode + 1) % 10 === 0) {
            const avgReward = rewards.slice(-10).reduce((a, b) => a + b, 0) / 10;
            console.log(`Episode ${episode + 1}/${numEpisodes}: Avg Reward = ${avgReward.toFixed(2)}`);
        }
    }

    // Final evaluation
    const finalAvg = rewards.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const initialAvg = rewards.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const improvement = ((finalAvg - initialAvg) / (Math.abs(initialAvg) + 1e-6)) * 100;

    console.log('\n✓ Training Results:');
    console.log('  Initial avg reward:', initialAvg.toFixed(2));
    console.log('  Final avg reward:', finalAvg.toFixed(2));
    console.log(`  Improvement: ${improvement.toFixed(1)}%`);

    await agent.close();
    console.log('\n✓ Full training demo complete');
}

/**
 * Main demo runner
 */
async function runDemos() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Neuro-Symbolic RL Framework - Comprehensive Demo        ║');
    console.log('║   Integrating NARS, MeTTa, and Tensor Logic               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    const demos = [
        demo1_BasicAgent,
        demo2_BridgeOperations,
        demo3_TensorPolicy,
        demo4_SkillDiscovery,
        demo5_ExperienceBuffer,
        demo6_MetaController,
        demo7_Benchmarking,
        demo8_StatisticalComparison,
        demo9_FullTraining
    ];

    for (const demo of demos) {
        try {
            await demo();
        } catch (error) {
            console.error(`✗ Demo failed:`, error.message);
        }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    All Demos Complete                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// Run demos
runDemos().catch(console.error);
