import {Bag} from '@senars/nar';
import {createAtom, createTask} from './testUtils.js';

describe('Bag', () => {
    describe('Basic Operations', () => {
        let bag;
        beforeEach(() => {
            bag = new Bag(10);
        });

        test('defaults', () => {
            expect(bag).toMatchObject({size: 0, maxSize: 10});
        });

        test('add/duplicate/remove', () => {
            const task = createTask(createAtom('A'));
            expect(bag.add(task)).toBe(true);
            expect(bag.size).toBe(1);

            expect(bag.add(task)).toBe(false);
            expect(bag.size).toBe(1);

            expect(bag.remove(task)).toBe(true);
            expect(bag.size).toBe(0);
        });
    });

    describe.each([
        [5, [0.3, 0.7]],
        [10, [0.5, 0.8]],
        [20, [0.4, 0.9]]
    ])('Priority Management (capacity: %d)', (capacity, priorities) => {
        let bag, t1, t2;
        beforeEach(() => {
            bag = new Bag(capacity);
            [t1, t2] = [createTask(createAtom('A'), priorities[0]), createTask(createAtom('B'), priorities[1])];
            [t1, t2].forEach(t => bag.add(t));
        });

        test('ordering', () => {
            expect(bag.peek()).toBe(t2);
            expect(bag.getItemsInPriorityOrder()).toEqual([t2, t1]);
        });

        test.each([
            [0.1],
            [0.5],
            [0.9]
        ])('decay factor %f', (factor) => {
            bag.applyDecay(factor);
            const items = bag.getItemsInPriorityOrder();
            const retentionRate = 1 - factor;
            expect(bag.getPriority(items[0])).toBeCloseTo(priorities[1] * retentionRate);
            expect(bag.getPriority(items[1])).toBeCloseTo(priorities[0] * retentionRate);
            expect(items[0]).toBe(t2);
            expect(items[1]).toBe(t1);
        });
    });
});
