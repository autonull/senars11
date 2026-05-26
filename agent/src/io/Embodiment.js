import {EventEmitter} from 'events';
import {generateId, Logger} from '@senars/core';

export class Embodiment extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.id = config.id || generateId('embodiment');
        this.type = 'generic';
        this.status = 'disconnected';
        this.profile = {
            name: config.name || this.type,
            description: config.description || '',
            capabilities: config.capabilities || [],
            constraints: config.constraints || {},
            isPublic: config.isPublic ?? true,
            isInternal: config.isInternal ?? false,
            defaultSalience: config.defaultSalience ?? 0.5
        };
        this._messageQueue = [];
        this._salienceConfig = config.salience || {};
    }

    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    async sendMessage(target, content, metadata = {}) {
        throw new Error('sendMessage() must be implemented by subclass');
    }

    calculateSalience(message) {
        if (!message) return this.profile.defaultSalience;
        let salience = this.profile.defaultSalience;
        if (message.isPrivate || message.isMention) {
            salience += 0.2;
        }
        if (message.metadata?.priority) {
            salience += Math.min(0.3, message.metadata.priority);
        }
        if (this._salienceConfig.typeWeights) {
            salience += this._salienceConfig.typeWeights[message.metadata?.type] ?? 0;
        }
        return Math.max(0, Math.min(1, salience));
    }

    getNextMessage(options = {}) {
        if (this._messageQueue.length === 0) {
            return null;
        }
        return options.mode === 'LIFO' ? this._messageQueue.pop() : this._messageQueue.shift();
    }

    peekMessages(limit = 10) {
        return this._messageQueue.slice(0, limit);
    }

    getQueueLength() {
        return this._messageQueue.length;
    }

    clearQueue() {
        this._messageQueue = [];
    }

    emitMessage(message) {
        if (!message || !message.from) {
            Logger.debug(`[${this.type}:${this.id}] Dropped message with no sender`);
            return;
        }
        const normalizedMessage = {
            id: message.id || generateId('msg'),
            embodimentId: this.id,
            protocol: this.type,
            from: message.from,
            content: message.content ?? '',
            timestamp: message.timestamp || Date.now(),
            metadata: message.metadata || {},
            isPrivate: message.isPrivate ?? false,
            isMention: message.isMention ?? false,
            salience: 0
        };
        normalizedMessage.salience = this.calculateSalience(normalizedMessage);
        this._messageQueue.push(normalizedMessage);
        this.emit('message', normalizedMessage);
        Logger.debug(`[${this.type}:${this.id}] Message queued: ${normalizedMessage.id} (salience: ${normalizedMessage.salience})`);
    }

    setStatus(newStatus) {
        if (this.status !== newStatus) {
            const oldStatus = this.status;
            this.status = newStatus;
            this.emit('status', {old: oldStatus, new: newStatus});
            Logger.info(`[${this.type}:${this.id}] Status: ${oldStatus} -> ${newStatus}`);
        }
    }

    getProfile() {
        return {...this.profile};
    }

    getStats() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            queueLength: this._messageQueue.length,
            profile: this.profile
        };
    }
}
