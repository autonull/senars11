/**
 * @jest-environment jsdom
 */
if (typeof window !== 'undefined') {
    window.URL = window.URL || {};
    window.URL.createObjectURL = window.URL.createObjectURL || function() { return 'mock-url'; };
    window.URL.revokeObjectURL = window.URL.revokeObjectURL || function() {};
}

import { describe, test, expect, afterEach, afterAll } from '@jest/globals';
import {Knowledge, TruthValueUtils} from '../../../agent/src/know/Knowledge.js';
// Skip DataTableKnowledge tests due to danfojs ESM compatibility issues with Jest
// import {DataTableKnowledge} from '../../../agent/src/know/DataTableKnowledge.js';

describe('Knowledge System', () => {
    describe('TruthValueUtils', () => {
        test.each([
            [50, 0.5], [0, 0], [100, 1], [-10, 0], [110, 1]
        ])('normalizeMetric(%i) -> %f', (val, expected) => {
            expect(TruthValueUtils.normalizeMetric(val, 0, 100)).toBe(expected);
        });

        test('metric -> frequency/confidence', () => {
            expect(TruthValueUtils.calculateFrequencyFromMetric(75, 0, 100)).toBe(0.75);
            expect(TruthValueUtils.calculateConfidenceFromMetric(50, 0, 100)).toBe(0.5);
        });

        test('createTruthValue', () => {
            expect(TruthValueUtils.createTruthValue(0.75, 0.9)).toBe('%0.75;0.90%');
        });
    });

    // Skip DataTableKnowledge tests due to danfojs ESM compatibility issues
    // These tests require a full ESM-compatible test environment
    describe.skip('DataTableKnowledge', () => {
        test('basic data handling', async () => {
            const knowledge = new DataTableKnowledge([
                {name: 'test1', value: 100},
                {name: 'test2', value: 200}
            ]);

            expect(await knowledge.getItems()).toHaveLength(2);
            expect(await knowledge.getSummary()).toMatchObject({rowCount: 2, columnCount: 2});
        });

        test('generate tasks', async () => {
            const knowledge = new DataTableKnowledge([
                {id: 'item1', value: 50},
                {id: 'item2', value: 75}
            ]);

            expect(await knowledge.toTasks()).toHaveLength(2);
        });
    });

    describe('Abstract Knowledge Class', () => {
        test('instantiation throws', () => {
            expect(() => new Knowledge()).toThrow('Cannot instantiate abstract class Knowledge');
        });
    });
});
