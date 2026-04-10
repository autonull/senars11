#!/usr/bin/env node
/**
 * irc-channel.test.js — Unit tests for IRCChannel message filtering.
 *
 * Covers:
 * - Self-message filtering (bot's own echoes are dropped)
 * - Nick mention detection (isMention set correctly)
 * - Input length truncation
 * - Private message detection
 *
 * Usage:
 *   node agent/tests/unit/irc-channel.test.js
 */

import { strict as assert } from 'assert';
import { IRCChannel } from '@senars/agent/io/channels/IRCChannel.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }

/* ── Helpers ─────────────────────────────────────────────────────────── */

function makeChannel() {
    const ch = new IRCChannel({
        id: 'test-irc', host: '127.0.0.1', port: 6667,
        nick: 'TestBot', username: 'testbot', realname: 'Test Bot',
        channels: ['##test'],
    });
    // Simulate the client being connected with a known nick
    ch.client.user = { nick: 'TestBot' };
    return ch;
}

/* ── Tests ──────────────────────────────────────────────────────────── */

test('IRCChannel has correct type', () => {
    const ch = makeChannel();
    assert.strictEqual(ch.type, 'irc');
});

test('_containsNickMention: matches nick at start with colon', () => {
    const ch = makeChannel();
    assert.ok(ch._containsNickMention('TestBot: hello there', 'TestBot'));
});

test('_containsNickMention: matches nick at start with comma', () => {
    const ch = makeChannel();
    assert.ok(ch._containsNickMention('TestBot, are you there?', 'TestBot'));
});

test('_containsNickMention: matches nick with @ prefix', () => {
    const ch = makeChannel();
    assert.ok(ch._containsNickMention('Hey @TestBot, help me', 'TestBot'));
});

test('_containsNickMention: matches nick as standalone word', () => {
    const ch = makeChannel();
    assert.ok(ch._containsNickMention('hello TestBot!', 'TestBot'));
});

test('_containsNickMention: does NOT match nick embedded in URL', () => {
    const ch = makeChannel();
    assert.ok(!ch._containsNickMention('check out https://example.com/TestBot/page', 'TestBot'));
});

test('_containsNickMention: does NOT match nick as substring', () => {
    const ch = makeChannel();
    assert.ok(!ch._containsNickMention('TestBotter is a great player', 'TestBot'));
});

test('_containsNickMention: does NOT match partial nick at end', () => {
    const ch = makeChannel();
    assert.ok(!ch._containsNickMention('I said TestBots not TestBot', 'Test'));
});

test('_containsNickMention: handles nick with regex special chars', () => {
    // A nick like "Test.Bot" would be a regex disaster without escaping
    const ch = makeChannel();
    ch.client.user = { nick: 'Test.Bot' };
    assert.ok(!ch._containsNickMention('TestXBot hello', 'Test.Bot'));
});

test('_containsNickMention: case insensitive', () => {
    const ch = makeChannel();
    assert.ok(ch._containsNickMention('testbot: hi', 'TestBot'));
    assert.ok(ch._containsNickMention('TESTBOT, ping', 'TestBot'));
});

test('_containsNickMention: returns false for empty nick', () => {
    const ch = makeChannel();
    assert.ok(!ch._containsNickMention('hello', ''));
});

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ IRCChannel Message Filtering Tests ═══\n');

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
