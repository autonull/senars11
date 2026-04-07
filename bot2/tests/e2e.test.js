#!/usr/bin/env node
/**
 * e2e.test.js — Event-driven end-to-end test.
 *
 * Watches bot stdout for pipeline stage markers, IRC socket for responses.
 * No artificial delays. Completes as fast as the LLM responds.
 *
 * Usage: node bot2/tests/e2e.test.js [--provider transformers|openai|ollama|dummy]
 */

import { createConnection } from 'net';
import { spawn, execSync } from 'child_process';
import { strict as assert } from 'assert';

/* ── FakeIRCUser ────────────────────────────────────────────────────── */

class FakeIRCUser {
    constructor(nick) {
        this.nick = nick;
        this.messages = [];
        this._socket = null;
        this._buffer = '';
        this._listeners = new Set();
    }

    connect(host, port) {
        return new Promise((resolve, reject) => {
            this._socket = createConnection({ host, port });
            this._socket.on('data', (d) => this._onData(d));
            this._socket.on('error', reject);
            this._socket.on('connect', () => {
                this._send(`NICK ${this.nick}`);
                this._send(`USER ${this.nick} 0 * :${this.nick}`);
                const onReg = (line) => {
                    if (line.includes(' 001 ')) {
                        this._listeners.delete(onReg);
                        this._send('JOIN ##metta');
                        setTimeout(resolve, 50);
                    }
                };
                this._listeners.add(onReg);
            });
        });
    }

    _onData(data) {
        this._buffer += data.toString('utf-8');
        const lines = this._buffer.split('\r\n');
        this._buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim()) continue;
            for (const fn of this._listeners) fn(line);
            const match = line.match(/:([^!]+)!.*PRIVMSG (\S+) :(.+)/);
            if (match) this.messages.push({ from: match[1], channel: match[2], content: match[3] });
        }
    }

    _send(line) { this._socket.write(line + '\r\n'); }
    say(channel, content) { this._send(`PRIVMSG ${channel} :${content}`); }
    disconnect() { this._send('QUIT :done'); this._socket?.destroy(); }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

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

function killPort(port) {
    try { execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: 'pipe' }); } catch {}
}

async function waitForPort(port, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await new Promise((resolve, reject) => {
                const s = createConnection({ host: '127.0.0.1', port });
                s.on('connect', () => { s.destroy(); resolve(); });
                s.on('error', reject);
                setTimeout(() => { s.destroy(); reject(new Error('timeout')); }, 500);
            });
            return;
        } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error(`Port ${port} not ready`);
}

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    const provider = process.argv.includes('--provider')
        ? process.argv[process.argv.indexOf('--provider') + 1]
        : 'dummy';

    console.log(`═══ SeNARS Bot2 E2E [provider=${provider}] ═══\n`);

    // Kill any stale process on port 6668
    killPort(6668);
    await new Promise(r => setTimeout(r, 500));

    // Start bot (no --host → embedded server on 127.0.0.1:6668)
    const botArgs = ['run.js', '--mode', 'irc', '--profile', 'parity', '--nick', 'SeNARchy', '--channel', '##metta'];
    if (provider !== 'transformers') botArgs.push('--provider', provider);
    if (provider === 'dummy') botArgs.push('--model', 'dummy');

    const bot = spawn('node', botArgs, {
        cwd: '/home/me/senars10/bot2',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'development' },
    });

    let botLog = '';
    bot.stdout.on('data', d => { botLog += d; process.stdout.write(`[BOT] ${d}`); });
    bot.stderr.on('data', d => process.stderr.write(`[ERR] ${d}`));

    try {
        // 1. Wait for bot ready signal
        console.log('[1] Waiting for bot ready...');
        await waitFor(() => botLog.includes('Starting MeTTa agent loop') ? true : null, 30000);
        console.log('✅ Bot ready\n');

        // 2. Connect test user
        console.log('[2] Connecting test user...');
        const user = new FakeIRCUser('testuser');
        await user.connect('127.0.0.1', 6668);
        console.log('✅ User connected\n');

        // 3. Send message
        console.log('[3] Sending: "what is 2+2?"');
        user.say('##metta', 'what is 2+2?');

        // 4. Watch pipeline stages
        console.log('[4] Watching pipeline...');
        await waitFor(() => botLog.includes('[MeTTa] New message') ? true : null, 10000);
        console.log('  ✅ Message received');

        await waitFor(() => botLog.includes('[MeTTa] Context built') ? true : null, 10000);
        console.log('  ✅ Context built');

        await waitFor(() => botLog.includes('[MeTTa] Invoking LLM') ? true : null, 10000);
        console.log('  ✅ LLM invoked');

        await waitFor(() => botLog.includes('[MeTTa] LLM response') ? true : null, 120000);
        console.log('  ✅ LLM responded');

        // 5. Wait for IRC response
        console.log('[5] Waiting for IRC response...');
        await waitFor(() => user.messages.find(m => m.from === 'SeNARchy'), 10000);
        const reply = user.messages.find(m => m.from === 'SeNARchy');
        console.log(`  ✅ Bot replied: "${reply.content.substring(0, 120)}"`);

        // Verify no errors
        assert.ok(!botLog.includes('Not connected'), 'No "Not connected" warnings');
        assert.ok(!botLog.includes('[undefined@irc]'), 'No undefined sender');

        console.log('\n✅ ALL STAGES PASSED');
    } catch (err) {
        console.error(`\n❌ FAILED: ${err.message}`);
        console.log('\n── Bot log (last 30 lines) ──');
        for (const line of botLog.split('\n').filter(l => l.trim()).slice(-30)) {
            console.log(`  ${line}`);
        }
        process.exit(1);
    } finally {
        bot.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 1000));
        try { bot.kill('SIGKILL'); } catch {}
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
