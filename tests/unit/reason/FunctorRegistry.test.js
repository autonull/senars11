import {FunctorRegistry} from '@senars/nar';

describe('FunctorRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new FunctorRegistry();
    });

    test('should register default functors', () => {
        expect(registry.has('add')).toBe(true);
        expect(registry.has('subtract')).toBe(true);
        expect(registry.has('True')).toBe(true);
    });

    test('should register dynamic functor', () => {
        registry.registerFunctorDynamic('test', () => 'success', {arity: 0});
        expect(registry.has('test')).toBe(true);
        expect(registry.execute('test')).toBe('success');
    });

    test('should execute default functors correctly', () => {
        expect(registry.execute('add', 2, 3)).toBe(5);
        expect(registry.execute('subtract', 5, 2)).toBe(3);
        expect(registry.execute('and', true, false)).toBe(false);
    });

    test('should handle bulk execution', () => {
        const calls = [
            {name: 'add', args: [1, 2]},
            {name: 'subtract', args: [5, 1]}
        ];
        const results = registry.executeBulk(calls);
        expect(results).toHaveLength(2);
        expect(results[0].result).toBe(3);
        expect(results[1].result).toBe(4);
    });

    test('should find functors by property', () => {
        const arithmetic = registry.getFunctorsByCategory('arithmetic');
        expect(arithmetic.length).toBeGreaterThan(0);
        expect(arithmetic.some(f => f.name === 'add')).toBe(true);
    });
});
