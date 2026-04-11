import {IntrospectionEvents, NAR, TermFactory} from '@senars/nar';
import {inputAll} from '../../support/testHelpers.js';

describe('NAR Integration', () => {
    let nar;
    const tf = new TermFactory();

    beforeAll(async () => {
        nar = new NAR({debug: {enabled: false}, cycle: {delay: 10, maxTasksPerCycle: 5}});
        await nar.initialize?.();
    });

    afterAll(async () => {
        await nar?.dispose();
    });

    afterEach(() => {
        nar?.reset();
    });

    describe('Basic Input Processing', () => {
        test('should accept simple belief', async () => {
            await nar.input('cat.');
            const beliefs = nar.getBeliefs();
            expect(beliefs.some(b => b.term.toString().includes('cat') && b.type === 'BELIEF')).toBe(true);
        });

        test('should handle belief with truth value', async () => {
            await nar.input('bird.%0.9;0.8%');
            const belief = nar.getBeliefs().find(b => b.term.toString().includes('bird'));
            expect(belief).toBeDefined();
            expect(belief.truth.f).toBeCloseTo(0.9, 1);
            expect(belief.truth.c).toBeCloseTo(0.8, 1);
        });

        test('should handle goal input', async () => {
            await nar.input('want_food!');
            expect(nar.getGoals().some(g => g.term.toString().includes('want_food'))).toBe(true);
        });

        test('should handle question input', async () => {
            await nar.input('is_cat?');
            expect(nar.getQuestions().some(q => q.term.toString().includes('is_cat'))).toBe(true);
        });
    });

    describe('Compound Term Processing', () => {
        test('should handle inheritance', async () => {
            await nar.input('(cat --> animal).');
            expect(nar.getBeliefs().some(b => b.term.toString().includes('cat') && b.term.toString().includes('animal'))).toBe(true);
        });

        test('should handle conjunction', async () => {
            await nar.input('(&, red, green).');
            expect(nar.getBeliefs().some(b => b.term.toString().includes('&'))).toBe(true);
        });

        test('should handle nested terms', async () => {
            await nar.input('((cat --> animal) ==> (animal --> mammal)).');
            const belief = nar.getBeliefs().find(b => b.term.toString().includes('==>'));
            expect(belief).toBeDefined();
        });
    });

    describe.each([
        ['Fast', 1],
        ['Standard', 10],
        ['Slow', 50]
    ])('System Lifecycle (%s)', (speed, delay) => {
        beforeEach(() => {
            if (nar) {
                nar.config.cycle.delay = delay;
            }
        });

        test('should execute multiple cycles', async () => {
            await inputAll(nar, ['cat.', 'dog.']);
            const results = await nar.runCycles(3);
            expect(results.length).toBe(3);
        });

        test('should reset state', async () => {
            await inputAll(nar, ['cat.', 'dog.']);
            expect(nar.getBeliefs().length).toBeGreaterThan(0);

            nar.reset();
            expect(nar.getBeliefs().length).toBe(0);
        });
    });

    describe('Memory Storage and Retrieval', () => {
        test('should store tasks in concepts', async () => {
            await inputAll(nar, ['(cat --> animal).', '(dog --> animal).', '(cat --> pet).']);
            const concepts = nar.memory.getAllConcepts();
            expect(concepts.length).toBeGreaterThanOrEqual(3);

            const terms = concepts.map(c => c.term.toString());
            ['cat', 'dog', 'animal'].forEach(t =>
                expect(terms.some(term => term.includes(t))).toBe(true)
            );
        });

        test('should retrieve beliefs by query', async () => {
            await inputAll(nar, ['(cat --> animal).', '(dog --> animal).', '(bird --> animal).']);
            const catBeliefs = nar.getBeliefs().filter(b => b.term.toString().toLowerCase().includes('cat'));
            expect(catBeliefs.length).toBeGreaterThanOrEqual(1);
            if (catBeliefs.length > 0) expect(catBeliefs[0].term.toString()).toContain('cat');
        });

        test('should handle compound terms', async () => {
            await nar.input('(&, cat, pet, animal).');
            const belief = nar.getBeliefs().find(b =>
                b.term.toString().includes('cat') && b.term.toString().includes('pet')
            );
            expect(belief).toBeDefined();
        });
    });

    describe('System Statistics', () => {
        test('should provide comprehensive stats', async () => {
            await inputAll(nar, ['(cat --> animal).', '(dog --> animal).']);
            await nar.step();
            expect(nar.getStats()).toMatchObject({
                memoryStats: expect.anything(),
                taskManagerStats: expect.anything(),
                streamReasonerStats: expect.anything()
            });
        });

        test('should track memory usage', async () => {
            await inputAll(nar, ['(cat --> animal).', '(dog --> animal).', '(bird --> animal).']);
            const stats = nar.getStats();
            expect(stats.memoryStats.totalConcepts).toBeGreaterThanOrEqual(1);
            expect(stats.memoryStats.totalTasks).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Event System', () => {
        test('should emit events for input processing', async () => {
            const events = [];
            const taskAddedEvents = [];

            nar.on(IntrospectionEvents.TASK_INPUT, (data) => events.push(data));
            nar.on(IntrospectionEvents.TASK_ADDED, (data) => taskAddedEvents.push(data));

            await nar.input('test.');

            expect(events.length).toBe(1);
            expect(events[0].task.term.toString()).toContain('test');
            expect(events[0].source).toBe('user');
            expect(taskAddedEvents.length).toBe(1);
            expect(taskAddedEvents[0].task.type).toBe('BELIEF');
        });
    });
});
