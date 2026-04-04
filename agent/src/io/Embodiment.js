/**
 * Embodiment.js - Abstract Base Class for Agent I/O Embodiments
 * 
 * Phase 5: Embodiment Abstraction
 * 
 * Defines the contract for all agent I/O modalities (IRC, Nostr, CLI, WebUI, API, etc.)
 * Each embodiment is a first-class citizen with its own profile, salience scoring,
 * and message queue management.
 * 
 * Key differences from Channel:
 * - Embodiments have a profile (description, capabilities, constraints)
 * - Embodiments report salience scores for input prioritization
 * - Embodiments support sub-agent scoping (Phase 6)
 */
import { EventEmitter } from 'events';
import { Logger } from '@senars/core';

export class Embodiment extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.id = config.id || `embodiment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        this.type = 'generic';
        this.status = 'disconnected';
        
        // Embodiment profile - metadata about this I/O modality
        this.profile = {
            name: config.name || this.type,
            description: config.description || '',
            capabilities: config.capabilities || [],  // e.g., ['private-messages', 'file-transfer', 'voice']
            constraints: config.constraints || {},     // e.g., { maxMessageLength: 4096 }
            isPublic: config.isPublic ?? true,        // Public channel vs private interface
            isInternal: config.isInternal ?? false,   // Internal/self-directed (VirtualEmbodiment)
            defaultSalience: config.defaultSalience ?? 0.5
        };
        
        // Message queue for incoming messages
        this._messageQueue = [];
        
        // Salience configuration
        this._salienceConfig = config.salience || {};
    }

    /**
     * Connect to the embodiment
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    /**
     * Disconnect from the embodiment
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Send a message through this embodiment
     * @param {string} target - Destination identifier
     * @param {string} content - Message content
     * @param {object} metadata - Optional metadata
     * @returns {Promise<boolean>}
     */
    async sendMessage(target, content, metadata = {}) {
        throw new Error('sendMessage() must be implemented by subclass');
    }

    /**
     * Calculate salience score for an incoming message
     * 
     * Salience determines message prioritization in EmbodimentBus.
     * Higher salience = processed first when attentionSalience capability is enabled.
     * 
     * @param {object} message - The incoming message object
     * @returns {number} Salience score between 0.0 and 1.0
     */
    calculateSalience(message) {
        // Base salience from embodiment profile
        let salience = this.profile.defaultSalience;
        
        // Boost for direct mentions / private messages
        if (message.isPrivate || message.isMention) {
            salience += 0.2;
        }
        
        // Boost for high-priority metadata
        if (message.metadata?.priority) {
            salience += Math.min(0.3, message.metadata.priority);
        }
        
        // Decay for low-importance message types
        if (this._salienceConfig.typeWeights) {
            const typeWeight = this._salienceConfig.typeWeights[message.metadata?.type] ?? 0;
            salience += typeWeight;
        }
        
        // Clamp to [0, 1]
        return Math.max(0, Math.min(1, salience));
    }

    /**
     * Get the next message from this embodiment's queue
     * @param {object} options - Retrieval options
     * @returns {object|null} Message object or null if queue is empty
     */
    getNextMessage(options = {}) {
        if (this._messageQueue.length === 0) {
            return null;
        }
        
        // FIFO by default
        if (options.mode === 'LIFO') {
            return this._messageQueue.pop();
        }
        
        return this._messageQueue.shift();
    }

    /**
     * Peek at messages without removing them
     * @param {number} limit - Max messages to return
     * @returns {array} Array of message objects
     */
    peekMessages(limit = 10) {
        return this._messageQueue.slice(0, limit);
    }

    /**
     * Get queue length
     * @returns {number}
     */
    getQueueLength() {
        return this._messageQueue.length;
    }

    /**
     * Clear the message queue
     */
    clearQueue() {
        this._messageQueue = [];
    }

    /**
     * Emit an incoming message - adds to queue and emits event
     * @param {object} message - Normalized message object
     */
    emitMessage(message) {
        const normalizedMessage = {
            id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            embodimentId: this.id,
            protocol: this.type,
            from: message.from || 'unknown',
            content: message.content || '',
            timestamp: message.timestamp || Date.now(),
            metadata: message.metadata || {},
            isPrivate: message.isPrivate ?? false,
            isMention: message.isMention ?? false,
            salience: 0  // Will be calculated by EmbodimentBus
        };
        
        // Calculate salience for this message
        normalizedMessage.salience = this.calculateSalience(normalizedMessage);
        
        // Add to queue
        this._messageQueue.push(normalizedMessage);
        
        // Emit event for real-time handling
        this.emit('message', normalizedMessage);
        
        Logger.debug(`[${this.type}:${this.id}] Message queued: ${normalizedMessage.id} (salience: ${normalizedMessage.salience})`);
    }

    /**
     * Update status and emit change event
     * @param {string} newStatus
     */
    setStatus(newStatus) {
        if (this.status !== newStatus) {
            const oldStatus = this.status;
            this.status = newStatus;
            this.emit('status', { old: oldStatus, new: newStatus });
            Logger.info(`[${this.type}:${this.id}] Status: ${oldStatus} -> ${newStatus}`);
        }
    }

    /**
     * Get embodiment profile for introspection
     * @returns {object}
     */
    getProfile() {
        return { ...this.profile };
    }

    /**
     * Get embodiment stats
     * @returns {object}
     */
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
