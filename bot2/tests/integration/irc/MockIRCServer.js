#!/usr/bin/env node

/**
 * MockIRCServer.js — In-process TCP IRC server for integration testing
 *
 * Implements a minimal RFC 1459-compatible IRC server that:
 * - Accepts multiple client connections via TCP
 * - Handles NICK/USER registration
 * - Routes PRIVMSG between clients on shared channels
 * - Supports JOIN/PART/QUIT
 * - Sends proper numeric reply codes for registration
 *
 * Designed for integration tests that connect the real IRCChannel
 * (via irc-framework) to a local server with no external dependencies.
 */
import { createServer } from 'net';
import { EventEmitter } from 'events';

export class MockIRCServer extends EventEmitter {
    constructor() {
        super();
        this._server = null;
        this._port = 0;
        this._clients = new Map();  // socket → { nick, user, channels }
        this._channels = new Map();  // channelName → Set<socket>
        this._capturedMessages = [];
    }

    /* ── Lifecycle ─────────────────────────────────────────────────── */

    async start(port = 0) {
        return new Promise((resolve, reject) => {
            this._server = createServer((socket) => this._handleConnection(socket));
            this._server.on('error', reject);
            this._server.listen(port, '127.0.0.1', () => {
                this._port = this._server.address().port;
                this.emit('started', { port: this._port });
                resolve(this._port);
            });
        });
    }

    async stop() {
        if (!this._server) return;
        for (const socket of this._clients.keys()) {
            socket.destroy();
        }
        this._clients.clear();
        this._channels.clear();
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

    /* ── Server-side message injection ────────────────────────────── */

    /**
     * Inject a message from a simulated user into a channel.
     * Writes directly to all channel members' sockets (the bot).
     * The simulated user doesn't need to be connected — the server
     * fabricates the wire-format message as if the user sent it.
     */
    simulateUserMessage(nick, channel, content) {
        const msg = `:${nick}!~user@localhost PRIVMSG ${channel} :${content}`;
        this._broadcastToChannel(channel, msg);
        this._capturedMessages.push({ from: nick, channel, content, type: 'privmsg' });
    }

    /**
     * Inject a private message from a simulated user to the bot.
     */
    simulatePrivateMessage(nick, targetNick, content) {
        const msg = `:${nick}!~user@localhost PRIVMSG ${targetNick} :${content}`;
        this._sendToNick(targetNick, msg);
        this._capturedMessages.push({ from: nick, channel: targetNick, content, type: 'private' });
    }

    /**
     * Simulate a user joining a channel.
     * Broadcasts the JOIN wire message to all channel members.
     */
    simulateJoin(nick, channel) {
        const joinMsg = `:${nick}!~user@localhost JOIN ${channel}`;
        this._broadcastToChannel(channel, joinMsg);
        this._capturedMessages.push({ from: nick, channel, content: null, type: 'join' });
    }

    /**
     * Simulate a server MOTD / numeric reply (no nick).
     * Tests boundary validation: should be dropped by IRCChannel.
     */
    simulateServerMessage(targetNick, content) {
        // Send a message with no source nick (server-only message)
        // This simulates numeric replies like :irc.server 376 <nick> :End of MOTD
        const msg = `${content}`;
        this._sendToNick(targetNick, msg);
    }

    /* ── Connection handling ──────────────────────────────────────── */

    _handleConnection(socket) {
        const clientInfo = { nick: null, user: null, channels: new Set(), registered: false, cleanedUp: false };
        this._clients.set(socket, clientInfo);

        let buffer = '';

        const cleanup = () => {
            if (clientInfo.cleanedUp || !this._clients.has(socket)) return;
            clientInfo.cleanedUp = true;
            this._handleQuit(socket, clientInfo, 'Connection closed');
            this._clients.delete(socket);
        };

        socket.on('data', (data) => {
            buffer += data.toString('utf-8');
            const lines = buffer.split('\r\n');
            buffer = lines.pop(); // keep incomplete line

            for (const line of lines) {
                if (line.trim()) {
                    this._handleCommand(socket, clientInfo, line.trim());
                }
            }
        });

        socket.on('close', cleanup);
        socket.on('error', cleanup);
    }

    _handleCommand(socket, clientInfo, line) {
        const parts = line.split(' ');
        const cmd = parts[0].toUpperCase();

        switch (cmd) {
            case 'NICK':
                this._handleNick(socket, clientInfo, parts[1]);
                break;
            case 'USER':
                this._handleUser(socket, clientInfo, parts.slice(1));
                break;
            case 'JOIN': {
                const channel = parts[1];
                if (channel && channel.startsWith('#')) {
                    this._handleJoin(socket, clientInfo, channel);
                }
                break;
            }
            case 'PART': {
                const channel = parts[1];
                const reason = parts.slice(2).join(' ').replace(/^:/, '') || 'Left';
                if (channel) {
                    this._handlePart(socket, clientInfo, channel, reason);
                }
                break;
            }
            case 'PRIVMSG': {
                const target = parts[1];
                const msgIdx = line.indexOf(':', line.indexOf(target) + target.length);
                const content = msgIdx >= 0 ? line.substring(msgIdx + 1) : (parts.slice(2).join(' '));
                if (target && content !== undefined) {
                    this._handlePrivMsg(socket, clientInfo, target, content);
                }
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
                // Silently accept pongs
                break;
            case 'CAP':
                // Send CAP ACK
                this._send(socket, 'CAP * ACK');
                break;
            default:
                break;
        }
    }

    _handleNick(socket, clientInfo, nick) {
        if (!nick) return;
        const oldNick = clientInfo.nick;
        clientInfo.nick = nick;
        this._tryRegister(socket, clientInfo);

        // Notify channels of nick change
        if (oldNick) {
            for (const channel of clientInfo.channels) {
                this._broadcastToChannel(channel, `:${oldNick}!~user@localhost NICK ${nick}`);
            }
        }
    }

    _handleUser(socket, clientInfo, _args) {
        clientInfo.user = 'user';
        this._tryRegister(socket, clientInfo);
    }

    _tryRegister(socket, clientInfo) {
        if (clientInfo.registered || !clientInfo.nick || !clientInfo.user) return;
        clientInfo.registered = true;

        const nick = clientInfo.nick;
        const host = 'localhost';

        // Send welcome numerics
        this._send(socket, `:${host} 001 ${nick} :Welcome to the Mock IRC Network, ${nick}`);
        this._send(socket, `:${host} 002 ${nick} :Your host is mock-irc, running version 0.0.1`);
        this._send(socket, `:${host} 003 ${nick} :This server was started recently`);
        this._send(socket, `:${host} 004 ${nick} mock-irc 0.0.1 io`);
        this._send(socket, `:${host} 251 ${nick} :There are 1 users and 0 invisible on 1 server`);
        this._send(socket, `:${host} 255 ${nick} :I have 1 clients and 0 servers`);

        // MOTD
        this._send(socket, `:${host} 375 ${nick} :- mock-irc Message of the Day -`);
        this._send(socket, `:${host} 372 ${nick} :- Welcome to the mock IRC server for testing!`);
        this._send(socket, `:${host} 376 ${nick} :End of /MOTD command.`);

        this.emit('client-registered', { nick, socket });
    }

    _handleJoin(socket, clientInfo, channel) {
        if (!clientInfo.registered) return;

        if (!this._channels.has(channel)) {
            this._channels.set(channel, new Set());
        }
        this._channels.get(channel).add(socket);
        clientInfo.channels.add(channel);

        // Send join confirmation and names
        const joinMsg = `:${clientInfo.nick}!~user@localhost JOIN ${channel}`;
        this._send(socket, joinMsg);
        this._broadcastToChannel(channel, joinMsg, socket);

        // NAMES reply
        const nicks = Array.from(this._channels.get(channel))
            .map(s => this._clients.get(s)?.nick)
            .filter(Boolean)
            .join(' ');
        this._send(socket, `:${'localhost'} 353 ${clientInfo.nick} = ${channel} :${nicks}`);
        this._send(socket, `:${'localhost'} 366 ${clientInfo.nick} ${channel} :End of /NAMES list.`);

        this.emit('user-joined', { nick: clientInfo.nick, channel });
    }

    _handlePart(socket, clientInfo, channel, reason) {
        if (!clientInfo.channels.has(channel)) return;

        clientInfo.channels.delete(channel);
        const ch = this._channels.get(channel);
        if (ch) {
            ch.delete(socket);
            if (ch.size === 0) this._channels.delete(channel);
        }

        const partMsg = `:${clientInfo.nick}!~user@localhost PART ${channel} :${reason}`;
        this._broadcastToChannel(channel, partMsg);
    }

    _handlePrivMsg(socket, clientInfo, target, content) {
        if (!clientInfo.registered) return;

        if (target.startsWith('#')) {
            // Channel message
            const msg = `:${clientInfo.nick}!~user@localhost PRIVMSG ${target} :${content}`;
            this._broadcastToChannel(target, msg, socket);
            this._capturedMessages.push({
                from: clientInfo.nick, channel: target, content, type: 'privmsg'
            });
        } else {
            // Private message
            const msg = `:${clientInfo.nick}!~user@localhost PRIVMSG ${target} :${content}`;
            this._sendToNick(target, msg);
            this._capturedMessages.push({
                from: clientInfo.nick, channel: target, content, type: 'private'
            });
        }
    }

    _handleQuit(socket, clientInfo, reason) {
        if (!clientInfo.nick) return;

        const quitMsg = `:${clientInfo.nick}!~user@localhost QUIT :${reason}`;
        for (const channel of clientInfo.channels) {
            this._broadcastToChannel(channel, quitMsg, socket);
        }
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
        if (socket && !socket.destroyed) {
            socket.write(message + '\r\n');
        }
    }

    _sendToNick(nick, message) {
        const socket = this._findClientByNick(nick);
        if (socket) this._send(socket, message);
    }

    _broadcastToChannel(channel, message, excludeSocket = null) {
        const members = this._channels.get(channel);
        if (!members) {
            return;
        }
        let sent = 0;
        for (const socket of members) {
            if (socket !== excludeSocket) {
                this._send(socket, message);
                sent++;
            }
        }
    }
}
