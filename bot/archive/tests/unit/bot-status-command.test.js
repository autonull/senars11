#!/usr/bin/env node
/**
 * bot-status-command.test.js — Unit tests for BotStatusCommand.
 *
 * Covers:
 * - Renders status string with correct format
 * - Handles missing bot reference gracefully
 * - Shows correct embodiment statuses
 *
 * Usage:
 *   node bot/tests/unit/bot-status-command.test.js
 */

import { strict as assert } from 'assert';
import { BotStatusCommand } from '../../src/BotStatusCommand.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }

/* ── Helpers ─────────────────────────────────────────────────────────── */

function mockBot(statusOverride = {}) {
    return {
        get status() {
            return {
                started: true,
                uptime: 123_456,
                profile: 'parity',
                nick: 'TestBot',
                loop: { running: true, paused: false, cycleCount: 42, llmReady: true },
                embodiments: { irc: { status: 'connected' }, cli: { status: 'disconnected' } },
                ...statusOverride,
            };
        }
    };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

test('renders status string with correct format', () => {
    const cmd = new BotStatusCommand(mockBot());
    const result = cmd._executeImpl();
    assert.ok(result.startsWith('Bot: TestBot [parity]'));
    assert.ok(result.includes('Uptime: 123s'));
    assert.ok(result.includes('Running: true'));
    assert.ok(result.includes('cycle=42'));
});

test('handles missing bot reference', async () => {
    const cmd = new BotStatusCommand(null);
    const result = cmd._executeImpl();
    assert.strictEqual(result, 'Status unavailable — bot reference not set.');
});

test('shows correct embodiment statuses', () => {
    const cmd = new BotStatusCommand(mockBot());
    const result = cmd._executeImpl();
    assert.ok(result.includes('irc=connected'));
    assert.ok(result.includes('cli=disconnected'));
});

test('shows no embodiments when empty', () => {
    const cmd = new BotStatusCommand(mockBot({ embodiments: {} }));
    const result = cmd._executeImpl();
    assert.ok(result.includes('(none)'));
});

test('shows stopped and paused loop state', () => {
    const cmd = new BotStatusCommand(mockBot({
        loop: { running: false, paused: true, cycleCount: 0, llmReady: false },
    }));
    const result = cmd._executeImpl();
    assert.ok(result.includes('running=false'));
    assert.ok(result.includes('paused=true'));
    assert.ok(result.includes('llm=false'));
});

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ BotStatusCommand Tests ═══\n');

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
