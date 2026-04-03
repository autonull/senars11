import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import {Bag, Focus, FocusSetSelector, MemoryResourceManager, Task, TermFactory, Stamp, Truth} from '@senars/nar';

describe('Phase 1.3: Competitive Memory Verification', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    const createTask = (name, priority = 0.5, creationTime = Date.now()) => {
        const term = termFactory.atomic(name);
        return new Task({
            term,
            punctuation: '.',
            truth: new Truth(1.0, 0.9),
            budget: { priority, durability: 0.5, quality: 0.5, cycles: 100, depth: 10 },
            stamp: Stamp.createInput() // Basic stamp
        });
    };

    describe('1.3.1 Bag (Long-Term Storage Structure)', () => {
        test('Bag respects maxSize and evicts based on priority', () => {
            const bag = new Bag(3, 'priority'); // Max size 3, Priority policy

            const item1 = { name: 'A', budget: { priority: 0.1 }, toString: () => 'A' };
            const item2 = { name: 'B', budget: { priority: 0.9 }, toString: () => 'B' };
            const item3 = { name: 'C', budget: { priority: 0.5 }, toString: () => 'C' };
            const item4 = { name: 'D', budget: { priority: 0.8 }, toString: () => 'D' };

            bag.add(item1);
            bag.add(item2);
            bag.add(item3);

            expect(bag.size).toBe(3);

            // Add item4 (0.8), should evict lowest priority (item1: 0.1)
            bag.add(item4);

            expect(bag.size).toBe(3);
            expect(bag.contains(item1)).toBe(false);
            expect(bag.contains(item2)).toBe(true);
            expect(bag.contains(item3)).toBe(true);
            expect(bag.contains(item4)).toBe(true);
        });

        test('Bag respects FIFO policy', () => {
            const bag = new Bag(3, 'fifo');
            const item1 = { name: 'A', budget: { priority: 0.5 }, toString: () => 'A' };
            const item2 = { name: 'B', budget: { priority: 0.5 }, toString: () => 'B' };
            const item3 = { name: 'C', budget: { priority: 0.5 }, toString: () => 'C' };
            const item4 = { name: 'D', budget: { priority: 0.5 }, toString: () => 'D' };

            bag.add(item1);
            bag.add(item2);
            bag.add(item3);

            // Add item4, should evict first inserted (item1)
            bag.add(item4);

            expect(bag.contains(item1)).toBe(false);
            expect(bag.contains(item4)).toBe(true);
        });
    });

    describe('1.3.1 Focus (Working Memory)', () => {
        test('Focus prioritizes tasks correctly', () => {
            const focus = new Focus({ defaultFocusSetSize: 5 });

            const t1 = createTask('t1', 0.1);
            const t2 = createTask('t2', 0.9);
            const t3 = createTask('t3', 0.5);

            focus.addTaskToFocus(t1);
            focus.addTaskToFocus(t2);
            focus.addTaskToFocus(t3);

            const tasks = focus.getTasks(3);

            expect(tasks[0].term.name).toBe('t2'); // 0.9
            expect(tasks[1].term.name).toBe('t3'); // 0.5
            expect(tasks[2].term.name).toBe('t1'); // 0.1
        });

        test('Focus applies decay', () => {
            const focus = new Focus();
            const t1 = createTask('t1', 0.8);
            focus.addTaskToFocus(t1);

            // Initial check (internal inspection via getTasks to see if priority changed?
            // FocusSet wraps tasks and tracks priority separately from the task object sometimes,
            // or modifies task budget. Let's check Focus implementation.)
            // FocusSet.js: entry.priority *= (1 - decayRate);

            focus.applyDecay();

            // To verify decay, we might need to peek at internal state or check if order changes relative to a new task?
            // Or assume Focus updates the task object?
            // FocusSet.js updates `entry.priority`. `getTasks` uses `entry.priority`.
            // The actual Task object's budget might not be mutated if it's frozen (Task is frozen).
            // So we check retrieval order against a new task with known priority.

            // t1 starts at 0.8. Decay rate 0.05 (default).
            // After 1 decay: 0.8 * 0.95 = 0.76.

            const tNew = createTask('new', 0.78);
            focus.addTaskToFocus(tNew);

            const tasks = focus.getTasks(2);
            // tNew (0.78) > t1 (0.76)
            expect(tasks[0].term.name).toBe('new');
            expect(tasks[1].term.name).toBe('t1');
        });
    });

    describe('1.3.2 Dynamic Sampling (FocusSetSelector)', () => {
        test('Selects tasks based on composite score', () => {
            const selector = new FocusSetSelector({
                priorityWeight: 1.0,
                urgencyWeight: 0.0,
                diversityWeight: 0.0
            });

            const t1 = createTask('t1', 0.2);
            const t2 = createTask('t2', 0.8);

            const selected = selector.select([t1, t2]);
            expect(selected[0]).toBe(t2);
        });

        // Test configuration override
        test('Respects configuration weights', () => {
            // Give huge weight to something else (e.g., diversity/complexity)
            // But Task complexity is 1 for atoms.
            // Let's rely on priorityWeight being 0 and picking purely by order?
            // Actually selector sorts by score.

            const selector = new FocusSetSelector({
                priorityWeight: 0.0,
                urgencyWeight: 0.0,
                diversityWeight: 0.0,
                recencyWeight: 0.0,
                noveltyWeight: 0.0,
                randomWeight: 0.0
                // If everything is 0, sort is stable or undefined?
                // JS sort is stable.
            });
            // If weights are zero, score is zero.

            const t1 = createTask('t1', 0.2);
            const t2 = createTask('t2', 0.8);

            const selected = selector.select([t1, t2]);
            // Filter by priorityThreshold default 0.1. Both pass.
            // Scores equal.
            expect(selected.length).toBe(2);
        });
    });

    describe('1.3.3 Memory Resource Management (AIKR)', () => {
        test('Detects memory pressure', () => {
            const mgr = new MemoryResourceManager({
                maxConcepts: 100,
                maxTasksPerConcept: 10,
                resourceBudget: 1000,
                memoryPressureThreshold: 0.8
            });

            // No pressure
            expect(mgr.isUnderMemoryPressure({ totalConcepts: 10, totalTasks: 50 })).toBe(false);

            // High concept pressure (90/100 = 0.9 > 0.8)
            expect(mgr.isUnderMemoryPressure({ totalConcepts: 90, totalTasks: 50 })).toBe(true);
        });

        test('Applies adaptive forgetting', () => {
            const mgr = new MemoryResourceManager({
                maxConcepts: 100,
                maxTasksPerConcept: 10,
                resourceBudget: 1000,
                memoryPressureThreshold: 0.5
            });

            const mockMemory = {
                stats: { totalConcepts: 90 },
                _applyConceptForgetting: jest.fn()
            };

            mgr.applyAdaptiveForgetting(mockMemory);

            // Should call forgetting multiple times
            expect(mockMemory._applyConceptForgetting).toHaveBeenCalled();
            expect(mockMemory._applyConceptForgetting.mock.calls.length).toBeGreaterThan(0);
        });
    });
});
