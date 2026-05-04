import {NeuroSymbolicAgent} from '../../rl/src/agents/NeuroSymbolicAgent.js';
import {GridWorld} from '../../rl/src/environments/GridWorld.js';

describe('RL Learning Integration Tests', () => {

    test('Agent learns temporal rule from experience', async () => {
        const env = new GridWorld();
        // Planning enabled
        const agent = new NeuroSymbolicAgent(env, {reasoning: 'metta', planning: true, grounding: 'learned'});

        // Initialize bridge
        await agent.initialize();

        const startState = [0, 0];
        const nextState = [0, 1];
        const actionIdx = 1;
        const reward = 0;
        const done = false;

        // Ensure grounding is initialized (usually by initialize() or first call)
        // But since we are manually lifting below, it's fine.

        // Grounding check
        const startTerm = agent.grounding.lift(startState);
        const nextTerm = agent.grounding.lift(nextState);
        const actionTerm = `^action_${actionIdx}`;

        // Manually trigger learning for a transition
        // This should invoke RuleInducer
        await agent.learn(startState, actionIdx, reward, nextState, done);

        // Allow some processing cycles for consolidation
        await agent.bridge.runCycles(50);

        // Verify if the rule exists or can be used.
        // We can query: <(&/, <(*, start) --> obs>, ^action) ==> ?what>?
        const query = `<(&/, <(*, ${startTerm}) --> obs>, ${actionTerm}) ==> ?what>?`;

        // Use a sufficient number of cycles for the query to be answered
        const answer = await agent.bridge.ask(query, {cycles: 20});

        console.log('Learning Query Answer:', JSON.stringify(answer, null, 2));

        // Expect an answer that mentions nextTerm
        expect(answer).toBeDefined();
        // If the rule was learned, we should get an answer where ?what substitutes to <(*, nextTerm) --> obs>
        // Note: SeNARS.ask returns { answer: bool, term: string, substitution: object }

        // Simple check: does the returned term contain the next state?
        if (answer.term) {
            // The answer term should be the whole implication: <(&/, start, action) ==> next>
            // Or at least contain the next state symbol
            expect(answer.term).toContain(nextTerm);
        } else {
            // If no direct answer, maybe check if we can plan with it?
            // But let's rely on ask() for now.
            // If ask fails, it might be due to confidence/frequency thresholds.
            // But we injected the rule via RuleInducer explicitly.

            // If ask returns nothing, fail.
            throw new Error("Agent did not learn the transition rule. Answer was empty.");
        }
    });

});
