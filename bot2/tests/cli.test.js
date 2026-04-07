#!/usr/bin/env node
/**
 * cli.test.js — CLI mode e2e test.
 *
 * Pipes messages to bot via stdin, captures stdout, verifies responses.
 * Event-driven, no artificial delays. Completes in seconds with dummy provider.
 *
 * Usage: node bot2/tests/cli.test.js [--provider transformers|openai|ollama|dummy]
 */

import { spawn } from 'child_process';
import { strict as assert } from 'assert';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    const provider = process.argv.includes('--provider')
        ? process.argv[process.argv.indexOf('--provider') + 1]
        : 'dummy';

    console.log(`═══ SeNARS Bot2 CLI Test [provider=${provider}] ═══\n`);

    const args = ['run.js', '--mode', 'cli', '--profile', 'parity', '--nick', 'TestBot', '--provider', provider];
    if (provider === 'dummy') args.push('--model', 'dummy');

    const bot = spawn('node', args, {
        cwd: '/home/me/senars10/bot2',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'development' },
    });

    let stdout = '';
    bot.stdout.on('data', d => { stdout += d; process.stdout.write(`[BOT] ${d}`); });
    bot.stderr.on('data', d => process.stderr.write(`[ERR] ${d}`));

    try {
        // Wait for bot ready
        console.log('[1] Waiting for bot ready...');
        await waitFor(() => stdout.includes('Starting MeTTa agent loop'), 30000);
        console.log('✅ Bot ready\n');

        // Send test messages
        console.log('[2] Sending messages...');
        const messages = ['hello', 'what is 2+2?', '!help', 'quit'];
        for (const msg of messages) {
            bot.stdin.write(msg + '\n');
            console.log(`  → "${msg}"`);
        }
        console.log();

        // Wait for all responses
        console.log('[3] Waiting for responses...');
        await waitFor(() => {
            const lines = stdout.split('\n').filter(l => l.includes('TestBot:') && !l.includes('Online'));
            return lines.length >= 3 ? lines : null;
        }, 60000);

        const replies = stdout.split('\n').filter(l => l.includes('TestBot:') && !l.includes('Online'));
        console.log(`  ✅ ${replies.length} responses received\n`);

        // Verify
        assert.ok(replies.length >= 3, `Expected ≥3 replies, got ${replies.length}`);
        assert.ok(!stdout.includes('Not connected'), 'No "Not connected" warnings');
        assert.ok(!stdout.includes('LLM response timed out'), 'No LLM timeout');

        console.log('── Replies ──');
        for (const reply of replies.slice(0, 3)) {
            console.log(`  ${reply.trim().substring(0, 100)}`);
        }

        console.log('\n✅ CLI TEST PASSED');
    } catch (err) {
        console.error(`\n❌ FAILED: ${err.message}`);
        console.log('\n── Bot output (last 20 lines) ──');
        for (const line of stdout.split('\n').filter(l => l.trim()).slice(-20)) {
            console.log(`  ${line}`);
        }
        process.exit(1);
    } finally {
        bot.kill('SIGTERM');
        await sleep(1000);
        try { bot.kill('SIGKILL'); } catch {}
    }
}

function waitFor(condition, timeoutMs = 30000, pollMs = 100) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const result = condition();
            if (result) return resolve(result);
            if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout (${timeoutMs}ms)`));
            setTimeout(check, pollMs);
        };
        check();
    });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
