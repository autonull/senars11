import { Space } from '../../../../core/src/metta/kernel/Space.js';
import { Term } from '../../../../core/src/metta/kernel/Term.js';

describe('Kernel Space', () => {
    let space;

    beforeEach(() => {
        Term.clearSymbolTable();
        space = new Space();
    });

    describe('Atom storage', () => {
        test('adds and retrieves atoms', () => {
            const atom = Term.sym('A');
            space.add(atom);
            expect(space.has(atom)).toBe(true);
            expect(space.all()).toContain(atom);
        });

        test('removes atoms', () => {
            const atom = Term.sym('A');
            space.add(atom);
            space.remove(atom);
            expect(space.has(atom)).toBe(false);
        });

        test('handles duplicate adds', () => {
            const atom = Term.sym('A');
            space.add(atom);
            space.add(atom);
            expect(space.size()).toBe(1);
        });
    });

    describe('Rule indexing', () => {
        test('adds rules and indexes them', () => {
            const pattern = Term.exp('=', [Term.sym('A'), Term.sym('B')]);
            const result = Term.sym('B');

            space.addRule(pattern, result);
            const stats = space.getStats();

            expect(stats.ruleCount).toBe(1);
            expect(stats.indexedFunctors).toBe(1);
        });
    });

    describe('Functor indexing', () => {
        test('rulesFor returns rules matching operator', () => {
            // Rule: (+ $x $y) = ...
            const plusPattern = Term.exp('+', [Term.var('x'), Term.var('y')]);
            const plusResult = Term.sym('result');

            // Rule: (- $x $y) = ...
            const minusPattern = Term.exp('-', [Term.var('x'), Term.var('y')]);
            const minusResult = Term.sym('result');

            space.addRule(plusPattern, plusResult);
            // Add duplicate operator to check grouping
            space.addRule(plusPattern, plusResult);
            space.addRule(minusPattern, minusResult);

            const plusRules = space.rulesFor('+');
            expect(plusRules.length).toBe(2);
            expect(plusRules[0].pattern.operator.name).toBe('+');
            expect(plusRules[1].pattern.operator.name).toBe('+');

            const minusRules = space.rulesFor('-');
            expect(minusRules.length).toBe(1);
            expect(minusRules[0].pattern.operator.name).toBe('-');
        });

        test('rulesFor returns empty array for unknown operator', () => {
            const unknownRules = space.rulesFor('unknown');
            expect(unknownRules.length).toBe(0);
        });
    });

    describe('Integration scenarios', () => {
        test('fibonacci rules scenario', () => {
            // fib(0) = 0
            space.addRule(Term.exp('fib', [Term.sym('0')]), Term.sym('0'));
            // fib(1) = 1
            space.addRule(Term.exp('fib', [Term.sym('1')]), Term.sym('1'));
            // fib($n) = ...
            space.addRule(Term.exp('fib', [Term.var('n')]), Term.sym('recurse'));

            const fibRules = space.rulesFor('fib');
            expect(fibRules.length).toBe(3);
            expect(fibRules.every(r => r.pattern.operator.name === 'fib')).toBe(true);
        });

        test('mixed atoms and rules', () => {
            space.add(Term.sym('Fact'));
            space.addRule(Term.exp('rule', [Term.var('x')]), Term.sym('res'));

            expect(space.size()).toBe(1); // 1 atom
            expect(space.getRules().length).toBe(1); // 1 rule
        });
    });
});
