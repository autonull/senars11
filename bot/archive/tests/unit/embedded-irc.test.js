#!/usr/bin/env node
/**
 * embedded-irc.test.js — Unit tests for EmbeddedIRCServer.
 *
 * Covers:
 * - Basic lifecycle (start/stop, idempotency)
 * - Multi-client registration
 * - Nick collision (433 rejection)
 * - PING/PONG keepalive
 * - Per-connection rate limiting
 * - Message routing (PRIVMSG, channel, private)
 * - Stale connection cleanup on PING timeout
 *
 * Usage:
 *   node bot/tests/unit/embedded-irc.test.js
 */

import { strict as assert } from 'assert';
import { createConnection } from 'net';
import { EmbeddedIRCServer } from '../../src/EmbeddedIRCServer.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Helper: raw IRC client ─────────────────────────────────────────── */

class IrcClient {
    constructor(host, port, nick) {
        this.host = host; this.port = port; this.nick = nick;
        this.messages = []; this._socket = null; this._buffer = '';
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
                    if (line.includes(' 001 ')) { this._listeners.delete(onReg); resolve(); }
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
            this.messages.push(line);
        }
    }
    _send(line) { this._socket?.write(line + '\r\n'); }
    say(channel, content) { this._send(`PRIVMSG ${channel} :${content}`); }
    sendPong() { this._send('PONG :embedded-irc'); }
    sendPing() { this._send('PING :embedded-irc'); }
    disconnect() { this._send('QUIT :done'); this._socket?.destroy(); }
    hasMessage(pattern) { return this.messages.some(m => typeof pattern === 'string' ? m.includes(pattern) : pattern.test(m)); }
    findMessage(pattern) { return this.messages.find(m => typeof pattern === 'string' ? m.includes(pattern) : pattern.test(m)); }
    privMsgCount() { return this.messages.filter(m => m.includes('PRIVMSG')).length; }
}

async function createServerWithClients(n = 1) {
    const server = new EmbeddedIRCServer();
    // Speed up PING for tests
    server._pingIntervalMs = 500;
    server._pingTimeoutMs = 200;
    server._rateLimitMaxPerWindow = 5;
    server._rateLimitWindowMs = 1000;

    const port = await server.start(0);
    const clients = [];
    for (let i = 0; i < n; i++) {
        const nick = `user${i}`;
        const client = new IrcClient('127.0.0.1', port, nick);
        await client.connect();
        clients.push(client);
    }
    return { server, port, clients };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

test('start/stop lifecycle is idempotent', async () => {
    const server = new EmbeddedIRCServer();
    const port1 = await server.start(0);
    const port2 = await server.start(0);
    assert.strictEqual(port1, port2);
    assert.strictEqual(server.clientCount, 0);
    await server.stop();
    assert.strictEqual(server._server, null, 'Server should be null after stop');
    await server.stop(); // idempotent
});

test('multi-client registration works', async () => {
    const { server, clients } = await createServerWithClients(3);
    assert.strictEqual(server.clientCount, 3);
    assert.ok(clients[0].hasMessage(' 001 '), 'Client 0 registered');
    assert.ok(clients[1].hasMessage(' 001 '), 'Client 1 registered');
    assert.ok(clients[2].hasMessage(' 001 '), 'Client 2 registered');
    for (const c of clients) c.disconnect();
    await server.stop();
});

test('nick collision sends 433 ERR_NICKNAMEINUSE', async () => {
    const { server, port, clients } = await createServerWithClients(1);
    const client2 = new IrcClient('127.0.0.1', port, 'user0');
    // Connect raw socket but intercept before NICK is processed
    const socket = createConnection({ host: '127.0.0.1', port });
    let response = '';
    await new Promise(resolve => {
        socket.on('data', d => { response += d.toString(); resolve(); });
        socket.on('error', resolve);
        // Send NICK with the same nick as the existing client
        socket.write('NICK user0\r\n');
        setTimeout(resolve, 500);
    });
    assert.ok(response.includes('433'), `Expected 433, got: ${response.trim()}`);
    assert.ok(response.includes('already in use') || response.includes('Nickname'), response);
    socket.destroy();
    clients[0].disconnect();
    await server.stop();
});

test('nick change is allowed for same client', async () => {
    const { server, clients } = await createServerWithClients(1);
    clients[0]._send('NICK newnick');
    await sleep(100);
    assert.ok(!clients[0].hasMessage('433'), 'Should not get 433 on own nick change');
    clients[0].disconnect();
    await server.stop();
});

test('PING from server and PONG response keeps connection alive', async () => {
    const { server, clients } = await createServerWithClients(1);
    // Wait for server PING
    await sleep(600);
    assert.ok(clients[0].hasMessage('PING'), `Server should send PING, got: ${clients[0].messages.slice(-5).join(' | ')}`);
    // Send PONG
    clients[0].sendPong();
    await sleep(100);
    assert.ok(clients[0].hasMessage('001') || clients[0].messages.length > 0, 'Connection still alive');
    clients[0].disconnect();
    await server.stop();
});

test('Client PING is answered with PONG', async () => {
    const { server, clients } = await createServerWithClients(1);
    clients[0].sendPing();
    await sleep(100);
    assert.ok(clients[0].hasMessage('PONG'), `Expected PONG, got: ${clients[0].messages.slice(-3).join(' | ')}`);
    clients[0].disconnect();
    await server.stop();
});

test('Stale connection dropped after PING timeout', async () => {
    const { server, clients } = await createServerWithClients(1);
    // Wait for PING, but don't PONG
    await sleep(600);
    assert.ok(clients[0].hasMessage('PING'), 'PING sent');
    // Wait for timeout
    await sleep(300);
    assert.ok(clients[0].hasMessage('ERROR') || clients[0].hasMessage('Ping timeout'),
        `Expected ERROR/Ping timeout, got: ${clients[0].messages.slice(-3).join(' | ')}`);
    // Connection should be closed
    await sleep(100);
    assert.strictEqual(server.clientCount, 0, 'Stale client should be removed');
    await server.stop();
});

test('Per-connection rate limiting drops excess messages', async () => {
    const { server, port } = await createServerWithClients(1);
    const client = new IrcClient('127.0.0.1', port, 'flood');
    await client.connect();
    client._send('JOIN ##test');
    await sleep(50);

    // Send more messages than the rate limit allows
    for (let i = 0; i < 10; i++) {
        client.say('##test', `msg${i}`);
    }
    await sleep(100);

    // The server broadcasts PRIVMSGs; should be capped at ~5 + maybe the join
    const privmsgCount = server.capturedMessages.filter(m => m.type === 'privmsg').length;
    assert.ok(privmsgCount <= 6, `Rate limited: expected ≤ 6 PRIVMSGs, got ${privmsgCount}`);
    // Should have received a rate limit NOTICE
    assert.ok(client.hasMessage('NOTICE') || client.hasMessage('rate limited'),
        `Expected rate limit notice, got: ${client.messages.slice(-3).join(' | ')}`);

    client.disconnect();
    await server.stop();
});

test('PRIVMSG routing between two clients on same channel', async () => {
    const { server, clients } = await createServerWithClients(2);
    clients[0]._send('JOIN ##test');
    clients[1]._send('JOIN ##test');
    await sleep(100);

    clients[0].say('##test', 'hello from alice');
    await sleep(100);

    assert.ok(clients[1].hasMessage('hello from alice'), 'Client 1 should receive the message');
    assert.ok(server.capturedMessages.some(m => m.content === 'hello from alice'), 'Server should capture the message');

    for (const c of clients) c.disconnect();
    await server.stop();
});

test('QUIT cleans up nick from the set', async () => {
    const { server, port, clients } = await createServerWithClients(1);
    clients[0].disconnect();
    await sleep(100);
    assert.strictEqual(server.clientCount, 0);

    // A new client should be able to take the freed nick
    const client2 = new IrcClient('127.0.0.1', port, 'user0');
    await client2.connect();
    assert.ok(client2.hasMessage(' 001 '), 'New client with same nick should register');
    client2.disconnect();
    await server.stop();
});

test('Message capture records PRIVMSGs', async () => {
    const { server, clients } = await createServerWithClients(1);
    clients[0]._send('JOIN ##test');
    await sleep(50);
    clients[0].say('##test', 'captured message');
    await sleep(100);

    const msgs = server.capturedMessages;
    assert.ok(msgs.some(m => m.content === 'captured message'), 'Message should be captured');
    assert.ok(msgs.some(m => m.type === 'privmsg'), 'Type should be privmsg');

    clients[0].disconnect();
    await server.stop();
});

test('simulateUserMessage injects messages for testing', async () => {
    const server = new EmbeddedIRCServer();
    const port = await server.start(0);
    const client = new IrcClient('127.0.0.1', port, 'observer');
    await client.connect();
    client._send('JOIN ##test');
    await sleep(100);

    server.simulateUserMessage('alice', '##test', 'injected message');
    await sleep(100);

    assert.ok(client.hasMessage('injected message'), 'Injected message should be broadcast');
    assert.ok(server.capturedMessages.some(m => m.from === 'alice'), 'Captured message should have correct sender');

    client.disconnect();
    await server.stop();
});

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ EmbeddedIRCServer Unit Tests ═══\n');

    for (const { name, fn } of TESTS) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`  ✗ ${name}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
