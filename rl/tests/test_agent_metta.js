
import { NeuroSymbolicAgent } from '../src/agents/NeuroSymbolicAgent.js';
import { RLEnvironment } from '../src/core/RLEnvironment.js';
import { strict as assert } from 'assert';
import path from 'path';

console.log("Testing NeuroSymbolicAgent with MeTTa Policy...");

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

async function test() {
    const env = new MockEnv();
    // Resolve path relative to current working directory (repo root)
    const policyPath = path.resolve('rl/src/strategies/policy.metta');

    console.log(`Loading policy from: ${policyPath}`);

    const agent = new NeuroSymbolicAgent(env, {
        planning: false,
        reasoning: 'metta',
        usePolicy: true,
        policyScript: policyPath
    });

    await agent.initialize();

    // Act
    const obs = [0.1, 0.2, 0.3, 0.4];
    console.log("Acting...");
    const action = await agent.act(obs);
    console.log(`Action selected by policy: ${action}`);
    assert(typeof action === 'number');
    assert(action >= 0 && action < 2);

    // Learn
    console.log("Learning...");
    await agent.learn(obs, action, 1.0, [0.5, 0.6, 0.7, 0.8], true);
    console.log("Learning step completed.");

    // Act again to ensure state is maintained
    const action2 = await agent.act(obs);
    console.log(`Action selected after learning: ${action2}`);
    assert(typeof action2 === 'number');

    await agent.close();
    console.log("NeuroSymbolicAgent with MeTTa Policy Tests Passed!");
}

test().catch(err => {
    console.error("Test Failed:", err);
    process.exit(1);
});
