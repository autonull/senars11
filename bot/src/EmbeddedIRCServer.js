/**
 * EmbeddedIRCServer — In-process TCP IRC server
 *
 * A minimal RFC 1459-compatible IRC server for single-node deployments.
 * No external IRC server required — the bot hosts its own.
 *
 * Capabilities:
 * - Multi-client TCP connections
 * - NICK/USER registration with proper numeric replies
 * - JOIN/PART/QUIT on channels
 * - PRIVMSG routing (channel and private)
 * - CAP negotiation
 * - Message capture for diagnostics
 *
 * Usage:
 *   const server = new EmbeddedIRCServer();
 *   const port = await server.start(6668);
 *   await server.stop();
 */
import { createServer } from 'net';
import { EventEmitter } from 'events';

export class EmbeddedIRCServer extends EventEmitter {
    constructor() {
        super();
        this._server = null;
        this._port = 0;
        this._clients = new Map();
        this._channels = new Map();
        this._capturedMessages = [];
        this._allNicks = new Set();
        this._pingIntervalMs = 60_000;
        this._pingTimeoutMs = 30_000;
        this._rateLimitWindowMs = 1000;
        this._rateLimitMaxPerWindow = 20;
    }

    /* ── Lifecycle ─────────────────────────────────────────────────── */

    /**
     * Start listening on the given port. Idempotent — returns existing port if already running.
     * @param {number} [port=0] — 0 for auto-assign
     * @returns {Promise<number>} the actual port bound
     */
    async start(port = 0) {
        if (this._server) return this._port;
        return new Promise((resolve, reject) => {
            this._server = createServer((socket) => this._handleConnection(socket));
            this._server.on('error', (err) => {
                this._server = null;
                reject(err);
            });
            this._server.listen(port, '127.0.0.1', () => {
                this._port = this._server.address().port;
                this.emit('started', { port: this._port });
                resolve(this._port);
            });
        });
    }

    /**
     * Stop the server and disconnect all clients. Idempotent.
     */
    async stop() {
        if (!this._server) return;
        for (const socket of this._clients.keys()) {
            try { socket.destroy(); } catch {}
        }
        this._clients.clear();
        this._channels.clear();
        this._allNicks.clear();
        return new Promise((resolve) => {
            this._server.close(() => {
                this._server = null;
                this.emit('stopped');
                resolve();
            });
        });
    }

    get port() { return this._port; }
    get clientCount() { return this._clients.size; }
    get capturedMessages() { return [...this._capturedMessages]; }
    clearCapturedMessages() { this._capturedMessages = []; }

    /* ── Server-side injection (diagnostics / simulated users) ─────── */

    simulateUserMessage(nick, channel, content) {
        this._broadcastToChannel(channel, `:${nick}!~user@localhost PRIVMSG ${channel} :${content}`);
        this._capturedMessages.push({ from: nick, channel, content, type: 'privmsg' });
    }

    simulatePrivateMessage(nick, targetNick, content) {
        this._sendToNick(targetNick, `:${nick}!~user@localhost PRIVMSG ${targetNick} :${content}`);
        this._capturedMessages.push({ from: nick, channel: targetNick, content, type: 'private' });
    }

    simulateJoin(nick, channel) {
        this._broadcastToChannel(channel, `:${nick}!~user@localhost JOIN ${channel}`);
        this._capturedMessages.push({ from: nick, channel, content: null, type: 'join' });
    }

    simulateServerMessage(targetNick, content) {
        this._sendToNick(targetNick, content);
    }

    /* ── Connection handling ──────────────────────────────────────── */

    _handleConnection(socket) {
        const clientInfo = {
            nick: null, user: null, channels: new Set(), registered: false,
            cleanedUp: false, expectingPong: false, pongTimer: null,
            msgTimestamps: [], rateLimited: false,
        };
        this._clients.set(socket, clientInfo);
        let buffer = '';

        // Server-side PING timer
        const schedulePing = () => {
            clearTimeout(clientInfo.pongTimer);
            clientInfo.pongTimer = setTimeout(() => {
                if (!clientInfo.cleanedUp && this._clients.has(socket)) {
                    clientInfo.expectingPong = true;
                    this._send(socket, 'PING :embedded-irc');
                    clientInfo.pongTimer = setTimeout(() => {
                        this._send(socket, 'ERROR :Ping timeout');
                        socket.destroy();
                    }, this._pingTimeoutMs);
                }
            }, this._pingIntervalMs);
        };
        schedulePing();

        const cleanup = () => {
            if (clientInfo.cleanedUp || !this._clients.has(socket)) {
                return;
            }
            clientInfo.cleanedUp = true;
            clearTimeout(clientInfo.pongTimer);
            if (clientInfo.nick) {
                this._allNicks.delete(clientInfo.nick);
            }
            this._handleQuit(socket, clientInfo, 'Connection closed');
            this._clients.delete(socket);
        };

        socket.on('data', (data) => {
            buffer += data.toString('utf-8');
            const lines = buffer.split('\r\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;

                // Rate limiting: sliding window per message line
                const now = Date.now();
                clientInfo.msgTimestamps.push(now);
                const windowStart = now - this._rateLimitWindowMs;
                clientInfo.msgTimestamps = clientInfo.msgTimestamps.filter(t => t >= windowStart);
                if (clientInfo.msgTimestamps.length > this._rateLimitMaxPerWindow) {
                    if (!clientInfo.rateLimited) {
                        clientInfo.rateLimited = true;
                        this._send(socket, 'NOTICE * :*** You are sending too many messages, you have been rate limited');
                        setTimeout(() => { clientInfo.rateLimited = false; }, this._rateLimitWindowMs);
                    }
                    continue; // Drop excess messages
                }

                this._handleCommand(socket, clientInfo, line.trim());
            }
        });
        socket.on('close', cleanup);
        socket.on('error', cleanup);
    }

    _handleCommand(socket, clientInfo, line) {
        const parts = line.split(' ');
        const cmd = parts[0].toUpperCase();
        switch (cmd) {
            case 'NICK': this._handleNick(socket, clientInfo, parts[1]); break;
            case 'USER': this._handleUser(socket, clientInfo, parts.slice(1)); break;
            case 'JOIN': {
                const ch = parts[1];
                if (ch?.startsWith('#')) this._handleJoin(socket, clientInfo, ch);
                break;
            }
            case 'PART': {
                const ch = parts[1];
                if (ch) this._handlePart(socket, clientInfo, ch, parts.slice(2).join(' ').replace(/^:/, '') || 'Left');
                break;
            }
            case 'PRIVMSG': {
                const target = parts[1];
                const msgIdx = line.indexOf(':', line.indexOf(target) + target.length);
                const content = msgIdx >= 0 ? line.substring(msgIdx + 1) : parts.slice(2).join(' ');
                if (target && content !== undefined) this._handlePrivMsg(socket, clientInfo, target, content);
                break;
            }
            case 'QUIT': {
                const reason = parts.slice(1).join(' ').replace(/^:/, '') || 'Client exited';
                this._handleQuit(socket, clientInfo, reason);
                this._clients.delete(socket);
                socket.destroy();
                break;
            }
            case 'PONG':
                clientInfo.expectingPong = false;
                break;
            case 'PING':
                this._send(socket, `PONG :${parts.slice(1).join(' ') || 'embedded-irc'}`);
                break;
            case 'CAP': this._send(socket, 'CAP * ACK'); break;
        }
    }

    _handleNick(socket, clientInfo, nick) {
        if (!nick) return;

        // Nick collision: reject if another client already has this nick.
        // Allow the client to re-SET their own nick (NICK change).
        if (this._allNicks.has(nick) && clientInfo.nick !== nick) {
            this._send(socket, `:localhost 433 * ${nick} :Nickname is already in use`);
            return;
        }

        // Release old nick from the set
        if (clientInfo.nick) this._allNicks.delete(clientInfo.nick);

        const oldNick = clientInfo.nick;
        clientInfo.nick = nick;
        this._allNicks.add(nick);
        this._tryRegister(socket, clientInfo);

        if (oldNick) {
            for (const ch of clientInfo.channels) {
                this._broadcastToChannel(ch, `:${oldNick}!~user@localhost NICK ${nick}`);
            }
        }
    }

    _handleUser(socket, clientInfo) {
        clientInfo.user = 'user';
        this._tryRegister(socket, clientInfo);
    }

    _tryRegister(socket, clientInfo) {
        if (clientInfo.registered || !clientInfo.nick || !clientInfo.user) return;
        clientInfo.registered = true;
        const nick = clientInfo.nick;
        const host = 'localhost';
        this._send(socket, `:${host} 001 ${nick} :Welcome to the IRC Network, ${nick}`);
        this._send(socket, `:${host} 002 ${nick} :Your host is embedded-irc, running version 0.0.1`);
        this._send(socket, `:${host} 003 ${nick} :This server was started recently`);
        this._send(socket, `:${host} 004 ${nick} embedded-irc 0.0.1 io`);
        this._send(socket, `:${host} 251 ${nick} :There are 1 users and 0 invisible on 1 server`);
        this._send(socket, `:${host} 255 ${nick} :I have 1 clients and 0 servers`);
        this._send(socket, `:${host} 375 ${nick} :- embedded-irc Message of the Day -`);
        this._send(socket, `:${host} 372 ${nick} :- Welcome to the embedded IRC server!`);
        this._send(socket, `:${host} 376 ${nick} :End of /MOTD command.`);
        this.emit('client-registered', { nick, socket });
    }

    _handleJoin(socket, clientInfo, channel) {
        if (!clientInfo.registered) return;
        if (!this._channels.has(channel)) this._channels.set(channel, new Set());
        this._channels.get(channel).add(socket);
        clientInfo.channels.add(channel);

        const joinMsg = `:${clientInfo.nick}!~user@localhost JOIN ${channel}`;
        this._send(socket, joinMsg);
        this._broadcastToChannel(channel, joinMsg, socket);

        const nicks = Array.from(this._channels.get(channel))
            .map(s => this._clients.get(s)?.nick).filter(Boolean).join(' ');
        this._send(socket, `:localhost 353 ${clientInfo.nick} = ${channel} :${nicks}`);
        this._send(socket, `:localhost 366 ${clientInfo.nick} ${channel} :End of /NAMES list.`);
        this.emit('user-joined', { nick: clientInfo.nick, channel });
    }

    _handlePart(socket, clientInfo, channel, reason) {
        if (!clientInfo.channels.has(channel)) return;
        clientInfo.channels.delete(channel);
        const ch = this._channels.get(channel);
        if (ch) { ch.delete(socket); if (ch.size === 0) this._channels.delete(channel); }
        this._broadcastToChannel(channel, `:${clientInfo.nick}!~user@localhost PART ${channel} :${reason}`);
    }

    _handlePrivMsg(socket, clientInfo, target, content) {
        if (!clientInfo.registered) return;
        if (target.startsWith('#')) {
            const msg = `:${clientInfo.nick}!~user@localhost PRIVMSG ${target} :${content}`;
            this._broadcastToChannel(target, msg, socket);
            this._capturedMessages.push({ from: clientInfo.nick, channel: target, content, type: 'privmsg' });
        } else {
            this._sendToNick(target, `:${clientInfo.nick}!~user@localhost PRIVMSG ${target} :${content}`);
            this._capturedMessages.push({ from: clientInfo.nick, channel: target, content, type: 'private' });
        }
    }

    _handleQuit(socket, clientInfo, reason) {
        if (!clientInfo.nick) return;
        this._allNicks.delete(clientInfo.nick);
        const quitMsg = `:${clientInfo.nick}!~user@localhost QUIT :${reason}`;
        for (const ch of clientInfo.channels) this._broadcastToChannel(ch, quitMsg, socket);
        clientInfo.channels.clear();
        this.emit('user-quit', { nick: clientInfo.nick, reason });
    }

    /* ── Internal helpers ──────────────────────────────────────────── */

    _findClientByNick(nick) {
        for (const [socket, info] of this._clients) {
            if (info.nick === nick) return socket;
        }
        return null;
    }

    _send(socket, message) {
        if (!socket || socket.destroyed) return;
        socket.write(message + '\r\n', (err) => {
            if (err) socket.destroy();
        });
    }

    _sendToNick(nick, message) {
        const socket = this._findClientByNick(nick);
        if (socket) this._send(socket, message);
    }

    _broadcastToChannel(channel, message, excludeSocket = null) {
        const members = this._channels.get(channel);
        if (!members) return;
        for (const socket of members) {
            if (socket !== excludeSocket) this._send(socket, message);
        }
    }
}
