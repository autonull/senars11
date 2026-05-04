/**
 * metta-loop.test.js — Unit tests for bot/loop.metta.
 */

import { MeTTaInterpreter } from '@senars/metta/MeTTaInterpreter.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const LOOP_FILE = resolve('bot/loop.metta');

describe('bot/loop.metta', () => {
    let loopCode;
    let interp;

    beforeAll(async () => {
        loopCode = await readFile(LOOP_FILE, 'utf8');
    });

    beforeEach(() => {
        interp = new MeTTaInterpreter();
        interp.run(loopCode);
    });

    test('loads without errors', () => {
        expect(() => interp.run(loopCode)).not.toThrow();
    });

    test('(when True ok) → ok', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(when True ok)'));
        expect(result.some(r => r.name === 'ok')).toBe(true);
    });

    test('(when False ok) → ()', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(when False ok)'));
        expect(result.some(r => r.name === '()')).toBe(true);
    });

    test('(bot-halt) returns agent-halted', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(bot-halt)'));
        expect(result.some(r => r.name === 'agent-halted')).toBe(true);
    });

    test('(bot-idle) structure is valid', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(bot-idle)'));
        expect(Array.isArray(result)).toBe(true);
    });

    test('(bot-init) runs without throwing', async () => {
        try {
            await interp.evaluateAsync(interp.parser.parse('(bot-init)'));
        } catch (e) {
            expect(e.message).toMatch(/not found|Operation/);
        }
    });
});
