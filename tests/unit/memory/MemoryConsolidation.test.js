import {MemoryConsolidation} from '../../../core/src/memory/MemoryConsolidation.js';
import {Memory} from '../../../core/src/memory/Memory.js';
import {Concept} from '../../../core/src/memory/Concept.js';
import {Task} from '../../../core/src/task/Task.js';
import {TermFactory} from '../../../core/src/term/TermFactory.js';

describe('MemoryConsolidation', () => {
    let consolidation, memory, tf;

    beforeEach(() => {
        consolidation = new MemoryConsolidation({
            activationThreshold: 0.1, decayRate: 0.05, propagationFactor: 0.3
        });
        tf = new TermFactory();
        memory = new Memory({priorityThreshold: 0.5, consolidationInterval: 10, priorityDecayRate: 0.1});
    });

    const createConcept = (term, activation = 0.5) => {
        const c = new Concept(term, Concept.DEFAULT_CONFIG);
        c._activation = activation;
        memory._concepts.set(term.name, c);
        memory._stats.totalConcepts++;
        return c;
    };

    test('initialization', () => {
        expect(consolidation.config).toMatchObject({
            activationThreshold: 0.1, decayRate: 0.05, propagationFactor: 0.3
        });
    });

    test('full consolidation cycle', () => {
        const [t1, t2] = [tf.atomic('A'), tf.atomic('B')];
        [t1, t2].forEach(t => memory.addTask(new Task({
            term: t, budget: {priority: 0.8}, truth: {frequency: 0.9, confidence: 0.8}
        })));

        const results = consolidation.consolidate(memory);
        expect(results).toEqual(expect.objectContaining({
            conceptsRemoved: expect.any(Number),
            activationPropagated: expect.any(Number),
            conceptsDecayed: expect.any(Number)
        }));
    });

    test('term similarity', () => {
        const [dog, animal, cat] = ['dog', 'animal', 'cat'].map(n => tf.atomic(n));

        expect(consolidation._calculateTermSimilarity(dog, dog)).toBe(1.0);
        expect(consolidation._calculateTermSimilarity(dog, cat)).toBe(0.0);

        const [inh1, inh2] = [tf.inheritance(dog, animal), tf.inheritance(cat, animal)];
        expect(consolidation._calculateTermSimilarity(inh1, inh1)).toBe(1.0);
        expect(consolidation._calculateTermSimilarity(inh1, inh2)).toBe(0.5); // Shared predicate 'animal'

        // Different operators
        expect(consolidation._calculateTermSimilarity(inh1, tf.similarity(dog, animal))).toBe(0.0);
    });

    test('activation propagation', () => {
        const [c1, c2] = [createConcept(tf.atomic('A'), 0.8), createConcept(tf.atomic('B'), 0.2)];
        const propagated = consolidation._propagateActivation(memory);
        // Assuming implementation tries to propagate, this checks it runs
        expect(propagated).toBeGreaterThanOrEqual(0);
    });

    test('decay and removal', () => {
        const [c1, c2] = [createConcept(tf.atomic('A'), 0.05), createConcept(tf.atomic('B'), 0.8)];
        // c1 below threshold 0.1

        expect(consolidation._applyDecay(memory)).toBe(2);
        expect(c2.activation).toBeLessThan(0.8);

        const removed = consolidation._removeDecayedConcepts(memory);
        expect(removed).toBe(1);
        expect(memory._concepts.has(c1.term.name)).toBe(false);
        expect(memory._concepts.has(c2.term.name)).toBe(true);
    });

    test('health metrics', () => {
        createConcept(tf.atomic('A'), 0.5);
        const health = consolidation.calculateHealthMetrics(memory);
        expect(health).toMatchObject({
            averageActivation: 0.5,
            memoryEfficiency: 0, // No tasks in concept
            consolidationNeeded: false
        });
    });

    test('empty memory health', () => {
        memory = new Memory();
        expect(consolidation.calculateHealthMetrics(memory)).toMatchObject({
            averageActivation: 0, averageQuality: 0, memoryEfficiency: 1
        });
    });
});
