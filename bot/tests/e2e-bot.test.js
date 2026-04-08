#!/usr/bin/env node
/**
 * e2e-bot.test.js — Full end-to-end test of the bot via its embedded IRC server.
 *
 * Starts the bot as a child process (with embedded EmbeddedIRCServer), connects
 * a raw TCP client as a simulated IRC user, sends channel messages, and verifies
 * responses.
 *
 * The actual port is discovered by parsing bot stdout — no hardcoding.
 *
 * Usage:
 *   node bot/tests/e2e-bot.test.js
 */

import { spawn } from 'child_process';
import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { Logger, resolveWithFallback } from '@senars/core';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
const BOT_DIR = resolve(__dirname, '..');

Logger.setLevel('INFO');

/* ── Simulated IRC user (raw TCP client) ─────────────────────────────── */

class FakeIRCUser {
    constructor(host, port, nick) {
        this.nick = nick;
        this.messages = [];
        this.host = host;
        this.port = port;
        this._socket = null;
        this._buffer = '';
    }

    connect() {
        return new Promise((resolve, reject) => {
            this._socket = createConnection({ host: this.host, port: this.port });
            this._socket.on('data', (data) => this._onData(data));
            this._socket.on('error', reject);
            this._socket.on('connect', () => {
                this._send(`NICK ${this.nick}`);
                this._send(`USER ${this.nick.toLowerCase()} 0 * :${this.nick}`);
                const onReg = (line) => {
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

    _listeners = new Set();

    _onData(data) {
        this._buffer += data.toString('utf-8');
        const lines = this._buffer.split('\r\n');
        this._buffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            for (const fn of this._listeners) fn(line);
            if (line.includes('PRIVMSG')) {
                const match = line.match(/:([^!]+)!.*PRIVMSG (##?\S+) :(.+)/);
                if (match) this.messages.push({ from: match[1], channel: match[2], content: match[3] });
            }
        }
    }

    _send(line) { this._socket.write(line + '\r\n'); }
    say(channel, content) { this._send(`PRIVMSG ${channel} :${content}`); }
    disconnect() { this._send('QUIT :test done'); this._socket?.destroy(); }
}

/* ── Test runner ──────────────────────────────────────────────────────── */

const TESTS = [];
let passed = 0, failed = 0;
function test(name, fn) { TESTS.push({ name, fn }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Tests ────────────────────────────────────────────────────────────── */

test("channel question generates a response", async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', "what's 2+2?");
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) { await sleep(500); if (user.messages.length > 0) break; }
    assert.ok(user.messages.length > 0, 'Bot should send at least one response message');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, 'Response should be from the bot');
    console.log(`  → Bot replied: "${reply.content.substring(0, 120)}"`);
});

test("channel command !help generates a response", async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', '!help');
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { await sleep(500); if (user.messages.length > 0) break; }
    assert.ok(user.messages.length > 0, 'Bot should respond to !help');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, '!help response should be from the bot');
});

test("URL containing bot nick does NOT trigger response", async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'check out https://example.com/SeNARchy/page');
    await sleep(5000);
    const botReply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(!botReply, 'Bot should NOT respond to URL containing its nick');
});

test("channel greeting generates a response", async (_bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'hello SeNARchy');
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { await sleep(500); if (user.messages.length > 0) break; }
    assert.ok(user.messages.length > 0, 'Bot should respond to greeting');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, 'Greeting response should be from the bot');
});

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — End-to-End Tests ═══\n');

    const { child, port } = await startBotInProcess();

    try {
        const user = new FakeIRCUser('127.0.0.1', port, 'testuser');
        await user.connect();
        console.log(`✅ Test user connected and joined ##metta (port ${port})\n`);

        await sleep(1000);

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
    console.log('[e2e] Starting bot process...');

    const child = spawn('node', ['run.js', '--mode', 'irc', '--profile', 'parity', '--nick', 'SeNARchy', '--channel', '##metta', '--provider', 'dummy'], {
        cwd: BOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
    });

    let botPort = null;
    let stdoutBuffer = '';

    child.stdout.on('data', (data) => {
        const str = data.toString();
        stdoutBuffer += str;
        process.stdout.write(`[BOT] ${str}`);
        const m = str.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
        if (m) botPort = parseInt(m[1], 10);
    });
    child.stderr.on('data', (data) => { process.stderr.write(`[BOT-ERR] ${data.toString()}`); });

    // Wait for the embedded server to report its actual port
    const deadline = Date.now() + 30000;
    while (!botPort && Date.now() < deadline) {
        await sleep(200);
        const m = stdoutBuffer.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
        if (m) botPort = parseInt(m[1], 10);
    }
    if (!botPort) throw new Error('Bot never started embedded IRC server');

    console.log(`[e2e] Embedded IRC server ready on port ${botPort}\n`);
    return { child, port: botPort };
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
