
import { MeTTaAgent } from '../../rl/src/agents/MeTTaAgent.js';
import { GridWorld } from '../../rl/src/environments/GridWorld.js';

describe('RL MeTTa Integration Tests', () => {

    test('MeTTaAgent loads and executes basic strategy', async () => {
        const env = new GridWorld();
        // Point to the strategy relative to repo root
        const strategyPath = 'rl/src/strategies/q-learning.metta';
        const agent = new MeTTaAgent(env, strategyPath);

        await agent.initialize();

        // 1. Act
        const obs = env.reset().observation;
        const action = await agent.act(obs);

        // Should be 0-3
        expect(action).toBeGreaterThanOrEqual(0);
        expect(action).toBeLessThan(4);

        // 2. Learn (update Q-value)
        // We can't easily inspect internal MeTTa atoms without exposing the runner/space.
        // But we can check if learn() executes without error.
        await agent.learn(obs, action, 10, obs, true);
    });

    test('MeTTaAgent can be scripted with custom Metta code', async () => {
        const env = new GridWorld();
        const agent = new MeTTaAgent(env, null); // No file

        // Inject custom strategy
        const code = `
            (= (agent-act $obs) 2)
            (= (agent-learn $s $a $r $ns $d) (nop))
        `;
        await agent.metta.run(code);
        await agent.initialize();

        const action = await agent.act([0,0]);
        expect(action).toBe(2);
    });

});
