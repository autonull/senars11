/**
 * Unit Tests for Parallel Evaluation
 * 
 * NOTE: These tests are async/timing-dependent and may be unstable.
 * They are disabled by default. Run manually when needed.
 */
import { MeTTaTestUtils } from '../../../helpers/MeTTaTestUtils.js';
import { Formatter } from '../../../../metta/src/kernel/Formatter.js';
import { jest } from '@jest/globals';

describe.skip('Parallel Evaluation', () => {
    let interpreter;

    beforeEach(() => {
        interpreter = MeTTaTestUtils.createInterpreter({ loadStdlib: true });
    });

    afterEach(() => {
        if (interpreter.workerPool) interpreter.workerPool.terminate();
    });

    test('should map items in parallel using background workers', async () => {
        const code = '!(&map-parallel (1 2 3 4) $x (+ $x 1))';
        const result = await interpreter.runAsync(code);

        expect(result).toHaveLength(1);
        expect(Formatter.toHyperonString(result[0])).toBe('(2 3 4 5)');
    }, 10000);

    test('should handle nested structure', async () => {
        const code = '!(&map-parallel (1) $x (: $x (: $x ())))';
        const result = await interpreter.runAsync(code);

        expect(result).toHaveLength(1);
        expect(Formatter.toHyperonString(result[0])).toBe('((1 1))');
    }, 10000);
});
