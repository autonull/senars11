/**
 * embedded-irc.test.js — Unit tests for EmbeddedIRCServer.
 */

import { createConnection } from 'net';
import { EmbeddedIRCServer } from '../../src/EmbeddedIRCServer.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

class IrcClient {
    constructor(host, port, nick) {
        this.host = host;
        this.port = port;
        this.nick = nick;
        this.messages = [];
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
                        resolve();
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
            if (!line.trim()) {
                continue;
            }
            for (const fn of this._listeners) {
                fn(line);
            }
            this.messages.push(line);
        }
    }
    _send(line) { this._socket?.write(line + '\r\n'); }
    say(channel, content) { this._send(`PRIVMSG ${channel} :${content}`); }
    sendPong() { this._send('PONG :embedded-irc'); }
    sendPing() { this._send('PING :embedded-irc'); }
    disconnect() {
        this._send('QUIT :done');
        this._socket?.destroy();
    }
    hasMessage(pattern) {
        return this.messages.some(m => typeof pattern === 'string' ? m.includes(pattern) : pattern.test(m));
    }
    findMessage(pattern) {
        return this.messages.find(m => typeof pattern === 'string' ? m.includes(pattern) : pattern.test(m));
    }
    privMsgCount() { return this.messages.filter(m => m.includes('PRIVMSG')).length; }
}

async function createServerWithClients(n = 1) {
    const server = new EmbeddedIRCServer();
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

describe('EmbeddedIRCServer', () => {
    test('start/stop lifecycle is idempotent', async () => {
        const server = new EmbeddedIRCServer();
        const port1 = await server.start(0);
        const port2 = await server.start(0);
        expect(port1).toBe(port2);
        expect(server.clientCount).toBe(0);
        await server.stop();
        expect(server._server).toBeNull();
        await server.stop();
    });

    test('multi-client registration works', async () => {
        const { server, clients } = await createServerWithClients(3);
        expect(server.clientCount).toBe(3);
        expect(clients[0].hasMessage(' 001 ')).toBe(true);
        expect(clients[1].hasMessage(' 001 ')).toBe(true);
        expect(clients[2].hasMessage(' 001 ')).toBe(true);
        for (const c of clients) {
            c.disconnect();
        }
        await server.stop();
    });

    test('nick collision sends 433 ERR_NICKNAMEINUSE', async () => {
        const { server, port, clients } = await createServerWithClients(1);
        const socket = createConnection({ host: '127.0.0.1', port });
        let response = '';
        await new Promise(resolve => {
            socket.on('data', d => { response += d.toString(); resolve(); });
            socket.on('error', resolve);
            socket.write('NICK user0\r\n');
            setTimeout(resolve, 500);
        });
        expect(response.includes('433')).toBe(true);
        socket.destroy();
        clients[0].disconnect();
        await server.stop();
    });

    test('nick change is allowed for same client', async () => {
        const { server, clients } = await createServerWithClients(1);
        clients[0]._send('NICK newnick');
        await sleep(100);
        expect(clients[0].hasMessage('433')).toBe(false);
        clients[0].disconnect();
        await server.stop();
    });

    test('PING from server and PONG response keeps connection alive', async () => {
        const { server, clients } = await createServerWithClients(1);
        await sleep(600);
        expect(clients[0].hasMessage('PING')).toBe(true);
        clients[0].sendPong();
        await sleep(100);
        expect(clients[0].messages.length).toBeGreaterThan(0);
        clients[0].disconnect();
        await server.stop();
    });

    test('Client PING is answered with PONG', async () => {
        const { server, clients } = await createServerWithClients(1);
        clients[0].sendPing();
        await sleep(100);
        expect(clients[0].hasMessage('PONG')).toBe(true);
        clients[0].disconnect();
        await server.stop();
    });

    test('Stale connection dropped after PING timeout', async () => {
        const { server, clients } = await createServerWithClients(1);
        await sleep(600);
        expect(clients[0].hasMessage('PING')).toBe(true);
        await sleep(300);
        expect(server.clientCount).toBe(0);
        await server.stop();
    });

    test('Per-connection rate limiting drops excess messages', async () => {
        const { server, port } = await createServerWithClients(1);
        const client = new IrcClient('127.0.0.1', port, 'flood');
        await client.connect();
        client._send('JOIN ##test');
        await sleep(50);
        for (let i = 0; i < 10; i++) {
            client.say('##test', `msg${i}`);
        }
        await sleep(100);
        const privmsgCount = server.capturedMessages.filter(m => m.type === 'privmsg').length;
        expect(privmsgCount).toBeLessThanOrEqual(6);
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
        expect(clients[1].hasMessage('hello from alice')).toBe(true);
        for (const c of clients) {
            c.disconnect();
        }
        await server.stop();
    });

    test('QUIT cleans up nick from the set', async () => {
        const { server, port, clients } = await createServerWithClients(1);
        clients[0].disconnect();
        await sleep(100);
        expect(server.clientCount).toBe(0);
        const client2 = new IrcClient('127.0.0.1', port, 'user0');
        await client2.connect();
        expect(client2.hasMessage(' 001 ')).toBe(true);
        client2.disconnect();
        await server.stop();
    });

    test('Message capture records PRIVMSGs', async () => {
        const { server, clients } = await createServerWithClients(1);
        clients[0]._send('JOIN ##test');
        await sleep(50);
        clients[0].say('##test', 'captured message');
        await sleep(100);
        expect(server.capturedMessages.some(m => m.content === 'captured message')).toBe(true);
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
        expect(client.hasMessage('injected message')).toBe(true);
        client.disconnect();
        await server.stop();
    });
});
