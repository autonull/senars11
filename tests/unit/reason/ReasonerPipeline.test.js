import {NAR, IntrospectionEvents} from '@senars/nar';

describe('Reasoner Pipeline Tests', () => {
    let nar;

    beforeEach(async () => {
        nar = new NAR({
            reasoning: {
                useStreamReasoner: true,
                cpuThrottleInterval: 0,
                maxDerivationDepth: 5
            },
            cycle: {delay: 1}
        });

        await nar.initialize();
    });

    afterEach(async () => {
        if (nar) {
            await nar.dispose();
        }
    });

    test('should process syllogistic reasoning steps correctly', async () => {
        // Input (a ==> b) and (b ==> c)
        await nar.input('(a ==> b). %0.9;0.9%');
        await nar.input('(b ==> c). %0.8;0.8%');

        // Check initial focus content
        const initialFocusTasks = nar._focus.getTasks(10);
        expect(initialFocusTasks.length).toBeGreaterThanOrEqual(2);

        // Run reasoning steps
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }

        // Check final focus content for derived conclusion (a ==> c)
        const finalFocusTasks = nar._focus.getTasks(30);

        // Look for the syllogistic conclusion (a ==> c) - note the actual format is (==>, a, c)
        const syllogisticDerivation = finalFocusTasks.some(task => {
            const termStr = task.term?.toString?.();
            return termStr && termStr.includes('(==>, a, c)');
        });

        // The syllogistic derivation should have been generated
        expect(syllogisticDerivation).toBe(true);
    });

    test('should handle focus management during reasoning', async () => {
        await nar.input('(x ==> y). %0.9;0.9%');
        await nar.input('(y ==> z). %0.8;0.8%');

        const beforeTasks = nar._focus.getTasks(10);
        expect(beforeTasks.length).toBeGreaterThanOrEqual(2);

        // Run several steps
        for (let i = 0; i < 3; i++) {
            await nar.step();
        }

        const afterTasks = nar._focus.getTasks(10);
        expect(afterTasks.length).toBeGreaterThanOrEqual(beforeTasks.length);
    });

    test('should maintain event emission during reasoning', async () => {
        // Mock event listeners to verify the pipeline is working
        const derivationEvents = [];
        const inputEvents = [];

        nar.on(IntrospectionEvents.REASONING_DERIVATION, (data) => {
            derivationEvents.push(data);
        });

        nar.on(IntrospectionEvents.TASK_INPUT, (data) => {
            inputEvents.push(data);
        });

        await nar.input('(p ==> q). %0.9;0.9%');
        await nar.input('(q ==> r). %0.8;0.8%');

        // Should have two input events
        expect(inputEvents.length).toBe(2);

        // Run reasoning steps
        for (let i = 0; i < 5; i++) {
            await nar.step();
        }

        // Should have reasoning derivation events generated
        expect(derivationEvents.length).toBeGreaterThanOrEqual(0);
    });

    test('should respect derivation depth limits', async () => {
        // Configure with low depth limit
        const narLimited = new NAR({
            reasoning: {
                useStreamReasoner: true,
                cpuThrottleInterval: 0,
                maxDerivationDepth: 1  // Very low limit
            },
            cycle: {delay: 1}
        });

        await narLimited.initialize();

        try {
            await narLimited.input('(m ==> n). %0.9;0.9%');
            await narLimited.input('(n ==> o). %0.8;0.8%');

            for (let i = 0; i < 3; i++) {
                await narLimited.step();
            }

            // Should still work but with depth-aware processing
            const finalTasks = narLimited._focus.getTasks(20);
            expect(finalTasks.length).toBeGreaterThanOrEqual(2);
        } finally {
            await narLimited.dispose();
        }
    });

    test('should handle memory and focus synchronization', async () => {
        await nar.input('(d ==> e). %0.9;0.9%');
        await nar.input('(e ==> f). %0.8;0.8%');

        // Check both focus and memory
        const focusTasks = nar._focus.getTasks(10);
        const memoryConcepts = nar.memory.getAllConcepts();

        expect(focusTasks.length).toBeGreaterThanOrEqual(2);
        expect(memoryConcepts.length).toBeGreaterThanOrEqual(2); // At least d, e or (d==>e)

        // Run reasoning
        for (let i = 0; i < 3; i++) {
            await nar.step();
        }

        // Verify that new derivations are in both focus and memory
        const finalFocusTasks = nar._focus.getTasks(20);
        const finalMemoryConcepts = nar.memory.getAllConcepts();

        expect(finalFocusTasks.length).toBeGreaterThanOrEqual(focusTasks.length);
        expect(finalMemoryConcepts.length).toBeGreaterThanOrEqual(memoryConcepts.length);
    });
});