/**
 * config.test.js — Unit tests for bot config: merge, parse, validate, profiles.
 */

import { mergeConfig, parseArgs, validateConfig } from '../../src/config.js';

describe('parseArgs', () => {
    test('returns empty object for no args', () => {
        expect(parseArgs([])).toEqual({});
    });

    test('parses --mode', () => {
        expect(parseArgs(['--mode', 'cli']).mode).toBe('cli');
    });

    test('parses --profile', () => {
        expect(parseArgs(['--profile', 'minimal']).profile).toBe('minimal');
    });

    test('parses --nick / -n', () => {
        expect(parseArgs(['--nick', 'Bot1']).nick).toBe('Bot1');
        expect(parseArgs(['-n', 'Bot2']).nick).toBe('Bot2');
    });

    test('parses --debug', () => {
        expect(parseArgs(['--debug']).debug).toBe(true);
    });

    test('warns on unknown flags', () => {
        expect(parseArgs(['--unknown-flag']).unknownFlag).toBeUndefined();
    });
});

describe('mergeConfig', () => {
    test('applies DEFAULTS when no file/CLI', () => {
        const c = mergeConfig(null, {});
        expect(c.profile).toBe('parity');
        expect(c.nick).toBe('SeNARchy');
    });

    test('applies minimal profile defaults', () => {
        const c = mergeConfig(null, { profile: 'minimal' });
        expect(c.profile).toBe('minimal');
        expect(c.loop.budget).toBe(10);
        expect(c.lm.modelName).toBe('HuggingFaceTB/SmolLM2-360M-Instruct');
        expect(c.capabilities.contextBudgets).toBe(false);
    });

    test('CLI overrides profile', () => {
        const c = mergeConfig({ profile: 'parity' }, { profile: 'minimal' });
        expect(c.profile).toBe('minimal');
    });

    test('file overrides profile defaults', () => {
        const c = mergeConfig({ loop: { budget: 20 } }, { profile: 'minimal' });
        expect(c.loop.budget).toBe(20);
    });

    test('merges capabilities from profile + file', () => {
        const c = mergeConfig({ capabilities: { customFlag: true } }, { profile: 'minimal' });
        expect(c.capabilities.contextBudgets).toBe(false);
        expect(c.capabilities.customFlag).toBe(true);
    });
});

describe('validateConfig', () => {
    test('accepts valid config', () => {
        expect(validateConfig({ profile: 'parity', nick: 'TestBot', lm: {}, loop: {} })).toHaveLength(0);
    });

    test('rejects unknown profile', () => {
        const errors = validateConfig({ profile: 'unknown' });
        expect(errors.some(e => e.includes('Unknown profile'))).toBe(true);
    });

    test('rejects bad temperature', () => {
        expect(validateConfig({ lm: { temperature: 5 } }).some(e => e.includes('temperature'))).toBe(true);
    });

    test('rejects bad budget', () => {
        expect(validateConfig({ loop: { budget: -1 } }).some(e => e.includes('budget'))).toBe(true);
    });

    test('rejects empty nick', () => {
        expect(validateConfig({ nick: '' }).some(e => e.includes('Nick'))).toBe(true);
    });
});
