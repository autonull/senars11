import { MessageEnvelope } from './MessageEnvelope.js';
import { Logger } from '@senars/core';

export class AgentMessageQueue {
    constructor(embodimentBus, cap) {
        this._msgQueue = [];
        this._msgWaiters = [];
        this._wakeResolvers = [];
        embodimentBus.on('message', msg => {
            Logger.debug(`[AgentMessageQueue] [${msg.from}@${msg.embodimentId}] ${msg.content?.substring(0, 80)}`);
            try {
                const envelope = new MessageEnvelope({
                    text: `[${msg.from}@${msg.embodimentId}] ${msg.content}`,
                    from: msg.from,
                    embodimentId: msg.embodimentId,
                    content: msg.content,
                    channel: msg.metadata?.channel ?? null,
                    isPrivate: msg.metadata?.isPrivate ?? false,
                    salience: msg.salience ?? 0,
                });
                this._msgWaiters.length > 0
                    ? this._msgWaiters.shift()(envelope)
                    : this._msgQueue.push(envelope);
                // Wake any sleeping loop
                for (const resolve of this._wakeResolvers.splice(0)) resolve();
            } catch (e) {
                Logger.warn(`[AgentMessageQueue] Dropped malformed message: ${e.message}`);
            }
        });
        this._cap = cap;
    }

    dequeue() {
        if (this._msgQueue.length > 0) {
            return Promise.resolve(this._msgQueue.shift());
        }
        if (!this._cap('autonomousLoop')) {
            return new Promise(res => this._msgWaiters.push(res));
        }
        return Promise.resolve(null);
    }

    /**
     * Returns a promise that resolves when the next message arrives.
     * Used to interrupt sleep when a message arrives during the inter-cycle delay.
     */
    onMessage() {
        if (this._msgQueue.length > 0) return Promise.resolve();
        return new Promise(resolve => this._wakeResolvers.push(resolve));
    }
}
