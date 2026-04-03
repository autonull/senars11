import { describe, expect, test, beforeEach } from '@jest/globals';
import {TermFactory, Truth, Stamp, ArrayStamp, BloomStamp} from '@senars/nar';

describe('Phase 1: Immutable Core Verification', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    describe('1.1 Canonical Foundation (Term Immutable Canonicalization)', () => {
        test('Terms must be interned (O(1) structural equality)', () => {
            const t1 = termFactory.create('cat');
            const t2 = termFactory.create('cat');
            expect(t1).toBe(t2); // Strict reference equality

            const c1 = termFactory.inheritance(t1, termFactory.create('animal'));
            const c2 = termFactory.inheritance(t1, termFactory.create('animal'));
            expect(c1).toBe(c2);
        });

        test('Terms must be immutable', () => {
            const t = termFactory.create('dog');
            expect(Object.isFrozen(t)).toBe(true);
            expect(() => { t.name = 'cat'; }).toThrow();
            expect(Object.isFrozen(t.components)).toBe(true);
        });
    });

    describe('1.1 Truth-Value Semantics', () => {
        test('Truth revision must follow NAL spec', () => {
            // Re-verify the example from NAL spec if possible, or use standard calculation
            // NAL: w = c/(1-c)
            // t1: (0.9, 0.9) -> w1 = 9
            // t2: (0.5, 0.5) -> w2 = 1
            // w = 10
            // f = (9*0.9 + 1*0.5) / 10 = (8.1 + 0.5)/10 = 0.86
            // c = 10/11 = 0.9090...

            const t1 = new Truth(0.9, 0.9);
            const t2 = new Truth(0.5, 0.5);
            const res = Truth.revision(t1, t2);

            expect(res.frequency).toBeCloseTo(0.86);
            expect(res.confidence).toBeCloseTo(10/11);
        });

        test('Truth choice must follow expectation', () => {
            // t1: (0.9, 0.9) -> e = 0.9 * (0.9 - 0.5) + 0.5 = 0.9 * 0.4 + 0.5 = 0.36 + 0.5 = 0.86
            // t2: (0.5, 0.9) -> e = 0.9 * (0.5 - 0.5) + 0.5 = 0.5
            const t1 = new Truth(0.9, 0.9);
            const t2 = new Truth(0.5, 0.9);

            expect(Truth.choice(t1, t2)).toBe(t1);
        });

        test('Truth objects must be immutable', () => {
            const t = new Truth(0.5, 0.5);
            expect(Object.isFrozen(t)).toBe(true);
        });
    });

    describe('1.1 Stamp Lineage', () => {
        test('Stamp must detect circular reasoning (overlap)', () => {
            const s1 = Stamp.createInput();
            const s2 = Stamp.createInput();

            const sDerived1 = Stamp.derive([s1]);
            const sDerived2 = Stamp.derive([s2]);

            expect(sDerived1.overlaps(s1)).toBe(true);
            expect(sDerived2.overlaps(s2)).toBe(true);
            expect(sDerived1.overlaps(s2)).toBe(false);

            const sMerge = Stamp.derive([sDerived1, sDerived2]);
            expect(sMerge.overlaps(s1)).toBe(true);
            expect(sMerge.overlaps(s2)).toBe(true);
        });

        test('Stamp must be immutable', () => {
            const s = Stamp.createInput();
            expect(Object.isFrozen(s)).toBe(true);
            if (s instanceof ArrayStamp) {
                 expect(Object.isFrozen(s.derivations)).toBe(true);
            }
        });

        test('Stamp should transition to BloomStamp when depth exceeds threshold', () => {
             // Threshold is 20 in Stamp.js
             let stamps = [Stamp.createInput()];
             for(let i=0; i<25; i++) {
                 stamps = [Stamp.derive(stamps)];
             }
             const deepStamp = stamps[0];
             expect(deepStamp instanceof BloomStamp).toBe(true);
             expect(deepStamp.depth).toBeGreaterThan(20);
        });
    });
});
