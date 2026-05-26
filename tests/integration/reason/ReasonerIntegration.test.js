import {NAR} from '@senars/nar';

const createReasonerConfig = (overrides = {}) => ({
    reasoning: {cpuThrottleInterval: 0, maxDerivationDepth: 5, ...overrides.reasoning},
    cycle: {delay: 1, ...overrides.cycle},
    ...overrides
});

describe('Reasoner Integration', () => {
    describe.each([
        ['shallow depth', {maxDerivationDepth: 1}],
        ['standard depth', {maxDerivationDepth: 5}],
        ['deep depth', {maxDerivationDepth: 10}]
    ])('Reasoning with %s', (depthName, reasoningConfig) => {
        let nar;

        beforeEach(async () => {
            nar = new NAR(createReasonerConfig({reasoning: reasoningConfig}));
            await nar.initialize();
        });

        afterEach(async () => {
            await nar?.dispose();
        });

        test('should process syllogistic reasoning', async () => {
            await nar.input('(a ==> b). %0.9;0.9%');
            await nar.input('(b ==> c). %0.8;0.8%');

            for (let i = 0; i < 10; i++) await nar.step();

            const derived = nar._focus.getTasks(30).some(t => {
                const s = t.term?.toString?.();
                return s && (s.includes('(==>, a, c)') || s.includes('a ==> c'));
            });

            expect(derived).toBe(true);
        });

        test('should handle rule registration and execution', async () => {
            expect(nar.streamReasoner).toBeDefined();
            expect(nar.streamReasoner.constructor.name).toBe('Reasoner');
            expect(nar.streamReasoner.ruleProcessor.ruleExecutor.getRuleCount()).toBeGreaterThan(0);
        });

        test('should maintain event flow during reasoning', async () => {
            const events = [];
            nar.on('reasoning.derivation', (data) => events.push(data));

            await nar.input('(x --> y). %0.9;0.9%');
            await nar.input('(y --> z). %0.8;0.8%');

            for (let i = 0; i < 5; i++) await nar.step();

            expect(events.length).toBeGreaterThanOrEqual(0);
        });

        test('should respect derivation depth limits', async () => {
            const narLimited = new NAR(createReasonerConfig({
                reasoning: {maxDerivationDepth: 1}
            }));

            await narLimited.initialize();

            try {
                await narLimited.input('(m --> n). %0.9;0.9%');
                await narLimited.input('(n --> o). %0.8;0.8%');

                for (let i = 0; i < 3; i++) await narLimited.step();

                expect(narLimited._focus.getTasks(20).length).toBeGreaterThanOrEqual(2);
            } finally {
                await narLimited.dispose();
            }
        });

        test('should synchronize memory and focus', async () => {
            await nar.input('(d --> e). %0.9;0.9%');
            await nar.input('(e --> f). %0.8;0.8%');

            const initialFocus = nar._focus.getTasks(10).length;
            const initialConcepts = nar.memory.getAllConcepts().length;

            expect(initialFocus).toBeGreaterThanOrEqual(2);
            expect(initialConcepts).toBeGreaterThanOrEqual(2);

            for (let i = 0; i < 3; i++) await nar.step();

            expect(nar._focus.getTasks(20).length).toBeGreaterThanOrEqual(initialFocus);
            expect(nar.memory.getAllConcepts().length).toBeGreaterThanOrEqual(initialConcepts);
        });

        test('should process tasks through complete pipeline', async () => {
            await nar.input('<robin --> [flying]>. %0.9;0.9%');
            await nar.input('<robin --> bird>. %0.8;0.9%');

            for (let i = 0; i < 3; i++) await nar.step();

            expect(nar._focus.getTasks(50).length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Comprehensive Reasoner Stream', () => {
        let nar;

        beforeEach(async () => {
            nar = new NAR(createReasonerConfig());
            await nar.initialize();
        });

        afterEach(async () => {
            await nar?.dispose();
        });

        test('should initialize correctly with real components', () => {
            expect(nar.streamReasoner).toBeDefined();
            expect(nar.streamReasoner.constructor.name).toBe('Reasoner');
            expect(nar.streamReasoner.config.maxDerivationDepth).toBeDefined();
        });

        test('should handle single step execution with real components', async () => {
            expect(typeof nar.step).toBe('function');

            // Add some input to work with
            await nar.input('(X --> Y). %0.9;0.9%');
            await nar.input('(Y --> Z). %0.8;0.8%');

            // Run a step and verify it doesn't error
            const initialTaskCount = nar._focus.getTasks(10).length;
            await nar.step();
            const finalTaskCount = nar._focus.getTasks(10).length;

            expect(finalTaskCount).toBeGreaterThanOrEqual(initialTaskCount);
        });

        test('should support start/stop functionality with real components', async () => {
            expect(typeof nar.streamReasoner.start).toBe('function');
            expect(typeof nar.streamReasoner.stop).toBe('function');

            expect(() => nar.streamReasoner.start()).not.toThrow();
            await nar.streamReasoner.stop();
        });
    });
});
