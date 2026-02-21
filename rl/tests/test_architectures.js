
import { NeuroSymbolicAgent } from '../src/agents/NeuroSymbolicAgent.js';
import { RLEnvironment } from '../src/core/RLEnvironment.js';
import { strict as assert } from 'assert';
import path from 'path';

console.log("Testing Architecture modularity & Exploration...");

class MockEnv extends RLEnvironment {
    constructor() {
        super();
        this.reset();
    }
    reset() {
        this.state = [0.1, 0.2, 0.3, 0.4];
        return { observation: this.state, info: {} };
    }
    step(action) {
        return { observation: [0.5, 0.6, 0.7, 0.8], reward: 1, terminated: true, truncated: false, info: {} };
    }
    get actionSpace() {
        return { type: 'Discrete', n: 2 };
    }
}

async function testMeTTaOnly() {
    console.log("--- Testing 'metta-policy' architecture ---");
    const env = new MockEnv();
    const policyPath = path.resolve('rl/src/examples/policy.metta');

    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'metta-policy',
        policyScript: policyPath
    });

    await agent.initialize();

    // Verify correct architecture instantiated
    assert.equal(agent.architecture.constructor.name, 'MeTTaPolicyArchitecture');
    console.log("Architecture instantiated correctly.");

    // Act
    const obs = [0.1, 0.2, 0.3, 0.4];
    const action = await agent.act(obs);
    console.log(`Action: ${action}`);
    assert(typeof action === 'number');

    // Learn
    await agent.learn(obs, action, 1.0, [0.5, 0.6, 0.7, 0.8], true);
    console.log("Learning step completed.");

    await agent.close();
    console.log("'metta-policy' architecture Passed!");
}

async function testDualProcess() {
    console.log("\n--- Testing 'dual-process' architecture (explicit) ---");
    const env = new MockEnv();
    const policyPath = path.resolve('rl/src/examples/policy.metta');

    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process', // Explicitly setting default
        reasoning: 'metta',
        usePolicy: true,
        policyScript: policyPath
    });

    await agent.initialize();

    // Verify correct architecture instantiated
    assert.equal(agent.architecture.constructor.name, 'DualProcessArchitecture');
    console.log("Architecture instantiated correctly.");

    // Act
    const obs = [0.1, 0.2, 0.3, 0.4];
    const action = await agent.act(obs);
    console.log(`Action: ${action}`);
    assert(typeof action === 'number');

    await agent.close();
    console.log("'dual-process' architecture Passed!");
}

async function testEvolutionary() {
    console.log("\n--- Testing 'evolutionary' architecture ---");
    const env = new MockEnv();

    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'evolutionary'
    });

    await agent.initialize();

    assert.equal(agent.architecture.constructor.name, 'EvolutionaryArchitecture');
    console.log("Architecture instantiated correctly.");

    const action = await agent.act([0.1]);
    console.log(`Action: ${action}`);
    assert(typeof action === 'number');

    await agent.close();
    console.log("'evolutionary' architecture Passed!");
}

async function testIntrinsicMotivation() {
    console.log("\n--- Testing 'intrinsic motivation' in DualProcess ---");
    const env = new MockEnv();
    const policyPath = path.resolve('rl/src/examples/policy.metta');

    const agent = new NeuroSymbolicAgent(env, {
        architecture: 'dual-process',
        usePolicy: true,
        policyScript: policyPath,
        intrinsicMode: 'novelty', // Enable novelty bonus
        intrinsicWeight: 0.5
    });

    await agent.initialize();

    // Act
    const obs = [0.1, 0.2, 0.3, 0.4];
    const action = await agent.act(obs);

    // Learn: Should calculate intrinsic reward
    // First visit to [0.5, ...]: count=0 -> +0.5 reward
    await agent.learn(obs, action, 1.0, [0.5, 0.6, 0.7, 0.8], true);

    // Verify visit count in motivation module
    const visitCount = agent.architecture.motivation.visitCounts.get('5_6_7_8'); // Hashed observation
    assert.equal(visitCount, 1);
    console.log("Intrinsic motivation module updated correctly.");

    await agent.close();
    console.log("'intrinsic motivation' test Passed!");
}

async function run() {
    await testMeTTaOnly();
    await testDualProcess();
    await testEvolutionary();
    await testIntrinsicMotivation();
}

run().catch(err => {
    console.error("Test Failed:", err);
    process.exit(1);
});
