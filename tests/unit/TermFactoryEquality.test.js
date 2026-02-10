import {TermFactory} from '../../src/term/TermFactory.js';

describe('TermFactory Commutative Operator Test', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('equality operator should preserve both components even if identical', () => {
        const fiveTerm = termFactory.atomic('5');
        const anotherFiveTerm = termFactory.atomic('5');

        const equalityTerm = termFactory.create('=', [fiveTerm, anotherFiveTerm]);

        expect(equalityTerm.components.length).toBe(2);
        expect(equalityTerm.operator).toBe('=');
    });

    test('equality operator with different components', () => {
        const fiveTerm = termFactory.atomic('5');
        const threeTerm = termFactory.atomic('3');

        const equalityTerm = termFactory.create('=', [fiveTerm, threeTerm]);

        expect(equalityTerm.components.length).toBe(2);
    });
});