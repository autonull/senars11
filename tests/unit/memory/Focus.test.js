import {Focus, Task, TermFactory} from '@senars/nar';

describe('Focus', () => {
    let focus, tf;
    const config = {maxFocusSets: 3, defaultFocusSetSize: 5, attentionDecayRate: 0.1};

    beforeEach(() => {
        tf = new TermFactory();
        focus = new Focus(config);
    });

    describe('Focus Sets', () => {
        test('initialization', () => {
            expect(focus.getCurrentFocus()).toBe('default');
            expect(focus.getStats()).toMatchObject({currentFocus: 'default', totalFocusSets: 1});
        });

        test('creation', () => {
            expect(focus.createFocusSet('test-set', 10)).toBe(true);
            expect(focus.getStats().totalFocusSets).toBe(2);
            expect(focus.getStats().focusSets['test-set']).toBeDefined();
        });

        test('duplicates prevented', () => {
            focus.createFocusSet('test-set');
            expect(focus.createFocusSet('test-set')).toBe(false);
            expect(focus.getStats().totalFocusSets).toBe(2);
        });

        test('max limit respected', () => {
            ['s1', 's2'].forEach(s => focus.createFocusSet(s));
            expect(focus.createFocusSet('s3')).toBe(false); // 1 default + 2 = 3
        });

        test('switching focus', () => {
            focus.createFocusSet('test-set');
            expect(focus.setFocus('test-set')).toBe(true);
            expect(focus.getCurrentFocus()).toBe('test-set');
            expect(focus.setFocus('non-existent')).toBe(false);
        });
    });

    describe('Task Operations', () => {
        let task;
        beforeEach(() => {
            task = new Task({
                term: tf.atomic('A'),
                truth: {frequency: 0.9, confidence: 0.8},
                punctuation: '.',
                budget: {priority: 0.7}
            });
        });

        test('add task', () => {
            expect(focus.addTaskToFocus(task)).toBe(true);
            const tasks = focus.getTasks(10);
            expect(tasks).toHaveLength(1);
            expect(tasks[0]).toBe(task);
        });

        test('prevent duplicates', () => {
            focus.addTaskToFocus(task);
            expect(focus.addTaskToFocus(task)).toBe(false);
            expect(focus.getTasks(10)).toHaveLength(1);
        });

        test('remove task from all sets', () => {
            focus.createFocusSet('s1');
            focus.createFocusSet('s2');

            ['s1', 's2'].forEach(s => {
                focus.setFocus(s);
                focus.addTaskToFocus(task);
            });

            expect(focus.removeTaskFromFocus(task.stamp.id)).toBe(true);

            ['s1', 's2'].forEach(s => {
                focus.setFocus(s);
                expect(focus.getTasks(10)).toHaveLength(0);
            });
        });

        test('capacity eviction by priority', () => {
            focus.createFocusSet('tiny', 2);
            focus.setFocus('tiny');

            const tasks = [0.5, 0.3, 0.8].map((p, i) => new Task({
                term: tf.atomic('T' + i),
                punctuation: '.',
                budget: {priority: p},
                truth: {frequency: 0.9, confidence: 0.8}
            }));

            tasks.forEach(t => focus.addTaskToFocus(t));

            const kept = focus.getTasks(10);
            expect(kept).toHaveLength(2);
            // 0.8 (T2) and 0.5 (T0) should stay, 0.3 (T1) evicted
            expect(kept.map(t => t.budget.priority)).toEqual(expect.arrayContaining([0.8, 0.5]));
        });
    });

    describe('Attention & Stats', () => {
        test('update attention', () => {
            const initial = focus.getStats().focusSets['default'].attentionScore;
            focus.updateAttention('default', 0.2);
            expect(focus.getStats().focusSets['default'].attentionScore).toBeCloseTo(Math.min(1, initial + 0.2));
        });

        test('apply decay', () => {
            focus.createFocusSet('s1');
            focus.updateAttention('default', 0.5);
            focus.updateAttention('s1', 0.8);

            focus.applyDecay();
            const stats = focus.getStats();
            expect(stats.focusSets['default'].attentionScore).toBeLessThan(0.5);
            expect(stats.focusSets['s1'].attentionScore).toBeLessThan(0.8);
        });

        test('clear', () => {
            focus.createFocusSet('s1');
            focus.clear();
            expect(focus.getCurrentFocus()).toBeNull();
            expect(focus.getStats().totalFocusSets).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('graceful failures', () => {
            focus.setFocus('non-existent');
            expect(focus.getTasks(10)).toEqual([]);
            expect(() => focus.updateAttention('non-existent', 0.1)).not.toThrow();
            expect(focus.removeTaskFromFocus('bad-hash')).toBe(false);
        });
    });
});
