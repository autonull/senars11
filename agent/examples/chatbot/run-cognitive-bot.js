#!/usr/bin/env node

/**
 * Cognitive IRC Bot - Full Cognitive Architecture
 * 
 * Integrates: Cognitive Architecture, MeTTa Reasoning, LLM, MCP Tools, and IRC
 */
import { Agent } from '@senars/agent';
import { Logger } from '@senars/core';
import { IRCChannel } from '@senars/agent/io/index.js';
import { CognitiveArchitecture } from '@senars/agent/cognitive/index.js';
import { MeTTaReasoner } from '@senars/agent/cognitive/index.js';
import { CognitiveLLM } from '../../src/cognitive/CognitiveLLM.js';
import { MCPClient } from '../../src/cognitive/MCPClient.js';

const CONFIG = {
    irc: { host: 'irc.quakenet.org', port: 6667, nick: 'SeNARchy', channel: '##metta', tls: false },
    ollama: { baseURL: 'http://localhost:11434', model: 'hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K' },
    cognitive: {
        agentName: 'SeNARchy',
        personality: 'helpful, curious, and concise. You engage genuinely and remember context.',
        workingMemoryCapacity: 7,
        attentionThreshold: 0.3
    },
    rateLimit: { perChannelMax: 3, perChannelInterval: 8000, globalMax: 10, globalInterval: 10000 }
};

class CognitiveIRCBot {
    constructor(config) {
        this.config = config;
        this.agent = null;
        this.cognitive = null;
        this.llm = null;
        this.reasoner = null;
        this.mcpClient = null;
        this.isRunning = false;
    }

    async initialize() {
        Logger.info('🧠 Initializing Cognitive IRC Bot...');

        // Initialize base Agent
        this.agent = new Agent({
            id: `cognitive-${this.config.cognitive.agentName}`,
            lm: { provider: 'dummy' },
            inputProcessing: { enableNarseseFallback: true },
            rateLimit: this.config.rateLimit
        });
        await this.agent.initialize();
        Logger.info('✅ Base Agent initialized');

        // Create and register IRC channel
        const ircChannel = new IRCChannel({
            id: 'irc',
            host: this.config.irc.host,
            port: this.config.irc.port,
            nick: this.config.irc.nick,
            username: this.config.irc.nick.toLowerCase(),
            realname: `${this.config.cognitive.agentName} Cognitive Bot`,
            tls: this.config.irc.tls,
            channels: [this.config.irc.channel]
        });
        this.agent.channelManager.register(ircChannel);
        Logger.info('✅ IRC Channel registered');

        // Initialize Cognitive Architecture
        this.cognitive = new CognitiveArchitecture(this.config.cognitive);
        Logger.info('✅ Cognitive Architecture initialized');

        // Initialize LLM
        this.llm = new CognitiveLLM(this.agent, {
            agentName: this.config.cognitive.agentName,
            personality: this.config.cognitive.personality
        });
        this.cognitive.setLLM(this.llm);
        Logger.info('✅ LLM initialized');

        // Initialize MeTTa Reasoner (if available)
        if (this.agent.metta) {
            this.reasoner = new MeTTaReasoner(this.agent.metta, { inferenceDepth: 3, maxInferenceTime: 300 });
            this.cognitive.setReasoner(this.reasoner);
            Logger.info('✅ MeTTa Reasoner initialized');
        } else {
            Logger.warn('⚠️  MeTTa not available, reasoning will be limited');
        }

        // Initialize MCP Client
        this.mcpClient = new MCPClient({ servers: [{ name: 'builtin' }], autoConnect: true });
        this.mcpClient.on('remember', async ({ fact, category }) => {
            if (this.reasoner) await this.reasoner._storeBelief({ content: fact, metadata: { category }, timestamp: Date.now() });
        });
        this.cognitive.setMCPClient(this.mcpClient);
        Logger.info('✅ MCP Client initialized');

        this._setupHandlers();
        this._initializeGoals();
        Logger.info('✅ Cognitive IRC Bot initialization complete');
    }

    _setupHandlers() {
        const ircChannel = this.agent.channelManager?.get('irc');
        if (!ircChannel) { Logger.warn('IRC channel not available'); return; }

        ircChannel.on('message', async (msg) => {
            if (!msg.from || msg.from === this.config.irc.nick || ['Server', 'AUTH', '*', ''].includes(msg.from)) return;
            const isPrivate = msg.metadata?.isPrivate ?? false;
            Logger.info(`[IRC] ${isPrivate ? 'PM' : (msg.metadata?.channel ?? this.config.irc.channel)} from ${msg.from}: ${msg.content?.substring(0, 60)}...`);
            await this._processMessage(msg, isPrivate);
        });

        ircChannel.on('connected', async (event) => {
            Logger.info(`🔌 Connected to IRC as ${event.nick}`);
            setTimeout(async () => {
                await this._sendMessage(this.config.irc.channel, `🤖 ${this.config.cognitive.agentName} online! I have memory and reasoning. Ask me anything!`);
            }, 2000);
        });

        ircChannel.on('disconnected', () => Logger.warn('❌ Disconnected from IRC'));
        ircChannel.on('error', (err) => Logger.error('IRC Error:', err));
        ircChannel.on('user_joined', ({ nick, channel }) => {
            if (channel === this.config.irc.channel && nick !== this.config.irc.nick) {
                Logger.info(`[IRC] ${nick} joined ${channel}`);
            }
        });
    }

    async _processMessage(msg, isPrivate) {
        try {
            const stimulus = {
                type: 'message', source: 'irc', content: msg.content,
                metadata: { from: msg.from, channel: msg.metadata?.channel ?? this.config.irc.channel, isPrivate, timestamp: msg.timestamp }
            };
            const result = await this.cognitive.cognitiveCycle(stimulus);
            Logger.debug(`[Cognitive] Cycle ${this.cognitive.state.cycle}: ${this.cognitive.state.phase}`);
            if (result.action && result.action.type !== 'none') await this._executeAction(result.action, msg);
        } catch (error) {
            Logger.error('[Cognitive] Message processing error:', error);
        }
    }

    async _executeAction(action, originalMsg) {
        const target = action.target ?? originalMsg.metadata?.channel ?? this.config.irc.channel;
        try {
            if (action.type === 'tool') {
                const toolResult = await this.mcpClient.callTool(action.content, action.metadata);
                if (toolResult) await this._sendMessage(target, this._formatToolResult(toolResult));
            } else if (action.type === 'respond') {
                await this._sendMessage(target, action.content);
            } else if (action.type === 'remember') {
                await this._sendMessage(target, "I'll remember that.");
            }
        } catch (error) {
            Logger.error('[Action] Execution error:', error);
        }
    }

    _formatToolResult(result) {
        if (typeof result === 'string') return result;
        if (result.error) return `Error: ${result.error}`;
        if (result.content) return result.content;
        if (result.results) return JSON.stringify(result.results).substring(0, 200);
        return JSON.stringify(result).substring(0, 200);
    }

    async _sendMessage(target, content) {
        try {
            const maxLen = 350;
            if (content.length <= maxLen) {
                await this.agent.channelManager.sendMessage('irc', target, content);
            } else {
                const chunks = [];
                let remaining = content;
                while (remaining.length > maxLen) {
                    let splitAt = remaining.lastIndexOf(' ', maxLen);
                    if (splitAt < 1) splitAt = maxLen;
                    chunks.push(remaining.substring(0, splitAt));
                    remaining = remaining.substring(splitAt + 1);
                }
                if (remaining) chunks.push(remaining);
                for (let i = 0; i < chunks.length; i++) {
                    await this.agent.channelManager.sendMessage('irc', target, chunks[i]);
                    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 800));
                }
            }
            Logger.info(`[Sent] To ${target}: ${content.substring(0, 50)}...`);
        } catch (error) {
            Logger.error('[Send] Error:', error);
        }
    }

    _initializeGoals() {
        if (!this.reasoner) return;
        this.reasoner.addGoal({ description: 'Help users with their questions', topics: ['question', 'help', 'explain'], intent: 'question', action: 'respond' });
        this.reasoner.addGoal({ description: 'Learn facts about active users', topics: [], action: 'remember' });
        this.reasoner.addGoal({ description: 'Maintain engaging conversations', topics: [], action: 'engage' });
        Logger.info('✅ Cognitive goals initialized');
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        Logger.info('🚀 Starting Cognitive IRC Bot...');

        const ircChannel = this.agent.channelManager?.get('irc');
        if (ircChannel) await ircChannel.connect();
        await this.mcpClient.connect();

        this.statusInterval = setInterval(() => this._reportStatus(), 300000);
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        Logger.info('👂 Bot is running. Press Ctrl+C to stop.');
    }

    _reportStatus() {
        const state = this.cognitive.getState();
        const mcpState = this.mcpClient.getState();
        Logger.info(`📊 Cognitive Status: Cycle=${state.cycle}, Phase=${state.phase}, WorkingMemory=${state.workingMemory.length}, Users=${state.userCount}, MCPTools=${mcpState.toolCount}`);
        if (this.reasoner) {
            const rs = this.reasoner.getState();
            Logger.info(`   Beliefs: ${rs.beliefCount}, Goals: ${rs.goalCount}`);
        }
    }

    async shutdown() {
        if (!this.isRunning) return;
        Logger.info('👋 Shutting down Cognitive Bot...');
        this.isRunning = false;
        if (this.statusInterval) clearInterval(this.statusInterval);
        await this.mcpClient.disconnect();
        await this.agent.channelManager.shutdown();
        await this.agent.shutdown();
        Logger.info('✅ Shutdown complete');
        process.exit(0);
    }
}

async function main() {
    try {
        const bot = new CognitiveIRCBot(CONFIG);
        await bot.initialize();
        await bot.start();
    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

if (process.argv[1]?.endsWith('run-cognitive-bot.js')) main();
export { CognitiveIRCBot, CONFIG };
