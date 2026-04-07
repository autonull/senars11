/**
 * Bot Config Unit Tests
 *
 * Tests for config loading, merging, CLI parsing, and embodiment resolution.
 */

import { describe, it, expect } from '@jest/globals';
import { mergeConfig, parseArgs, DEFAULTS } from '../../src/config.js';

describe('Bot Config', () => {
    describe('DEFAULTS', () => {
        it('has sensible defaults', () => {
            expect(DEFAULTS.mode).toBe('irc');
            expect(DEFAULTS.nick).toBe('SeNARchy');
            expect(DEFAULTS.profile).toBe('parity');
            expect(DEFAULTS.provider).toBe('transformers');
            expect(DEFAULTS.loop.budget).toBe(50);
            expect(DEFAULTS.loop.sleepMs).toBe(2000);
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
            const args = ['--provider', 'openai'];
            const result = parseArgs(args);
            expect(result.provider).toBe('openai');
        });

        it('parses --multi flag', () => {
            const args = ['--multi'];
            const result = parseArgs(args);
            expect(result.multi).toBe(true);
        });

        it('parses OpenAI endpoint', () => {
            const args = ['--openai-base-url', 'http://localhost:8080', '--openai-api-key', 'sk-test'];
            const result = parseArgs(args);
            expect(result.openaiBaseURL).toBe('http://localhost:8080');
            expect(result.openaiApiKey).toBe('sk-test');
        });

        it('handles short flags', () => {
            const args = ['-n', 'Bot', '-c', '#test', '-m', 'gpt-4'];
            const result = parseArgs(args);
            expect(result.nick).toBe('Bot');
            expect(result.channel).toBe('#test');
            expect(result.model).toBe('gpt-4');
        });
    });

    describe('mergeConfig()', () => {
        it('uses defaults when no config provided', () => {
            const result = mergeConfig(null, {});
            expect(result.profile).toBe('parity');
            expect(result.nick).toBe('SeNARchy');
            expect(result.embodiments.irc.enabled).toBe(true);
            expect(result.embodiments.cli.enabled).toBe(false);
        });

        it('CLI flags override defaults', () => {
            const result = mergeConfig(null, { mode: 'cli', nick: 'TestBot', profile: 'minimal' });
            expect(result.mode).toBe('cli');
            expect(result.nick).toBe('TestBot');
            expect(result.profile).toBe('minimal');
            expect(result.embodiments.cli.enabled).toBe(true);
            expect(result.embodiments.irc.enabled).toBe(false);
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
            expect(result.mode).toBe('demo');
            expect(result.profile).toBe('evolved');
        });

        it('builds embodiments from mode', () => {
            const result = mergeConfig(null, { mode: 'demo' });
            expect(result.embodiments.demo.enabled).toBe(true);
            expect(result.embodiments.irc.enabled).toBe(false);
            expect(result.embodiments.cli.enabled).toBe(false);
        });

        it('uses file config embodiments when present', () => {
            const fileConfig = {
                embodiments: {
                    irc: { enabled: true, host: 'irc.example.com' },
                    cli: { enabled: true },
                }
            };
            const result = mergeConfig(fileConfig, { mode: 'irc' });
            expect(result.embodiments.irc.enabled).toBe(true);
            expect(result.embodiments.irc.host).toBe('irc.example.com');
            expect(result.embodiments.cli.enabled).toBe(true);
        });

        it('detects openai provider from openaiBaseURL', () => {
            const result = mergeConfig(null, { openaiBaseURL: 'http://localhost:8080' });
            expect(result.provider).toBe('openai');
        });

        it('respects explicit provider when no OpenAI endpoint', () => {
            const result = mergeConfig(null, { provider: 'ollama' });
            expect(result.provider).toBe('ollama');
        });

        it('handles legacy bot.nick structure', () => {
            const fileConfig = { bot: { nick: 'LegacyBot' } };
            const result = mergeConfig(fileConfig, {});
            expect(result.nick).toBe('LegacyBot');
        });

        it('handles legacy irc.host structure', () => {
            const fileConfig = { irc: { host: 'irc.old.com', port: 6669 } };
            const result = mergeConfig(fileConfig, {});
            expect(result.host).toBe('irc.old.com');
            expect(result.port).toBe(6669);
        });
    });
});
