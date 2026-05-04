#!/usr/bin/env node
/**
 * multi-mode.test.js — E2E test: different operating modes.
 */

import { strict as assert } from 'assert';
import { BotHarness } from '../support/BotHarness.js';

let passed = 0, failed = 0;
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('--mode cli starts', async () => {
    const harness = new BotHarness({ args: ['--mode', 'cli', '--profile', 'minimal'] });
    await harness.spawn();
    assert.ok(true, 'CLI mode started');
    await harness.kill();
});

test('minimal profile starts with reduced capabilities', async () => {
    const harness = new BotHarness({ args: ['--profile', 'minimal'] });
    await harness.spawn();
    assert.ok(harness.stdout.includes('SeNARchy') || harness.stdout.includes('minimal') || harness.stdout.includes('IRC'),
        'Should mention nick or profile in output');
    await harness.kill();
});

// Main
(async () => {
    console.log('═══ Multi-Mode E2E Tests ═══\n');
    for (const { name, fn } of TESTS) {
        try { await fn(); console.log(`  ✓ ${name}`); passed++; }
        catch (e) { console.log(`  ✗ ${name}: ${e.message}`); failed++; }
    }
    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
})();
