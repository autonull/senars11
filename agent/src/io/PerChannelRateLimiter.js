/**
 * PerChannelRateLimiter.js - Token Bucket Rate Limiter per Channel/Target
 * Prevents spamming individual channels while allowing global throughput.
 */
import { Logger } from '@senars/core';

export class PerChannelRateLimiter {
    /**
     * @param {object} config
     * @param {number} config.maxTokens - Max tokens per bucket (default: 5)
     * @param {number} config.refillInterval - Refill interval in ms (default: 10000)
     * @param {number} config.globalMax - Global max tokens across all channels (default: 20)
     * @param {number} config.globalInterval - Global refill interval (default: 10000)
     */
    constructor(config = {}) {
        this.maxTokens = config.maxTokens ?? 5;
        this.refillInterval = config.refillInterval ?? 10000; // 10 seconds
        this.globalMax = config.globalMax ?? 20;
        this.globalInterval = config.globalInterval ?? 10000;

        // Per-channel buckets: Map<channelId, { tokens, lastRefill }>
        this.channelBuckets = new Map();

        // Global bucket
        this.globalTokens = this.globalMax;
        this.globalLastRefill = Date.now();

        // Statistics for monitoring
        this.stats = {
            totalMessages: 0,
            throttledMessages: 0,
            perChannel: new Map()
        };
    }

    /**
     * Get or create a bucket for a channel
     * @param {string} channelId
     * @returns {object}
     */
    _getBucket(channelId) {
        if (!this.channelBuckets.has(channelId)) {
            this.channelBuckets.set(channelId, {
                tokens: this.maxTokens,
                lastRefill: Date.now()
            });
            this.stats.perChannel.set(channelId, { messages: 0, throttled: 0 });
        }
        return this.channelBuckets.get(channelId);
    }

    /**
     * Refill tokens for a bucket
     * @param {object} bucket
     */
    _refillBucket(bucket) {
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;

        if (elapsed > this.refillInterval) {
            bucket.tokens = this.maxTokens;
            bucket.lastRefill = now;
        } else {
            // Gradual refill
            const tokensToAdd = (elapsed / this.refillInterval) * this.maxTokens;
            bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
        }
    }

    /**
     * Refill global bucket
     */
    _refillGlobal() {
        const now = Date.now();
        const elapsed = now - this.globalLastRefill;

        if (elapsed > this.globalInterval) {
            this.globalTokens = this.globalMax;
            this.globalLastRefill = now;
        } else {
            const tokensToAdd = (elapsed / this.globalInterval) * this.globalMax;
            this.globalTokens = Math.min(this.globalMax, this.globalTokens + tokensToAdd);
        }
    }

    /**
     * Try to acquire a token for sending a message
     * @param {string} channelId - Channel/target identifier
     * @returns {Promise<{allowed: boolean, waitTime: number, reason?: string}>}
     */
    async acquire(channelId) {
        this._refillGlobal();
        const bucket = this._getBucket(channelId);
        this._refillBucket(bucket);

        // Check global limit first
        if (this.globalTokens < 1) {
            this.stats.throttledMessages++;
            const waitTime = this.globalInterval - (Date.now() - this.globalLastRefill);
            return {
                allowed: false,
                waitTime: Math.max(100, waitTime),
                reason: 'global_rate_limit'
            };
        }

        // Check per-channel limit
        if (bucket.tokens < 1) {
            this.stats.throttledMessages++;
            const channelStats = this.stats.perChannel.get(channelId);
            if (channelStats) channelStats.throttled++;

            const waitTime = this.refillInterval - (Date.now() - bucket.lastRefill);
            return {
                allowed: false,
                waitTime: Math.max(100, waitTime),
                reason: 'channel_rate_limit'
            };
        }

        // Consume tokens
        this.globalTokens -= 1;
        bucket.tokens -= 1;
        this.stats.totalMessages++;

        const channelStats = this.stats.perChannel.get(channelId);
        if (channelStats) channelStats.messages++;

        return {
            allowed: true,
            waitTime: 0,
            remainingTokens: bucket.tokens,
            globalRemaining: this.globalTokens
        };
    }

    /**
     * Wait until a token is available
     * @param {string} channelId
     * @returns {Promise<{allowed: boolean, waitTime: number}>}
     */
    async wait(channelId) {
        let attempts = 0;
        const maxAttempts = 10; // Prevent infinite loops

        while (attempts < maxAttempts) {
            const result = await this.acquire(channelId);

            if (result.allowed) {
                return result;
            }

            // Wait for the specified time
            await new Promise(resolve => setTimeout(resolve, result.waitTime));
            attempts++;
        }

        // If we've tried too many times, allow anyway to prevent deadlock
        Logger.warn(`Rate limiter: ${channelId} waited too long, allowing message`);
        return { allowed: true, waitTime: 0, forced: true };
    }

    /**
     * Get current stats
     * @returns {object}
     */
    getStats() {
        const perChannelStats = {};
        for (const [channelId, stats] of this.stats.perChannel.entries()) {
            const bucket = this.channelBuckets.get(channelId);
            perChannelStats[channelId] = {
                messages: stats.messages,
                throttled: stats.throttled,
                currentTokens: bucket?.tokens ?? 0
            };
        }

        return {
            totalMessages: this.stats.totalMessages,
            throttledMessages: this.stats.throttledMessages,
            globalTokens: this.globalTokens,
            perChannel: perChannelStats
        };
    }

    /**
     * Reset stats
     */
    resetStats() {
        this.stats = {
            totalMessages: 0,
            throttledMessages: 0,
            perChannel: new Map()
        };
    }

    /**
     * Clear all buckets (e.g., on channel disconnect)
     * @param {string} channelId
     */
    clearChannel(channelId) {
        this.channelBuckets.delete(channelId);
        this.stats.perChannel.delete(channelId);
    }
}
