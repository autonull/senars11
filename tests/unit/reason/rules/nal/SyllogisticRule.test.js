import {ImplicationSyllogisticRule, Task, Truth, ArrayStamp, TermFactory} from '@senars/nar';

describe('ImplicationSyllogisticRule', () => {
    let termFactory;
    let termA, termB, termC;

    beforeEach(() => {
        termFactory = new TermFactory();
        termA = termFactory.atomic('a');
        termB = termFactory.atomic('b');
        termC = termFactory.atomic('c');
    });

    test('should correctly identify transitive syllogistic patterns', () => {
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

        const rule = new ImplicationSyllogisticRule();
        const context = {termFactory};

        expect(rule.canApply(taskAB, taskBC, context)).toBe(true);
        expect(rule.canApply(taskBC, taskAB, context)).toBe(true);
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

        const rule = new ImplicationSyllogisticRule();
        const context = {termFactory};
        const results = rule.apply(taskAB, taskBC, context);

        expect(results).toHaveLength(1);
        if (results.length > 0) {
            const result = results[0];
            expect(result.term.operator).toBe('==>');
            expect(result.term.components).toHaveLength(2);
            expect(result.term.components[0].name).toBe('a');
            expect(result.term.components[1].name).toBe('c');
        }
    });
});
