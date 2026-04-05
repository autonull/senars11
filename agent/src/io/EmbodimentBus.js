/**
 * EmbodimentBus.js - I/O Router for Multiple Embodiments
 *
 * Phase 5: Embodiment Abstraction
 *
 * Manages registration, message routing, and retrieval across multiple
 * simultaneous I/O channels. Supports both FIFO and salience-ordered
 * message retrieval modes.
 *
 * Key features:
 * - Register/unregister embodiments dynamically
 * - getNextMessage() with FIFO or salience-ordered retrieval
 * - Broadcast messages to all/specific embodiments
 * - Event forwarding from embodiments to central listeners
 */
import {EventEmitter} from 'events';
import {Logger} from '@senars/core';

export class EmbodimentBus extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.embodiments = new Map();
        this._messageQueue = [];  // Global queue for salience-ordered retrieval
        this._useSalienceOrdering = config.attentionSalience ?? false;
        this._middleware = [];

        // Stats tracking
        this._stats = {
            totalMessages: 0,
            messagesByEmbodiment: new Map(),
            lastMessageTime: null
        };
    }

    /**
     * Register an embodiment
     * @param {Embodiment} embodiment
     */
    register(embodiment) {
        if (this.embodiments.has(embodiment.id)) {
            throw new Error(`Embodiment ${embodiment.id} already registered`);
        }

        this.embodiments.set(embodiment.id, embodiment);

        // Forward events from embodiment
        embodiment.on('message', (msg) => this._handleIncomingMessage(msg));
        embodiment.on('status', (status) => this.emit('embodiment.status', {
            embodimentId: embodiment.id,
            ...status
        }));
        embodiment.on('error', (err) => this.emit('embodiment.error', {
            embodimentId: embodiment.id,
            error: err
        }));

        Logger.info(`Embodiment registered: ${embodiment.type} (${embodiment.id})`);
        this.emit('embodiment.registered', embodiment);
    }

    /**
     * Unregister an embodiment
     * @param {string} embodimentId
     */
    async unregister(embodimentId) {
        const embodiment = this.embodiments.get(embodimentId);
        if (embodiment) {
            if (embodiment.status === 'connected') {
                await embodiment.disconnect();
            }
            embodiment.removeAllListeners();
            this.embodiments.delete(embodimentId);

            // Remove from global queue
            this._messageQueue = this._messageQueue.filter(
                msg => msg.embodimentId !== embodimentId
            );

            Logger.info(`Embodiment unregistered: ${embodimentId}`);
            this.emit('embodiment.unregistered', embodimentId);
        }
    }

    /**
     * Get an embodiment by ID
     * @param {string} embodimentId
     * @returns {Embodiment|undefined}
     */
    get(embodimentId) {
        return this.embodiments.get(embodimentId);
    }

    /**
     * Get all registered embodiments
     * @returns {Array<Embodiment>}
     */
    getAll() {
        return Array.from(this.embodiments.values());
    }

    /**
     * Get next message from the bus
     *
     * If attentionSalience is enabled: returns highest-salience message
     * Otherwise: returns oldest message (FIFO)
     *
     * @param {object} options - Retrieval options
     * @returns {object|null} Message object or null if no messages
     */
    getNextMessage(options = {}) {
        const mode = options.mode || (this._useSalienceOrdering ? 'salience' : 'FIFO');

        if (this._messageQueue.length === 0) {
            return null;
        }

        let message;

        if (mode === 'salience') {
            // Find and remove highest-salience message
            let maxIdx = 0;
            let maxSalience = this._messageQueue[0].salience ?? 0;

            for (let i = 1; i < this._messageQueue.length; i++) {
                const salience = this._messageQueue[i].salience ?? 0;
                if (salience > maxSalience) {
                    maxSalience = salience;
                    maxIdx = i;
                }
            }

            message = this._messageQueue.splice(maxIdx, 1)[0];
            Logger.debug(`Salience-ordered retrieval: message ${message.id} (salience: ${maxSalience})`);
        } else {
            // FIFO
            message = this._messageQueue.shift();
            Logger.debug(`FIFO retrieval: message ${message.id}`);
        }

        return message;
    }

    /**
     * Peek at queued messages without removing
     * @param {number} limit - Max messages to return
     * @param {string} mode - 'FIFO' | 'salience'
     * @returns {Array<object>}
     */
    peekMessages(limit = 10, mode = 'FIFO') {
        if (mode === 'salience') {
            // Return sorted by salience descending
            return [...this._messageQueue]
                .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))
                .slice(0, limit);
        }
        return this._messageQueue.slice(0, limit);
    }

    /**
     * Get total queued message count
     * @returns {number}
     */
    getQueueLength() {
        return this._messageQueue.length;
    }

    /**
     * Send a message through a specific embodiment
     * @param {string} embodimentId
     * @param {string} target
     * @param {string} content
     * @param {object} metadata
     */
    async sendMessage(embodimentId, target, content, metadata = {}) {
        const embodiment = this.embodiments.get(embodimentId);
        if (!embodiment) {
            throw new Error(`Embodiment ${embodimentId} not found`);
        }

        if (embodiment.status !== 'connected') {
            throw new Error(`Embodiment ${embodimentId} is not connected`);
        }

        Logger.debug(`Sending message via ${embodimentId} to ${target}`);
        return await embodiment.sendMessage(target, content, metadata);
    }

    /**
     * Broadcast a message to all connected embodiments
     * @param {string} target
     * @param {string} content
     * @param {object} metadata
     * @returns {Promise<object>} Results by embodiment ID
     */
    async broadcast(target, content, metadata = {}) {
        const results = {};
        const promises = [];

        for (const [id, embodiment] of this.embodiments) {
            if (embodiment.status === 'connected') {
                const promise = embodiment.sendMessage(target, content, metadata)
                    .then(success => {
                        results[id] = {success};
                    })
                    .catch(err => {
                        results[id] = {success: false, error: err.message};
                    });
                promises.push(promise);
            }
        }

        await Promise.all(promises);
        return results;
    }

    /**
     * Add middleware for processing messages
     * @param {Function} fn - (msg, next) => void
     */
    use(fn) {
        this._middleware.push(fn);
    }

    /**
     * Enable or disable salience-ordered retrieval
     * @param {boolean} enabled
     */
    setSalienceOrdering(enabled) {
        this._useSalienceOrdering = enabled;
        Logger.info(`Salience ordering ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get bus stats
     * @returns {object}
     */
    getStats() {
        const embodimentStats = {};
        for (const [id, embodiment] of this.embodiments) {
            embodimentStats[id] = embodiment.getStats();
        }

        return {
            totalEmbodiments: this.embodiments.size,
            connectedEmbodiments: this.getAll().filter(e => e.status === 'connected').length,
            queueLength: this._messageQueue.length,
            useSalienceOrdering: this._useSalienceOrdering,
            totalMessages: this._stats.totalMessages,
            embodiments: embodimentStats
        };
    }

    /**
     * Shutdown all embodiments
     */
    async shutdown() {
        const promises = Array.from(this.embodiments.values()).map(e => e.disconnect());
        await Promise.all(promises);
        this.embodiments.clear();
        this._messageQueue = [];
        Logger.info('EmbodimentBus shutdown complete');
    }

    // ── Private ──────────────────────────────────────────────────────

    /**
     * Process incoming message from an embodiment
     */
    async _handleIncomingMessage(message) {
        try {
            // Execute middleware pipeline
            const msg = {...message};
            for (const mw of this._middleware) {
                let nextCalled = false;
                const next = () => {
                    nextCalled = true;
                };
                await mw(msg, next);
                if (!nextCalled) {
                    Logger.debug(`Message ${msg.id} stopped by middleware`);
                    return;
                }
            }

            // Add to global queue
            this._messageQueue.push(msg);

            // Update stats
            this._stats.totalMessages++;
            this._stats.lastMessageTime = Date.now();
            const prevCount = this._stats.messagesByEmbodiment.get(msg.embodimentId) || 0;
            this._stats.messagesByEmbodiment.set(msg.embodimentId, prevCount + 1);

            // Emit processed message
            this.emit('message', msg);

            Logger.debug(`Message ${msg.id} queued from ${msg.embodimentId} (salience: ${msg.salience})`);
        } catch (error) {
            Logger.error('Error in embodiment message processing:', error);
        }
    }
}
