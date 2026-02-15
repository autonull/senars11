/**
 * @file tests/unit/core/test-truth.unit.test.js
 * @description Unit tests for Truth class using real objects with minimal mocks
 */

// Third-party imports
// (none in this file)

// Local imports
import { TRUTH } from '../../../src/config/constants.js';
import { Truth } from '../../../src/Truth.js';

// Test helper imports
// (none in this file - would be added if we used test helpers)

describe('Truth Class - Unit Tests with Real Objects', () => {
    test('should create Truth instance with default values when no parameters provided', () => {
        const truth = new Truth();

        expect(truth).toBeInstanceOf(Truth);
        expect(truth.frequency).toBe(TRUTH.DEFAULT_FREQUENCY);
        expect(truth.confidence).toBe(TRUTH.DEFAULT_CONFIDENCE);
        expect(truth.f).toBe(TRUTH.DEFAULT_FREQUENCY);
        expect(truth.c).toBe(TRUTH.DEFAULT_CONFIDENCE);
    });

    test('should create Truth instance with specified frequency and confidence', () => {
        const [frequency, confidence] = [0.8, 0.9];
        const truth = new Truth(frequency, confidence);

        expect(truth).toMatchObject({ frequency, confidence, f: frequency, c: confidence });
    });

    test('should clamp frequency and confidence values to valid range [0, 1]', () => {
        // Test with values outside the valid range
        const [truthLow, truthHigh] = [new Truth(-0.5, -0.2), new Truth(1.5, 1.8)];

        expect(truthLow).toMatchObject({ frequency: 0, confidence: 0 });
        expect(truthHigh).toMatchObject({ frequency: 1, confidence: 1 });
    });

    test('should handle NaN values by using default values', () => {
        const truthNaN = new Truth(NaN, NaN);

        expect(truthNaN).toMatchObject({
            frequency: TRUTH.DEFAULT_FREQUENCY,
            confidence: TRUTH.DEFAULT_CONFIDENCE
        });
    });

    test('should create frozen object that cannot be modified', () => {
        const truth = new Truth(0.7, 0.8);

        // Verify the object is frozen
        expect(Object.isFrozen(truth)).toBe(true);

        // Store original values
        const { frequency: originalFrequency, confidence: originalConfidence } = truth;

        // Attempt to modify the object in strict mode context
        expect(() => {
            'use strict';
            truth.frequency = 0.9;
        }).toThrow();

        // Values should remain unchanged
        expect({ frequency: truth.frequency, confidence: truth.confidence })
            .toMatchObject({ frequency: originalFrequency, confidence: originalConfidence });
    });

    test('should correctly use deduction operation with real Truth objects', () => {
        const [truth1, truth2] = [new Truth(0.8, 0.9), new Truth(0.7, 0.6)];
        const result = Truth.deduction(truth1, truth2);
        const [expectedFreq, expectedConf] = [0.8 * 0.7, 0.9 * 0.6]; // 0.56, 0.54

        expect(result).toBeInstanceOf(Truth);
        expect(result).toMatchObject({ frequency: expectedFreq, confidence: expectedConf });
    });

    test('should correctly use induction operation with real Truth objects', () => {
        const [truth1, truth2] = [new Truth(0.8, 0.9), new Truth(0.7, 0.6)];
        const result = Truth.induction(truth1, truth2);

        expect(result).toBeInstanceOf(Truth);
        expect(result).toMatchObject({ frequency: 0.7, confidence: 0.9 * 0.6 });
    });

    test('should handle null/undefined inputs gracefully in operations', () => {
        const truth1 = new Truth(0.8, 0.9);

        // Test with null and undefined using array destructuring
        const [resultNull, resultUndefined] = [
            Truth.deduction(truth1, null),
            Truth.induction(undefined, truth1)
        ];

        expect([resultNull, resultUndefined]).toEqual([null, null]);
    });

    test('should correctly compute expectation value', () => {
        const truth = new Truth(0.8, 0.7);
        const expectation = Truth.expectation(truth);

        expect(expectation).toBe(0.8 * 0.7); // 0.56
    });

    test('should provide correct string representation', () => {
        const truth = new Truth(0.75, 0.85);
        const str = truth.toString();

        // The exact format depends on the precision constant in constants
        expect(str).toMatch(/^%[0-9.]+;[0-9.]+%$/);
    });

    test('should compare truth objects correctly using equals method', () => {
        const [truth1, truth2, truth3] = [
            new Truth(0.7, 0.8),
            new Truth(0.7, 0.8),
            new Truth(0.8, 0.8)
        ];

        expect([
            truth1.equals(truth2),
            truth1.equals(truth3),
            truth1.equals("not a truth object")
        ]).toEqual([true, false, false]);
    });

    test('should determine stronger truth using expectation comparison', () => {
        const [truth1, truth2] = [new Truth(0.8, 0.5), new Truth(0.6, 0.7)]; // expectations: 0.4, 0.42

        expect([
            Truth.isStronger(truth2, truth1),
            Truth.isStronger(truth1, truth2)
        ]).toEqual([true, false]);
    });
});