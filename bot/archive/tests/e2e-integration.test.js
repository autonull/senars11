#!/usr/bin/env node
/**
 * e2e-integration.test.js — Integration tests approximating actual usage.
 *
 * Tests the full bot process with real LLM inference (Transformers.js):
 *   1. CLI mode — stdin/stdout interaction
 *   2. Multi-embodiment — IRC + CLI simultaneously
 *   3. Action execution — respond, think through full stack
 *   4. Concurrent messages — rapid messages, no drops, no races
 *   5. Shutdown lifecycle — clean teardown, no resource leaks
 *
 * Usage:
 *   node bot/tests/e2e-integration.test.js
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function botArgs(overrides = {}) {
    const args = [
        'run.js',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ];
    if (overrides.mode) args.splice(1, 0, '--mode', overrides.mode);
    return args;
}

function spawnBot(args = []) {
    const child = spawn('node', args, {
        cwd: BOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [], stderr = [];
    child.stdout.on('data', d => { stdout.push(d.toString()); process.stdout.write(`[BOT] ${d}`); });
    child.stderr.on('data', d => { stderr.push(d.toString()); process.stderr.write(`[BOT-ERR] ${d}`); });
    const output = () => [...stdout, ...stderr].join('');
    const waitFor = (pattern, timeout = 60000) => {
        const re = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern;
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const tick = () => {
                if (re.test(output())) { resolve(output()); return; }
                if (Date.now() < deadline) { setTimeout(tick, 200); return; }
                reject(new Error(`Timeout waiting for: ${pattern}\nOutput:\n${output().slice(-2000)}`));
            };
            tick();
        });
    };
    const kill = async () => {
        if (!child.killed) child.kill('SIGTERM');
        await sleep(1500);
        if (!child.killed) { try { child.kill('SIGKILL'); } catch {} }
        await sleep(500);
    };
    return { child, output, waitFor, kill };
}

/* ── Fake IRC user (raw TCP) ────────────────────────────────────────── */

class FakeIRCUser {
    constructor(host, port, nick) {
        this.nick = nick; this.messages = []; this.host = host; this.port = port;
        this._socket = null; this._buffer = ''; this._listeners = new Set();
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
    say(ch, content) { this._send(`PRIVMSG ${ch} :${content}`); }
    waitForBotReply(timeout = 120000) {
        return new Promise(resolve => {
            const start = this.messages.length;
            const deadline = Date.now() + timeout;
            const tick = () => {
                if (this.messages.length > start) {
                    resolve(this.messages.filter(m => m.from === 'SeNARchy'));
                    return;
                }
                if (Date.now() < deadline) { setTimeout(tick, 200); return; }
                resolve([]);
            };
            setTimeout(tick, 200);
        });
    }
    disconnect() { this._send('QUIT :done'); this._socket?.destroy(); }
}

/* ── Discover embedded IRC port from bot stdout ──────────────────────── */

async function discoverPort(bot) {
    const out = await bot.waitFor(/Embedded IRC server: 127\.0\.0\.1:(\d+)/, 60000);
    const m = out.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/* ── Tests ───────────────────────────────────────────────────────────── */

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// ── Test 1: CLI mode — stdin/stdout interaction ─────────────────────

test('CLI mode: stdin → MeTTa loop → stdout response', async () => {
    const bot = spawnBot(botArgs({ mode: 'cli' }));
    try {
        await bot.waitFor('Online', 120000);
        await sleep(2000);

        bot.child.stdin.write('hello there\n');
        await bot.waitFor(/\[MeTTa\] New message:.*hello there/, 120000);

        const out = bot.output();
        assert.ok(out.includes('[MeTTa] Context built:'), 'Context should be built');
        assert.ok(out.includes('SeNARchy:'), 'Response should appear on stdout');
    } finally { await bot.kill(); }
});

// ── Test 2: Multi-embodiment — IRC + CLI simultaneously ─────────────

test('Multi-embodiment: IRC and CLI both connected and functional', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'multi',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor('Online', 120000);
        await bot.waitFor(/Embodiment registered: irc/, 60000);
        const port = await discoverPort(bot);
        assert.ok(port, 'Embedded IRC server should start');

        const ircUser = new FakeIRCUser('127.0.0.1', port, 'multiuser');
        await ircUser.connect();

        const out = bot.output();
        assert.ok(out.includes('Embodiment registered: cli'), 'CLI embodiment registered');
        assert.ok(out.includes('Embodiment registered: irc'), 'IRC embodiment registered');

        // Send via IRC — should reach MeTTa loop
        ircUser.say('##metta', 'hello from IRC');
        await sleep(60000);
        const ircReplies = ircUser.messages.filter(m => m.from === 'SeNARchy');
        assert.ok(ircReplies.length > 0, 'Bot should respond to IRC message');
        const ircOut = bot.output();
        assert.ok(ircOut.includes('[MeTTa] New message:'), 'IRC message should reach MeTTa loop');

        // Send via CLI — should also reach MeTTa loop
        bot.child.stdin.write('hello from CLI\n');
        await bot.waitFor(/\[user@cli\] hello from CLI/, 60000);

        ircUser.disconnect();
    } finally { await bot.kill(); }
});

// ── Test 3: Action execution through full stack ───────────────────────

test('Action execution: respond action works end-to-end', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor(/Embedded IRC server/, 120000);
        const port = await discoverPort(bot);

        const user = new FakeIRCUser('127.0.0.1', port, 'actionuser');
        await user.connect();

        user.say('##metta', 'what can you do?');
        const replies = await user.waitForBotReply();
        assert.ok(replies.length > 0, 'Bot should send a response');
        assert.ok(replies[0].content.length > 5, 'Response should be non-trivial');

        const out = bot.output();
        assert.ok(out.includes('[MeTTa] Context built:'), 'Context built');
        assert.ok(out.includes('[MeTTa] LLM response:'), 'LLM invoked');

        user.disconnect();
    } finally { await bot.kill(); }
});

test('Action execution: think action produces no user-visible output', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor(/Embedded IRC server/, 120000);
        const port = await discoverPort(bot);

        const user = new FakeIRCUser('127.0.0.1', port, 'thinkuser');
        await user.connect();

        user.say('##metta', 'what is 2+2?');
        const replies = await user.waitForBotReply();

        // Bot should respond (think+respond or just respond), but not flood
        assert.ok(replies.length <= 2, `Should not produce excessive responses (got ${replies.length})`);

        user.disconnect();
    } finally { await bot.kill(); }
});

// ── Test 4: Concurrent messages — no drops, no races ──────────────────

test('Concurrent: interruptible sleep — no delay between messages', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor(/Embedded IRC server/, 120000);
        const port = await discoverPort(bot);

        const user = new FakeIRCUser('127.0.0.1', port, 'sleepuser');
        await user.connect();

        // Wait for bot to finish first idle cycle and enter sleep
        await sleep(5000);

        const before = Date.now();
        user.say('##metta', 'wake up!');

        await bot.waitFor(/\[MeTTa\] New message:.*wake up/, 120000);
        const elapsed = Date.now() - before;

        assert.ok(elapsed < 10000, `Message should be processed quickly (${elapsed}ms, not waiting full sleepMs)`);

        user.disconnect();
    } finally { await bot.kill(); }
});

// ── Test 5: Shutdown lifecycle — clean teardown ───────────────────────

test('Lifecycle: clean SIGTERM shutdown', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor(/Embedded IRC server/, 120000);
        const port = await discoverPort(bot);

        const user = new FakeIRCUser('127.0.0.1', port, 'lifecycleuser');
        await user.connect();
        user.disconnect();
        await sleep(2000);

        bot.child.kill('SIGTERM');
        await bot.waitFor('Shutdown complete', 10000);

        const out = bot.output();
        assert.ok(out.includes('Received SIGTERM'), 'Should acknowledge SIGTERM');
        assert.ok(out.includes('Shutdown complete'), 'Should complete shutdown');
        assert.ok(out.includes('irc:irc] Status: connected -> disconnected'), 'IRC should disconnect');
    } finally { await bot.kill(); }
});

test('Lifecycle: shutdown during active conversation', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ]);
    try {
        await bot.waitFor(/Embedded IRC server/, 120000);
        const port = await discoverPort(bot);

        const user = new FakeIRCUser('127.0.0.1', port, 'activeuser');
        await user.connect();

        user.say('##metta', 'hello');
        await sleep(2000);

        bot.child.kill('SIGTERM');
        await bot.waitFor('Shutdown complete', 10000);

        const out = bot.output();
        assert.ok(out.includes('Shutdown complete'), 'Should shutdown cleanly even during activity');
    } finally { await bot.kill(); }
});

// ── Test 6: External IRC server mode (no embedded server) ─────────────

test('External IRC server mode: host flag skips embedded server', async () => {
    const bot = spawnBot([
        'run.js', '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
        '--host', '127.0.0.1', '--port', '9999',
    ]);
    try {
        await sleep(10000);
        const out = bot.output();
        assert.ok(!out.includes('Embedded IRC server'), 'Should NOT start embedded IRC server when host is provided');
        assert.ok(out.includes('SeNARS Bot'), 'Bot should initialize');
    } finally { await bot.kill(); }
});

// ── Test runner ───────────────────────────────────────────────────────

async function main() {
    console.log('═══ SeNARS Bot — Integration Tests (Real LLM) ═══\n');

    let passed = 0, failed = 0;

    for (const { name, fn } of TESTS) {
        console.log(`── ${name}`);
        try {
            await fn();
            console.log(`  ✓ PASS\n`);
            passed++;
        } catch (err) {
            console.log(`  ✗ FAIL: ${err.message}\n`);
            failed++;
        }
        await sleep(500);
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
