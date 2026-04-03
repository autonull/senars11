import {Decompose1, TermFactory, Task, Truth, Stamp} from '@senars/nar';

describe('Decompose1 Rule', () => {
    let rule;
    let termFactory;
    let context;

    beforeEach(() => {
        rule = new Decompose1();
        termFactory = new TermFactory();
        context = {termFactory};
    });

    test('should decompose (A && B)', () => {
        const A = termFactory.atomic('A');
        const B = termFactory.atomic('B');
        const compound = termFactory.conjunction(A, B);

        const truth = new Truth(0.9, 0.9);
        const task = new Task({
            term: compound,
            truth: truth,
            stamp: Stamp.createInput(),
            punctuation: '.'
        });

        const results = rule.apply(task, null, context);

        expect(results.length).toBe(2);

        const termNames = results.map(t => t.term.name);
        expect(termNames).toContain('A');
        expect(termNames).toContain('B');

        // Verify truth
        // structuralDeduction: f = f0*f0 = 0.81. c = c0/(c0+1)*c0 = 0.9/1.9*0.9 = 0.426...
        const expectedF = 0.9 * 0.9;
        const c0 = 0.9;
        const expectedC = (c0 / (c0 + 1)) * c0;

        expect(results[0].truth.frequency).toBeCloseTo(expectedF);
        expect(results[0].truth.confidence).toBeCloseTo(expectedC);
    });

    test('should not decompose atom', () => {
        const atom = termFactory.atomic('A');
        const task = new Task({
            term: atom,
            truth: new Truth(1, 0.9),
            stamp: Stamp.createInput()
        });

        expect(rule.canApply(task, null, context)).toBe(false);
    });
});
