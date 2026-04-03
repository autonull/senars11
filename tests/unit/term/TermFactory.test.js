import {beforeEach, describe, expect, test} from '@jest/globals';
import {TermFactory} from '@senars/nar';

describe('TermFactory', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('creates atomic terms', () => {
        const term = termFactory.create('cat');
        expect(term.toString()).toBe('cat');
        expect(term.isAtomic).toBe(true);
    });

    test('caches atomic terms', () => {
        const term1 = termFactory.create('dog');
        const term2 = termFactory.create('dog');
        expect(term1).toBe(term2);
    });

    test('creates compound terms via helper', () => {
        const cat = termFactory.create('cat');
        const animal = termFactory.create('animal');
        const term = termFactory.inheritance(cat, animal);

        expect(term.isCompound).toBe(true);
        expect(term.operator).toBe('-->');
        expect(term.components[0]).toBe(cat);
        expect(term.components[1]).toBe(animal);
        expect(term.toString()).toBe('(-->, cat, animal)');
    });

    test('creates similarity terms via helper', () => {
        const cat = termFactory.create('cat');
        const dog = termFactory.create('dog');
        const term = termFactory.similarity(cat, dog);

        expect(term.operator).toBe('<->');
        expect(term.toString()).toBe('(<->, cat, dog)');
    });

    test('creates variable terms', () => {
        const query = termFactory.variable('z');
        expect(query.toString()).toBe('?z');
        expect(query.isVariable).toBe(true);

        const independent = termFactory.create('$x');
        expect(independent.toString()).toBe('$x');

        const dependent = termFactory.create('#y');
        expect(dependent.toString()).toBe('#y');
    });

    describe('Logical Operators', () => {
        test('creates implication', () => {
            const a = termFactory.create('a');
            const b = termFactory.create('b');
            const term = termFactory.implication(a, b);

            expect(term.operator).toBe('==>');
            expect(term.toString()).toBe('(==>, a, b)');
        });

        test('creates equivalence', () => {
            const a = termFactory.create('a');
            const b = termFactory.create('b');
            const term = termFactory.equivalence(a, b);

            expect(term.operator).toBe('<=>');
            expect(term.toString()).toBe('(<=>, a, b)');
        });

        test('creates conjunction', () => {
            const a = termFactory.create('a');
            const b = termFactory.create('b');
            const term = termFactory.conjunction([a, b]);
            expect(term.operator).toBe('&');
            expect(term.toString()).toBe('(&, a, b)');
        });

        test('creates disjunction', () => {
            const a = termFactory.create('a');
            const b = termFactory.create('b');
            const term = termFactory.disjunction([a, b]);
            expect(term.operator).toBe('|');
            expect(term.toString()).toBe('(|, a, b)');
        });

        test('creates negation', () => {
            const a = termFactory.create('a');
            const term = termFactory.negation(a);
            expect(term.operator).toBe('--');
            expect(term.toString()).toBe('(--, a)');
        });

        describe('Reflexive Terms', () => {
            test.each([
                ['inheritance', (tf, a) => tf.inheritance(a, a)],
                ['similarity', (tf, a) => tf.similarity(a, a)],
                ['implication', (tf, a) => tf.implication(a, a)],
                ['equivalence', (tf, a) => tf.equivalence(a, a)]
            ])('reduces reflexive %s to True', (name, createFn) => {
                const a = termFactory.create('a');
                const term = createFn(termFactory, a);
                expect(term).not.toBeNull();
                expect(term.name).toBe('True');
                expect(term.isAtomic).toBe(true);
            });
        });
    });

    describe('Set Operators', () => {
        test.each([
            ['extensional set', (tf, a, _b) => tf.setExt(a), '{}', '{a}', 1],
            ['intensional set', (tf, a, _b) => tf.setInt(a), '[]', '[a]', 1],
            ['product', (tf, a, b) => tf.product(a, b), '*', '(*, a, b)', 2],
            ['difference', (tf, a, b) => tf.difference(a, b), '<~>', '(<~>, a, b)', 2]
        ])('creates %s', (name, createFn, expectedOp, expectedStr, numArgs) => {
            const a = termFactory.create('a');
            const b = termFactory.create('b');
            const term = createFn(termFactory, a, b);
            expect(term.operator).toBe(expectedOp);
            expect(term.toString()).toBe(expectedStr);
        });
    });

    describe('Error Handling', () => {
        test('throws on empty creation', () => {
            expect(() => termFactory.create('')).toThrow();
            expect(() => termFactory.create(null)).toThrow();
        });
    });

    test('clears cache', () => {
        const term1 = termFactory.create('bird');
        termFactory.clearCache();
        const term2 = termFactory.create('bird');
        expect(term1).not.toBe(term2);
    });
});
