import {NeuroSymbolicAgent} from '../src/agents/NeuroSymbolicAgent.js';
import {Environment} from '../src/index.js';
import {strict as assert} from 'assert';

console.log("Testing NeuroSymbolicAgent...");

class MockEnv extends Environment {
    constructor() {
        super();
        this.reset();
    }

    get actionSpace() {
        return {type: 'Discrete', n: 2};
    }

    reset() {
        this.state = [0];
        return {observation: [0], info: {}};
    }

    step(action) {
        return {observation: [0], reward: 0, terminated: true, truncated: false, info: {}};
    }
}

async function test() {
    const env = new MockEnv();
    const agent = new NeuroSymbolicAgent(env, {
        planning: false, // disable complex planning for speed
        reasoning: 'metta'
    });

    await agent.initialize();

    // Act
    const action = await agent.act([0]);
    assert(typeof action === 'number');
    assert(action >= 0 && action < 2);

    // Learn
    await agent.learn([0], action, 1.0, [0], true);

    await agent.close();
    console.log("NeuroSymbolicAgent Tests Passed!");
}

test().catch(console.error);
