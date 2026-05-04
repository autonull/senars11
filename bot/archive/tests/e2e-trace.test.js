#!/usr/bin/env node
/**
 * e2e-trace.test.js — Full pipeline diagnostic trace with real LLM.
 *
 * Starts the bot with Transformers.js, connects a fake IRC user, sends one
 * message, then traces every pipeline stage to pinpoint where things work
 * or break.
 *
 * Usage:
 *   node bot/tests/e2e-trace.test.js
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { Logger, resolveWithFallback } from '@senars/core';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
const BOT_DIR = resolve(__dirname, '..');

Logger.setLevel('WARN');

const MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

/* ── Fake IRC user ───────────────────────────────────────────────────── */

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
    disconnect() { this._send('QUIT :done'); this._socket?.destroy(); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Diagnostic trace ──────────────────────────────────────────────────── */

const PIPELINE_STAGES = [
    { key: 'llmWarmup',       pattern: /Warming up LLM|LLM ready|LLM returned empty|LLM warm-up failed/ },
    { key: 'messageReceived', pattern: /New message:/ },
    { key: 'contextBuilt',    pattern: /Context built:/ },
    { key: 'llmInvoked',      pattern: /Invoking LLM/ },
    { key: 'llmResponded',    pattern: /LLM response:/ },
    { key: 'autoRespondSent', pattern: /auto-respond\] →/ },
    { key: 'error',           pattern: /Error:|error:|FAIL|crash/ },
];

async function tracePipeline(output) {
    console.log('\n═══ Pipeline Stage Trace ═══\n');
    const results = {};
    const matchingLines = [];

    for (const { key, pattern } of PIPELINE_STAGES) {
        const lines = output.filter(l => pattern.test(l));
        results[key] = lines.length > 0;
        for (const l of lines.slice(0, 2)) matchingLines.push(`  [${key}] ${l.trim()}`);
    }

    for (const [stage, found] of Object.entries(results)) {
        console.log(`  ${found ? '✅' : '❌'} ${stage}: ${found ? 'observed' : 'NOT observed'}`);
    }

    if (matchingLines.length) {
        console.log('\n── Key log lines ──');
        for (const l of matchingLines) console.log(l);
    }

    const missingStages = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    const errorFound = results.error;

    if (errorFound) {
        console.log('\n⚠️  ERRORS detected in output');
        const errorLines = output.filter(l => /Error|error|crash|FAIL/.test(l));
        for (const l of errorLines.slice(0, 5)) console.log(`  ${l.trim()}`);
    }

    if (missingStages.length && !errorFound) {
        console.log(`\n⚠️  Pipeline stages not observed: ${missingStages.join(', ')}`);
    }

    return { results, missingStages, errorFound };
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — Pipeline Diagnostic Trace (Real LLM) ═══\n');

    const { child, output, port } = await startBotInProcess();

    try {
        const user = new FakeIRCUser('127.0.0.1', port, 'testuser');
        await user.connect();
        console.log('✅ Test user connected');

        await sleep(2000);

        // Send a single message and trace the full pipeline
        console.log('\n→ Sending: "what is 2+2?"');
        user.say('##metta', 'what is 2+2?');

        // Wait for response or timeout (real LLM may take up to 2 min)
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
            await sleep(500);
            if (user.messages.find(m => m.from === 'SeNARchy')) break;
        }

        if (user.messages.length > 0) {
            const reply = user.messages.find(m => m.from === 'SeNARchy');
            console.log(`\n✅ Bot responded: "${reply?.content?.substring(0, 120)}"`);
        } else {
            console.log('\n❌ Bot did NOT respond within 3 min');
        }

        // Trace pipeline stages
        await tracePipeline(output);
    } finally {
        if (!child.killed) child.kill('SIGTERM');
        await sleep(2000);
        if (!child.killed) { try { child.kill('SIGKILL'); } catch {} }
    }
}

async function startBotInProcess() {
    const child = spawn('node', [
        'run.js',
        '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'transformers',
        '--model', MODEL,
    ], {
        cwd: BOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = [];
    let botPort = null;

    child.stdout.on('data', d => {
        const lines = d.toString().split('\n');
        for (const l of lines) {
            output.push(l);
            const m = l.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
            if (m) botPort = parseInt(m[1], 10);
        }
        process.stdout.write(`[BOT] ${d}`);
    });
    child.stderr.on('data', d => process.stderr.write(`[BOT-ERR] ${d}`));

    // Model download may take several minutes on first run
    const deadline = Date.now() + 300_000;
    while (!botPort && Date.now() < deadline) {
        await sleep(500);
    }
    if (!botPort) throw new Error('Bot never started embedded IRC server');

    return { child, output, port: botPort };
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
