import { Embodiment } from '../Embodiment.js';
import { Client } from 'irc-framework';
import { Logger } from '@senars/core';

export class IRCChannel extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'IRC',
            description: config.description || 'IRC chat channel',
            capabilities: config.capabilities || ['private-messages', 'channel-ops', 'ctcp'],
            constraints: { maxMessageLength: 512 },
            isPublic: config.isPublic ?? true,
            isInternal: false,
            defaultSalience: config.defaultSalience ?? 0.5
        });

        this.type = 'irc';
        this.client = new Client();
        this.channels = new Set();
        this.knownUsers = new Map();
        this.pendingQueries = new Map();

        this._sendQueue = [];
        this._processingQueue = false;
        this._messageInterval = config.rateLimit?.interval ?? 4000;
        this._lastSendTime = 0;

        this._setupClientEvents();
    }

    _setupClientEvents() {
        this.client.on('registered', (event) => {
            this.setStatus('connected');
            this.emit('connected', event);
            Logger.info(`[IRC:${this.id}] Connected as ${event.nick}`);

            // Auto-join configured channels
            if (this.config.channels) {
                this.config.channels.forEach(channel => this.join(channel));
            }
        });

        this.client.on('message', (event) => {
            // Normalize event structure
            const from = event.nick;
            const content = event.message;
            const target = event.target;
            const isPrivate = this._isPrivateMessage(event);

            // Emit as unified message event with isPrivate flag
            this.emitMessage({
                from,
                content,
                metadata: {
                    channel: target,
                    type: event.type || 'message',
                    tags: event.tags,
                    isPrivate
                }
            });
        });

        // Channel joins
        this.client.on('join', (event) => {
            const { nick, channel } = event;
            Logger.debug(`[IRC:${this.id}] ${nick} joined ${channel}`);
            this._trackUser(channel, nick);
            this.emit('user_joined', { nick, channel });
        });

        // Channel parts
        this.client.on('part', (event) => {
            const { nick, channel, reason } = event;
            Logger.debug(`[IRC:${this.id}] ${nick} left ${channel}: ${reason}`);
            this._untrackUser(channel, nick);
            this.emit('user_part', { nick, channel, reason });
        });

        // Quits
        this.client.on('quit', (event) => {
            const { nick, reason } = event;
            Logger.debug(`[IRC:${this.id}] ${nick} quit: ${reason}`);
            this._removeUserFromAllChannels(nick);
            this.emit('user_quit', { nick, reason });
        });

        // Nick changes
        this.client.on('nick', (event) => {
            const { oldNick, newNick } = event;
            Logger.debug(`[IRC:${this.id}] ${oldNick} is now ${newNick}`);
            this._updateUserNick(oldNick, newNick);
            this.emit('user_nick', { oldNick, newNick });
        });

        // Channel mode changes
        this.client.on('mode', (event) => {
            const { channel, setby, mode } = event;
            Logger.debug(`[IRC:${this.id}] Mode change in ${channel} by ${setby}: ${mode}`);
            this.emit('mode_change', { channel, setby, mode });
        });

        // Topic changes
        this.client.on('topic', (event) => {
            const { channel, topic, setby } = event;
            Logger.info(`[IRC:${this.id}] Topic in ${channel}: ${topic}`);
            this.emit('topic_change', { channel, topic, setby });
        });

        // CTCP VERSION
        this.client.on('ctcp_version', (event) => {
            Logger.debug(`[IRC:${this.id}] CTCP VERSION from ${event.nick}`);
        });

        // CTCP PING
        this.client.on('ctcp_ping', (event) => {
            Logger.debug(`[IRC:${this.id}] CTCP PING from ${event.nick}`);
            // Auto-respond to pings
            this.client.ctcp(event.nick, 'PING', event.data);
        });

        // Close event
        this.client.on('close', () => {
            this.setStatus('disconnected');
            this._sendQueue.forEach(({ reject }) => reject(new Error('Connection closed')));
            this._sendQueue = [];
            this._processingQueue = false;
            this.emit('disconnected');
            this.knownUsers.clear();
        });

        // Error event
        this.client.on('error', (err) => {
            this.emit('error', err);
            Logger.error(`[IRC:${this.id}] Error:`, err);
        });

        // Notice event
        this.client.on('notice', (event) => {
            const from = event.nick || 'Server';
            const content = event.message;
            const target = event.target;

            this.emitMessage({
                from,
                content,
                metadata: { channel: target, type: 'notice' }
            });
        });

        // Welcome messages
        this.client.on('welcome', (event) => {
            Logger.info(`[IRC:${this.id}] Welcome: ${event.message}`);
            this.emit('welcome', event);
        });
    }

    _isPrivateMessage(event) {
        const target = event.target;
        return target === this.client.user.nick || !/^[#&!+]/.test(target);
    }

    _isCTCP(content) {
        return content.startsWith('\x01') && content.endsWith('\x01');
    }

    _handleCTCP(from, content, target) {
        const ctcpData = content.slice(1, -1).split(' ');
        const command = ctcpData[0].toUpperCase();
        const data = ctcpData.slice(1).join(' ');

        Logger.debug(`[IRC:${this.id}] CTCP ${command} from ${from}`);

        switch (command) {
            case 'VERSION':
                // Auto-respond with version info
                this.client.ctcpResponse(from, 'VERSION', `${this.config.nick} Bot 1.0`);
                break;
            case 'PING':
                // Auto-respond to ping
                this.client.ctcpResponse(from, 'PING', data);
                break;
            case 'TIME':
                this.client.ctcpResponse(from, 'TIME', new Date().toString());
                break;
            case 'INFO':
                this.client.ctcpResponse(from, 'INFO', `${this.config.nick} - Intelligent IRC Agent`);
                break;
        }

        // Emit CTCP event for custom handling
        this.emit('ctcp', {
            from,
            command,
            data,
            target,
            timestamp: Date.now()
        });
    }

    _trackUser(channel, nick) {
        if (!this.knownUsers.has(channel)) this.knownUsers.set(channel, new Set());
        this.knownUsers.get(channel).add(nick);
    }

    _untrackUser(channel, nick) {
        this.knownUsers.get(channel)?.delete(nick);
    }

    _removeUserFromAllChannels(nick) {
        for (const users of this.knownUsers.values()) users.delete(nick);
    }

    _updateUserNick(oldNick, newNick) {
        for (const users of this.knownUsers.values()) {
            if (users.has(oldNick)) { users.delete(oldNick); users.add(newNick); }
        }
    }

    getUsersInChannel(channel) {
        const users = this.knownUsers.get(channel);
        return users ? Array.from(users) : [];
    }

    async connect() {
        if (this.status === 'connected') return;

        this.setStatus('connecting');

        try {
            this.client.connect({
                host: this.config.host || 'irc.libera.chat',
                port: this.config.port || 6667,
                nick: this.config.nick || 'senars-bot',
                username: this.config.username || 'senars',
                gecos: this.config.realname || `${this.config.nick} Bot`,
                tls: !!this.config.tls,
                password: this.config.password,
                auto_reconnect: true,
                auto_reconnect_wait: 2000,
                auto_reconnect_max_retries: 5,
                // Enable CTCP handling
                ctcp: {
                    version: `${this.config.nick} Bot 1.0`,
                    ping: true
                }
            });
        } catch (error) {
            this.setStatus('error');
            throw error;
        }
    }

    async disconnect() {
        if (this.status === 'disconnected') return;
        this._sendQueue.forEach(({ reject }) => reject(new Error('Disconnecting')));
        this._sendQueue = [];
        this._processingQueue = false;
        this.client.quit(this.config.quitMessage || 'Leaving...');
        this.knownUsers.clear();
    }

    async join(channel) {
        if (this.status !== 'connected') {
            Logger.warn(`[IRC:${this.id}] Cannot join ${channel} - not connected`);
            return;
        }
        this.client.join(channel);
        this.channels.add(channel);
        Logger.info(`[IRC:${this.id}] Joined ${channel}`);
    }

    async part(channel, reason) {
        if (this.channels.has(channel)) {
            this.client.part(channel, reason || 'Leaving');
            this.channels.delete(channel);
            this.knownUsers.delete(channel);
        }
    }

    async join(channel) {
        if (this.status !== 'connected') {
            Logger.warn(`[IRC:${this.id}] Cannot join ${channel} - not connected`);
            return;
        }
        this.client.join(channel);
        this.channels.add(channel);
        Logger.info(`[IRC:${this.id}] Joined ${channel}`);
    }

    async part(channel, reason) {
        if (this.channels.has(channel)) {
            this.client.part(channel, reason || 'Leaving');
            this.channels.delete(channel);
            this.knownUsers.delete(channel);
        }
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') throw new Error('Not connected to IRC');
        return new Promise((resolve, reject) => {
            this._sendQueue.push({ target, content, metadata, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this._processingQueue || this._sendQueue.length === 0) return;
        this._processingQueue = true;

        while (this._sendQueue.length > 0) {
            // Adaptive delay: if last send was recent, wait remaining time
            const sinceLast = Date.now() - this._lastSendTime;
            if (sinceLast < this._messageInterval) {
                await new Promise(r => setTimeout(r, this._messageInterval - sinceLast));
            }

            const { target, content, metadata, resolve, reject } = this._sendQueue.shift();
            const safe = String(content).replace(/[\r\n]/g, ' ').trim();
            if (!safe) { resolve(true); continue; }
            try {
                if (metadata.action) this.client.action(target, safe);
                else if (metadata.notice) this.client.notice(target, safe);
                else this.client.say(target, safe);
                this._lastSendTime = Date.now();
                resolve(true);
            } catch (e) { reject(e); }
        }

        this._processingQueue = false;
    }

    async sendPrivateMessage(nick, content) { return this.sendMessage(nick, content, { private: true }); }
    async sendAction(target, content) { return this.sendMessage(target, content, { action: true }); }
    async sendNotice(target, content) { return this.sendMessage(target, content, { notice: true }); }

    async setTopic(channel, topic) {
        if (this.status !== 'connected') throw new Error('Not connected to IRC');
        this.client.raw(`TOPIC ${channel} :${topic}`);
        return true;
    }

    async getChannelUsers(channel) {
        return new Promise((resolve) => {
            const users = [];
            const namesListener = (event) => {
                if (event.channel === channel) users.push(...event.nicks);
            };
            this.client.on('names', namesListener);
            this.client.raw(`NAMES ${channel}`);
            setTimeout(() => {
                this.client.removeListener('names', namesListener);
                resolve(users);
            }, 5000);
        });
    }

    async sendCTCP(nick, command, data = '') {
        if (this.status !== 'connected') throw new Error('Not connected to IRC');
        this.client.ctcp(nick, command, data);
        return true;
    }

    isChannel(target) { return /^[#&!+]/.test(target); }
    isUserInChannel(channel, nick) { return this.knownUsers.get(channel)?.has(nick) ?? false; }
}
