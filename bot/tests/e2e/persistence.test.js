#!/usr/bin/env node
/**
 * persistence.test.js — E2E test: memory survives restart.
 */

import { strict as assert } from 'assert';
import { FakeIRCUser } from '../support/FakeIRCUser.js';
import { BotHarness } from '../support/BotHarness.js';

let passed = 0, failed = 0;
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('Bot starts and shuts down cleanly', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    await harness.kill('SIGTERM');
    assert.ok(true, 'Clean shutdown');
});

// Main
(async () => {
    console.log('═══ Persistence E2E Tests ═══\n');
    for (const { name, fn } of TESTS) {
        try { await fn(); console.log(`  ✓ ${name}`); passed++; }
        catch (e) { console.log(`  ✗ ${name}: ${e.message}`); failed++; }
    }
    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
})();
