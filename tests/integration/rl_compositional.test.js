import {NeuroSymbolicAgent} from '../../rl/src/agents/NeuroSymbolicAgent.js';
import {CompositionalWorld} from '../../rl/src/environments/CompositionalWorld.js';

describe('RL Compositional World Integration Tests', () => {

    test('Agent perceives dynamic environment in CompositionalWorld', async () => {
        // Create environment with 1 object
        // Note: CompositionalWorld constructor takes `config` object, not `size, numObjects` directly.
        // It defaults to size=10, numObjects=3 if not provided correctly.
        // Let's force smaller size to ensure movement changes state predictably.
        const env = new CompositionalWorld({size: 5, numObjects: 1});
        const agent = new NeuroSymbolicAgent(env, {reasoning: 'metta'});

        await agent.initialize();

        // 1. Initial observation
        const obs = env.reset().observation;
        // Obs: [agentX, agentY, objX, objY]
        // Lift observation to get symbolic representation
        const sym = agent.grounding.lift(obs);

        // Verify symbol was created (format: state_X_X_X_X)
        expect(sym).toMatch(/^state_/);

        // 2. Move agent towards object (manual step simulation)
        // Let's say we just move right (action 3)
        const action = 3;
        const next = env.step(action);

        // 3. Verify agent processes the new observation
        // Learn/update
        await agent.learn(obs, action, next.reward, next.observation, next.terminated);

        // 4. Check if new state is grounded (different symbol)
        const nextSym = agent.grounding.lift(next.observation);
        expect(nextSym).toMatch(/^state_/);
        expect(nextSym).not.toBe(sym); // Should be different state unless hit wall/obj at same spot
    });

});
