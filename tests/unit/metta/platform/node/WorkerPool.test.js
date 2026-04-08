import { WorkerPool } from '../../../../../metta/src/platform/node/WorkerPool.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

// Workaround for Jest VM environment
const __filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerScript = path.resolve(__dirname, '../../../../../metta/src/platform/node/metta-worker.js');

describe('Node WorkerPool', () => {
    let pool;

    afterEach(() => {
        if (pool) {
            pool.terminate();
            pool = null;
        }
    });

    test('should execute simple MeTTa code', async () => {
        pool = new WorkerPool(workerScript, 2);

        // !(+ 1 2) returns [3] (eval result)
        const result = await pool.execute({ code: '!(+ 1 2)' });

        // Check string output
        expect(result).toContain('3');
    });

    test('should execute parallel tasks', async () => {
        pool = new WorkerPool(workerScript, 4);

        const tasks = [
            { code: '!(+ 1 1)' }, // 2
            { code: '!(+ 2 2)' }, // 4
            { code: '!(+ 3 3)' }, // 6
            { code: '!(+ 4 4)' }  // 8
        ];

        const results = await Promise.all(tasks.map(t => pool.execute(t)));

        expect(results).toHaveLength(4);
        expect(results[0]).toContain('2');
        expect(results[1]).toContain('4');
        expect(results[2]).toContain('6');
        expect(results[3]).toContain('8');
    });

    test('should handle helper mapParallel method', async () => {
        pool = new WorkerPool(workerScript, 2);

        const items = [1, 2, 3, 4];
        const results = await pool.mapParallel(items, (item) => ({
            code: `!(* ${item} 10)`
        }));

        expect(results).toHaveLength(4);
        expect(results[0]).toContain('10');
        expect(results[1]).toContain('20');
        expect(results[2]).toContain('30');
        expect(results[3]).toContain('40');
    });

    test('should handle errors in worker', async () => {
        pool = new WorkerPool(workerScript, 1);

        // Syntax error or runtime error
        // (foo is not defined) triggers error if strict? Or just symbolic.
        // Let's force an error by sending invalid task structure or internal error
        // But interpreter usually doesn't crash.
        // Let's invoke something that calls throw?
        // MeTTa interpreter might not expose `throw`.

        // If we send a task without 'code', metta-worker might crash attempting to run(undefined)
        // interpreter.run(undefined) -> parser.parseProgram(undefined) -> crash potentially

        await expect(pool.execute({})).rejects.toThrow();
    });
});
