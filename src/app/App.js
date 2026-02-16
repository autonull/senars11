import {AgentBuilder} from '../agent/AgentBuilder.js';
import EventEmitter from 'events';

export class App extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.agents = new Map();
        this.activeAgentId = null;
    }

    get agent() {
        return this.agents.get(this.activeAgentId)?.agent ?? null;
    }

    async initialize() {
        if (this.agent) return this.agent;
        return this.createAgent('default', this.config);
    }

    _generateAgentId() {
        return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    async createAgent(agentId = null, config = {}) {
        const id = agentId ?? this._generateAgentId();
        const effectiveConfig = Object.keys(config).length ? config : this.config;

        const agent = await new AgentBuilder(effectiveConfig).build();
        agent.id = id;

        this.agents.set(id, { id, agent, createdAt: new Date(), lastAccessed: new Date(), config: effectiveConfig });
        this.activeAgentId ??= id;

        return agent;
    }

    getAgent(agentId) {
        const entry = this.agents.get(agentId);
        if (entry) entry.lastAccessed = new Date();
        return entry?.agent ?? null;
    }

    switchAgent(agentId) {
        if (!this.agents.has(agentId)) throw new Error(`Agent ${agentId} does not exist`);
        this.activeAgentId = agentId;
        return this.getAgent(agentId);
    }

    listAgents() {
        return Array.from(this.agents.values()).map(entry => ({
            ...entry,
            isActive: entry.id === this.activeAgentId
        }));
    }

    async removeAgent(agentId) {
        const agentEntry = this.agents.get(agentId);
        if (!agentEntry) return false;

        await this._cleanupAgent(agentEntry.agent, agentId);
        this.agents.delete(agentId);

        if (this.activeAgentId === agentId) {
            this.activeAgentId = this.agents.keys().next().value ?? null;
        }

        return true;
    }

    async start({ startAgent = true, setupSignals = false } = {}) {
        await this.initialize();
        if (startAgent) this.agent?.start?.();
        if (setupSignals) this.setupGracefulShutdown();
        this.emit('started', this.agent);
        return this.agent;
    }

    async shutdown() {
        this.log.info('\nShutting down application...');
        for (const [id, { agent }] of this.agents) {
            await this._shutdownAgent(agent, id);
        }
        this.emit('stopped');
    }

    async _shutdownAgent(agent, agentId) {
        if (!agent) return;
        this.log.info(`Stopping agent ${agentId}...`);
        try {
            await agent.save?.();
            await (agent.shutdown?.() ?? agent.stop?.());
        } catch (error) {
            this.log.error(`Error stopping agent ${agentId}:`, error.message);
        }
    }

    async _cleanupAgent(agent, agentId) {
        if (!agent) return;
        try {
            agent.stop?.();
            await agent.dispose?.();
        } catch (error) {
            this.log.error(`Error cleaning up agent ${agentId}:`, error);
        }
    }

    setupGracefulShutdown() {
        const handleSignal = async () => {
            await this.shutdown();
            process.exit(0);
        };

        process.on('SIGINT', handleSignal);
        process.on('SIGTERM', handleSignal);
    }
}
