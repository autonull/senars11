/**
 * IRCChannel.js - IRC Protocol Implementation
 * Wraps 'irc-framework' for resilient IRC connectivity.
 * Supports: channel messages, private messages, CTCP, actions, notices
 * 
 * Phase 5: Updated to extend Embodiment for unified I/O abstraction
 */
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

    /**
     * Check if a message is private (not to a channel)
     */
    _isPrivateMessage(event) {
        const target = event.target;
        // Private if target matches our nick or doesn't start with #/&/!/+
        return target === this.client.user.nick || !/^[#&!+]/.test(target);
    }

    /**
     * Check if content is CTCP
     */
    _isCTCP(content) {
        return content.startsWith('\x01') && content.endsWith('\x01');
    }

    /**
     * Handle CTCP messages
     */
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

    /**
     * Track user in channel
     */
    _trackUser(channel, nick) {
        if (!this.knownUsers.has(channel)) {
            this.knownUsers.set(channel, new Set());
        }
        this.knownUsers.get(channel).add(nick);
    }

    /**
     * Untrack user from channel
     */
    _untrackUser(channel, nick) {
        const users = this.knownUsers.get(channel);
        if (users) {
            users.delete(nick);
        }
    }

    /**
     * Remove user from all channels
     */
    _removeUserFromAllChannels(nick) {
        for (const users of this.knownUsers.values()) {
            users.delete(nick);
        }
    }

    /**
     * Update user nick
     */
    _updateUserNick(oldNick, newNick) {
        for (const users of this.knownUsers.values()) {
            if (users.has(oldNick)) {
                users.delete(oldNick);
                users.add(newNick);
            }
        }
    }

    /**
     * Get users in a channel
     */
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

    /**
     * Send a message to channel or user
     * @param {string} target - Channel (#channel) or nick
     * @param {string} content - Message content
     * @param {object} metadata - Options: action, notice, private
     */
    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') {
            throw new Error('Not connected to IRC');
        }

        // Action message (/me)
        if (metadata.action) {
            this.client.action(target, content);
        }
        // Notice message
        else if (metadata.notice) {
            this.client.notice(target, content);
        }
        // Regular message
        else {
            this.client.say(target, content);
        }

        return true;
    }

    /**
     * Send a private message to a user
     */
    async sendPrivateMessage(nick, content) {
        return this.sendMessage(nick, content, { private: true });
    }

    /**
     * Send an action message (/me)
     */
    async sendAction(target, content) {
        return this.sendMessage(target, content, { action: true });
    }

    /**
     * Send a notice
     */
    async sendNotice(target, content) {
        return this.sendMessage(target, content, { notice: true });
    }

    /**
     * Set channel topic
     */
    async setTopic(channel, topic) {
        if (this.status !== 'connected') {
            throw new Error('Not connected to IRC');
        }
        this.client.raw(`TOPIC ${channel} :${topic}`);
        return true;
    }

    /**
     * Get channel user list
     */
    async getChannelUsers(channel) {
        return new Promise((resolve) => {
            const users = [];
            const namesListener = (event) => {
                if (event.channel === channel) {
                    users.push(...event.nicks);
                }
            };

            this.client.on('names', namesListener);
            this.client.raw(`NAMES ${channel}`);

            // Timeout after 5 seconds
            setTimeout(() => {
                this.client.removeListener('names', namesListener);
                resolve(users);
            }, 5000);
        });
    }

    /**
     * Send CTCP query
     */
    async sendCTCP(nick, command, data = '') {
        if (this.status !== 'connected') {
            throw new Error('Not connected to IRC');
        }
        this.client.ctcp(nick, command, data);
        return true;
    }

    /**
     * Check if target is a channel
     */
    isChannel(target) {
        return /^[#&!+]/.test(target);
    }

    /**
     * Check if user is in a channel
     */
    isUserInChannel(channel, nick) {
        const users = this.knownUsers.get(channel);
        return users ? users.has(nick) : false;
    }
}
