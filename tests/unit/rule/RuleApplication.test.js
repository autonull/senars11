import {ImplicationSyllogisticRule as SyllogisticRule} from '../../../src/reason/rules/nal/SyllogisticRule.js';
import {ModusPonensRule} from '../../../src/reason/rules/nal/ModusPonensRule.js';
import {Task} from '../../../src/task/Task.js';
import {Truth} from '../../../src/Truth.js';
import {ArrayStamp} from '../../../src/Stamp.js';
import {TermFactory} from '../../../src/term/TermFactory.js';

describe('Rule Application Tests', () => {
    // Create simple terms for testing
    let termA, termB, termC;
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        termA = termFactory.atomic('a');
        termB = termFactory.atomic('b');
        termC = termFactory.atomic('c');
    });

    describe('SyllogisticRule', () => {
        let syllogisticRule;

        beforeEach(() => {
            syllogisticRule = new SyllogisticRule();
        });

        test('should apply correctly to syllogistic pattern (a==>b) and (b==>c)', () => {
            // Create compound terms (a ==> b) and (b ==> c)
            const termAB = termFactory.implication(termA, termB);
            const termBC = termFactory.implication(termB, termC);

            // Create tasks with these terms
            const taskAB = new Task({
                term: termAB,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                stamp: new ArrayStamp(),
                budget: {priority: 0.9, durability: 0.9, quality: 0.9}
            });

            const taskBC = new Task({
                term: termBC,
                punctuation: '.',
                truth: new Truth(0.8, 0.8),
                stamp: new ArrayStamp(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            // Test canApply method
            expect(syllogisticRule.canApply(taskAB, taskBC)).toBe(true);
            expect(syllogisticRule.canApply(taskBC, taskAB)).toBe(true);

            // Apply the rule
            const results = syllogisticRule.apply(taskAB, taskBC);
            expect(results).toHaveLength(1); // Should produce one result: (a==>c)

            if (results.length > 0) {
                const resultTerm = results[0].term;
                expect(resultTerm.operator).toBe('==>');
                expect(resultTerm.components).toHaveLength(2);
                expect(resultTerm.components[0].name).toBe('a');
                expect(resultTerm.components[1].name).toBe('c');
            }
        });

        test('should not apply to non-syllogistic patterns', () => {
            // Test with non-matching terms
            const task1 = new Task({
                term: termA,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                stamp: new ArrayStamp(),
                budget: {priority: 0.9, durability: 0.9, quality: 0.9}
            });

            const task2 = new Task({
                term: termB,
                punctuation: '.',
                truth: new Truth(0.8, 0.8),
                stamp: new ArrayStamp(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            expect(syllogisticRule.canApply(task1, task2)).toBe(false);
            expect(syllogisticRule.canApply(task2, task1)).toBe(false);
        });

        test('should handle term comparison correctly', () => {
            const termAB = termFactory.implication(termA, termB);
            const termBA = termFactory.implication(termB, termA);

            const taskAB = new Task({
                term: termAB,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                stamp: new ArrayStamp(),
                budget: {priority: 0.9, durability: 0.9, quality: 0.9}
            });

            const taskBA = new Task({
                term: termBA,
                punctuation: '.',
                truth: new Truth(0.8, 0.8),
                stamp: new ArrayStamp(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            // These should be able to form a syllogistic relation
            expect(syllogisticRule.canApply(taskAB, taskBA)).toBe(true);
        });
    });

    describe('ModusPonensRule', () => {
        let modusPonensRule;

        beforeEach(() => {
            modusPonensRule = new ModusPonensRule();
        });

        test('should apply correctly to modus ponens pattern (a==>c) and a', () => {
            // Create compound term (a ==> c)
            const termAC = termFactory.implication(termA, termC);

            // Create tasks
            const taskAC = new Task({
                term: termAC,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                stamp: new ArrayStamp(),
                budget: {priority: 0.9, durability: 0.9, quality: 0.9}
            });

            const taskA = new Task({
                term: termA,
                punctuation: '.',
                truth: new Truth(0.8, 0.8),
                stamp: new ArrayStamp(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            // Test canApply method
            expect(modusPonensRule.canApply(taskAC, taskA)).toBe(true);
            expect(modusPonensRule.canApply(taskA, taskAC)).toBe(true);

            // Apply the rule
            const results = modusPonensRule.apply(taskAC, taskA);
            expect(results).toHaveLength(1); // Should produce one result: c

            if (results.length > 0) {
                const resultTerm = results[0].term;
                expect(resultTerm.name).toBe('c');
            }
        });

        test('should not apply when terms do not support it', () => {
            // Test with non-matching terms that can't form modus ponens
            const task1 = new Task({
                term: termA,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                stamp: new ArrayStamp(),
                budget: {priority: 0.9, durability: 0.9, quality: 0.9}
            });

            const task2 = new Task({
                term: termB,
                punctuation: '.',
                truth: new Truth(0.8, 0.8),
                stamp: new ArrayStamp(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            expect(modusPonensRule.canApply(task1, task2)).toBe(false);
            expect(modusPonensRule.canApply(task2, task1)).toBe(false);
        });
    });

    describe('Term Comparison Logic', () => {
        test('should correctly compare terms using equals method', () => {
            // Create identical terms
            const term1 = termFactory.atomic('a');
            const term2 = termFactory.atomic('a');

            // They should be equal
            expect(term1.equals(term2)).toBe(true);
            expect(term2.equals(term1)).toBe(true);
        });

        test('should correctly compare compound terms', () => {
            const termAB1 = termFactory.implication(termA, termB);
            const termAB2 = termFactory.implication(termA, termB);
            const termAC = termFactory.implication(termA, termC);

            // AB terms should be equal
            expect(termAB1.equals(termAB2)).toBe(true);
            expect(termAB2.equals(termAB1)).toBe(true);

            // AB and AC terms should not be equal
            expect(termAB1.equals(termAC)).toBe(false);
            expect(termAC.equals(termAB1)).toBe(false);
        });

        test('should handle different term structures correctly', () => {
            const simpleTerm = termA;
            const compoundTerm = termFactory.implication(termA, termB);

            // Simple and compound terms should not match
            expect(simpleTerm.equals(compoundTerm)).toBe(false);
            expect(compoundTerm.equals(simpleTerm)).toBe(false);
        });
    });
});