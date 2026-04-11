import {Logger} from '@senars/core';

export class PerChannelRateLimiter {
    constructor(config = {}) {
        this.maxTokens = config.maxTokens ?? 5;
        this.refillInterval = config.refillInterval ?? 10000;
        this.globalMax = config.globalMax ?? 20;
        this.globalInterval = config.globalInterval ?? 10000;
        this.channelBuckets = new Map();
        this.globalTokens = this.globalMax;
        this.globalLastRefill = Date.now();
        this.stats = {totalMessages: 0, throttledMessages: 0, perChannel: new Map()};
    }

    _getBucket(channelId) {
        if (!this.channelBuckets.has(channelId)) {
            this.channelBuckets.set(channelId, {tokens: this.maxTokens, lastRefill: Date.now()});
            this.stats.perChannel.set(channelId, {messages: 0, throttled: 0});
        }
        return this.channelBuckets.get(channelId);
    }

    _refillBucket(bucket) {
        const elapsed = Date.now() - bucket.lastRefill;
        if (elapsed > this.refillInterval) {
            bucket.tokens = this.maxTokens;
            bucket.lastRefill = Date.now();
        } else {
            bucket.tokens = Math.min(this.maxTokens, bucket.tokens + (elapsed / this.refillInterval) * this.maxTokens);
        }
    }

    _refillGlobal() {
        const elapsed = Date.now() - this.globalLastRefill;
        if (elapsed > this.globalInterval) {
            this.globalTokens = this.globalMax;
            this.globalLastRefill = Date.now();
        } else {
            this.globalTokens = Math.min(this.globalMax, this.globalTokens + (elapsed / this.globalInterval) * this.globalMax);
        }
    }

    async acquire(channelId) {
        this._refillGlobal();
        const bucket = this._getBucket(channelId);
        this._refillBucket(bucket);

        if (this.globalTokens < 1) {
            this.stats.throttledMessages++;
            return {
                allowed: false,
                waitTime: Math.max(100, this.globalInterval - (Date.now() - this.globalLastRefill)),
                reason: 'global_rate_limit'
            };
        }
        if (bucket.tokens < 1) {
            this.stats.throttledMessages++;
            const channelStats = this.stats.perChannel.get(channelId);
            if (channelStats) {
                channelStats.throttled++;
            }
            return {
                allowed: false,
                waitTime: Math.max(100, this.refillInterval - (Date.now() - bucket.lastRefill)),
                reason: 'channel_rate_limit'
            };
        }
        this.globalTokens -= 1;
        bucket.tokens -= 1;
        this.stats.totalMessages++;
        const channelStats = this.stats.perChannel.get(channelId);
        if (channelStats) {
            channelStats.messages++;
        }
        return {allowed: true, waitTime: 0, remainingTokens: bucket.tokens, globalRemaining: this.globalTokens};
    }

    async wait(channelId) {
        let attempts = 0;
        while (attempts < 10) {
            const result = await this.acquire(channelId);
            if (result.allowed) {
                return result;
            }
            await new Promise(resolve => setTimeout(resolve, result.waitTime));
            attempts++;
        }
        Logger.warn(`Rate limiter: ${channelId} waited too long, allowing message`);
        return {allowed: true, waitTime: 0, forced: true};
    }

    getStats() {
        const perChannelStats = {};
        for (const [channelId, stats] of this.stats.perChannel.entries()) {
            perChannelStats[channelId] = {
                messages: stats.messages, throttled: stats.throttled,
                currentTokens: this.channelBuckets.get(channelId)?.tokens ?? 0
            };
        }
        return {
            totalMessages: this.stats.totalMessages,
            throttledMessages: this.stats.throttledMessages,
            globalTokens: this.globalTokens,
            perChannel: perChannelStats
        };
    }

    resetStats() {
        this.stats = {totalMessages: 0, throttledMessages: 0, perChannel: new Map()};
    }

    clearChannel(channelId) {
        this.channelBuckets.delete(channelId);
        this.stats.perChannel.delete(channelId);
    }
}
