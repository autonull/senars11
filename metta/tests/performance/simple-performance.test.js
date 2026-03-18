/**
 * Simple Performance Tests
 */

import { MeTTaInterpreter } from '../../src/MeTTaInterpreter.js';

describe('Simple Performance', () => {
    let interpreter;

    beforeEach(() => {
        interpreter = new MeTTaInterpreter({ loadStdlib: false });
    });

    test('basic arithmetic speed', () => {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            interpreter.run(`(^ &+ ${i} 1)`);
        }
        const end = performance.now();
        expect(end - start).toBeLessThan(1000);
    });
});
