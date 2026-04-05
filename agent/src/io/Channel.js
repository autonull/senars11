import { EventEmitter } from 'events';
import { Logger, generateId } from '@senars/core';

export class Channel extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.id = config.id || generateId('channel');
        this.type = 'generic';
        this.status = 'disconnected';
    }

    async connect() { throw new Error('connect() must be implemented by subclass'); }
    async disconnect() { throw new Error('disconnect() must be implemented by subclass'); }
    async sendMessage(target, content, metadata = {}) { throw new Error('sendMessage() must be implemented by subclass'); }

    emitMessage(from, content, metadata = {}) {
        this.emit('message', {
            id: metadata.id || generateId('msg'),
            channelId: this.id,
            protocol: this.type,
            from, content,
            timestamp: Date.now(),
            metadata
        });
    }

    setStatus(newStatus) {
        if (this.status !== newStatus) {
            const oldStatus = this.status;
            this.status = newStatus;
            this.emit('status', { old: oldStatus, new: newStatus });
            Logger.info(`[${this.type}:${this.id}] Status changed: ${oldStatus} -> ${newStatus}`);
        }
    }
}
