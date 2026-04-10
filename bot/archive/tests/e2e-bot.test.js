#!/usr/bin/env node
/**
 * e2e-bot.test.js — End-to-end test of the bot via its embedded IRC server.
 *
 * Starts the bot as a child process with a real Transformers.js LLM,
 * connects a raw TCP client as a simulated IRC user, sends messages,
 * and verifies responses.
 *
 * Port is discovered from bot stdout — no hardcoding.
 *
 * Usage:
 *   node bot/tests/e2e-bot.test.js
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';
import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { Logger, resolveWithFallback } from '@senars/core';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
const BOT_DIR = resolve(__dirname, '..');

Logger.setLevel('WARN');

/* ── Simulated IRC user (raw TCP client) ─────────────────────────────── */

class FakeIRCUser {
    constructor(host, port, nick) {
        this.nick = nick;
        this.messages = [];
        this.host = host;
        this.port = port;
        this._socket = null;
        this._buffer = '';
        this._listeners = new Set();
    }

    connect() {
        return new Promise((resolve, reject) => {
            this._socket = createConnection({ host: this.host, port: this.port });
            this._socket.on('data', d => this._onData(d));
            this._socket.on('error', reject);
            this._socket.on('connect', () => {
                this._send(`NICK ${this.nick}`);
                this._send(`USER ${this.nick.toLowerCase()} 0 * :${this.nick}`);
                const onReg = line => {
                    if (line.includes(' 001 ')) {
                        this._listeners.delete(onReg);
                        this._send('JOIN ##metta');
                        setTimeout(resolve, 200);
                    }
                };
                this._listeners.add(onReg);
            });
        });
    }

    _onData(data) {
        this._buffer += data.toString('utf-8');
        const lines = this._buffer.split('\r\n');
        this._buffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            for (const fn of this._listeners) fn(line);
            if (line.includes('PRIVMSG')) {
                const m = line.match(/:([^!]+)!.*PRIVMSG (##?\S+) :(.+)/);
                if (m) this.messages.push({ from: m[1], channel: m[2], content: m[3] });
            }
        }
    }

    _send(line) { this._socket.write(line + '\r\n'); }
    say(channel, content) { this._send(`PRIVMSG ${channel} :${content}`); }

    /** Wait until at least one new bot reply appears, or timeout. */
    waitForBotReply(timeout = 15000) {
        return new Promise(resolve => {
            const start = this.messages.length;
            const end = Date.now() + timeout;
            const tick = () => {
                if (this.messages.length > start) {
                    resolve(this.messages.filter(m => m.from === 'SeNARchy'));
                    return;
                }
                if (Date.now() < end) { setTimeout(tick, 200); return; }
                resolve([]);
            };
            setTimeout(tick, 200);
        });
    }

    disconnect() { this._send('QUIT :done'); this._socket?.destroy(); }
}

/* ── Test runner ─────────────────────────────────────────────────────── */

const TESTS = [];
let passed = 0, failed = 0;
function test(name, fn) { TESTS.push({ name, fn }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Tests ────────────────────────────────────────────────────────────── */

test('Channel question generates a response', async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', "what's 2+2?");
    const replies = await user.waitForBotReply(120000);
    assert.ok(replies.length > 0, 'Bot should respond to a question');
    assert.ok(replies[0].content.length > 5, 'Response should be non-trivial');
    console.log(`  → Bot replied: "${replies[0].content.substring(0, 120)}"`);
});

test('Channel command !help generates a response', async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', '!help');
    const replies = await user.waitForBotReply(120000);
    assert.ok(replies.length > 0, 'Bot should respond to !help');
});

test('URL containing bot nick does NOT trigger response', async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'check out https://example.com/SeNARchy/page');
    await sleep(15000);
    const replies = user.messages.filter(m => m.from === 'SeNARchy');
    assert.ok(replies.length === 0, `Bot should NOT respond to URL containing nick (got ${replies.length} replies)`);
});

test('Channel greeting generates a response', async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'hello SeNARchy');
    const replies = await user.waitForBotReply(120000);
    assert.ok(replies.length > 0, 'Bot should respond to greeting');
});

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — End-to-End Tests (Real LLM) ═══\n');

    const { child, port } = await startBotInProcess();

    try {
        const user = new FakeIRCUser('127.0.0.1', port, 'testuser');
        await user.connect();
        console.log(`✅ Test user connected and joined ##metta (port ${port})\n`);

        await sleep(2000);

        for (const { name, fn } of TESTS) {
            console.log(`── ${name}`);
            try { await fn(null, user); console.log(`  ✓ PASS\n`); passed++; }
            catch (err) { console.log(`  ✗ FAIL: ${err.message}\n`); failed++; }
        }
    } finally {
        if (!child.killed) child.kill('SIGTERM');
        await sleep(2000);
        if (!child.killed) { try { child.kill('SIGKILL'); } catch {} }
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

async function startBotInProcess() {
    console.log('[e2e] Starting bot with real Transformers.js LLM...');

    const child = spawn('node', [
        'run.js',
        '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', 'HuggingFaceTB/SmolLM2-360M-Instruct',
    ], {
        cwd: BOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    let botPort = null;
    let stdoutBuffer = '';

    child.stdout.on('data', d => {
        const str = d.toString();
        stdoutBuffer += str;
        process.stdout.write(`[BOT] ${str}`);
        const m = str.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
        if (m) botPort = parseInt(m[1], 10);
    });
    child.stderr.on('data', d => process.stderr.write(`[BOT-ERR] ${d}`));

    // Wait for embedded server to report its port (model download may take time)
    const deadline = Date.now() + 300_000; // 5 min for first-run model download
    while (!botPort && Date.now() < deadline) {
        await sleep(500);
        const m = stdoutBuffer.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
        if (m) botPort = parseInt(m[1], 10);
    }
    if (!botPort) throw new Error('Bot never started embedded IRC server');

    console.log(`[e2e] Embedded IRC server ready on port ${botPort}\n`);
    return { child, port: botPort };
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
