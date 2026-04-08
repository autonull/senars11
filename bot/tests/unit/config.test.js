/**
 * Bot Config Unit Tests
 *
 * Tests for config loading, merging, CLI parsing, embodiment resolution,
 * and validation.
 */

import { describe, it, expect } from '@jest/globals';
import { mergeConfig, parseArgs, validateConfig, DEFAULTS } from '../../src/config.js';

describe('Bot Config', () => {
    describe('DEFAULTS', () => {
        it('has sensible defaults', () => {
            expect(DEFAULTS.profile).toBe('parity');
            expect(DEFAULTS.nick).toBe('SeNARchy');
            expect(DEFAULTS.lm.provider).toBe('transformers');
            expect(DEFAULTS.loop.budget).toBe(50);
            expect(DEFAULTS.loop.sleepMs).toBe(2000);
            expect(DEFAULTS.embodiments.irc.enabled).toBe(false);
        });
    });

    describe('parseArgs()', () => {
        it('parses basic flags', () => {
            const args = ['--mode', 'cli', '--nick', 'TestBot'];
            const result = parseArgs(args);
            expect(result.mode).toBe('cli');
            expect(result.nick).toBe('TestBot');
        });

        it('parses --provider flag', () => {
            const result = parseArgs(['--provider', 'openai']);
            expect(result.provider).toBe('openai');
        });

        it('parses --multi flag', () => {
            const result = parseArgs(['--multi']);
            expect(result.multi).toBe(true);
        });

        it('parses OpenAI endpoint', () => {
            const result = parseArgs(['--openai-base-url', 'http://localhost:8080', '--openai-api-key', 'sk-test']);
            expect(result.openaiBaseURL).toBe('http://localhost:8080');
            expect(result.openaiApiKey).toBe('sk-test');
        });

        it('handles short flags', () => {
            const result = parseArgs(['-n', 'Bot', '-c', '#test', '-m', 'gpt-4']);
            expect(result.nick).toBe('Bot');
            expect(result.channel).toBe('#test');
            expect(result.model).toBe('gpt-4');
        });

        it('warns on unknown flags but continues', () => {
            const result = parseArgs(['--mood', 'happy', '--mode', 'cli']);
            expect(result.mode).toBe('cli');
            expect(result.mood).toBeUndefined();
        });
    });

    describe('mergeConfig()', () => {
        it('uses defaults when no config provided', () => {
            const result = mergeConfig(null, {});
            expect(result.profile).toBe('parity');
            expect(result.nick).toBe('SeNARchy');
            expect(result.embodiments.irc.enabled).toBe(false);
        });

        it('CLI mode flag enables the correct embodiment', () => {
            const result = mergeConfig(null, { mode: 'cli' });
            expect(result.embodiments.cli.enabled).toBe(true);
            expect(result.embodiments.irc.enabled).toBe(false);
            expect(result.embodiments.demo.enabled).toBe(false);
        });

        it('CLI flags override defaults', () => {
            const result = mergeConfig(null, { nick: 'TestBot', profile: 'minimal' });
            expect(result.nick).toBe('TestBot');
            expect(result.profile).toBe('minimal');
        });

        it('file config overrides defaults', () => {
            const fileConfig = {
                nick: 'FileBot',
                profile: 'evolved',
                loop: { budget: 100, sleepMs: 5000 },
            };
            const result = mergeConfig(fileConfig, {});
            expect(result.nick).toBe('FileBot');
            expect(result.profile).toBe('evolved');
            expect(result.loop.budget).toBe(100);
            expect(result.loop.sleepMs).toBe(5000);
        });

        it('CLI wins over file config', () => {
            const fileConfig = { nick: 'FileBot', profile: 'evolved' };
            const cli = { nick: 'CLIBot', mode: 'demo' };
            const result = mergeConfig(fileConfig, cli);
            expect(result.nick).toBe('CLIBot');
            expect(result.embodiments.demo.enabled).toBe(true);
            expect(result.profile).toBe('evolved');
        });

        it('uses file config embodiments when present', () => {
            const fileConfig = {
                embodiments: {
                    irc: { enabled: true, host: 'irc.example.com' },
                    cli: { enabled: true },
                }
            };
            const result = mergeConfig(fileConfig, {});
            expect(result.embodiments.irc.enabled).toBe(true);
            expect(result.embodiments.irc.host).toBe('irc.example.com');
            expect(result.embodiments.cli.enabled).toBe(true);
        });

        it('detects openai provider from openaiBaseURL', () => {
            const result = mergeConfig(null, { openaiBaseURL: 'http://localhost:8080' });
            expect(result.provider).toBe('openai');
        });

        it('respects explicit provider', () => {
            const result = mergeConfig(null, { provider: 'ollama' });
            expect(result.provider).toBe('ollama');
        });

        it('normalizes legacy bot.nick shape', () => {
            const fileConfig = { bot: { nick: 'LegacyBot' } };
            const result = mergeConfig(fileConfig, {});
            expect(result.nick).toBe('LegacyBot');
        });

        it('normalizes legacy irc.host shape', () => {
            const fileConfig = { irc: { host: 'irc.old.com', port: 6669 } };
            const result = mergeConfig(fileConfig, {});
            expect(result.embodiments.irc.host).toBe('irc.old.com');
            expect(result.embodiments.irc.port).toBe(6669);
            expect(result.embodiments.irc.enabled).toBe(true);
        });

        it('--multi enables all embodiments', () => {
            const result = mergeConfig(null, { mode: 'irc', multi: true });
            expect(result.embodiments.irc.enabled).toBe(true);
            expect(result.embodiments.cli.enabled).toBe(true);
            expect(result.embodiments.demo.enabled).toBe(true);
        });

        it('--multi enables all embodiments from file config', () => {
            const fileConfig = {
                embodiments: { irc: { enabled: true }, cli: { enabled: false }, demo: { enabled: false } }
            };
            const result = mergeConfig(fileConfig, { multi: true });
            expect(result.embodiments.irc.enabled).toBe(true);
            expect(result.embodiments.cli.enabled).toBe(true);
            expect(result.embodiments.demo.enabled).toBe(true);
        });
    });

    describe('validateConfig()', () => {
        it('passes valid config', () => {
            const result = mergeConfig(null, {});
            const errors = validateConfig(result);
            expect(errors).toEqual([]);
        });

        it('rejects unknown profile', () => {
            const errors = validateConfig({ profile: 'super-full' });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('Unknown profile');
        });

        it('rejects unknown provider', () => {
            const errors = validateConfig({ provider: 'anthropic' });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('Unknown provider');
        });

        it('rejects invalid temperature', () => {
            const errors = validateConfig({ lm: { temperature: 5 } });
            expect(errors.some(e => e.includes('temperature'))).toBe(true);
        });

        it('rejects invalid loop budget', () => {
            const errors = validateConfig({ loop: { budget: -1 } });
            expect(errors.some(e => e.includes('budget'))).toBe(true);
        });

        it('rejects non-integer sleepMs', () => {
            const errors = validateConfig({ loop: { sleepMs: 1.5 } });
            expect(errors.some(e => e.includes('sleepMs'))).toBe(true);
        });

        it('rejects non-string nick', () => {
            const errors = validateConfig({ nick: 42 });
            expect(errors.some(e => e.includes('Nick'))).toBe(true);
        });
    });
});
