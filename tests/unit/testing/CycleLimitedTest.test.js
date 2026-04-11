import {CycleLimitedTester, runCycleLimitedTest} from '@senars/nar/src/testing/CycleLimitedTest.js';

describe('Cycle-Limited Testing Framework', () => {
    test('should terminate reliably within cycle limits', async () => {
        const result = await runCycleLimitedTest(async (nar) => {
            // Add a simple task that should complete quickly
            await nar.input('<apple --> fruit>. %1.0;0.9%');
        }, 10); // 10 cycle limit

        expect(result.success).toBe(true);
        expect(result.cycleCount).toBeLessThanOrEqual(10);
    });

    test('should handle cycle completion gracefully', async () => {
        const result = await runCycleLimitedTest(async (nar) => {
            await nar.input('<bird --> animal>. %0.9;0.8%');
        }, 5); // Run for 5 cycles

        // The test should complete all cycles without hanging
        expect(result.cycleCount).toBe(5);
        expect(result.message).toContain('completed');
        expect(result.success).toBe(true);
    });

    test('should work with tester utility', async () => {
        const tester = new CycleLimitedTester(20)
            .addTask('bird --> animal', '.', 0.9, 0.8)
            .addTask('tweety --> bird', '.', 1.0, 0.9)
            .expectResult(async (nar) => {
                // Just verify the system is responsive
                return true;
            });

        const result = await tester.run();
        expect(result.success).toBe(true);
        expect(result.cycleCount).toBeLessThanOrEqual(20);
    });

    test('should handle errors gracefully', async () => {
        const result = await runCycleLimitedTest(async (nar) => {
            throw new Error('Test error');
        }, 10);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Test error');
        expect(result.message).toContain('failed with error');
    });

    test('NAL-only test should complete within limits', async () => {
        const result = await runCycleLimitedTest(async (nar) => {
            await nar.input('<cat --> animal>. %0.9;0.8%');
            await nar.input('<whiskers --> cat>. %1.0;0.9%');
        }, 15);

        expect(result.success).toBe(true);
        expect(result.cycleCount).toBeLessThanOrEqual(15);
    });
});