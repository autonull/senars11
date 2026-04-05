import { Embodiment } from './Embodiment.js';
import { Logger } from '@senars/core';

export class VirtualEmbodiment extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'Virtual',
            isInternal: true,
            isPublic: false,
            defaultSalience: config.defaultSalience ?? 0.7
        });
        this.type = 'virtual';
        this.id = config.id || 'virtual';
        this._taskQueue = config.taskQueue || [];
        this._maxQueueSize = config.maxQueueSize ?? 50;
        this._taskGenerators = [];
        this._idleTimeout = config.idleTimeout ?? 5000;
        this._idleTimer = null;
        this._subAgents = new Map();
        this._scopedContexts = new Map();
        this._monologue = [];
        this._maxMonologueLength = config.maxMonologueLength ?? 100;
    }

    async connect() {
        if (this.status === 'connected') return;
        this.setStatus('connected');
        this.emit('connected', { type: 'virtual' });
        Logger.info('[VirtualEmbodiment] Connected - ready for self-directed tasks');
        if (this.config.autonomousMode) this._startIdleTimer();
    }

    async disconnect() {
        if (this.status === 'disconnected') return;
        this._stopIdleTimer();
        this._taskGenerators = [];
        this.setStatus('disconnected');
        this.emit('disconnected');
        Logger.info('[VirtualEmbodiment] Disconnected');
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') throw new Error('Virtual embodiment not connected');
        if (metadata.isMonologue) { this._addMonologue(content); return true; }
        if (target !== 'self' && this._subAgents.has(target)) return this._sendToSubAgent(target, content, metadata);
        if (metadata.isTask || target === 'self') { this._queueTask(content, metadata); return true; }
        this.emitMessage({ from: 'virtual', content, metadata: { ...metadata, type: 'internal' } });
        return true;
    }

    generateSelfTask(task, metadata = {}) {
        const taskMessage = {
            from: 'virtual', content: task,
            metadata: { ...metadata, type: 'self-task', isPrivate: true, generated: Date.now() }
        };
        Logger.debug(`[VirtualEmbodiment] Generated self-task: ${task}`);
        this.emitMessage(taskMessage);
        this._resetIdleTimer();
    }

    registerTaskGenerator(generator) {
        this._taskGenerators.push(generator);
        Logger.debug('[VirtualEmbodiment] Task generator registered');
    }

    spawnSubAgent(subAgentId, task, context = {}, cycleBudget = 10) {
        if (this._subAgents.has(subAgentId)) {
            Logger.warn(`[VirtualEmbodiment] Sub-agent ${subAgentId} already exists`);
            return false;
        }
        this._subAgents.set(subAgentId, { id: subAgentId, status: 'active', createdAt: Date.now(), cycleBudget, cyclesUsed: 0, task });
        this._scopedContexts.set(subAgentId, new Map(Object.entries(context)));
        Logger.info(`[VirtualEmbodiment] Sub-agent spawned: ${subAgentId} (budget: ${cycleBudget})`);
        this.emit('subagent.spawned', { id: subAgentId, task, cycleBudget });
        return true;
    }

    _sendToSubAgent(subAgentId, content, metadata = {}) {
        if (!this._subAgents.has(subAgentId)) {
            Logger.warn(`[VirtualEmbodiment] Sub-agent ${subAgentId} not found`);
            return false;
        }
        this.emitMessage({
            from: 'virtual', content,
            metadata: { ...metadata, type: 'sub-agent-message', subAgentId }
        });
        Logger.debug(`[VirtualEmbodiment] Message sent to sub-agent ${subAgentId}`);
        return true;
    }

    terminateSubAgent(subAgentId) {
        const subAgent = this._subAgents.get(subAgentId);
        if (!subAgent) return null;
        this._subAgents.delete(subAgentId);
        const context = this._scopedContexts.get(subAgentId);
        this._scopedContexts.delete(subAgentId);
        subAgent.status = 'terminated';
        subAgent.terminatedAt = Date.now();
        Logger.info(`[VirtualEmbodiment] Sub-agent terminated: ${subAgentId}`);
        this.emit('subagent.terminated', { id: subAgentId, ...subAgent });
        return { ...subAgent, context: context ? Object.fromEntries(context) : {} };
    }

    getSubAgent(subAgentId) { return this._subAgents.get(subAgentId) || null; }
    getSubAgents() { return Array.from(this._subAgents.values()); }
    getScopedContext(subAgentId) { return this._scopedContexts.get(subAgentId) || null; }

    _addMonologue(content) {
        this._monologue.push({ timestamp: Date.now(), content });
        while (this._monologue.length > this._maxMonologueLength) this._monologue.shift();
        Logger.debug(`[VirtualEmbodiment] Monologue: ${content}`);
    }

    getMonologue(limit = 10) { return this._monologue.slice(-limit); }
    clearMonologue() { this._monologue = []; }

    _queueTask(content, metadata = {}) {
        if (this._taskQueue.length >= this._maxQueueSize) this._taskQueue.shift();
        this._taskQueue.push({ content, metadata, queuedAt: Date.now() });
        Logger.debug(`[VirtualEmbodiment] Task queued: ${content}`);
    }

    async _generateTaskFromGenerators() {
        if (this._taskGenerators.length === 0) return null;
        const generator = this._taskGenerators[Math.floor(Math.random() * this._taskGenerators.length)];
        try {
            const result = await generator();
            if (result?.task) return result;
        } catch (error) {
            Logger.error('[VirtualEmbodiment] Task generator error:', error);
        }
        return null;
    }

    _startIdleTimer() {
        this._stopIdleTimer();
        this._idleTimer = setTimeout(() => this._onIdle(), this._idleTimeout);
    }

    _stopIdleTimer() {
        if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    }

    _resetIdleTimer() { if (this.config.autonomousMode) this._startIdleTimer(); }

    async _onIdle() {
        Logger.debug('[VirtualEmbodiment] Idle - generating self-task');
        const generated = await this._generateTaskFromGenerators();
        if (generated) {
            this.generateSelfTask(generated.task, { ...generated.metadata, reason: 'idle-generated' });
        } else {
            this.generateSelfTask('Reflect on recent activity and identify improvements.', { reason: 'idle-default', type: 'reflection' });
        }
    }

    getStats() {
        const base = super.getStats();
        return { ...base, subAgents: this._subAgents.size, taskQueueLength: this._taskQueue.length, monologueLength: this._monologue.length, taskGenerators: this._taskGenerators.length };
    }
}
