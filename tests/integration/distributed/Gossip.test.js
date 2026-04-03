import {NAR, Truth} from '@senars/nar';

describe('Gossip-Based Belief Sharing Integration', () => {
    let agentA, agentB;

    beforeEach(async () => {
        agentA = new NAR();
        agentB = new NAR();
        await agentA.initialize();
        await agentB.initialize();
    });

    afterEach(async () => {
        await agentA.dispose();
        await agentB.dispose();
    });

    const query = (agent, termStr) => {
        // Use parser to ensure term structure matches what's in memory (compound vs atomic)
        const parsed = agent._parser.parse(termStr.endsWith('.') ? termStr : termStr + '.');
        return agent.query(parsed.term);
    };

    test('should sync beliefs between two agents', async () => {
        // 1. Agent A learns something
        await agentA.input('(sky --> blue).');
        await agentA.runCycles(5);

        // 2. Agent B learns something else
        await agentB.input('(grass --> green).');
        await agentB.runCycles(5);

        // Verify initial states
        const beliefsA = query(agentA, '(sky --> blue)');
        const beliefsB = query(agentB, '(grass --> green)');
        expect(beliefsA.length).toBeGreaterThan(0);
        expect(beliefsB.length).toBeGreaterThan(0);

        expect(query(agentA, '(grass --> green)').length).toBe(0);
        expect(query(agentB, '(sky --> blue)').length).toBe(0);

        // 3. Get Deltas from A (everything is new)
        const deltasA = agentA.memory.getBeliefDeltas(0);
        expect(deltasA.length).toBeGreaterThanOrEqual(1);

        // 4. Send Deltas A -> B (Reconcile)
        for (const delta of deltasA) {
            await agentB.reconcile(delta);
        }
        await agentB.runCycles(5); // Allow processing

        // Verify B knows what A knows
        const beliefsBA = query(agentB, '(sky --> blue)');
        expect(beliefsBA.length).toBeGreaterThan(0);

        // 5. Get Deltas from B (should include its own new belief + maybe A's if modified?)
        // If we query since 0, it gets everything.
        const deltasB = agentB.memory.getBeliefDeltas(0);

        // 6. Send Deltas B -> A
        for (const delta of deltasB) {
            await agentA.reconcile(delta);
        }
        await agentA.runCycles(5);

        // Verify A knows what B knows
        const beliefsAB = query(agentA, '(grass --> green)');
        expect(beliefsAB.length).toBeGreaterThan(0);
    });

    test('should reconcile conflicting beliefs via NAL Revision', async () => {
        // 1. Agent A believes (S --> P). %0.9;0.9%
        const tA = new Truth(0.9, 0.9);
        await agentA.input(`(S --> P). %${tA.f};${tA.c}%`);
        await agentA.runCycles(5);

        // 2. Agent B believes (S --> P). %0.6;0.9% (Different frequency)
        const tB = new Truth(0.6, 0.9);
        await agentB.input(`(S --> P). %${tB.f};${tB.c}%`);
        await agentB.runCycles(5);

        // 3. Sync A -> B
        const deltasA = agentA.memory.getBeliefDeltas(0);

        // Normalize the term string we are looking for using the parser
        const parsedS_P = agentA._parser.parse('(S --> P).');
        const termS_P_Str = parsedS_P.term.toString();

        const beliefA = deltasA.find(d => d.term === termS_P_Str);

        expect(beliefA).toBeDefined();

        const success = await agentB.reconcile(beliefA);
        expect(success).toBe(true);

        await agentB.runCycles(5);

        // 4. Verify B's belief is revised
        // Expected revision of (0.9, 0.9) and (0.6, 0.9)
        // c = 0.9 -> w = 0.9/0.1 = 9
        // wTotal = 9 + 9 = 18
        // f = (9*0.9 + 9*0.6) / 18 = (8.1 + 5.4) / 18 = 13.5 / 18 = 0.75
        // c = 18/19 = 0.947...

        const beliefsB = query(agentB, '(S --> P)');

        // Find the revised belief (highest confidence/expectation)
        const finalTruth = beliefsB.reduce((best, b) => {
            return b.truth.confidence > best.confidence ? b.truth : best;
        }, beliefsB[0].truth);

        expect(finalTruth.frequency).toBeCloseTo(0.75, 1);
        expect(finalTruth.confidence).toBeGreaterThan(0.9);
    });
});
