import {randomWeightedSelect} from '@senars/nar';

describe('randomWeightedSelect', () => {
    test('should select items based on weights', () => {
        // When all weights are equal, each item should have equal probability
        const items = ['a', 'b', 'c'];
        const weights = [1, 1, 1];

        // Test multiple times to ensure randomness works
        const results = [];
        for (let i = 0; i < 100; i++) {
            results.push(randomWeightedSelect(items, weights));
        }

        // All items should have appeared
        const uniqueResults = [...new Set(results)];
        expect(uniqueResults.sort()).toEqual(['a', 'b', 'c'].sort());
    });

    test('should favor items with higher weights', () => {
        const items = ['low', 'high', 'medium'];
        const weights = [1, 10, 5]; // High weight should be selected more often

        const count = {};
        for (let i = 0; i < 1000; i++) {
            const selected = randomWeightedSelect(items, weights);
            count[selected] = (count[selected] || 0) + 1;
        }

        // The 'high' item should be selected most often
        expect(count.high).toBeGreaterThan(count.medium);
        expect(count.high).toBeGreaterThan(count.low);
    });

    test('should handle zero weights', () => {
        const items = ['a', 'b', 'c'];
        const weights = [0, 1, 1];

        // Items with zero weight should be selected less often or never
        const results = [];
        for (let i = 0; i < 100; i++) {
            results.push(randomWeightedSelect(items, weights));
        }

        // 'a' should appear rarely or not at all due to zero weight
        const aCount = results.filter(item => item === 'a').length;
        expect(aCount / results.length).toBeLessThan(0.1); // Less than 10% of the time
    });

    test('should return null for empty arrays', () => {
        const result = randomWeightedSelect([], []);
        expect(result).toBeNull();
    });

    test('should throw error for mismatched array lengths', () => {
        expect(() => {
            randomWeightedSelect(['a', 'b'], [1]);
        }).toThrow('Items and weights arrays must have the same length');

        expect(() => {
            randomWeightedSelect(['a'], [1, 2]);
        }).toThrow('Items and weights arrays must have the same length');
    });

    test('should handle all zero weights', () => {
        // When all weights are zero, should select randomly
        const items = ['a', 'b', 'c'];
        const weights = [0, 0, 0];

        const result = randomWeightedSelect(items, weights);
        expect(items).toContain(result);
    });

    test('should handle negative weights by treating them as zero', () => {
        const items = ['a', 'b', 'c'];
        const weights = [-1, 1, 2];

        // After normalization, -1 becomes 0, so 'a' should be selected least often
        const results = [];
        for (let i = 0; i < 500; i++) {
            results.push(randomWeightedSelect(items, weights));
        }

        const counts = {a: 0, b: 0, c: 0};
        results.forEach(item => counts[item]++);

        // 'a' should be selected least often compared to b and c
        expect(counts.a).toBeLessThan(counts.b);
        expect(counts.a).toBeLessThan(counts.c);
    });
});
