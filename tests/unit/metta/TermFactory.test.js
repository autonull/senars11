import {TermFactory, Term} from '@senars/nar';
import * as TermUtils from '@senars/nar/src/term/TermUtils.js';

describe('TermFactory', () => {
    let factory;
    const sym = (name) => factory.atomic(name);
    const v = (name) => factory.variable(name);

    beforeEach(() => {
        factory = new TermFactory();
        factory.clearCache();
    });

    test('creates atomic terms', () => {
        const atom = factory.atomic('A');
        expect(TermUtils.isAtomic(atom)).toBe(true);
        expect(atom.name).toBe('A');
    });

    test('creates variables', () => {
        const variable = factory.variable('x');
        expect(TermUtils.isVariable(variable)).toBe(true);
        expect(variable.name).toBe('?x');
    });

    test('creates compound terms (inheritance)', () => {
        const link = factory.inheritance(factory.atomic('A'), factory.atomic('B'));
        expect(TermUtils.isCompound(link)).toBe(true);
        expect(link.operator).toBe('-->');
        expect(link.components[0].name).toBe('A');
        expect(link.components[1].name).toBe('B');
    });

    test('canonicalizes commutative terms', () => {
        // equality is commutative
        const eq1 = factory.equality(sym('A'), sym('B'));
        const eq2 = factory.equality(sym('B'), sym('A'));

        expect(eq1.components[0].name).toBe('A'); // sorted alphabetically
        expect(eq1.components[1].name).toBe('B');

        expect(eq1).toBe(eq2); // Should form the exact same object due to canonicalization
    });

});
