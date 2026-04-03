import {beforeEach, describe, expect, test} from '@jest/globals';
import {TermFactory, TermType} from '@senars/nar';

describe('TermFactory Sorting and Canonicalization', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('Equivalence sorting conflict reproduction', () => {
        // Reproduce the conflict between alphabetical sort and complexity sort in Equivalence
        const termA = termFactory.variable('$x');
        const termB = termFactory.negation(termFactory.atomic('a'));

        // Expect final order to be by complexity: [termB, termA]
        // termB (complexity 2) > termA (complexity 1)
        const equivalence = termFactory.equivalence(termA, termB);

        expect(equivalence.components[0].equals(termB)).toBe(true);
        expect(equivalence.components[1].equals(termA)).toBe(true);
    });

    test('Redundant sorting verification (Behavioral)', () => {
        const a = termFactory.atomic('a');
        const b = termFactory.atomic('b');

        // Commutative operator &
        // Alphabetical: a, b.
        const conjunction = termFactory.conjunction(b, a);
        expect(conjunction.components[0].name).toBe('a');
        expect(conjunction.components[1].name).toBe('b');
    });

    test('Redundancy removal (Idempotency)', () => {
        const a = termFactory.atomic('a');
        // & a a -> a
        const conjunction = termFactory.conjunction(a, a);
        expect(conjunction.isAtomic).toBe(true);
        expect(conjunction.name).toBe('a');
    });

    test('Reflexive simplification works', () => {
        const a = termFactory.atomic('a');
        // <-> a a
        const eq = termFactory.similarity(a, a);
        expect(eq.name).toBe('True');
    });
});
