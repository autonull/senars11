#!/usr/bin/env node
/**
 * e2e-multi-bot.test.js — Two real bots, one shared IRC server, real SmolLM.
 *
 * In-process: two Bot instances share one EmbeddedIRCServer.
 * A raw TCP FakeIRCUser drives real IRC PRIVMSG interactions.
 * Each bot loads its own Transformers.js pipeline (real inference).
 *
 *   node bot/tests/e2e-multi-bot.test.js
 */

import { strict as assert } from 'assert';
import { createConnection } from 'net';
import { Bot } from '../src/index.js';
import { EmbeddedIRCServer } from '../src/EmbeddedIRCServer.js';
import { Logger } from '@senars/core';

Logger.setLevel('WARN');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Fake IRC user (raw TCP) ─────────────────────────────────────────────── */

class FakeIRCUser {
    #sock; #buf = ''; #msgs = [];

    constructor(host, port, nick) { this.host = host; this.port = port; this.nick = nick; }
    get messages() { return this.#msgs; }

    connect() {
        return new Promise((resolve, reject) => {
            this.#sock = createConnection({ host: this.host, port: this.port });
            this.#sock.on('error', reject);
            this.#sock.on('connect', () => {
                this._w(`NICK ${this.nick}`);
                this._w(`USER ${this.nick.toLowerCase()} 0 * :${this.nick}`);
            });
            this.#sock.on('data', d => {
                this.#buf += d.toString();
                const lines = this.#buf.split('\r\n');
                this.#buf = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const m = line.match(/:([^!]+)!.*PRIVMSG (##?\S+) :(.+)/);
                    if (m) this.#msgs.push({ from: m[1], channel: m[2], content: m[3] });
                    if (line.includes(' 001 ')) { this._w('JOIN ##metta'); setTimeout(resolve, 300); }
                }
            });
        });
    }

    say(t, c) { this._w(`PRIVMSG ${t} :${c}`); }
    _w(l) { this.#sock?.write(l + '\r\n'); }
    disconnect() { this._w('QUIT :bye'); this.#sock?.destroy(); }

    /** Wait until `min` new PRIVMSG lines from `from` appear (or any if null). */
    wait({ from = null, min = 1, timeout = 120000 } = {}) {
        return new Promise(resolve => {
            const base = this.#msgs.length;
            const end = Date.now() + timeout;
            const poll = () => {
                const hits = this.#msgs.slice(base).filter(m => !from || m.from === from);
                if (hits.length >= min) { resolve(hits); return; }
                Date.now() < end ? setTimeout(poll, 100) : resolve(hits);
            };
            setTimeout(poll, 100);
        });
    }
}

/* ── Wait for a bot's MeTTa loop to complete a cycle with LLM ready ──────── */

function waitForReady(bot, timeout = 180000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${bot.config.nick} ready timeout`)), timeout);
        const b = bot.agent._mettaLoopBuilder;
        const handler = () => {
            if (b._llmReady) {
                clearTimeout(t);
                resolve();
            }
        };
        b.on('cycle-end', handler);
        if (b._llmReady) { clearTimeout(t); resolve(); }
    });
}

/* ── Bot config ───────────────────────────────────────────────────────────── */

function cfg(nick, port) {
    return {
        profile: 'parity', nick,
        embodiments: { irc: { enabled: true, host: '127.0.0.1', port, channels: ['##metta'] } },
        lm: { provider: 'transformers', modelName: 'HuggingFaceTB/SmolLM2-360M-Instruct', temperature: 0.7, maxTokens: 128 },
        loop: { budget: 50, sleepMs: 1000 },
        rateLimit: { perChannelMax: 10, perChannelInterval: 2000, globalMax: 20, globalInterval: 5000 },
    };
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }
let pass = 0, fail = 0;

async function main() {
    console.log('═══ SeNARS Multi-Bot E2E — Real SmolLM ═══\n');

    // 1. Shared IRC server
    const srv = new EmbeddedIRCServer();
    const port = await srv.start(0);
    console.log(`IRC server: 127.0.0.1:${port}\n`);

    // 2. Bot Alpha
    console.log('[1/3] Bot Alpha…');
    const A = new Bot(cfg('Alpha', port));
    await A.initialize();
    await A.start();
    await waitForReady(A);
    console.log('✅ Alpha\n');

    // 3. Bot Beta
    console.log('[2/3] Bot Beta…');
    const B = new Bot(cfg('Beta', port));
    await B.initialize();
    await B.start();
    await waitForReady(B);
    console.log('✅ Beta\n');

    // 4. Human user
    const H = new FakeIRCUser('127.0.0.1', port, 'Human');
    await H.connect();
    await sleep(1000);
    console.log('✅ Human\n');
    console.log('[3/3] Running scenarios…\n');

    for (const { name, fn } of TESTS) {
        console.log(`── ${name}`);
        try {
            await fn(srv, A, B, H);
            console.log('  ✓ PASS\n'); pass++;
        } catch (e) {
            console.log(`  ✗ FAIL: ${e.message}\n`); fail++;
        }
    }

    H.disconnect();
    await A.shutdown();
    await B.shutdown();
    await srv.stop();

    console.log(`${pass}/${pass + fail} passed.`);
    if (fail) console.log(`${fail} FAILED.`);
    process.exit(fail ? 1 : 0);
}

/* ═══ Scenarios ═══ */

test('Both respond when addressed', async (srv, A, B, H) => {
    H.say('##metta', 'Alpha, what is your name?');
    const a = await H.wait({ from: 'Alpha', min: 1 });
    assert.ok(a.length, 'Alpha must respond');
    console.log(`  Alpha → "${a[0].content.slice(0, 150)}"`);

    H.say('##metta', 'Beta, who are you?');
    const b = await H.wait({ from: 'Beta', min: 1 });
    assert.ok(b.length, 'Beta must respond');
    console.log(`  Beta  → "${b[0].content.slice(0, 150)}"`);
});

test('Alpha mentions Beta → Beta replies', async (srv, A, B, H) => {
    H.say('##metta', 'Alpha, greet Beta by name');
    const a = await H.wait({ from: 'Alpha', min: 1 });
    assert.ok(a.length, 'Alpha must respond');
    console.log(`  Alpha → "${a[0].content.slice(0, 150)}"`);

    const b = await H.wait({ from: 'Beta', min: 1 });
    assert.ok(b.length, 'Beta must reply to being mentioned');
    console.log(`  Beta  → "${b[0].content.slice(0, 150)}"`);
});

test('Multi-turn: Alpha then Beta', async (srv, A, B, H) => {
    H.say('##metta', 'Alpha, what is 2 plus 2');
    const a = await H.wait({ from: 'Alpha', min: 1 });
    assert.ok(a.length, 'Alpha turn 1');
    console.log(`  Alpha → "${a[0].content.slice(0, 150)}"`);

    H.say('##metta', 'Beta, confirm that answer');
    const b = await H.wait({ from: 'Beta', min: 1 });
    assert.ok(b.length, 'Beta turn 2');
    console.log(`  Beta  → "${b[0].content.slice(0, 150)}"`);
});

test('URL with nick does NOT trigger response', async (srv, A, B, H) => {
    H.say('##metta', 'see https://example.com/Alpha/page');
    const r = await H.wait({ from: 'Alpha', timeout: 8000 });
    assert.strictEqual(r.length, 0, `Alpha must ignore URL with nick (got ${r.length})`);
    console.log('  Alpha correctly ignored URL');
});

test('Group address: at least one bot responds', async (srv, A, B, H) => {
    H.say('##metta', 'Alpha and Beta, say hello');
    const r = await H.wait({ min: 1 });
    const fromA = r.filter(m => m.from === 'Alpha');
    const fromB = r.filter(m => m.from === 'Beta');
    assert.ok(fromA.length || fromB.length, 'At least one bot must respond');
    for (const m of r) console.log(`  ${m.from} → "${m.content.slice(0, 150)}"`);
});

test('Substantive answer quality', async (srv, A, B, H) => {
    H.say('##metta', 'Alpha, why does rain fall — one sentence');
    const r = await H.wait({ from: 'Alpha', min: 1 });
    assert.ok(r.length, 'Alpha must respond');
    assert.ok(r[0].content.length > 10, `Too short: ${r[0].content.length} chars`);
    console.log(`  Alpha → "${r[0].content.slice(0, 200)}"`);
});

test('Server still healthy', async (srv, A, B, H) => {
    assert.ok(srv.clientCount >= 1, 'clients');
    H.say('##metta', 'Alpha, final check');
    const r = await H.wait({ from: 'Alpha', min: 1 });
    assert.ok(r.length, 'Alpha still responding');
    console.log(`  ok — clients=${srv.clientCount}`);
});

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
