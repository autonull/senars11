import {Stamp, Task, TermFactory, Truth} from '@senars/nar';
import {createTask, createTruth, taskAssertions, TEST_CONSTANTS, testImmutability} from '../../support/index.js';

describe('Task', () => {
    let term;
    const factory = new TermFactory();

    beforeEach(() => {
        term = factory.atomic('A');
    });

    describe('Initialization', () => {
        test('defaults', () => {
            const task = new Task({term, truth: {frequency: 0.9, confidence: 0.8}});
            expect(task.term).toBe(term);
            expect(task.type).toBe('BELIEF');
            expect(task.truth).toBeDefined();
            expect(task.budget).toEqual(TEST_CONSTANTS.BUDGET.DEFAULT);
            expect(task.stamp).toBeInstanceOf(Stamp);
        });

        test('custom properties', () => {
            const truth = createTruth();
            const budget = TEST_CONSTANTS.BUDGET.HIGH;
            const task = new Task({term, punctuation: '!', truth, budget});
            expect(task.type).toBe('GOAL');
            expect(task.truth).toEqual(truth);
            expect(task.budget).toEqual(budget);
        });

        test('convenience constructor', () => {
            const truth = new Truth(0.8, 0.7);
            const task = new Task({term, punctuation: '.', truth, budget: {priority: 0.9}});
            expect(task.term).toBe(term);
            expect(task.type).toBe('BELIEF');
            expect(task.truth).toBe(truth);
            expect(task.budget.priority).toBe(0.9);
        });

        test('invalid term -> throws', () => {
            expect(() => new Task({term: 'invalid'})).toThrow(/valid Term object/);
        });
    });

    describe('Validation', () => {
        test('BELIEF requires truth', () => {
            expect(() => new Task({term, punctuation: '.', truth: null})).toThrow(/BELIEF tasks must have valid truth/);
            expect(() => new Task({term, truth: null})).toThrow(/BELIEF tasks must have valid truth/); // default punct
        });

        test('GOAL requires truth', () => {
            expect(() => new Task({term, punctuation: '!', truth: null})).toThrow(/GOAL tasks must have valid truth/);
        });

        test('QUESTION prohibits truth', () => {
            expect(() => new Task({
                term,
                punctuation: '?',
                truth: createTruth()
            })).toThrow(/Questions cannot have truth/);

            const t = new Task({term, punctuation: '?', truth: null});
            expect(t.type).toBe('QUESTION');
            expect(t.truth).toBeNull();
        });

        test('invalid punctuation', () => {
            expect(() => new Task({term, punctuation: '*'})).toThrow(); // Defaults to belief but fails truth check or punct check
        });
    });

    describe('Operations', () => {
        test('immutability', () => {
            testImmutability(createTask({term}), {type: 'GOAL'});
        });

        test('clone', () => {
            const t1 = createTask({term});
            const t2 = t1.clone({punctuation: '?', truth: null});

            expect(t1.type).toBe('BELIEF');
            expect(t1.truth).toBeDefined();
            expect(t2.type).toBe('QUESTION');
            expect(t2.truth).toBeNull();
            expect(t2.term).toBe(t1.term);
        });

        test('equals', () => {
            const t = createTask({term, punctuation: '.', truth: createTruth(0.9, 0.9)});
            expect(t.equals(createTask({term, punctuation: '.', truth: createTruth(0.9, 0.9)}))).toBe(true);
            expect(t.equals(createTask({term, punctuation: '.', truth: createTruth(0.8, 0.8)}))).toBe(false);
            expect(t.equals(createTask({
                term: factory.atomic('B'),
                punctuation: '.',
                truth: createTruth(0.9, 0.9)
            }))).toBe(false);
            expect(t.equals(createTask({term, punctuation: '!', truth: createTruth(0.9, 0.9)}))).toBe(false);
            expect(t.equals(null)).toBe(false);
        });

        test('toString', () => {
            expect(createTask({term, punctuation: '.', truth: createTruth()}).toString()).toContain('A. %0.90;0.80%');
        });
    });

    describe('Type Check Helpers', () => {
        test.each([
            {punct: '.', checks: {isBelief: true, isGoal: false, isQuestion: false}},
            {punct: '!', checks: {isBelief: false, isGoal: true, isQuestion: false}},
            {punct: '?', checks: {isBelief: false, isGoal: false, isQuestion: true}},
        ])('punctuation "$punct"', ({punct, checks}) => {
            const truth = punct === '?' ? null : createTruth();
            const t = new Task({term, punctuation: punct, truth});
            expect(t.isBelief()).toBe(checks.isBelief);
            expect(t.isGoal()).toBe(checks.isGoal);
            expect(t.isQuestion()).toBe(checks.isQuestion);
        });
    });

    describe('Utilities', () => {
        test('taskAssertions & helpers', () => {
            const belief = createTask({term, punctuation: '.'});
            taskAssertions.expectTaskType(belief, 'BELIEF');
            taskAssertions.expectTaskPunctuation(belief, '.');

            const list = [belief];
            expect(taskAssertions.findTaskByTerm(list, 'A')).toBe(belief);
        });
    });
});
