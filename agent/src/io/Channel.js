/**
 * Channel.js - Abstract Base Class for Communication Channels
 * Defines the contract for all messaging protocols (IRC, Nostr, etc.)
 */
import { EventEmitter } from 'events';
import { Logger, generateId } from '@senars/core';

export class Channel extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.id = config.id || generateId('channel');
        this.type = 'generic';
        this.status = 'disconnected'; // disconnected, connecting, connected, error
    }

    /**
     * Connect to the service
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    /**
     * Disconnect from the service
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Send a message to a specific target (channel, user, etc.)
     * @param {string} target - The destination (e.g., #channel, user_id)
     * @param {string} content - The message content
     * @param {object} metadata - Optional metadata
     * @returns {Promise<boolean>}
     */
    async sendMessage(target, content, metadata = {}) {
        throw new Error('sendMessage() must be implemented by subclass');
    }

    /**
     * Helper to emit incoming messages in a standardized format
     * @param {string} from - Sender identifier
     * @param {string} content - Message content
     * @param {object} metadata - Additional protocol-specific data
     */
    emitMessage(from, content, metadata = {}) {
        this.emit('message', {
            id: metadata.id || generateId('msg'),
            channelId: this.id,
            protocol: this.type,
            from,
            content,
            timestamp: Date.now(),
            metadata
        });
    }

    /**
     * Helper to update status and emit change event
     * @param {string} newStatus
     */
    setStatus(newStatus) {
        if (this.status !== newStatus) {
            const oldStatus = this.status;
            this.status = newStatus;
            this.emit('status', { old: oldStatus, new: newStatus });
            Logger.info(`[${this.type}:${this.id}] Status changed: ${oldStatus} -> ${newStatus}`);
        }
    }
}
