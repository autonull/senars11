import {Concept} from '@senars/nar';
import {createTask, createTerm} from '../../support/factories.js';

describe('Concept', () => {
    let concept, term;
    beforeEach(() => {
        term = createTerm('A');
        concept = new Concept(term, {priorityDecayRate: 0.9});
    });

    describe('Initialization', () => {
        test('defaults', () => {
            expect(concept).toMatchObject({term, totalTasks: 0, activation: 0, quality: 0, useCount: 0});
            expect(concept.getAllTasks()).toEqual([]);
        });
    });

    describe('Task Management', () => {
        test('add/duplicate/remove', () => {
            const task = createTask({term});

            expect(concept.addTask(task)).toBe(true);
            expect(concept.totalTasks).toBe(1);
            expect(concept.getAllTasks()).toContain(task);

            expect(concept.addTask(task)).toBe(false);
            expect(concept.totalTasks).toBe(1);

            expect(concept.removeTask(task)).toBe(true);
            expect(concept.totalTasks).toBe(0);
        });

        test('getTasksByType', () => {
            const [belief, goal] = [
                createTask({term, punctuation: '.'}),
                createTask({term, punctuation: '!'})
            ];
            [belief, goal].forEach(t => concept.addTask(t));
            expect(concept.getTasksByType('BELIEF')).toEqual([belief]);
            expect(concept.getTasksByType('GOAL')).toEqual([goal]);
        });
    });

    describe('Properties', () => {
        test.each([
            ['boostActivation clamped', c => {
                c.boostActivation(0.5);
                c.boostActivation(0.6);
            }, c => c.activation, 1],
            ['applyDecay', c => {
                c.boostActivation(1);
                c.applyDecay(0.2);
            }, c => c.activation, 0.8],
            ['updateQuality', c => {
                c.updateQuality(0.5);
                c.updateQuality(-0.2);
            }, c => c.quality, 0.3],
            ['incrementUseCount', c => c.incrementUseCount(), c => c.useCount, 1],
        ])('%s', (_, action, selector, expected) => {
            action(concept);
            expect(selector(concept)).toBeCloseTo(expected);
        });

        test('averagePriority', () => {
            [createTask({term, budget: {priority: 0.8}}), createTask({term, budget: {priority: 0.6}})]
                .forEach(t => concept.addTask(t));
            expect(concept.averagePriority).toBeCloseTo(0.8); // Second task suppressed
        });
    });

    describe('Serialization', () => {
        test('serializes concept data', () => {
            const task = createTask({term, punctuation: '.', truth: {frequency: 1.0, confidence: 0.9}});
            concept.addTask(task);
            concept.boostActivation(0.5);

            const serialized = concept.serialize();
            expect(serialized).toBeDefined();
            expect(serialized).toHaveProperty('term');
            expect(serialized).toHaveProperty('activation');
        });

        test('handles invalid deserialization data', async () => {
            const success = await concept.deserialize(null);
            expect(success).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('enforceCapacity', () => {
            for (let i = 0; i < 15; i++) {
                concept.addTask(createTask({term, punctuation: '.'}));
            }
            concept.enforceCapacity(5);
            expect(concept.totalTasks).toBeLessThanOrEqual(5);
        });

        test('containsTask', () => {
            const task = createTask({term});
            expect(concept.containsTask(task)).toBe(false);
            concept.addTask(task);
            expect(concept.containsTask(task)).toBe(true);
        });

        test('replaceTask', () => {
            const oldTask = createTask({term, punctuation: '.'});
            const newTask = createTask({term, punctuation: '.', truth: {frequency: 0.9, confidence: 0.95}});

            concept.addTask(oldTask);
            const replaced = concept.replaceTask(oldTask, newTask);
            expect(replaced).toBe(true);
        });

        test('getStats returns comprehensive data', () => {
            concept.addTask(createTask({term}));
            const stats = concept.getStats();

            expect(stats).toHaveProperty('term');
            expect(stats).toHaveProperty('totalTasks');
            expect(stats).toHaveProperty('activation');
            expect(stats.totalTasks).toBe(1);
        });
    });
});
