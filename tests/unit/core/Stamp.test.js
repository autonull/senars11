import {ArrayStamp, BloomStamp, Stamp} from '../../../core/src/Stamp.js';

describe('Stamp', () => {
    describe('ArrayStamp', () => {
        test('initialization', () => {
            const opts = {id: 'test-id', creationTime: 12345, source: 'INPUT', derivations: ['d1', 'd2']};
            const stamp = new ArrayStamp(opts);
            expect(stamp).toMatchObject(opts);
            expect(stamp.occurrenceTime).toBe(12345);
        });

        test('immutability', () => {
            const stamp = new ArrayStamp({id: 's1'});
            expect(Object.isFrozen(stamp)).toBe(true);
            expect(Object.isFrozen(stamp.derivations)).toBe(true);
            expect(() => stamp.id = 'new-id').toThrow();
            expect(() => stamp.derivations.push('new')).toThrow();
        });

        test('static createInput', () => {
            const s = Stamp.createInput();
            expect(s).toBeInstanceOf(ArrayStamp);
            expect(s).toMatchObject({source: 'INPUT', derivations: []});
            expect(Math.abs(s.creationTime - Date.now())).toBeLessThanOrEqual(1000);
        });

        test('derive', () => {
            const [p1, p2, p3] = [
                new ArrayStamp({id: 'p1', derivations: ['d1'], depth: 1}),
                new ArrayStamp({id: 'p2', derivations: ['d2'], depth: 2}),
                new ArrayStamp({id: 'p3', derivations: [], depth: 0})
            ];

            const d1 = Stamp.derive([p1, p2]);
            expect(d1).toBeInstanceOf(ArrayStamp);
            expect(d1).toMatchObject({source: 'DERIVED', depth: 3});
            expect(d1.derivations).toEqual(expect.arrayContaining(['p1', 'p2', 'd1', 'd2']));

            const d2 = Stamp.derive([p3]);
            expect(d2.depth).toBe(1);
        });

        test('equality', () => {
            const s1 = new ArrayStamp({id: 's1'});
            expect(s1.equals(new ArrayStamp({id: 's1'}))).toBe(true);
            expect(s1.equals(new ArrayStamp({id: 's2'}))).toBe(false);
            expect(s1.equals(null)).toBe(false);
        });

        test('unique ID generation', () => {
            expect(new ArrayStamp().id).not.toBe(new ArrayStamp().id);
        });

        test('overlaps', () => {
            const s1 = Stamp.createInput();
            const s2 = Stamp.createInput();
            const s3 = Stamp.derive([s1]);

            expect(s1.overlaps(s2)).toBe(false);
            expect(s1.overlaps(s1)).toBe(true);

            expect(s3.overlaps(s1)).toBe(true);
            expect(s1.overlaps(s3)).toBe(true);
            expect(s3.overlaps(s2)).toBe(false);

            // Cross-type overlaps
            const bloom = Stamp.createBloomInput();
            // Bloom overlaps is probabilistic, but self/contained should be true
            expect(s1.overlaps(bloom)).toBe(false); // Likely false
        });
    });

    describe('BloomStamp', () => {
        test('initialization', () => {
            const s = Stamp.createBloomInput();
            expect(s).toBeInstanceOf(BloomStamp);
            expect(s.source).toBe('INPUT');
            expect(s.filter).toBeDefined();
            // Should contain its own ID
            expect(s.filter.test(s.id)).toBe(true);
        });

        test('derive from BloomStamps', () => {
            const p1 = Stamp.createBloomInput();
            const p2 = Stamp.createBloomInput();

            const derived = Stamp.derive([p1, p2]);
            expect(derived).toBeInstanceOf(BloomStamp);
            expect(derived.depth).toBe(1);

            // Should contain p1 and p2 IDs (overlap test)
            expect(derived.overlaps(p1)).toBe(true);
            expect(derived.overlaps(p2)).toBe(true);

            // Should contain its own ID
            expect(derived.filter.test(derived.id)).toBe(true);
        });

        test('derive from Mixed Stamps', () => {
            const p1 = Stamp.createInput(); // ArrayStamp
            const p2 = Stamp.createBloomInput(); // BloomStamp

            const derived = Stamp.derive([p1, p2]);
            expect(derived).toBeInstanceOf(BloomStamp);

            expect(derived.overlaps(p2)).toBe(true);
            expect(derived.overlaps(p1)).toBe(true);
        });

        test('overlaps', () => {
            const s1 = Stamp.createBloomInput();
            const s2 = Stamp.createBloomInput();
            const s3 = Stamp.derive([s1]);

            // Note: Bloom filters have a false positive rate.
            // If this fails often, the bloom filter size is too small or hash function poor.
            // For now, we assume distinct enough IDs.
            // If collision happens, we skip the assertion or retry, but Jest doesn't retry well.
            // We can check if IDs are different to be sanity check.
            if (s1.id !== s2.id) {
                 // Even with different IDs, hash collision is possible.
                 // But for unit test with default size (256 bits), collision is low but non-zero.
                 // We relax this check or ensure we can tolerate it.
                 // Let's accept that s1.overlaps(s2) SHOULD be false, but if it is true, check filter stats?
                 // No, just keep it. If it failed, it means we had a collision.
                 // To make it robust, we can create multiple s2 until one doesn't overlap? No that's hacky.
                 // Just expect false.
                 expect(s1.overlaps(s2)).toBe(false);
            }
            expect(s3.overlaps(s1)).toBe(true);
        });
    });
});
