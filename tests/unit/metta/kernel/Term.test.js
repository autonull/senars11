import { Term } from '../../../../core/src/metta/kernel/Term.js';

describe('Kernel Term', () => {
    beforeEach(() => {
        Term.clearSymbolTable();
    });

    describe('sym - Symbol creation', () => {
        test('creates atomic terms', () => {
            const atom = Term.sym('foo');
            expect(atom.type).toBe('atom');
            expect(atom.name).toBe('foo');
            expect(atom.operator).toBeNull();
            expect(atom.components).toEqual([]);
        });

        test('interns symbols for O(1) equality', () => {
            const foo1 = Term.sym('foo');
            const foo2 = Term.sym('foo');
            expect(foo1).toBe(foo2); // Same object reference
        });

        test('different symbols are different objects', () => {
            const foo = Term.sym('foo');
            const bar = Term.sym('bar');
            expect(foo).not.toBe(bar);
        });

        test('toString returns name', () => {
            const atom = Term.sym('test');
            expect(atom.toString()).toBe('test');
        });
    });

    describe('var - Variable creation', () => {
        test('creates variable with $ prefix', () => {
            const v = Term.var('x');
            expect(v.type).toBe('atom');
            expect(v.name).toBe('$x');
        });

        test('handles already prefixed variables', () => {
            const v = Term.var('$y');
            expect(v.name).toBe('$y');
        });

        test('variables are interned', () => {
            const v1 = Term.var('x');
            const v2 = Term.var('$x');
            expect(v1).toBe(v2);
        });
    });

    describe('exp - Expression creation', () => {
        test('creates compound terms', () => {
            const a = Term.sym('a');
            const b = Term.sym('b');
            const expr = Term.exp('+', [a, b]);

            expect(expr.type).toBe('compound');
            // operator is now an atom, check its name or verify it's an atom with correct name
            expect(expr.operator.name).toBe('+');
            expect(expr.components).toEqual([a, b]);
        });

        test('builds canonical name', () => {
            const a = Term.sym('1');
            const b = Term.sym('2');
            const expr = Term.exp('+', [a, b]);

            expect(expr.name).toBe('(+, 1, 2)');
            expect(expr.toString()).toBe('(+, 1, 2)');
        });

        test('handles nested expressions', () => {
            const x = Term.sym('x');
            const y = Term.sym('y');
            const inner = Term.exp('*', [x, y]);
            const outer = Term.exp('+', [inner, Term.sym('z')]);

            expect(outer.operator.name).toBe('+');
            expect(outer.components[0]).toBe(inner);
            expect(outer.name).toBe('(+, (*, x, y), z)');
        });

        test('throws on invalid operator', () => {
            expect(() => Term.exp(null, [])).toThrow();
            expect(() => Term.exp('', [])).toThrow();
        });

        test('throws on non-array components', () => {
            expect(() => Term.exp('+', 'not-array')).toThrow();
        });

        test('components are frozen', () => {
            const a = Term.sym('a');
            const expr = Term.exp('+', [a]);
            expect(() => { expr.components.push(Term.sym('b')); }).toThrow();
        });
    });

    describe('equals - Structural equality', () => {
        test('equal atomic terms', () => {
            const a1 = Term.sym('foo');
            const a2 = Term.sym('foo');
            expect(Term.equals(a1, a2)).toBe(true);
        });

        test('different atomic terms', () => {
            const a = Term.sym('foo');
            const b = Term.sym('bar');
            expect(Term.equals(a, b)).toBe(false);
        });

        test('equal compound terms', () => {
            const a = Term.sym('a');
            const b = Term.sym('b');
            const e1 = Term.exp('+', [a, b]);
            const e2 = Term.exp('+', [a, b]);
            expect(Term.equals(e1, e2)).toBe(true);
        });

        test('different operators', () => {
            const a = Term.sym('a');
            const e1 = Term.exp('+', [a]);
            const e2 = Term.exp('-', [a]);
            expect(Term.equals(e1, e2)).toBe(false);
        });

        test('different component count', () => {
            const a = Term.sym('a');
            const b = Term.sym('b');
            const e1 = Term.exp('+', [a]);
            const e2 = Term.exp('+', [a, b]);
            expect(Term.equals(e1, e2)).toBe(false);
        });

        test('different components', () => {
            const a = Term.sym('a');
            const b = Term.sym('b');
            const c = Term.sym('c');
            const e1 = Term.exp('+', [a, b]);
            const e2 = Term.exp('+', [a, c]);
            expect(Term.equals(e1, e2)).toBe(false);
        });

        test('nested equality', () => {
            const x = Term.sym('x');
            const inner1 = Term.exp('*', [x, x]);
            const inner2 = Term.exp('*', [x, x]);
            const outer1 = Term.exp('+', [inner1]);
            const outer2 = Term.exp('+', [inner2]);
            expect(Term.equals(outer1, outer2)).toBe(true);
        });

        test('handles null/undefined', () => {
            const a = Term.sym('a');
            expect(Term.equals(a, null)).toBe(false);
            expect(Term.equals(null, a)).toBe(false);
            expect(Term.equals(null, null)).toBe(false);
        });
    });

    describe('isVar - Variable detection', () => {
        test('detects variables', () => {
            const v = Term.var('x');
            expect(Term.isVar(v)).toBe(true);
        });

        test('non-variables return false', () => {
            const a = Term.sym('foo');
            expect(Term.isVar(a)).toBe(false);
        });

        test('compound terms are not variables', () => {
            const v = Term.var('x');
            const expr = Term.exp('f', [v]);
            expect(Term.isVar(expr)).toBe(false);
        });

        test('handles null', () => {
            expect(Term.isVar(null)).toBe(false);
        });
    });

    describe('Symbol table management', () => {
        test('clearSymbolTable removes interned symbols', () => {
            const foo1 = Term.sym('foo');
            Term.clearSymbolTable();
            const foo2 = Term.sym('foo');
            expect(foo1).not.toBe(foo2); // Different objects after clear
        });
    });
});
