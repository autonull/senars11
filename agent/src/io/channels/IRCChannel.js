/**
 * IRCChannel.js - IRC Protocol Implementation
 * Wraps 'irc-framework' for resilient IRC connectivity.
 */
import { Channel } from '../Channel.js';
import { Client } from 'irc-framework';
import { Logger } from '@senars/core';

export class IRCChannel extends Channel {
    constructor(config = {}) {
        super(config);
        this.type = 'irc';
        this.client = new Client();
        this.channels = new Set();

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

            this.emitMessage(from, content, {
                channel: target,
                type: event.type,
                tags: event.tags
            });
        });

        this.client.on('close', () => {
            this.setStatus('disconnected');
            this.emit('disconnected');
        });

        this.client.on('error', (err) => {
            this.emit('error', err);
            Logger.error(`[IRC:${this.id}] Error:`, err);
        });
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
                gecos: this.config.realname || 'SeNARS Agent',
                tls: this.config.tls !== false, // Default to TLS
                password: this.config.password,
                auto_reconnect: true,
                auto_reconnect_wait: 2000,
                auto_reconnect_max_retries: 5
            });
        } catch (error) {
            this.setStatus('error');
            throw error;
        }
    }

    async disconnect() {
        if (this.status === 'disconnected') return;
        this.client.quit(this.config.quitMessage || 'Leaving...');
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

    async part(channel) {
        if (this.channels.has(channel)) {
            this.client.part(channel);
            this.channels.delete(channel);
        }
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') {
            throw new Error('Not connected to IRC');
        }

        // Support action messages (/me)
        if (metadata.action) {
            this.client.action(target, content);
        } else {
            this.client.say(target, content);
        }

        return true;
    }
}
