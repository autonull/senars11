/**
 * ChannelManager.js - Thin view over EmbodimentBus
 * Superseded by EmbodimentBus per METTACLAW §15.
 * Registration, message routing, and salience calculation live in EmbodimentBus.
 */
import { EventEmitter } from 'events';
import { Logger } from '@senars/core';

export class ChannelManager extends EventEmitter {
    constructor(config = {}, bus) {
        super();
        this.config = config;
        this.bus = bus;
    }

    register(channel) {
        this.bus.register(channel);
    }

    get(channelId) {
        return this.bus.get(channelId);
    }

    async unregister(channelId) {
        const emb = this.bus.get(channelId);
        if (emb) {
            await emb.disconnect?.();
            this.bus.unregister(channelId);
        }
    }

    async sendMessage(channelId, target, content, metadata = {}) {
        const emb = this.bus.get(channelId);
        if (emb?.status !== 'connected') throw new Error(`Embodiment ${channelId} not connected`);
        return emb.sendMessage(target, content, metadata);
    }

    async broadcast(target, content) {
        return this.bus.broadcast(target, content);
    }

    async shutdown() {
        return this.bus.shutdown();
    }
}
