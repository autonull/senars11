import {TermFactory} from '../../../src/term/TermFactory.js';

describe('TermFactory', () => {
    let factory;

    beforeEach(() => {
        factory = new TermFactory();
    });

    describe('Caching and Uniqueness', () => {
        test.each([
            {
                name: 'identical atomic terms',
                create1: (f) => f.atomic('A'),
                create2: (f) => f.atomic('A'),
                expected: 'same'
            },
            {
                name: 'identical compound terms',
                create1: (f) => f.inheritance(f.atomic('A'), f.atomic('B')),
                create2: (f) => f.inheritance(f.atomic('A'), f.atomic('B')),
                expected: 'same'
            },
            {
                name: 'different atomic terms',
                create1: (f) => f.atomic('A'),
                create2: (f) => f.atomic('B'),
                expected: 'different'
            },
            {
                name: 'different compound terms (operator)',
                create1: (f) => f.inheritance(f.atomic('A'), f.atomic('B')),
                create2: (f) => f.similarity(f.atomic('A'), f.atomic('B')),
                expected: 'different'
            },
        ])('should return $expected instance for $name', ({create1, create2, expected}) => {
            const term1 = create1(factory);
            const term2 = create2(factory);
            if (expected === 'same') {
                expect(term1).toBe(term2);
            } else {
                expect(term1).not.toBe(term2);
            }
        });
    });

    describe('Normalization', () => {
        test.each([
            {
                name: 'commutativity',
                term1: (f) => f.conjunction(f.atomic('A'), f.atomic('B')),
                term2: (f) => f.conjunction(f.atomic('B'), f.atomic('A'))
            },
            {
                name: 'associativity',
                term1: (f) => f.conjunction(f.atomic('A'), f.conjunction(f.atomic('B'), f.atomic('C'))),
                term2: (f) => f.conjunction(f.atomic('A'), f.atomic('B'), f.atomic('C'))
            },
            {
                name: 'redundancy',
                term1: (f) => f.conjunction(f.atomic('A'), f.atomic('A')),
                term2: (f) => f.conjunction(f.atomic('A'))
            },
        ])('should handle $name correctly by returning the same instance', ({term1, term2}) => {
            expect(term1(factory)).toBe(term2(factory));
        });
    });

    describe('Convenience Methods', () => {
        test('predicate should create ^ term', () => {
            const pred = factory.atomic('pred');
            const args = factory.atomic('args');
            const term = factory.predicate(pred, args);
            expect(term.operator).toBe('^');
            expect(term.components).toHaveLength(2);
            expect(term.components[0]).toBe(pred);
            expect(term.components[1]).toBe(args);
        });

        test('tuple should create , term', () => {
            const a = factory.atomic('a');
            const b = factory.atomic('b');
            const term = factory.tuple(a, b);
            expect(term.operator).toBe(',');
            expect(term.components).toHaveLength(2);
            expect(term.components[0]).toBe(a);
            expect(term.components[1]).toBe(b);
        });

        test('atomic should create atomic term', () => {
            const term = factory.atomic('A');
            expect(term.isAtomic).toBe(true);
            expect(term.name).toBe('A');
        });
    });
});
