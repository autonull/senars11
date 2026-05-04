import {TermFactory, TermSerializer} from '@senars/nar';

describe('TermSerializer', () => {
    let factory;
    let serializer;

    beforeEach(() => {
        factory = new TermFactory();
        serializer = new TermSerializer();
    });

    test('should serialize atom', () => {
        const t = factory.atomic('A');
        expect(serializer.stringify(t)).toBe('A');
    });

    test('should serialize negation', () => {
        const t = factory.negation(factory.atomic('A'));
        expect(serializer.stringify(t)).toBe('--A');
    });

    test('should serialize inheritance', () => {
        const t = factory.inheritance(factory.atomic('A'), factory.atomic('B'));
        expect(serializer.stringify(t)).toBe('(A --> B)');
    });

    test('should serialize set', () => {
        const t = factory.setExt([factory.atomic('A'), factory.atomic('B')]);
        expect(serializer.stringify(t)).toBe('{A, B}');
    });

    test('should serialize delta', () => {
        const t = factory.delta(factory.atomic('A'));
        expect(serializer.stringify(t)).toBe('ΔA');
    });
});
