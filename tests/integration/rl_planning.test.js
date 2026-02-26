
import { NeuroSymbolicAgent } from '../../rl/src/agents/NeuroSymbolicAgent.js';
import { GridWorld } from '../../rl/src/environments/GridWorld.js';

describe('RL Planning Integration Tests', () => {

    test('NeuroSymbolicAgent with planning enabled', async () => {
        const env = new GridWorld();
        // Planning enabled, reasoning with 'metta' (which uses SeNARSBridge)
        const agent = new NeuroSymbolicAgent(env, { reasoning: 'metta', planning: true });

        await agent.initialize();

        const obs = env.reset().observation;

        // Define a simple goal that the agent should try to achieve
        // For GridWorld, the goal is implicitly defined by the environment (reach [4,4]),
        // but the agent needs to know this explicitly if it's doing model-based planning.
        const goal = [4, 4];

        // currently act() takes a goal
        const action = await agent.act(obs, goal);

        expect(action).toBeDefined();
        // Since we are in a simple grid world, we expect the action to be a number (0-3)
        expect(typeof action).toBe('number');
        expect(action).toBeGreaterThanOrEqual(0);
        expect(action).toBeLessThan(4);
    });

});
