import { Unify } from '../../../../core/src/metta/kernel/Unify.js';
import { Term } from '../../../../core/src/metta/kernel/Term.js';

describe('Kernel Unify', () => {
    beforeEach(() => {
        Term.clearSymbolTable();
    });

    describe('isVar', () => {
        test('detects variables', () => {
            const v = Term.var('x');
            expect(Unify.isVar(v)).toBe(true);
        });

        test('non-variables return false', () => {
            const atom = Term.sym('foo');
            expect(Unify.isVar(atom)).toBe(false);
        });

        test('compound terms are not variables', () => {
            const expr = Term.exp('+', [Term.sym('1')]);
            expect(Unify.isVar(expr)).toBe(false);
        });
    });

    describe('unify - Basic cases', () => {
        test('unifies variable with term', () => {
            const pattern = Term.var('x');
            const term = Term.sym('foo');

            const bindings = Unify.unify(pattern, term);
            expect(bindings).not.toBeNull();
            expect(bindings['$x']).toBe(term);
        });

        test('unifies matching atoms', () => {
            const a1 = Term.sym('foo');
            const a2 = Term.sym('foo');

            const bindings = Unify.unify(a1, a2);
            expect(bindings).toEqual({});
        });

        test('fails to unify different atoms', () => {
            const a1 = Term.sym('foo');
            const a2 = Term.sym('bar');

            const bindings = Unify.unify(a1, a2);
            expect(bindings).toBeNull();
        });

        test('unifies two variables', () => {
            const v1 = Term.var('x');
            const v2 = Term.var('y');

            const bindings = Unify.unify(v1, v2);
            expect(bindings).not.toBeNull();
            // One variable bound to the other
            expect(bindings['$x'] || bindings['$y']).toBeTruthy();
        });
    });

    describe('unify - Compound terms', () => {
        test('unifies compound terms with same operator', () => {
            const p = Term.exp('+', [Term.var('x'), Term.var('y')]);
            const t = Term.exp('+', [Term.sym('1'), Term.sym('2')]);

            const bindings = Unify.unify(p, t);
            expect(bindings).not.toBeNull();
            expect(bindings['$x'].name).toBe('1');
            expect(bindings['$y'].name).toBe('2');
        });

        test('fails on different operators', () => {
            const p = Term.exp('+', [Term.var('x')]);
            const t = Term.exp('-', [Term.sym('1')]);

            const bindings = Unify.unify(p, t);
            expect(bindings).toBeNull();
        });

        test('fails on different component count', () => {
            const p = Term.exp('+', [Term.var('x')]);
            const t = Term.exp('+', [Term.sym('1'), Term.sym('2')]);

            const bindings = Unify.unify(p, t);
            expect(bindings).toBeNull();
        });

        test('unifies nested expressions', () => {
            const p = Term.exp('f', [Term.var('x'), Term.exp('g', [Term.var('y')])]);
            const t = Term.exp('f', [Term.sym('a'), Term.exp('g', [Term.sym('b')])]);

            const bindings = Unify.unify(p, t);
            expect(bindings).not.toBeNull();
            expect(bindings['$x'].name).toBe('a');
            expect(bindings['$y'].name).toBe('b');
        });
    });

    describe('unify - With existing bindings', () => {
        test('uses existing bindings', () => {
            const p = Term.var('x');
            const t = Term.sym('foo');
            const existingBindings = { '$x': Term.sym('foo') };

            const bindings = Unify.unify(p, t, existingBindings);
            expect(bindings).not.toBeNull();
            expect(bindings).toEqual(existingBindings);
        });

        test('fails if existing binding conflicts', () => {
            const p = Term.var('x');
            const t = Term.sym('bar');
            const existingBindings = { '$x': Term.sym('foo') };

            const bindings = Unify.unify(p, t, existingBindings);
            expect(bindings).toBeNull();
        });

        test('unifies with partially bound pattern', () => {
            const p = Term.exp('+', [Term.var('x'), Term.var('y')]);
            const t = Term.exp('+', [Term.sym('1'), Term.sym('1')]);
            const existingBindings = { '$x': Term.sym('1') };

            const bindings = Unify.unify(p, t, existingBindings);
            expect(bindings).not.toBeNull();
            expect(bindings['$x'].name).toBe('1');
            expect(bindings['$y'].name).toBe('1');
        });
    });

    describe('unify - Occurs check', () => {
        test('prevents infinite structures', () => {
            const x = Term.var('x');
            const infiniteLoop = Term.exp('f', [x]);

            const bindings = Unify.unify(x, infiniteLoop);
            expect(bindings).toBeNull(); // Should fail occurs check
        });

        test('allows valid recursive structures', () => {
            const x = Term.var('x');
            const y = Term.var('y');
            const expr = Term.exp('f', [y]);

            const bindings = Unify.unify(x, expr);
            expect(bindings).not.toBeNull();
            expect(bindings['$x']).toBe(expr);
        });
    });

    describe('subst - Substitution', () => {
        test('substitutes simple variable', () => {
            const term = Term.var('x');
            const bindings = { '$x': Term.sym('42') };

            const result = Unify.subst(term, bindings);
            expect(result.name).toBe('42');
        });

        test('substitutes in compound term', () => {
            const term = Term.exp('+', [Term.var('x'), Term.sym('1')]);
            const bindings = { '$x': Term.sym('5') };

            const result = Unify.subst(term, bindings);
            expect(result.operator.name).toBe('+');
            expect(result.components[0].name).toBe('5');
            expect(result.components[1].name).toBe('1');
        });

        test('substitutes nested variables', () => {
            const term = Term.exp('f', [Term.var('x'), Term.var('y')]);
            const bindings = { '$x': Term.sym('a'), '$y': Term.sym('b') };

            const result = Unify.subst(term, bindings);
            expect(result.components[0].name).toBe('a');
            expect(result.components[1].name).toBe('b');
        });

        test('handles transitive bindings', () => {
            const term = Term.var('x');
            const bindings = { '$x': Term.var('y'), '$y': Term.sym('final') };

            const result = Unify.subst(term, bindings);
            expect(result.name).toBe('final');
        });

        test('returns term unchanged if no bindings', () => {
            const term = Term.exp('+', [Term.sym('1'), Term.sym('2')]);
            const result = Unify.subst(term, {});

            expect(result).toBe(term); // Same object
        });

        test('handles null/undefined term', () => {
            const result1 = Unify.subst(null, {});
            const result2 = Unify.subst(undefined, {});

            expect(result1).toBeNull();
            expect(result2).toBeUndefined();
        });
    });

    describe('matchAll - Multiple pattern matching', () => {
        test('matches all successful pattern-term pairs', () => {
            const p1 = Term.exp('f', [Term.var('x')]);
            const p2 = Term.exp('g', [Term.var('y')]);

            const t1 = Term.exp('f', [Term.sym('a')]);
            const t2 = Term.exp('g', [Term.sym('b')]);
            const t3 = Term.exp('h', [Term.sym('c')]);

            const matches = Unify.matchAll([p1, p2], [t1, t2, t3]);

            expect(matches.length).toBe(2);
            expect(matches[0].pattern).toBe(p1);
            expect(matches[0].term).toBe(t1);
            expect(matches[1].pattern).toBe(p2);
            expect(matches[1].term).toBe(t2);
        });

        test('returns empty array if no matches', () => {
            const p1 = Term.exp('f', [Term.var('x')]);
            const t1 = Term.exp('g', [Term.sym('a')]);

            const matches = Unify.matchAll([p1], [t1]);
            expect(matches).toEqual([]);
        });

        test('returns multiple matches for same pattern', () => {
            const pattern = Term.exp('type', [Term.var('x')]);
            const t1 = Term.exp('type', [Term.sym('Int')]);
            const t2 = Term.exp('type', [Term.sym('String')]);

            const matches = Unify.matchAll([pattern], [t1, t2]);

            expect(matches.length).toBe(2);
            expect(matches[0].bindings['$x'].name).toBe('Int');
            expect(matches[1].bindings['$x'].name).toBe('String');
        });
    });

    describe('Integration scenarios', () => {
        test('fibonacci pattern matching', () => {
            const fib0Pattern = Term.exp('fib', [Term.sym('0')]);
            const fib1Pattern = Term.exp('fib', [Term.sym('1')]);
            const fibNPattern = Term.exp('fib', [Term.var('n')]);

            const query = Term.exp('fib', [Term.sym('5')]);

            expect(Unify.unify(fib0Pattern, query)).toBeNull();
            expect(Unify.unify(fib1Pattern, query)).toBeNull();

            const bindings = Unify.unify(fibNPattern, query);
            expect(bindings).not.toBeNull();
            expect(bindings['$n'].name).toBe('5');
        });

        test('arithmetic expression simplification', () => {
            const pattern = Term.exp('+', [Term.var('a'), Term.sym('0')]);
            const expr = Term.exp('+', [Term.sym('x'), Term.sym('0')]);

            const bindings = Unify.unify(pattern, expr);
            expect(bindings).not.toBeNull();

            const resultTemplate = Term.var('a');
            const simplified = Unify.subst(resultTemplate, bindings);
            expect(simplified.name).toBe('x');
        });
    });
});
