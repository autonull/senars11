import {NeuroSymbolicAgent} from '../../rl/src/agents/NeuroSymbolicAgent.js';
import {GridWorld} from '../../rl/src/environments/GridWorld.js';

describe('RL End-to-End Planning Tests', () => {

    test('Agent uses injected rule to achieve goal', async () => {
        const env = new GridWorld();
        // Planning enabled
        const agent = new NeuroSymbolicAgent(env, {reasoning: 'metta', planning: true});

        // Initialize bridge
        await agent.initialize();

        const startState = [0, 0];
        const nextState = [0, 1];
        const goalState = [0, 1]; // Goal is the next state
        const actionIdx = 1;      // Action to transition (assumed GridWorld semantics)

        // Ensure terms match what SymbolGrounding produces
        const startTerm = agent.grounding.lift(startState); // state_0_0
        const nextTerm = agent.grounding.lift(nextState);   // state_0_1
        const opTerm = `^action_1`;

        console.log(`Injecting rule: <(&/, <(*, ${startTerm}) --> obs>, <(*, ${opTerm}) --> executed>) ==> <(*, ${nextTerm}) --> obs>>.`);

        // Simpler Policy Rule: < <(*, start) --> obs> ==> ^op >.
        // "If we see start state, do op."
        // This tests if the system can execute an operation based on a symbolic condition.
        const rule = `< <(*, ${startTerm}) --> obs> ==> ${opTerm} >. %1.0;0.9%`;

        await agent.bridge.input(rule);

        // Force the agent to consider this rule
        await agent.bridge.runCycles(10);

        // Also inject that the operation is an operation
        // Usually NARS needs to know ^action_1 is an operator to execute it.
        // We can try to set it as an operator in the TermFactory or just hope the prefix is enough.
        // But for safe measure, let's use the standard "op" predicate if available, or just rely on ^
        // agent.bridge.input(`<${opTerm} --> (prop, op)>.`);

        // Perform action selection
        const action = await agent.act(startState, goalState);

        if (action !== actionIdx) {
            console.error(`Expected action ${actionIdx}, got ${action}`);
        }

        expect(action).toBe(actionIdx);
    });

});
