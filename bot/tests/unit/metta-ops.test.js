/**
 * metta-ops.test.js — Unit tests for new grounded ops via MeTTaInterpreter.
 */

import { MeTTaInterpreter } from '@senars/metta/MeTTaInterpreter.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = join(tmpdir(), `metta-ops-${Date.now()}`);
let interp;

beforeAll(async () => {
  interp = new MeTTaInterpreter();
  await mkdir(tmp, { recursive: true });
}, 10000);

afterAll(async () => {
    rmSync(tmp, { recursive: true, force: true });
});

describe('&sread', () => {
    test('parses valid s-expression', async () => {
        const results = await interp.evaluateAsync(interp.parser.parse('(^ &sread "(+ 1 2)")'));
        expect(results.length).toBeGreaterThan(0);
    });

    test('returns False for empty string', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &sread "")'));
        expect(result.some(r => r.name === 'False')).toBe(true);
    });

    test('returns atom for unparseable input', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &sread "not an s-expr")'));
        expect(result.length).toBeGreaterThan(0);
    });
});

describe('&balance-parens', () => {
    test('adds missing parens', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &balance-parens "(+ 1 2")'));
        expect(result.some(r => r.name === '(+ 1 2)')).toBe(true);
    });

    test('leaves balanced alone', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &balance-parens "(+ 1 2)")'));
        expect(result.some(r => r.name === '(+ 1 2)')).toBe(true);
    });
});

describe('&fs-write / &fs-read', () => {
    test('round-trip', async () => {
        const path = join(tmp, 'test.txt');
        await interp.evaluateAsync(interp.parser.parse(`(^ &fs-write "${path}" "hello world")`));
        const result = await interp.evaluateAsync(interp.parser.parse(`(^ &fs-read "${path}")`));
        expect(result.some(r => r.name === 'hello world')).toBe(true);
    });
});

describe('&fs-append', () => {
    test('appends to file', async () => {
        const path = join(tmp, 'append.txt');
        await interp.evaluateAsync(interp.parser.parse(`(^ &fs-write "${path}" "hello")`));
        await interp.evaluateAsync(interp.parser.parse(`(^ &fs-append "${path}" " world")`));
        const result = await interp.evaluateAsync(interp.parser.parse(`(^ &fs-read "${path}")`));
        expect(result.some(r => r.name === 'hello world')).toBe(true);
    });
});

describe('&fs-read missing file', () => {
    test('throws ENOENT', async () => {
        await expect(interp.evaluateAsync(interp.parser.parse('(^ &fs-read "/nonexistent/file.txt")'))).rejects.toThrow(/ENOENT|no such file/);
    });
});

describe('&fs-read-last', () => {
    test('reads last N chars', async () => {
        const path = join(tmp, 'last.txt');
        await writeFile(path, 'abcdefghij');
        const result = await interp.evaluateAsync(interp.parser.parse(`(^ &fs-read-last "${path}" 3)`));
        expect(result.some(r => r.name === 'hij')).toBe(true);
    });

    test('returns full file if N > size', async () => {
        const path = join(tmp, 'last2.txt');
        await writeFile(path, 'abc');
        const result = await interp.evaluateAsync(interp.parser.parse(`(^ &fs-read-last "${path}" 100)`));
        expect(result.some(r => r.name === 'abc')).toBe(true);
    });
});

describe('&shell', () => {
    test('executes simple command', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &shell "echo hello")'));
        expect(result.some(r => r.name === 'hello')).toBe(true);
    });
});

describe('&time', () => {
    test('returns numeric timestamp', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &time)'));
        const ts = parseInt(result[0]?.name ?? '0', 10);
        expect(ts).toBeGreaterThan(1e12);
    });
});

describe('&time-str', () => {
    test('returns ISO string', async () => {
        const result = await interp.evaluateAsync(interp.parser.parse('(^ &time-str)'));
        const s = result[0]?.name ?? '';
        expect(s.includes('T') && s.includes('Z')).toBe(true);
    });
});
