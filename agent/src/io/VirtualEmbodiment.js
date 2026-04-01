/**
 * VirtualEmbodiment.js - Internal Self-Directed Channel
 * 
 * Phase 5: Embodiment Abstraction
 * 
 * Provides an internal channel for the agent to:
 * - Generate self-tasks when idle (autonomousLoop mode)
 * - Host sub-agents with isolated contexts (subAgentSpawning)
 * - Maintain internal monologue and reflection
 * 
 * This embodiment is always "connected" and has no external I/O.
 * Messages are internally generated task prompts.
 */
import { Embodiment } from './Embodiment.js';
import { Logger } from '@senars/core';

export class VirtualEmbodiment extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'Virtual',
            isInternal: true,
            isPublic: false,
            defaultSalience: config.defaultSalience ?? 0.7  // Higher default salience for self-tasks
        });
        
        this.type = 'virtual';
        this.id = config.id || 'virtual';
        
        // Task generation configuration
        this._taskQueue = config.taskQueue || [];
        this._maxQueueSize = config.maxQueueSize ?? 50;
        this._taskGenerators = [];  // Functions that can generate self-tasks
        this._idleTimeout = config.idleTimeout ?? 5000;  // ms before generating self-task
        this._idleTimer = null;
        
        // Sub-agent scoping (Phase 6)
        this._subAgents = new Map();
        this._scopedContexts = new Map();
        
        // Internal monologue buffer
        this._monologue = [];
        this._maxMonologueLength = config.maxMonologueLength ?? 100;
    }

    /**
     * Connect the virtual embodiment (always succeeds immediately)
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.status === 'connected') return;
        
        this.setStatus('connected');
        this.emit('connected', { type: 'virtual' });
        
        Logger.info('[VirtualEmbodiment] Connected - ready for self-directed tasks');
        
        // Start idle timer if autonomous mode
        if (this.config.autonomousMode) {
            this._startIdleTimer();
        }
    }

    /**
     * Disconnect the virtual embodiment
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.status === 'disconnected') return;
        
        this._stopIdleTimer();
        this._taskGenerators = [];
        
        this.setStatus('disconnected');
        this.emit('disconnected');
        
        Logger.info('[VirtualEmbodiment] Disconnected');
    }

    /**
     * Send a message to the virtual embodiment (internal queuing)
     * @param {string} target - 'self' or sub-agent ID
     * @param {string} content - Task or monologue content
     * @param {object} metadata - Options: isTask, isMonologue, subAgentId, priority
     * @returns {Promise<boolean>}
     */
    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') {
            throw new Error('Virtual embodiment not connected');
        }

        // Internal monologue
        if (metadata.isMonologue) {
            this._addMonologue(content);
            return true;
        }

        // Sub-agent directed message
        if (target !== 'self' && this._subAgents.has(target)) {
            return this._sendToSubAgent(target, content, metadata);
        }

        // Self-directed task
        if (metadata.isTask || target === 'self') {
            this._queueTask(content, metadata);
            return true;
        }

        // Default: emit as regular message
        this.emitMessage({
            from: 'virtual',
            content,
            metadata: { ...metadata, type: 'internal' }
        });

        return true;
    }

    /**
     * Generate a self-task when idle
     * @param {string} task - Task description
     * @param {object} metadata - Task metadata
     */
    generateSelfTask(task, metadata = {}) {
        const taskMessage = {
            from: 'virtual',
            content: task,
            metadata: {
                ...metadata,
                type: 'self-task',
                isPrivate: true,
                generated: Date.now()
            }
        };

        Logger.debug(`[VirtualEmbodiment] Generated self-task: ${task}`);
        this.emitMessage(taskMessage);
        
        // Reset idle timer
        this._resetIdleTimer();
    }

    /**
     * Register a task generator function
     * @param {Function} generator - async () => { task: string, metadata: object }
     */
    registerTaskGenerator(generator) {
        this._taskGenerators.push(generator);
        Logger.debug('[VirtualEmbodiment] Task generator registered');
    }

    /**
     * Spawn a sub-agent with isolated context
     * 
     * Phase 6: subAgentSpawning capability
     * 
     * @param {string} subAgentId - Unique identifier for sub-agent
     * @param {string} task - Initial task for sub-agent
     * @param {object} context - Isolated context atoms
     * @param {number} cycleBudget - Max cycles sub-agent can run
     * @returns {boolean} Success
     */
    spawnSubAgent(subAgentId, task, context = {}, cycleBudget = 10) {
        if (this._subAgents.has(subAgentId)) {
            Logger.warn(`[VirtualEmbodiment] Sub-agent ${subAgentId} already exists`);
            return false;
        }

        this._subAgents.set(subAgentId, {
            id: subAgentId,
            status: 'active',
            createdAt: Date.now(),
            cycleBudget,
            cyclesUsed: 0,
            task
        });

        this._scopedContexts.set(subAgentId, new Map(Object.entries(context)));

        Logger.info(`[VirtualEmbodiment] Sub-agent spawned: ${subAgentId} (budget: ${cycleBudget})`);
        
        // Emit sub-agent creation event
        this.emit('subagent.spawned', {
            id: subAgentId,
            task,
            cycleBudget
        });

        return true;
    }

    /**
     * Send message to sub-agent
     */
    _sendToSubAgent(subAgentId, content, metadata = {}) {
        const subAgent = this._subAgents.get(subAgentId);
        if (!subAgent) {
            Logger.warn(`[VirtualEmbodiment] Sub-agent ${subAgentId} not found`);
            return false;
        }

        // Emit as message for sub-agent to process
        this.emitMessage({
            from: 'virtual',
            content,
            metadata: {
                ...metadata,
                type: 'sub-agent-message',
                subAgentId
            }
        });

        Logger.debug(`[VirtualEmbodiment] Message sent to sub-agent ${subAgentId}`);
        return true;
    }

    /**
     * Terminate a sub-agent
     * @param {string} subAgentId
     * @returns {object} Sub-agent final state
     */
    terminateSubAgent(subAgentId) {
        const subAgent = this._subAgents.get(subAgentId);
        if (!subAgent) {
            return null;
        }

        this._subAgents.delete(subAgentId);
        const context = this._scopedContexts.get(subAgentId);
        this._scopedContexts.delete(subAgentId);

        subAgent.status = 'terminated';
        subAgent.terminatedAt = Date.now();

        Logger.info(`[VirtualEmbodiment] Sub-agent terminated: ${subAgentId}`);
        
        this.emit('subagent.terminated', {
            id: subAgentId,
            ...subAgent
        });

        return { ...subAgent, context: context ? Object.fromEntries(context) : {} };
    }

    /**
     * Get sub-agent state
     * @param {string} subAgentId
     * @returns {object|null}
     */
    getSubAgent(subAgentId) {
        return this._subAgents.get(subAgentId) || null;
    }

    /**
     * Get all sub-agents
     * @returns {Array<object>}
     */
    getSubAgents() {
        return Array.from(this._subAgents.values());
    }

    /**
     * Get scoped context for sub-agent
     * @param {string} subAgentId
     * @returns {Map|null}
     */
    getScopedContext(subAgentId) {
        return this._scopedContexts.get(subAgentId) || null;
    }

    /**
     * Add to internal monologue buffer
     */
    _addMonologue(content) {
        this._monologue.push({
            timestamp: Date.now(),
            content
        });

        // Trim if over limit
        while (this._monologue.length > this._maxMonologueLength) {
            this._monologue.shift();
        }

        Logger.debug(`[VirtualEmbodiment] Monologue: ${content}`);
    }

    /**
     * Get recent monologue entries
     * @param {number} limit
     * @returns {Array<object>}
     */
    getMonologue(limit = 10) {
        return this._monologue.slice(-limit);
    }

    /**
     * Clear monologue buffer
     */
    clearMonologue() {
        this._monologue = [];
    }

    /**
     * Queue a self-task
     */
    _queueTask(content, metadata = {}) {
        if (this._taskQueue.length >= this._maxQueueSize) {
            this._taskQueue.shift();  // Drop oldest
        }

        this._taskQueue.push({
            content,
            metadata,
            queuedAt: Date.now()
        });

        Logger.debug(`[VirtualEmbodiment] Task queued: ${content}`);
    }

    /**
     * Generate task from registered generators
     */
    async _generateTaskFromGenerators() {
        if (this._taskGenerators.length === 0) {
            return null;
        }

        // Pick random generator
        const generator = this._taskGenerators[
            Math.floor(Math.random() * this._taskGenerators.length)
        ];

        try {
            const result = await generator();
            if (result && result.task) {
                return result;
            }
        } catch (error) {
            Logger.error('[VirtualEmbodiment] Task generator error:', error);
        }

        return null;
    }

    /**
     * Start idle timer for autonomous task generation
     */
    _startIdleTimer() {
        this._stopIdleTimer();
        this._idleTimer = setTimeout(() => this._onIdle(), this._idleTimeout);
    }

    /**
     * Stop idle timer
     */
    _stopIdleTimer() {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    /**
     * Reset idle timer (called on activity)
     */
    _resetIdleTimer() {
        if (this.config.autonomousMode) {
            this._startIdleTimer();
        }
    }

    /**
     * Idle callback - generate self-task
     */
    async _onIdle() {
        Logger.debug('[VirtualEmbodiment] Idle - generating self-task');
        
        const generated = await this._generateTaskFromGenerators();
        
        if (generated) {
            this.generateSelfTask(generated.task, {
                ...generated.metadata,
                reason: 'idle-generated'
            });
        } else {
            // Default self-task
            this.generateSelfTask('Reflect on recent activity and identify improvements.', {
                reason: 'idle-default',
                type: 'reflection'
            });
        }
    }

    /**
     * Override getStats to include sub-agent info
     */
    getStats() {
        const baseStats = super.getStats();
        return {
            ...baseStats,
            subAgents: this._subAgents.size,
            taskQueueLength: this._taskQueue.length,
            monologueLength: this._monologue.length,
            taskGenerators: this._taskGenerators.length
        };
    }
}
