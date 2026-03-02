#!/usr/bin/env node

/**
 * Cognitive IRC Bot - Full Cognitive Architecture
 * 
 * Integrates:
 * - Cognitive Architecture (memory, attention, reasoning)
 * - MeTTa Reasoning Engine
 * - LLM for language
 * - MCP for tools
 * - IRC for communication
 */

import { Agent } from '../../src/Agent.js';
import { Logger } from '@senars/core';
import { IRCChannel } from '../../src/io/channels/IRCChannel.js';
import { CognitiveArchitecture } from '../../src/cognitive/CognitiveArchitecture.js';
import { MeTTaReasoner } from '../../src/cognitive/MeTTaReasoner.js';
import { CognitiveLLM } from '../../src/cognitive/CognitiveLLM.js';
import { MCPClient } from '../../src/cognitive/MCPClient.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
    irc: {
        host: 'irc.quakenet.org',
        port: 6667,
        nick: 'SeNARchy',
        channel: '##metta',
        tls: false
    },
    ollama: {
        baseURL: 'http://localhost:11434',
        model: 'hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K'
    },
    cognitive: {
        agentName: 'SeNARchy',
        personality: 'helpful, curious, and concise. You engage genuinely with users and remember context.',
        workingMemoryCapacity: 7,
        attentionThreshold: 0.3
    },
    rateLimit: {
        perChannelMax: 3,
        perChannelInterval: 8000,
        globalMax: 10,
        globalInterval: 10000
    }
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
        
        // 1. Initialize base Agent
        this.agent = new Agent({
            id: `cognitive-${this.config.cognitive.agentName}`,
            lm: { provider: 'dummy' }, // We use our own LLM
            inputProcessing: { enableNarseseFallback: false },
            rateLimit: this.config.rateLimit
        });
        
        await this.agent.initialize();
        Logger.info('✅ Base Agent initialized');

        // 2. Create and register IRC channel
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

        // 3. Initialize Cognitive Architecture
        this.cognitive = new CognitiveArchitecture(this.config.cognitive);
        Logger.info('✅ Cognitive Architecture initialized');

        // 4. Initialize LLM
        this.llm = new CognitiveLLM({
            baseURL: this.config.ollama.baseURL,
            model: this.config.ollama.model,
            agentName: this.config.cognitive.agentName,
            personality: this.config.cognitive.personality
        });
        this.cognitive.setLLM(this.llm);
        Logger.info('✅ LLM initialized');

        // 5. Initialize MeTTa Reasoner (if metta available)
        if (this.agent.metta) {
            this.reasoner = new MeTTaReasoner(this.agent.metta, {
                inferenceDepth: 3,
                maxInferenceTime: 300
            });
            this.cognitive.setReasoner(this.reasoner);
            Logger.info('✅ MeTTa Reasoner initialized');
        } else {
            Logger.warn('⚠️  MeTTa not available, reasoning will be limited');
        }

        // 6. Initialize MCP Client
        this.mcpClient = new MCPClient({
            servers: [{ name: 'builtin' }],
            autoConnect: true
        });
        
        // Handle memory events from MCP
        this.mcpClient.on('remember', async ({ fact, category }) => {
            if (this.reasoner) {
                await this.reasoner._storeBelief({
                    content: fact,
                    metadata: { category },
                    timestamp: Date.now()
                });
            }
        });
        
        this.cognitive.setMCPClient(this.mcpClient);
        Logger.info('✅ MCP Client initialized');

        // 7. Set up IRC message handlers
        this._setupHandlers();

        // 8. Add cognitive goals
        this._initializeGoals();

        Logger.info('✅ Cognitive IRC Bot initialization complete');
    }

    _setupHandlers() {
        const ircChannel = this.agent.channelManager?.get('irc');
        
        if (!ircChannel) {
            Logger.warn('IRC channel not available');
            return;
        }

        // Handle all IRC messages
        ircChannel.on('message', async (msg) => {
            Logger.info(`[IRC RAW] from=${msg.from || 'NONE'} content=${msg.content?.substring(0, 40)} channel=${msg.metadata?.channel}`);
            
            // Ignore server messages and self
            if (!msg.from || msg.from === this.config.irc.nick || 
                msg.from === 'Server' || msg.from === 'AUTH' || msg.from === '*' || msg.from === '') {
                Logger.debug(`[IRC] Ignoring server/bot message from=${msg.from}`);
                return;
            }

            const isPrivate = msg.metadata?.isPrivate || false;
            const channel = msg.metadata?.channel || this.config.irc.channel;
            
            Logger.info(`[IRC] ${isPrivate ? 'PM' : channel} from ${msg.from}: ${msg.content.substring(0, 60)}...`);

            // Process through cognitive architecture
            await this._processMessage(msg, isPrivate);
        });

        // Connection events
        ircChannel.on('connected', async (event) => {
            Logger.info(`🔌 Connected to IRC as ${event.nick}`);
            
            // Send introduction after delay
            setTimeout(async () => {
                await this._sendMessage(this.config.irc.channel,
                    `🤖 ${this.config.cognitive.agentName} online! I have memory and reasoning. Ask me anything!`
                );
            }, 2000);
        });

        ircChannel.on('disconnected', () => {
            Logger.warn('❌ Disconnected from IRC');
        });

        ircChannel.on('error', (err) => {
            Logger.error('IRC Error:', err);
        });

        // User joins
        ircChannel.on('user_joined', ({ nick, channel }) => {
            if (channel === this.config.irc.channel && nick !== this.config.irc.nick) {
                Logger.info(`[IRC] ${nick} joined ${channel}`);
                // Optional: greet new users
            }
        });
    }

    async _processMessage(msg, isPrivate) {
        try {
            // Create cognitive stimulus
            const stimulus = {
                type: 'message',
                source: 'irc',
                content: msg.content,
                metadata: {
                    from: msg.from,
                    channel: msg.metadata?.channel || this.config.irc.channel,
                    isPrivate,
                    timestamp: msg.timestamp
                }
            };

            // Run cognitive cycle
            const result = await this.cognitive.cognitiveCycle(stimulus);
            
            Logger.debug(`[Cognitive] Cycle ${this.cognitive.state.cycle}: ${this.cognitive.state.phase}`);

            // Execute action if any
            if (result.action && result.action.type !== 'none') {
                await this._executeAction(result.action, msg);
            }

        } catch (error) {
            Logger.error('[Cognitive] Message processing error:', error);
        }
    }

    async _executeAction(action, originalMsg) {
        const target = action.target || originalMsg.metadata?.channel || this.config.irc.channel;
        
        try {
            if (action.type === 'tool') {
                // Execute MCP tool
                const toolResult = await this.mcpClient.callTool(action.content, action.metadata);
                
                if (toolResult) {
                    // Respond with tool result
                    const response = this._formatToolResult(toolResult);
                    await this._sendMessage(target, response);
                }
            } else if (action.type === 'respond') {
                // Send response
                await this._sendMessage(target, action.content);
            } else if (action.type === 'remember') {
                // Acknowledge memory storage
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
            // Split long messages
            const maxLen = 350;
            if (content.length <= maxLen) {
                await this.agent.channelManager.sendMessage('irc', target, content);
            } else {
                // Split into chunks
                const chunks = [];
                let remaining = content;
                while (remaining.length > maxLen) {
                    let splitAt = remaining.lastIndexOf(' ', maxLen);
                    if (splitAt < 1) splitAt = maxLen;
                    chunks.push(remaining.substring(0, splitAt));
                    remaining = remaining.substring(splitAt + 1);
                }
                if (remaining) chunks.push(remaining);
                
                // Send with delays
                for (let i = 0; i < chunks.length; i++) {
                    await this.agent.channelManager.sendMessage('irc', target, chunks[i]);
                    if (i < chunks.length - 1) {
                        await new Promise(r => setTimeout(r, 800));
                    }
                }
            }
            Logger.info(`[Sent] To ${target}: ${content.substring(0, 50)}...`);
        } catch (error) {
            Logger.error('[Send] Error:', error);
        }
    }

    _initializeGoals() {
        if (!this.reasoner) return;
        
        // Add cognitive goals
        this.reasoner.addGoal({
            description: 'Help users with their questions',
            topics: ['question', 'help', 'explain'],
            intent: 'question',
            action: 'respond'
        });
        
        this.reasoner.addGoal({
            description: 'Learn facts about active users',
            topics: [],
            action: 'remember'
        });
        
        this.reasoner.addGoal({
            description: 'Maintain engaging conversations',
            topics: [],
            action: 'engage'
        });
        
        Logger.info('✅ Cognitive goals initialized');
    }

    async start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        Logger.info('🚀 Starting Cognitive IRC Bot...');
        
        // Connect IRC
        const ircChannel = this.agent.channelManager?.get('irc');
        if (ircChannel) {
            await ircChannel.connect();
        }
        
        // Connect MCP
        await this.mcpClient.connect();
        
        // Status reporting
        this.statusInterval = setInterval(() => {
            this._reportStatus();
        }, 300000); // Every 5 minutes
        
        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        
        Logger.info('👂 Bot is running. Press Ctrl+C to stop.');
    }

    _reportStatus() {
        const state = this.cognitive.getState();
        const mcpState = this.mcpClient.getState();
        
        Logger.info(`📊 Cognitive Status:
   Cycle: ${state.cycle}
   Phase: ${state.phase}
   Working Memory: ${state.workingMemory.length} items
   Users Tracked: ${state.userCount}
   MCP Tools: ${mcpState.toolCount}`);
        
        if (this.reasoner) {
            const reasonerState = this.reasoner.getState();
            Logger.info(`   Beliefs: ${reasonerState.beliefCount}
   Goals: ${reasonerState.goalCount}`);
        }
    }

    async shutdown() {
        if (!this.isRunning) return;
        
        Logger.info('👋 Shutting down Cognitive Bot...');
        
        this.isRunning = false;
        
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        await this.mcpClient.disconnect();
        await this.agent.channelManager.shutdown();
        await this.agent.shutdown();
        
        Logger.info('✅ Shutdown complete');
        process.exit(0);
    }
}

// Main entry point
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

// Run if executed directly
if (process.argv[1]?.endsWith('run-cognitive-bot.js')) {
    main();
}

export { CognitiveIRCBot, CONFIG };
