import {TestNAR} from '@senars/core/src/testing/TestNAR';

describe('Post-Mortem Analysis', () => {
    test('should allow inspection of focus buffer', async () => {
        await new TestNAR()
            .input('(a ==> b)', 1.0, 0.9)
            .run(1)
            .inspect((nar, tasks) => {
                expect(nar).toBeDefined();
                expect(nar._focus).toBeDefined();

                expect(tasks).toBeDefined();
                expect(Array.isArray(tasks)).toBe(true);
                expect(tasks.length).toBeGreaterThan(0);

                // Note: (a ==> b) is parsed as (==>, a, b)
                const hasInputTask = tasks.some(t => t.term.toString().includes('(==>, a, b)'));
                expect(hasInputTask).toBe(true);

                if (nar.memory) {
                    const concepts = nar.memory.getAllConcepts();
                    expect(concepts.length).toBeGreaterThan(0);
                }
            })
            .execute();
    });

    test('should fail test if inspection callback throws', async () => {
        const testPromise = new TestNAR()
            .input('(a ==> b)', 1.0, 0.9)
            .run(1)
            .inspect(() => {
                throw new Error('Custom inspection error');
            })
            .execute();

        await expect(testPromise).rejects.toThrow('Inspection failed: Custom inspection error');
    });
});
