#!/usr/bin/env node
/**
 * e2e-bot.test.js — Full end-to-end test of the bot via its embedded IRC server.
 *
 * Starts the bot in-process (with embedded MockIRCServer), connects a raw TCP
 * client as a simulated IRC user, sends channel messages, and verifies responses.
 *
 * Usage:
 *   node bot/tests/e2e-bot.test.js
 */

import { createConnection, createServer } from 'net';
import { Logger } from '@senars/core';
import { strict as assert } from 'assert';

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
                // Auto-join after registration (wait for 001)
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
            // Capture PRIVMSG directed at our nick or to our channel
            if (line.includes('PRIVMSG')) {
                const match = line.match(/:([^!]+)!.*PRIVMSG (##?\S+) :(.+)/);
                if (match) {
                    this.messages.push({ from: match[1], channel: match[2], content: match[3] });
                }
            }
        }
    }

    _send(line) {
        this._socket.write(line + '\r\n');
    }

    say(channel, content) {
        this._send(`PRIVMSG ${channel} :${content}`);
    }

    disconnect() {
        this._send('QUIT :test done');
        this._socket?.destroy();
    }
}

/* ── Test runner ──────────────────────────────────────────────────────── */

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    TESTS.push({ name, fn });
}

/* ── Tests ────────────────────────────────────────────────────────────── */

test('channel question "what\'s 2+2?" generates a response', async (bot, user) => {
    user.messages.length = 0;
    user.say('##metta', "what's 2+2?");

    // Wait up to 30s for a response (LLM may be slow)
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        await sleep(500);
        if (user.messages.length > 0) break;
    }

    assert.ok(user.messages.length > 0, 'Bot should send at least one response message');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, 'Response should be from the bot');
    console.log(`  → Bot replied: "${reply.content.substring(0, 120)}"`);
});

test('channel command "!help" generates a response', async (bot, user) => {
    user.messages.length = 0;
    user.say('##metta', '!help');

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await sleep(500);
        if (user.messages.length > 0) break;
    }

    assert.ok(user.messages.length > 0, 'Bot should respond to !help');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, '!help response should be from the bot');
    console.log(`  → Bot replied: "${reply.content.substring(0, 120)}"`);
});

test('URL containing bot nick does NOT trigger response', async (bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'check out https://example.com/SeNARchy/page');

    await sleep(5000);

    const botReply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(!botReply, 'Bot should NOT respond to URL containing its nick');
    console.log('  → Correctly ignored');
});

test('channel greeting "hello" generates a response', async (bot, user) => {
    user.messages.length = 0;
    user.say('##metta', 'hello SeNARchy');

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await sleep(500);
        if (user.messages.length > 0) break;
    }

    assert.ok(user.messages.length > 0, 'Bot should respond to greeting');
    const reply = user.messages.find(m => m.from === 'SeNARchy');
    assert.ok(reply, 'Greeting response should be from the bot');
    console.log(`  → Bot replied: "${reply.content.substring(0, 120)}"`);
});

/* ── Helpers ──────────────────────────────────────────────────────────── */

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — End-to-End Tests ═══\n');

    // Start the bot in a child process
    const botProcess = await startBotInProcess();

    try {
        // Connect fake user to bot's embedded IRC server
        const user = new FakeIRCUser('127.0.0.1', 6668, 'testuser');
        await user.connect();
        console.log('✅ Test user connected and joined ##metta\n');

        // Give the bot a moment to settle
        await sleep(1000);

        // Run tests
        for (const { name, fn } of TESTS) {
            console.log(`── ${name}`);
            try {
                await fn(null, user);
                console.log(`  ✓ PASS\n`);
                passed++;
            } catch (err) {
                console.log(`  ✗ FAIL: ${err.message}\n`);
                failed++;
            }
        }
    } finally {
        botProcess.kill('SIGTERM');
        // Give it time to shut down
        await sleep(2000);
        try { botProcess.kill('SIGKILL'); } catch {}
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

async function startBotInProcess() {
    console.log('🚀 Starting bot process...');

    const { spawn } = await import('child_process');
    const child = spawn('node', [
        'run.js',
        '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'dummy',
    ], {
        cwd: '/home/me/senars10/bot',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
    });

    // Stream bot output to console for debugging
    child.stdout.on('data', (data) => {
        const str = data.toString();
        process.stdout.write(`[BOT] ${str}`);
    });
    child.stderr.on('data', (data) => {
        const str = data.toString();
        process.stderr.write(`[BOT-ERR] ${str}`);
    });

    // Wait for the embedded server to be ready (port 6668)
    await waitForPort(6668, 30000);
    console.log('✅ Bot embedded IRC server ready on port 6668\n');

    return child;
}

async function waitForPort(port, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await new Promise((resolve, reject) => {
                const socket = createConnection({ host: '127.0.0.1', port });
                socket.on('connect', () => { socket.destroy(); resolve(); });
                socket.on('error', reject);
                setTimeout(() => { socket.destroy(); reject(new Error('timeout')); }, 2000);
            });
            return;
        } catch {
            await sleep(1000);
        }
    }
    throw new Error(`Timed out waiting for port ${port}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
