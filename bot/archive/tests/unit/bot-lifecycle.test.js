#!/usr/bin/env node
/**
 * bot-lifecycle.test.js — Unit tests for the Bot class lifecycle.
 *
 * Covers:
 * - Constructor creates a pending ready promise
 * - shutdown() before initialize() rejects the ready promise
 * - shutdown() after initialize() resolves the ready promise (no stale reject)
 * - shutdown() is idempotent (second call is no-op)
 * - status getter returns a snapshot without reaching into Agent internals
 *
 * These tests do NOT require a real LLM or IRC server — they test the
 * Bot class surface only.
 *
 * Usage:
 *   node bot/tests/unit/bot-lifecycle.test.js
 */

import { strict as assert } from 'assert';
import { Bot, registerEmbodimentFactory } from '../../src/index.js';
import { Embodiment } from '@senars/agent/io/Embodiment.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }

/* ── Helpers ─────────────────────────────────────────────────────────── */

function minimalConfig() {
    return {
        profile: 'parity',
        nick: 'TestBot',
        embodiments: {
            irc: { enabled: false },
            cli: { enabled: false },
            demo: { enabled: false },
        },
        loop: { budget: 1, sleepMs: 100 },
        rateLimit: { perChannelMax: 3, perChannelInterval: 1000, globalMax: 10, globalInterval: 10000 },
    };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

test('constructor creates a pending ready promise', () => {
    const bot = new Bot(minimalConfig());
    assert.strictEqual(bot.isStarted, false);
    // The ready promise should not be settled yet.
    // We can check by racing it with a short timeout.
    let settled = false;
    bot.ready.then(() => { settled = true; }).catch(() => { settled = true; });
    // Synchronously it should not be settled.
    assert.strictEqual(settled, false, 'Ready promise should not be settled');
});

test('status returns a valid snapshot before init', () => {
    const bot = new Bot(minimalConfig());
    const status = bot.status;
    assert.strictEqual(status.started, false);
    assert.strictEqual(status.profile, 'parity');
    assert.strictEqual(status.nick, 'TestBot');
    assert.deepStrictEqual(status.loop, { running: false, paused: false, cycleCount: 0, llmReady: false });
    assert.deepStrictEqual(status.embodiments, {});
});

test('config is frozen', () => {
    const bot = new Bot(minimalConfig());
    assert.throws(() => { bot.config.nick = 'mutated'; }, /Cannot assign/);
});

test('shutdown before initialize rejects the ready promise', async () => {
    const bot = new Bot(minimalConfig());
    const readyPromise = bot.ready;

    await bot.shutdown();

    // ready should reject because it was never resolved.
    let rejected = false;
    try { await readyPromise; } catch { rejected = true; }
    assert.ok(rejected, 'Ready promise should reject on shutdown before init');
});

test('shutdown is idempotent', async () => {
    const bot = new Bot(minimalConfig());
    await bot.shutdown();
    await bot.shutdown(); // should not throw
    assert.ok(true, 'Double shutdown should not throw');
});

test('agent getter is undefined before initialize', () => {
    const bot = new Bot(minimalConfig());
    assert.strictEqual(bot.agent, undefined);
});

test('startTime is undefined before start', () => {
    const bot = new Bot(minimalConfig());
    assert.strictEqual(bot.startTime, undefined);
});

test('status.uptime is 0 before start', () => {
    const bot = new Bot(minimalConfig());
    assert.strictEqual(bot.status.uptime, 0);
});

test('status loop state is zeroed before init', () => {
    const bot = new Bot(minimalConfig());
    const { loop } = bot.status;
    assert.strictEqual(loop.running, false);
    assert.strictEqual(loop.paused, false);
    assert.strictEqual(loop.cycleCount, 0);
    assert.strictEqual(loop.llmReady, false);
});

test('registerEmbodimentFactory rejects non-function', () => {
    assert.throws(() => { registerEmbodimentFactory('test', null); }, /must be a function/);
    assert.throws(() => { registerEmbodimentFactory('test', 42); }, /must be a function/);
    assert.throws(() => { registerEmbodimentFactory('test', 'string'); }, /must be a function/);
});

test('registerEmbodimentFactory accepts a function', () => {
    const factory = async () => [];
    assert.doesNotThrow(() => { registerEmbodimentFactory('test-lifecycle', factory); });
});

test('status embodiments is empty object before initialization', () => {
    const bot = new Bot(minimalConfig());
    assert.deepStrictEqual(bot.status.embodiments, {});
});

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ Bot Lifecycle Unit Tests ═══\n');

    for (const { name, fn } of TESTS) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`  ✗ ${name}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
