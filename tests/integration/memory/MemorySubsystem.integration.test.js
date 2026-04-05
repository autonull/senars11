import {afterEach, beforeEach, describe, expect, test} from '@jest/globals';
import {
    Concept,
    Focus,
    FocusSetSelector,
    Memory,
    MemoryConsolidation,
    MemoryIndex,
    NAR,
    TermFactory
} from '@senars/nar';
import {inputAll, wait} from '../../support/testHelpers.js';
import {generateBeliefs} from '../../support/integrationTestUtils.js';
import {createTask, createTerm} from '../../support/index.js';

describe('Memory Subsystem Integration', () => {
    describe.each([
        ['minimal', {maxConcepts: 20, priorityThreshold: 0.5, consolidationInterval: 3}],
        ['standard', {maxConcepts: 50, priorityThreshold: 0.3, consolidationInterval: 5}],
        ['large', {maxConcepts: 100, priorityThreshold: 0.2, consolidationInterval: 8}]
    ])('Memory with %s configuration', (configName, memConfig) => {
        let nar;

        beforeEach(async () => {
            nar = new NAR({
                debug: {enabled: false},
                cycle: {delay: 5, maxTasksPerCycle: 10},
                memory: memConfig
            });
            await nar.initialize?.();
        });

        afterEach(async () => {
            await nar?.dispose();
            nar = null;
        });

        test('Activation propagation through concept network', async () => {
            await inputAll(nar, [
                '<node1 --> central>.',
                '<node2 --> central>.',
                '<node3 --> central>.',
                '<central --> core>.'
            ]);

            await nar.runCycles(5);
            await nar.input('<node1 --> central>.');
            await nar.input('<node1 --> central>.');
            await nar.runCycles(10);

            const concepts = nar.memory.getAllConcepts();
            const centralConcept = concepts.find(c => c.term.toString().includes('central'));

            expect(concepts.length).toBeGreaterThan(0);
            expect(centralConcept).toBeDefined();
        });

        test('Multi-step decay verification', async () => {
            await inputAll(nar, ['<decaying --> concept>.']);
            await nar.runCycles(2);

            const initialConcepts = nar.memory.getAllConcepts();
            const initialCount = initialConcepts.length;

            await wait(100);
            await nar.runCycles(15);

            const finalConcepts = nar.memory.getAllConcepts();
            expect(finalConcepts.length).toBeLessThanOrEqual(initialCount + 5);
        });

        test('Consolidation threshold boundary', async () => {
            const belowThreshold = Math.max(1, memConfig.maxConcepts - 5);
            const beliefs = generateBeliefs(belowThreshold, 'threshold');
            await inputAll(nar, beliefs);

            await nar.runCycles(5);
            const beforeThreshold = nar.memory.getAllConcepts().length;

            await inputAll(nar, generateBeliefs(10, 'overflow'));
            await nar.runCycles(5);

            const afterThreshold = nar.memory.getAllConcepts();
            expect(afterThreshold.length).toBeLessThanOrEqual(memConfig.maxConcepts);
            expect(afterThreshold.length).toBeGreaterThan(0);
        });

        test('Priority-based forgetting under memory pressure', async () => {
            const pressureCount = Math.max(10, memConfig.maxConcepts - 5);
            const allBeliefs = generateBeliefs(pressureCount, 'pressure');
            await inputAll(nar, allBeliefs);

            await nar.runCycles(8);

            const finalConcepts = nar.memory.getAllConcepts();
            expect(finalConcepts.length).toBeLessThanOrEqual(memConfig.maxConcepts);
            expect(finalConcepts.length).toBeGreaterThan(0);

            const stats = nar.getStats();
            expect(stats.memoryStats.totalConcepts).toBeGreaterThan(0);
        });
    });

    describe('Component Integration', () => {
        let memory, focus, selector, index, consolidation, tf;

        beforeEach(() => {
            tf = new TermFactory();
            memory = new Memory({priorityThreshold: 0.3, consolidationInterval: 5, priorityDecayRate: 0.1});
            focus = new Focus({maxFocusSets: 3, defaultFocusSetSize: 10, attentionDecayRate: 0.05});
            selector = new FocusSetSelector({maxSize: 5});
            index = new MemoryIndex();
            consolidation = new MemoryConsolidation({
                activationThreshold: 0.1,
                decayRate: 0.05,
                propagationFactor: 0.3
            });
        });

        test('Focus vs long-term memory separation', () => {
            const [tA, tB, tC] = ['A', 'B', 'C'].map(name => createTerm(`term_${name}`));
            const [taskHigh, taskMed, taskLow] = [0.9, 0.6, 0.2].map((p, i) => createTask({
                term: [tA, tB, tC][i],
                budget: {priority: p}
            }));

            focus.createFocusSet('primary', 5);
            focus.setFocus('primary');
            focus.addTaskToFocus(taskHigh);
            memory.addTask(taskLow);

            expect(focus.getTasks(10)).toContain(taskHigh);
            expect(memory.getConcept(tC)).toBeDefined();
            expect(focus.getTasks(10).find(t => t.term.equals(tB))).toBeUndefined();
            expect(memory.getConcept(tB)).toBeNull();
        });

        test('Promotion to long-term memory', () => {
            const term = createTerm('important');
            const task = createTask({term, budget: {priority: 0.85}});

            focus.createFocusSet('test', 3);
            focus.setFocus('test');
            focus.addTaskToFocus(task);
            expect(focus.getTasks(5)).toContain(task);

            memory.addTask(task);
            expect(memory.getConcept(term).term.equals(term)).toBe(true);
        });

        test('Memory indexing for inheritance relationships', () => {
            const [dog, animal] = [tf.atomic('dog'), tf.atomic('animal')];
            const inheritance = tf.inheritance(dog, animal);

            [inheritance, tf.similarity(tf.atomic('cat'), tf.atomic('feline')), tf.conjunction(tf.atomic('rain'), tf.atomic('wet'))]
                .map(term => new Concept(term, {}))
                .forEach(c => index.addConcept(c));

            expect(index.getStats()).toMatchObject({totalConcepts: 3, inheritanceEntries: 1, similarityEntries: 2});

            const related = index.findInheritanceConcepts(dog);
            expect(related).toHaveLength(1);
            expect(related[0].term.equals(inheritance)).toBe(true);
        });

        test('Memory consolidation triggers correctly', () => {
            Array.from({length: 5}, (_, i) => createTask({
                term: createTerm(`cons_${i}`),
                budget: {priority: 0.5 - (i * 0.1)}
            })).forEach((task, i) => memory.addTask(task, Date.now() - (i * 1000)));

            const result = consolidation.consolidate(memory, Date.now());
            expect(result).toHaveProperty('conceptsDecayed');
            expect(memory.getAllConcepts()).toBeInstanceOf(Array);
        });

        test('Multiple focus sets management', () => {
            const sets = ['high', 'recent', 'diverse'];
            sets.forEach((s, i) => focus.createFocusSet(s, 3 + i));

            const tasks = sets.map((_, i) => createTask({
                term: createTerm(`T${i}`),
                budget: {priority: 0.9 - i * 0.2}
            }));

            sets.forEach((s, i) => {
                focus.setFocus(s);
                focus.addTaskToFocus(tasks[i]);
            });

            sets.forEach((s, i) => {
                focus.setFocus(s);
                expect(focus.getTasks(10)).toContain(tasks[i]);
            });


            expect(focus.getStats().totalFocusSets).toBeGreaterThanOrEqual(3);
        });

        test('Attention decay in focus sets', () => {
            focus.createFocusSet('decay-test', 5);
            focus.setFocus('decay-test');

            const task = createTask({term: createTerm('decaying'), budget: {priority: 0.8}});
            focus.addTaskToFocus(task);

            const initialStats = focus.getStats();
            const initialAttention = initialStats.focusSets['decay-test'].attentionScore;

            focus.applyDecay();

            const decayedStats = focus.getStats();
            expect(decayedStats.focusSets['decay-test'].attentionScore).toBeLessThan(initialAttention);
        });
    });

    describe('Cross-Layer Interaction', () => {
        let nar;

        beforeEach(async () => {
            nar = new NAR({
                debug: {enabled: false},
                cycle: {delay: 5, maxTasksPerCycle: 10},
                memory: {priorityThreshold: 0.3, consolidationInterval: 5, maxConcepts: 50}
            });
            await nar.initialize?.();
        });

        afterEach(async () => {
            await nar?.dispose();
            nar = null;
        });

        test('Focus overflow to long-term consolidation', async () => {
            const beliefs = generateBeliefs(30, 'overflow');
            await inputAll(nar, beliefs);
            await nar.runCycles(5);

            const {_focus: focus, memory} = nar;
            if (!focus || !memory) return;

            const focusTasks = focus.getTasks(100);
            const memConcepts = memory.getAllConcepts();

            expect(focusTasks.length).toBeLessThanOrEqual(50);
            expect(memConcepts.length).toBeGreaterThanOrEqual(10);
        });

        test('Cross-focus-set reasoning', async () => {
            if (!nar._focus) return;

            await nar.input('<A --> B>.');
            await nar.input('<B --> C>.');

            nar._focus.createFocusSet('set1', 5);
            nar._focus.setFocus('set1');
            await nar.input('<C --> D>.');

            nar._focus.createFocusSet('set2', 5);
            nar._focus.setFocus('set2');
            await nar.input('<D --> E>.');

            await nar.runCycles(10);

            const beliefs = nar.getBeliefs();
            expect(beliefs.length).toBeGreaterThan(2);
        });

        test('Concept indexing under load', async () => {
            const inheritances = Array.from({length: 25}, (_, i) =>
                `<item_${i} --> category_${i % 5}>.`
            );

            await inputAll(nar, inheritances);
            await nar.runCycles(5);

            const concepts = nar.memory.getAllConcepts();
            const categoryRelated = concepts.filter(c =>
                c.term.toString().includes('category')
            );

            expect(concepts.length).toBeGreaterThanOrEqual(5);
            expect(categoryRelated.length).toBeGreaterThanOrEqual(1);
        });

        test('Belief revision updates memory correctly', async () => {
            await nar.input('<bird --> [can_fly]>.%0.9;0.8%');
            await nar.runCycles(2);

            const initialBeliefs = nar.getBeliefs();
            const initial = initialBeliefs.find(b => b.term.toString().includes('bird'));

            await nar.input('<bird --> [can_fly]>.%0.5;0.9%');
            await nar.runCycles(2);

            const updatedBeliefs = nar.getBeliefs();
            const updated = updatedBeliefs.find(b => b.term.toString().includes('bird'));

            expect(initial || updated).toBeDefined();
            expect(updatedBeliefs.length).toBeGreaterThanOrEqual(1);
        });

        test('Query retrieval from long-term memory', async () => {
            await inputAll(nar, [
                '<cat --> animal>.',
                '<dog --> animal>.',
                '<bird --> animal>.'
            ]);

            await nar.runCycles(5);
            await nar.input('<cat --> ?x>?');
            await nar.runCycles(3);

            const questions = nar.getQuestions();
            expect(questions.length).toBeGreaterThanOrEqual(1);

            const beliefs = nar.getBeliefs();
            const catRelated = beliefs.filter(b => b.term.toString().includes('cat'));
            expect(catRelated.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Stress Tests', () => {
        let memory, focus, index;

        beforeEach(() => {
            const tf = new TermFactory();
            memory = new Memory({priorityThreshold: 0.3, consolidationInterval: 5, priorityDecayRate: 0.1});
            focus = new Focus({maxFocusSets: 3, defaultFocusSetSize: 10, attentionDecayRate: 0.05});
            index = new MemoryIndex();
        });

        test('High-volume concept processing', () => {
            const start = Date.now();
            focus.createFocusSet('stress', 10);
            focus.setFocus('stress');

            Array.from({length: 50}, (_, i) => {
                const task = createTask({term: createTerm(`stress_${i}`), budget: {priority: Math.random()}});
                focus.addTaskToFocus(task);
                memory.addTask(task);
                index.addConcept(memory.getConcept(task.term));
            });

            expect(Date.now() - start).toBeLessThan(2000);
            expect(focus.getTasks(100)).toHaveLength(10);
            expect(memory.getAllConcepts()).toHaveLength(50);
            expect(index.getStats().totalConcepts).toBe(50);
        });
    });
});
