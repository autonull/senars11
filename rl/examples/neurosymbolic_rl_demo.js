/**
 * Unified Neuro-Symbolic RL Agent Demo
 */
import {
    NeuroSymbolicAgent,
    NeuroSymbolicBridge,
    TensorLogicPolicy,
    SkillDiscovery,
    ExperienceBuffer,
    MetaController,
    StatisticalTests,
    AgentComparator,
    CartPole
} from '../src/index.js';

async function demo_BasicAgent() {
    console.log('\n=== Demo: Basic Neuro-Symbolic Agent ===\n');
    const env = new CartPole({ maxSteps: 200 });
    const agent = new NeuroSymbolicAgent(env, { architecture: 'dual-process', reasoning: 'metta' });
    await agent.initialize();

    const { observation } = env.reset();
    let totalReward = 0;

    for (let step = 0; step < 200; step++) {
        const action = await agent.act(observation, { explorationRate: 0.1 });
        const { observation: nextObs, reward, terminated } = env.step(action);
        await agent.learn(observation, action, reward, nextObs, terminated);
        totalReward += reward;
        if (terminated) break;
    }

    console.log(`✓ Episode completed: Reward = ${totalReward}`);
    await agent.close();
}

async function demo_Bridge() {
    console.log('\n=== Demo: Neuro-Symbolic Bridge ===\n');
    const bridge = NeuroSymbolicBridge.createBalanced({ maxReasoningCycles: 50 });
    await bridge.initialize();

    const tensor = { data: [0.8, 0.2, 0.9, 0.1], shape: [4] };
    const symbolic = bridge.liftToSymbols(tensor, { threshold: 0.5 });
    console.log('✓ Tensor → Symbol:', Array.from(symbolic.symbols.keys()).length, 'symbols');

    const narsese = bridge.observationToNarsese(tensor.data);
    console.log('✓ Symbol → Narsese generated');

    await bridge.inputNarsese('<feature_0 --> observed>.');
    const answer = await bridge.askNarsese('<(?x) --> observed>?');
    console.log('✓ Query result:', answer ? 'found' : 'not found');

    await bridge.shutdown();
}

async function demo_Policy() {
    console.log('\n=== Demo: Tensor Logic Policy ===\n');
    const policy = TensorLogicPolicy.createDiscrete(64, 4, { hiddenDim: 128 });
    await policy.initialize();

    const state = Array.from({ length: 64 }, Math.random);
    const { action, actionProb } = await policy.selectAction(state, { exploration: 0.1 });
    console.log(`✓ Action selected: ${action} (prob: ${actionProb.toFixed(3)})`);

    const { loss } = await policy.update({ state, action, reward: 1.0, nextState: state, done: false }, { advantages: [1.0] });
    console.log(`✓ Policy updated: Loss = ${loss.toFixed(4)}`);

    await policy.shutdown();
}

async function demo_Skills() {
    console.log('\n=== Demo: Skill Discovery ===\n');
    const skillSystem = SkillDiscovery.create({ minSupport: 3, maxLevels: 4 });
    await skillSystem.initialize();

    const experiences = Array.from({ length: 50 }, () => ({
        state: Array.from({ length: 8 }, Math.random),
        action: Math.floor(Math.random() * 4),
        reward: Math.random() * 2 - 1,
        nextState: Array.from({ length: 8 }, Math.random),
        done: false
    }));

    const newSkills = await skillSystem.discoverSkills(experiences, { consolidate: true });
    console.log(`✓ Discovered ${newSkills.length} new skills`);
    console.log(`✓ Total skills: ${skillSystem.getPrimitiveSkills().length} primitive, ${skillSystem.getCompositeSkills().length} composite`);

    await skillSystem.shutdown();
}

async function demo_Experience() {
    console.log('\n=== Demo: Experience Buffer ===\n');
    const buffer = ExperienceBuffer.createCausal(10000, { batchSize: 32 });
    await buffer.initialize();

    const experiences = Array.from({ length: 100 }, () => ({
        state: Array.from({ length: 8 }, Math.random),
        action: Math.floor(Math.random() * 4),
        reward: Math.random(),
        nextState: Array.from({ length: 8 }, Math.random),
        done: Math.random() < 0.1
    }));

    await buffer.storeBatch(experiences);
    console.log('✓ Stored 100 experiences');

    const sample = await buffer.sample(10, { strategy: 'prioritized' });
    console.log(`✓ Sampled ${sample.length} experiences`);
    console.log('✓ Buffer stats:', buffer.getStats());

    await buffer.shutdown();
}

async function demo_MetaController() {
    console.log('\n=== Demo: Meta-Controller ===\n');
    const metaController = MetaController.createArchitectureSearch({ populationSize: 10 });
    await metaController.initialize();

    metaController.setArchitecture({ components: [{ id: 'perception', type: 'sensor' }, { id: 'action', type: 'policy' }] });
    console.log('✓ Initial architecture set');

    for (let i = 0; i < 5; i++) {
        const result = await metaController.evaluatePerformance(50 + Math.random() * 50);
        console.log(`✓ Generation ${i + 1}: ${result.modified ? 'modified' : 'no change'}`);
    }

    await metaController.shutdown();
}

async function demo_Statistics() {
    console.log('\n=== Demo: Statistical Tests ===\n');
    const sample1 = [80, 85, 90, 78, 92, 88, 85, 91, 87, 89];
    const sample2 = [75, 78, 82, 80, 85, 79, 81, 77, 83, 80];

    const tTest = StatisticalTests.tTest(sample1, sample2, 0.05);
    console.log('✓ T-Test Results:');
    console.log(`  Agent 1 mean: ${tTest.mean1?.toFixed(2)}`);
    console.log(`  Agent 2 mean: ${tTest.mean2?.toFixed(2)}`);
    console.log(`  P-value: ${tTest.pValue?.toFixed(4)}`);
    console.log(`  Significant: ${tTest.significant}`);

    const ci = StatisticalTests.confidenceInterval(sample1, 0.95);
    console.log(`\n✓ 95% CI: [${ci.lower?.toFixed(2)}, ${ci.upper?.toFixed(2)}]`);
}

async function runDemos() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Neuro-Symbolic RL Framework - Clean Refactored Demo     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    for (const demo of [demo_BasicAgent, demo_Bridge, demo_Policy, demo_Skills, demo_Experience, demo_MetaController, demo_Statistics]) {
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

runDemos().catch(console.error);
