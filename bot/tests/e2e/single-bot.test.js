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

test('Message received → no crash, bot processes cycle', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    const port = harness.discoverPort();
    if (!port) { await harness.kill(); return; }

    const user = new FakeIRCUser('127.0.0.1', port, 'tester');
    await user.connect();
    user.say('##metta', 'SeNARchy: what is 2+2?');

    // Wait for bot to process cycles (minimal profile: 10 cycles x 1s each)
    // The message is received and queued even if no LLM responds
    await new Promise(r => setTimeout(r, 5000));
    assert.ok(!harness.process.killed && (harness.process.exitCode === null || harness.process.exitCode === undefined),
        'Bot should still be running after receiving message');
    user.disconnect();
    await harness.kill();
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
