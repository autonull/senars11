import {FocusSetSelector, Task, TermFactory, ArrayStamp} from '@senars/nar';

describe('FocusSetSelector', () => {
    let selector, tf, now;

    beforeEach(() => {
        tf = new TermFactory();
        now = Date.now();
        selector = new FocusSetSelector({
            maxSize: 3, priorityThreshold: 0.2,
            priorityWeight: 0.5, urgencyWeight: 0.3, diversityWeight: 0.2
        });
    });

    const createTask = (p, timeOffset = 0, termName = 'A') => new Task({
        term: tf.atomic(termName),
        punctuation: '.',
        budget: {priority: p},
        truth: {frequency: 0.9, confidence: 0.8},
        stamp: new ArrayStamp({id: `id-${Math.random()}`, creationTime: now - timeOffset, source: 'INPUT'})
    });

    test('initialization', () => {
        expect(selector.config).toMatchObject({
            maxSize: 3, priorityThreshold: 0.2,
            priorityWeight: 0.5, urgencyWeight: 0.3, diversityWeight: 0.2
        });
    });

    test('empty inputs', () => {
        [[], null, undefined].forEach(input => {
            expect(selector.select(input, now)).toEqual([]);
        });
    });

    test('priority threshold filtering', () => {
        const tasks = [createTask(0.1), createTask(0.5)];
        const selected = selector.select(tasks, now);
        expect(selected).toHaveLength(1);
        expect(selected[0].budget.priority).toBe(0.5);
    });

    test('composite scoring', () => {
        // High priority + recent (urgency)
        const t1 = createTask(0.8, 1000, 'A');
        const t2 = createTask(0.6, 500, 'B');
        const t3 = createTask(0.4, 2000, 'C');

        const selected = selector.select([t1, t2, t3], now);
        expect(selected).toHaveLength(3);
        expect(selected[0]).toBe(t1); // Highest priority usually wins if urgency is close
    });

    test('max size limit', () => {
        const tasks = Array.from({length: 5}, (_, i) => createTask(0.5 + i * 0.1, i * 100, String.fromCharCode(65 + i)));
        expect(selector.select(tasks, now)).toHaveLength(3);
    });

    test('urgency influence', () => {
        const recent = createTask(0.5, 100);
        const old = createTask(0.5, 10000); // Higher urgency due to age

        const selected = selector.select([recent, old], now);
        expect(selected[0]).toBe(old);
    });

    test('reconfiguration', () => {
        selector.configure({maxSize: 5, priorityThreshold: 0.3});
        expect(selector.config.maxSize).toBe(5);
        expect(selector.config.priorityThreshold).toBe(0.3);
        expect(selector.config.urgencyWeight).toBe(0.3); // Unchanged
    });

    test('stability', () => {
        const tasks = [createTask(0.8), createTask(0.6)];
        const s1 = selector.select(tasks, now);
        const s2 = selector.select(tasks, now);
        expect(s1).toEqual(s2);
    });
});
