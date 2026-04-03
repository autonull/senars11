import {ImplicationSyllogisticRule, ModusPonensRule, Task, Truth, TermFactory} from '@senars/nar';

describe('Rule Application', () => {
    let tf, tA, tB, tC;

    beforeEach(() => {
        tf = new TermFactory();
        [tA, tB, tC] = ['a', 'b', 'c'].map(n => tf.atomic(n));
    });

    const createTask = (term) => new Task({
        term, punctuation: '.',
        truth: new Truth(0.9, 0.9), budget: {priority: 0.9}
    });

    describe('Syllogistic Rule (==>)', () => {
        const rule = new ImplicationSyllogisticRule();

        test('transitivity: (a==>b), (b==>c) -> (a==>c)', () => {
            const [t1, t2] = [tf.implication(tA, tB), tf.implication(tB, tC)].map(createTask);

            expect(rule.canApply(t1, t2)).toBe(true);
            expect(rule.canApply(t2, t1)).toBe(true);

            const res = rule.apply(t1, t2, {termFactory: tf});
            expect(res).toHaveLength(1);
            // Verify term structure: (a ==> c)
            const resTerm = res[0].term;
            expect(resTerm.operator).toBe('==>');
            expect(resTerm.components[0].equals(tA)).toBe(true);
            expect(resTerm.components[1].equals(tC)).toBe(true);
        });

        test('mismatching terms', () => {
            const [t1, t2] = [tA, tB].map(createTask);
            expect(rule.canApply(t1, t2)).toBe(false);
        });

        test('term comparison', () => {
            const [t1, t2] = [tf.implication(tA, tB), tf.implication(tB, tA)].map(createTask);
            expect(rule.canApply(t1, t2)).toBe(true);
        });
    });

    describe('Modus Ponens', () => {
        const rule = new ModusPonensRule();

        test('deduction: (a==>c), a -> c', () => {
            const [imp, ant] = [tf.implication(tA, tC), tA].map(createTask);

            expect(rule.canApply(imp, ant)).toBe(true);
            expect(rule.canApply(ant, imp)).toBe(true);

            const res = rule.apply(imp, ant);
            expect(res).toHaveLength(1);
            expect(res[0].term.equals(tC)).toBe(true);
        });

        test('mismatch', () => {
            const [t1, t2] = [tA, tB].map(createTask);
            expect(rule.canApply(t1, t2)).toBe(false);
        });
    });
});
