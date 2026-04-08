#!/usr/bin/env node
/**
 * e2e-trace.test.js — Full end-to-end trace of the bot pipeline.
 *
 * Starts the bot in-process with an embedded EmbeddedIRCServer, connects a raw TCP
 * client as a simulated IRC user, sends messages, and traces every step.
 *
 * Usage:
 *   node bot/tests/e2e-trace.test.js
 */

import { createConnection } from 'net';
import { spawn } from 'child_process';
import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { Logger, resolveWithFallback } from '@senars/core';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
const BOT_DIR = resolve(__dirname, '..');

/* ── Simulated IRC user (raw TCP client) ─────────────────────────────── */

class FakeIRCUser {
    constructor(host, port, nick) {
        this.nick = nick;
        this.messages = [];
        this.rawLines = [];
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
            this.rawLines.push(line);
            for (const fn of this._listeners) fn(line);
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

/* ── Helpers ──────────────────────────────────────────────────────────── */

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — E2E Trace Test ═══\n');

    // Step 1: Start the bot process
    console.log('[1/6] Starting bot process...');
    const botProcess = spawn('node', [
        'run.js',
        '--mode', 'irc',
        '--profile', 'parity',
        '--nick', 'SeNARchy',
        '--channel', '##metta',
        '--provider', 'dummy',
    ], {
        cwd: BOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'development' },
    });

    let botOutput = '';
    let botErrors = '';
    let botPort = null;

    botProcess.stdout.on('data', (data) => {
        const str = data.toString();
        botOutput += str;
        process.stdout.write(`[BOT] ${str}`);
        const m = str.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
        if (m) botPort = parseInt(m[1], 10);
    });
    botProcess.stderr.on('data', (data) => {
        const str = data.toString();
        botErrors += str;
        process.stderr.write(`[BOT-ERR] ${str}`);
    });
    botProcess.on('exit', (code, signal) => {
        console.log(`\n[BOT] Process exited: code=${code}, signal=${signal}`);
        console.log(`[BOT] Total stdout: ${botOutput.length} chars`);
        console.log(`[BOT] Total stderr: ${botErrors.length} chars`);
    });

    try {
        // Step 2: Wait for embedded IRC server to be ready (discover port from stdout)
        console.log('[2/6] Waiting for embedded IRC server...');
        const deadline = Date.now() + 30000;
        while (!botPort && Date.now() < deadline) {
            await sleep(200);
            const m = botOutput.match(/Embedded IRC server: 127\.0\.0\.1:(\d+)/);
            if (m) botPort = parseInt(m[1], 10);
        }
        if (!botPort) throw new Error('Bot never started embedded IRC server');
        console.log(`✅ Embedded IRC server ready on port ${botPort}\n`);

        // Step 3: Connect fake user
        console.log('[3/6] Connecting test user...');
        const user = new FakeIRCUser('127.0.0.1', botPort, 'testuser');
        await user.connect();
        console.log(`✅ Test user connected and joined ##metta (port ${botPort})\n`);

        // Give the bot a moment to settle
        await sleep(2000);

        // Step 4: Send a test message
        console.log('[4/6] Sending test message: "what is 2+2?"');
        user.say('##metta', 'what is 2+2?');
        console.log('✅ Message sent\n');

        // Step 5: Wait for response
        console.log('[5/6] Waiting for bot response (up to 90s)...');
        const deadline = Date.now() + 90000;
        let responded = false;
        let replyContent = '';

        while (Date.now() < deadline) {
            await sleep(1000);
            const reply = user.messages.find(m => m.from === 'SeNARchy');
            if (reply) {
                responded = true;
                replyContent = reply.content;
                break;
            }
            // Check if bot process is still alive
            if (botProcess.killed) {
                console.log('⚠️  Bot process exited unexpectedly');
                break;
            }
        }

        // Step 6: Report results
        console.log('\n[6/6] Results:');
        console.log(`  Bot responded: ${responded}`);
        if (responded) {
            console.log(`  Reply: "${replyContent.substring(0, 200)}"`);
        }

        // Analyze bot output for clues
        console.log('\n── Bot Output Analysis ──');
        const hasNewMessage = botOutput.includes('[MeTTa] New message');
        const hasContextBuilt = botOutput.includes('[MeTTa] Context built') || botOutput.includes('Context built');
        const hasInvokingLLM = botOutput.includes('[MeTTa] Invoking LLM') || botOutput.includes('Invoking LLM');
        const hasLLMResponse = botOutput.includes('[MeTTa] LLM response') || botOutput.includes('LLM response');
        const hasAutoRespond = botOutput.includes('[MeTTa auto-respond]');
        const hasWarmup = botOutput.includes('Warming up LLM') || botOutput.includes('LLM ready') || botOutput.includes('LLM warm-up');
        const hasError = botOutput.includes('Error') || botOutput.includes('error') || botErrors.length > 0;

        console.log(`  LLM warmup: ${hasWarmup ? '✅' : '❌'}`);
        console.log(`  Message received: ${hasNewMessage ? '✅' : '❌'}`);
        console.log(`  Context built: ${hasContextBuilt ? '✅' : '❌'}`);
        console.log(`  LLM invoked: ${hasInvokingLLM ? '✅' : '❌'}`);
        console.log(`  LLM responded: ${hasLLMResponse ? '✅' : '❌'}`);
        console.log(`  Auto-respond: ${hasAutoRespond ? '✅' : '❌'}`);
        console.log(`  Errors: ${hasError ? '⚠️' : '✅'}`);

        // Determine where the pipeline broke
        if (!hasNewMessage) {
            console.log('\n❌ FAILURE: Message never reached MeTTaLoop');
            console.log('   Possible causes: IRCChannel not emitting, EmbodimentBus not routing, AgentMessageQueue not dequeuing');
        } else if (!hasContextBuilt) {
            console.log('\n❌ FAILURE: ContextBuilder hung or crashed');
            console.log('   Possible causes: semanticMemory hang, historySpace hang, Promise.all deadlock');
        } else if (!hasInvokingLLM) {
            console.log('\n❌ FAILURE: ContextBuilder returned but loop did not proceed to LLM');
            console.log('   Possible causes: exception in build(), loop state corruption');
        } else if (!hasLLMResponse) {
            console.log('\n❌ FAILURE: LLM invocation hung or crashed');
            console.log('   Possible causes: model loading hang, network timeout, generateText() never returns');
        } else if (!hasAutoRespond && !responded) {
            console.log('\n❌ FAILURE: LLM responded but reply was not sent');
            console.log('   Possible causes: sendReply embodiment lookup failed, embodiment not connected, reply text extraction failed');
        } else if (responded) {
            console.log('\n✅ SUCCESS: Full pipeline working');
        } else {
            console.log('\n⚠️  UNKNOWN: Check bot output above for details');
        }

        // Print relevant bot output sections
        console.log('\n── Key Bot Log Lines ──');
        const lines = botOutput.split('\n').filter(l =>
            l.includes('MeTTa') ||
            l.includes('LLM') ||
            l.includes('Context') ||
            l.includes('respond') ||
            l.includes('Error') ||
            l.includes('embodiment') ||
            l.includes('registered') ||
            l.includes('Connected') ||
            l.includes('Starting') ||
            l.includes('Warming')
        );
        for (const line of lines.slice(-30)) {
            console.log(`  ${line}`);
        }

        if (botErrors.trim()) {
            console.log('\n── Bot Errors ──');
            for (const line of botErrors.split('\n').filter(l => l.trim()).slice(-20)) {
                console.log(`  ${line}`);
            }
        }

    } finally {
        console.log('\n── Cleanup ──');
        if (!botProcess.killed) botProcess.kill('SIGTERM');
        await sleep(2000);
        if (!botProcess.killed) { try { botProcess.kill('SIGKILL'); } catch {} }
        console.log('✅ Bot process terminated');
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
