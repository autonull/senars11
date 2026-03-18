/**
 * ChannelManager.js - Central Registry for Communication Channels
 * Manages lifecycle and routing for multiple channels.
 */
import { EventEmitter } from 'events';
import { Logger } from '@senars/core';
import { RateLimiter } from './RateLimiter.js';
import { PerChannelRateLimiter } from './PerChannelRateLimiter.js';

export class ChannelManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.channels = new Map();
        this.middleware = [];
        
        // Global rate limiter (legacy, for backward compatibility)
        this.rateLimiter = new RateLimiter(
            config.rateLimit?.max || 10,
            config.rateLimit?.interval || 2000
        );
        
        // Per-channel rate limiter (new, more granular control)
        this.perChannelRateLimiter = new PerChannelRateLimiter({
            maxTokens: config.rateLimit?.perChannelMax ?? 5,
            refillInterval: config.rateLimit?.perChannelInterval ?? 10000,
            globalMax: config.rateLimit?.globalMax ?? 20,
            globalInterval: config.rateLimit?.globalInterval ?? 10000
        });
        
        // Use per-channel limiting by default
        this.usePerChannelLimiting = config.rateLimit?.usePerChannel ?? true;
    }

    /**
     * Register a new channel instance
     * @param {Channel} channel
     */
    register(channel) {
        if (this.channels.has(channel.id)) {
            throw new Error(`Channel with ID ${channel.id} already exists`);
        }

        this.channels.set(channel.id, channel);

        // Forward events
        channel.on('message', (msg) => this._handleIncomingMessage(msg));
        channel.on('status', (status) => this.emit('channel.status', { channelId: channel.id, ...status }));
        channel.on('error', (err) => this.emit('channel.error', { channelId: channel.id, error: err }));

        Logger.info(`Channel registered: ${channel.type} (${channel.id})`);
        this.emit('channel.registered', channel);
    }

    /**
     * Unregister and disconnect a channel
     * @param {string} channelId
     */
    async unregister(channelId) {
        const channel = this.channels.get(channelId);
        if (channel) {
            if (channel.status === 'connected') {
                await channel.disconnect();
            }
            channel.removeAllListeners();
            this.channels.delete(channelId);
            Logger.info(`Channel unregistered: ${channelId}`);
            this.emit('channel.unregistered', channelId);
        }
    }

    /**
     * Get a channel by ID
     * @param {string} channelId
     * @returns {Channel|undefined}
     */
    get(channelId) {
        return this.channels.get(channelId);
    }

    /**
     * Add middleware for processing messages
     * @param {Function} fn - (msg, next) => void
     */
    use(fn) {
        this.middleware.push(fn);
    }

    /**
     * Process incoming message through middleware pipeline
     * @param {object} message
     */
    async _handleIncomingMessage(message) {
        let msg = { ...message };

        try {
            // Execute middleware pipeline
            for (const mw of this.middleware) {
                let nextCalled = false;
                const next = () => { nextCalled = true; };

                await mw(msg, next);

                if (!nextCalled) {
                    // Middleware stopped propagation
                    return;
                }
            }

            // Emit processed message
            this.emit('message', msg);
        } catch (error) {
            Logger.error('Error in channel middleware:', error);
        }
    }

    /**
     * Send a message through a specific channel
     * @param {string} channelId
     * @param {string} target
     * @param {string} content
     * @param {object} metadata
     */
    async sendMessage(channelId, target, content, metadata = {}) {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel ${channelId} not found`);
        }

        // Apply rate limiting (prefer per-channel limiting)
        if (this.usePerChannelLimiting) {
            const rateKey = `${channelId}:${target}`;
            await this.perChannelRateLimiter.wait(rateKey);
        } else {
            await this.rateLimiter.wait();
        }

        return await channel.sendMessage(target, content, metadata);
    }

    /**
     * Get rate limiter stats
     */
    getRateLimitStats() {
        if (this.usePerChannelLimiting) {
            return this.perChannelRateLimiter.getStats();
        }
        return {
            tokens: this.rateLimiter.tokens,
            limit: this.rateLimiter.limit
        };
    }

    /**
     * Broadcast a message to all connected channels (optional utility)
     */
    async broadcast(target, content) {
        const promises = [];
        for (const channel of this.channels.values()) {
            if (channel.status === 'connected') {
                // Apply rate limiting per message call inside loop
                await this.rateLimiter.wait();
                promises.push(channel.sendMessage(target, content).catch(err =>
                    Logger.warn(`Failed to broadcast to ${channel.id}:`, err)
                ));
            }
        }
        return Promise.all(promises);
    }

    /**
     * Shutdown all channels
     */
    async shutdown() {
        const promises = Array.from(this.channels.values()).map(c => c.disconnect());
        await Promise.all(promises);
        this.channels.clear();
    }
}
