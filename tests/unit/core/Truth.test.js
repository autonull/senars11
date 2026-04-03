import {TRUTH_DEFAULTS, TRUTH_THRESHOLDS, Truth} from '@senars/nar';

describe('Truth', () => {
    test('initialization', () => {
        expect(new Truth()).toMatchObject({_frequency: TRUTH_DEFAULTS.NEUTRAL_FREQUENCY, _confidence: TRUTH_DEFAULTS.DEFAULT_CONFIDENCE});
        expect(new Truth(0.8, 0.9)).toMatchObject({_frequency: 0.8, _confidence: 0.9});
        expect(new Truth(-0.5, 1.5)).toMatchObject({_frequency: 0, _confidence: 1});
        expect(new Truth(NaN, NaN)).toMatchObject({
            _frequency: TRUTH_DEFAULTS.NEUTRAL_FREQUENCY,
            _confidence: TRUTH_DEFAULTS.DEFAULT_CONFIDENCE
        });
    });

    test('immutability', () => {
        const t = new Truth(0.7, 0.8);
        expect(Object.isFrozen(t)).toBe(true);
        expect(() => t.frequency = 0.9).toThrow();
    });

    const [t1, t2] = [new Truth(0.8, 0.9), new Truth(0.7, 0.6)];

    test.each([
        ['deduction', t1, t2, 0.8 * 0.7, 0.9 * 0.6],
        // Induction: w = f2*c1*c2 = 0.7*0.9*0.6 = 0.378; c = 0.378/1.378 = 0.2743
        ['induction', t1, t2, 0.7, (0.7 * 0.9 * 0.6) / (0.7 * 0.9 * 0.6 + 1)],
        // Abduction: w = f1*c1*c2 = 0.8*0.9*0.6 = 0.432; c = 0.432/1.432 = 0.3016
        ['abduction', t1, t2, 0.8, (0.8 * 0.9 * 0.6) / (0.8 * 0.9 * 0.6 + 1)],
        ['detachment', t1, t2, 0.7, 0.8 * 0.9 * 0.6],
        ['analogy', t1, t2, 0.8 * 0.7, 0.9 * 0.6 * 0.7],
        ['resemblance', t1, t2, (0.8 + 0.7) / 2, 0.9 * 0.6]
    ])('operation: %s', (op, a, b, f, c) => {
        expect(Truth[op](a, b)).toMatchObject({frequency: f, confidence: c});
    });

    test('revision', () => {
        const tRev = Truth.revision(t1, t2);
        // NAL Revision:
        // w1 = 0.9/(1-0.9) = 9
        // w2 = 0.6/(1-0.6) = 1.5
        // w = 10.5
        // f = (9*0.8 + 1.5*0.7)/10.5 = 8.25/10.5 ≈ 0.7857
        // c = 10.5/11.5 ≈ 0.9130
        const w1 = 0.9 / (1 - 0.9);
        const w2 = 0.6 / (1 - 0.6);
        const w = w1 + w2;
        const expectedF = (w1 * 0.8 + w2 * 0.7) / w;
        const expectedC = w / (w + 1);

        expect(tRev.frequency).toBeCloseTo(expectedF);
        expect(tRev.confidence).toBeCloseTo(expectedC);

        // Identity checks
        expect(Truth.revision(t1, t1)).toBe(t1);
        expect(Truth.revision(t1, null)).toBe(t1);
    });

    test('negation', () => {
        expect(Truth.negation(t1)).toMatchObject({frequency: 1 - 0.8, confidence: 0.9});
    });

    test('conversion', () => {
        expect(Truth.conversion(t1)).toMatchObject({frequency: 0.8, confidence: 0.8 * 0.9});
    });

    test('comparison', () => {
        const comp = Truth.comparison(t1, t2);
        const fProd = 0.8 * 0.7;
        const denom = fProd + (1 - 0.8) * (1 - 0.7);
        expect(comp.frequency).toBeCloseTo(fProd / denom);
        expect(comp.confidence).toBe(0.9 * 0.6);
    });

    test('contraposition', () => {
        const contra = Truth.contraposition(t1, t2);
        const n1 = 0.7 * (1 - 0.8);
        const d1 = n1 + (1 - 0.7) * 0.8;
        expect(contra.frequency).toBeCloseTo(n1 / d1);
        expect(contra.confidence).toBe(0.9 * 0.6);
    });

    test('expectation', () => {
        // e = c * (f - 0.5) + 0.5
        // 0.9 * (0.8 - 0.5) + 0.5 = 0.9 * 0.3 + 0.5 = 0.77
        expect(Truth.expectation(t1)).toBeCloseTo(0.77);
        expect(Truth.expectation(null)).toBe(0.5); // Default expectation is 0.5
    });

    test('choice', () => {
        const tWeak = new Truth(0.8, 0.1);
        const tStrong = new Truth(0.8, 0.9);

        // tStrong should have higher expectation
        expect(Truth.expectation(tStrong)).toBeGreaterThan(Truth.expectation(tWeak));

        const chosen = Truth.choice(tWeak, tStrong);
        expect(chosen).toBe(tStrong);

        expect(Truth.choice(tStrong, null)).toBe(tStrong);
        expect(Truth.choice(null, tWeak)).toBe(tWeak);
    });

    test('isStronger', () => {
        expect(Truth.isStronger(t1, t2)).toBe(true);
    });

    test('equality', () => {
        expect(t1.equals(new Truth(0.8, 0.9))).toBe(true);
        expect(t1.equals(t2)).toBe(false);
    });

    test('toString', () => {
        expect(t1.toString()).toMatch(/^%[0-9.]+;[0-9.]+%$/);
    });
});
