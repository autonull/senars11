import { MessageEnvelope } from './MessageEnvelope.js';
import { Logger } from '@senars/core';

export class AgentMessageQueue {
    constructor(embodimentBus, cap) {
        this._msgQueue = [];
        this._msgWaiters = [];
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
}
