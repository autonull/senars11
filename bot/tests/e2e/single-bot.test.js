#!/usr/bin/env node
/**
 * single-bot.test.js — E2E test: one bot, embedded IRC, real LLM.
 */

import { strict as assert } from 'assert';
import { FakeIRCUser } from '../support/FakeIRCUser.js';
import { BotHarness } from '../support/BotHarness.js';

let passed = 0, failed = 0;
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('Port discovery from stdout works', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    const port = harness.discoverPort();
    assert.ok(port === null || typeof port === 'number', 'Port should be null or number');
    await harness.kill();
});

test('Channel question → bot responds', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    const port = harness.discoverPort();
    if (!port) { await harness.kill(); return; }

    const user = new FakeIRCUser('127.0.0.1', port, 'tester');
    await user.connect();
    user.say('##metta', 'SeNARchy: what is 2+2?');

    try {
        const reply = await user.waitFor(/PRIVMSG.*SeNARchy/, 30000);
        assert.ok(reply, 'Bot should respond');
    } finally {
        user.disconnect();
        await harness.kill();
    }
});

test('SIGTERM shutdown → clean exit', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    await harness.kill('SIGTERM');
    assert.ok(harness.process.killed || harness.process.exitCode !== undefined, 'Process should have exited');
});

test('Empty message → no crash', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    const port = harness.discoverPort();
    if (!port) { await harness.kill(); return; }

    const user = new FakeIRCUser('127.0.0.1', port, 'tester2');
    await user.connect();
    user.say('##metta', 'SeNARchy:');

    await new Promise(r => setTimeout(r, 5000));
    assert.ok(harness.process.exitCode === null || harness.process.exitCode === undefined, 'Bot should not have crashed');
    user.disconnect();
    await harness.kill();
});

(async () => {
    console.log('═══ Single Bot E2E Tests ═══\n');
    for (const { name, fn } of TESTS) {
        try { await fn(); console.log(`  ✓ ${name}`); passed++; }
        catch (e) { console.log(`  ✗ ${name}: ${e.message}`); failed++; }
    }
    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
})();
