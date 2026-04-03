import path from 'path';
import { WorkerPool } from '../../../../../metta/src/platform/node/WorkerPool.js';

const workerScript = path.resolve(process.cwd(), 'metta/src/platform/node/metta-worker.js');

describe('Node WorkerPool', () => {
    let pool;

    afterAll(() => {
        if (pool) {
            pool.terminate();
            pool = null;
        }
    });

    test('should execute simple MeTTa code', async () => {
        pool = new WorkerPool(workerScript, 1);
        const result = await pool.execute({ code: '!(+ 1 2)' });
        expect(result).toContain('3');
    });

    test('should execute parallel tasks', async () => {
        pool = new WorkerPool(workerScript, 4);

        const tasks = [
            { code: '!(+ 1 1)' },
            { code: '!(+ 2 2)' },
            { code: '!(+ 3 3)' },
            { code: '!(+ 4 4)' }
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
        await expect(pool.execute({})).rejects.toThrow();
    });
});
