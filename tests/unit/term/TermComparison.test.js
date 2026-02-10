import {ImplicationSyllogisticRule as SyllogisticRule} from '../../../src/reason/rules/nal/SyllogisticRule.js';
import {Task} from '../../../src/task/Task.js';
import {Truth} from '../../../src/Truth.js';
import {ArrayStamp} from '../../../src/Stamp.js';
import {TermFactory} from '../../../src/term/TermFactory.js';

describe('Term Comparison Tests', () => {
    let termFactory;
    let termA, termB, termC;

    beforeEach(() => {
        termFactory = new TermFactory();
        termA = termFactory.atomic('a');
        termB = termFactory.atomic('b');
        termC = termFactory.atomic('c');
    });

    test('should correctly identify syllogistic patterns in tasks', () => {
        // Create terms for (a ==> b) and (b ==> c)
        const termAB = termFactory.implication(termA, termB);
        const termBC = termFactory.implication(termB, termC);

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

        // Test the internal logic of term comparison
        expect(taskAB.term.isCompound).toBe(true);
        expect(taskBC.term.isCompound).toBe(true);
        expect(taskAB.term.operator).toBe('==>');
        expect(taskBC.term.operator).toBe('==>');

        // Check that the middle terms match (B term from first matches A term from second)
        expect(taskAB.term.components[1].equals(taskBC.term.components[0])).toBe(true);
    });

    test('should properly handle term equality checks', () => {
        // Create identical terms
        const term1 = termFactory.atomic('test');
        const term2 = termFactory.atomic('test');
        const term3 = termFactory.atomic('different');

        expect(term1.equals(term2)).toBe(true);
        expect(term1.equals(term3)).toBe(false);
        expect(term2.equals(term3)).toBe(false);
    });

    test('should correctly identify transitive syllogistic patterns', () => {
        // Test the pattern: (a ==> b) and (b ==> c) should produce (a ==> c)
        const termAB = termFactory.implication(termA, termB);
        const termBC = termFactory.implication(termB, termC);

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

        const rule = new SyllogisticRule();

        // Both orderings should be valid for syllogistic reasoning
        expect(rule.canApply(taskAB, taskBC)).toBe(true);
        expect(rule.canApply(taskBC, taskAB)).toBe(true);
    });

    test('should handle nested term structures', () => {
        // Create nested compound terms
        const termAB = termFactory.implication(termA, termB);
        const termNested = termFactory.implication(termAB, termC); // ((a ==> b) ==> c)

        expect(termNested.isCompound).toBe(true);
        expect(termNested.components).toHaveLength(2);
        expect(termNested.components[0].isCompound).toBe(true); // This should be (a ==> b)
        expect(termNested.components[0].operator).toBe('==>');
    });

    test('should maintain proper term structure through rule application', () => {
        const termAB = termFactory.implication(termA, termB);
        const termBC = termFactory.implication(termB, termC);

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

        const rule = new SyllogisticRule();
        const results = rule.apply(taskAB, taskBC);

        // Should produce (a ==> c)
        expect(results).toHaveLength(1);
        if (results.length > 0) {
            const result = results[0];
            expect(result.term.operator).toBe('==>');
            expect(result.term.components).toHaveLength(2);
            expect(result.term.components[0].name).toBe('a');
            expect(result.term.components[1].name).toBe('c');
        }
    });

    test('should handle complex term comparisons', () => {
        // Create various term structures
        const term1 = termA;
        const term2 = termB;
        const term3 = termFactory.implication(termA, termB);
        const term4 = termFactory.implication(termB, termA);

        // Simple terms vs compound terms
        expect(term1.equals(term3)).toBe(false); // 'a' vs '(a==>b)'
        expect(term3.equals(term4)).toBe(false); // '(a==>b)' vs '(b==>a)'

        // But components should match appropriately
        expect(term3.components[0].equals(term4.components[1])).toBe(true); // 'a' vs 'a'
        expect(term3.components[1].equals(term4.components[0])).toBe(true); // 'b' vs 'b'
    });
});