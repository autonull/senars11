#!/usr/bin/env node

/**
 * Intelligent IRC ChatBot Runner
 * 
 * Full-featured chatbot with:
 * - Ollama LLM integration (Qwen3-8B or configurable)
 * - MeTTa cognitive architecture
 * - SeNARS memory and reasoning
 * - Per-channel rate limiting
 * - Multi-channel support (IRC, Matrix, CLI)
 * - Intelligent message processing
 * 
 * Usage:
 *   node run-intelligent-chatbot.js [options]
 * 
 * Options:
 *   --host, -h     IRC server host (default: irc.quakenet.org)
 *   --port, -p     IRC server port (default: 6667)
 *   --nick, -n     Bot nickname (default: senars-bot)
 *   --channel, -c  Channel to join (default: ##metta)
 *   --model, -m    Ollama model (default: hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K)
 *   --tls          Enable TLS
 *   --debug        Enable debug logging
 */

import { Agent } from '../../src/Agent.js';
import { Logger } from '@senars/core';
import { IRCChannel } from '../../src/io/channels/IRCChannel.js';
import { IntelligentMessageProcessor } from '../../src/ai/IntelligentMessageProcessor.js';
import { isEnabled } from '../../src/config/capabilities.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        host: 'irc.quakenet.org',
        port: 6667,
        nick: 'SeNARchy',
        channel: '##metta',
        model: 'onnx-community/Qwen2.5-1.5B-Instruct',
        tls: false,
        debug: false,
        ollamaUrl: 'http://localhost:11434',
        openaiBaseURL: null,
        openaiApiKey: null,
        personality: 'helpful, knowledgeable, and concise. You are an intelligent assistant focused on reasoning and learning.',
        rateLimit: {
            perChannelMax: 5,
            perChannelInterval: 10000,
            globalMax: 20,
            globalInterval: 10000
        }
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        switch (arg) {
            case '--host':
            case '-h':
                config.host = next;
                i++;
                break;
            case '--port':
            case '-p':
                config.port = parseInt(next, 10);
                i++;
                break;
            case '--nick':
            case '-n':
                config.nick = next;
                i++;
                break;
            case '--channel':
            case '-c':
                config.channel = next;
                i++;
                break;
            case '--model':
            case '-m':
                config.model = next;
                i++;
                break;
            case '--ollama-url':
                config.ollamaUrl = next;
                i++;
                break;
            case '--openai-base-url':
                config.openaiBaseURL = next;
                i++;
                break;
            case '--openai-api-key':
                config.openaiApiKey = next;
                i++;
                break;
            case '--tls':
                config.tls = true;
                break;
            case '--debug':
                config.debug = true;
                break;
            case '--personality':
                config.personality = next;
                i++;
                break;
            case '--help':
                printHelp();
                process.exit(0);
        }
    }

    return config;
}

function printHelp() {
    console.log(`
Intelligent IRC ChatBot - SeNARS Agent

Usage: node run-intelligent-chatbot.js [options]

Options:
  --host, -h          IRC server host (default: irc.quakenet.org)
  --port, -p          IRC server port (default: 6667)
  --nick, -n          Bot nickname (default: SeNARchy)
  --channel, -c       Channel to join (default: ##metta)
  --model, -m         Model name
  --ollama-url        Ollama API URL (default: http://localhost:11434)
  --openai-base-url   OpenAI-compatible endpoint URL (e.g. http://localhost:8080/v1)
  --openai-api-key    API key for OpenAI-compatible endpoint
  --tls               Enable TLS connection
  --debug             Enable debug logging
  --personality       Bot personality description
  --help              Show this help message

Provider selection:
  - Default: Transformers.js runs models locally on CPU (auto-downloads & caches)
  - With --openai-base-url: Uses OpenAI-compatible endpoint (llama.cpp server, etc.)

Examples:
  # Local CPU inference with Transformers.js
  node run-intelligent-chatbot.js

  # Use llama.cpp server (OpenAI-compatible API)
  node run-intelligent-chatbot.js --openai-base-url http://localhost:8080/v1 --model my-model

  # Connect to different IRC server
  node run-intelligent-chatbot.js --host irc.libera.chat --channel #test
`);
}

// Main chatbot class
class IntelligentChatBot {
    constructor(config) {
        this.config = config;
        this.agent = null;
        this.messageProcessor = null;
        this.isRunning = false;
        this.startTime = Date.now();
    }

    async initialize() {
        Logger.info('🤖 Initializing Intelligent ChatBot...');
        Logger.info(`   Host: ${this.config.host}:${this.config.port}`);
        Logger.info(`   Nick: ${this.config.nick}`);
        Logger.info(`   Channel: ${this.config.channel}`);
        const provider = this.config.openaiBaseURL ? 'openai' : 'transformers';
        Logger.info(`   Provider: ${provider}`);
        Logger.info(`   Model: ${this.config.model}`);
        if (this.config.openaiBaseURL) {
            Logger.info(`   Endpoint: ${this.config.openaiBaseURL}`);
        }

        // Set log level
        if (this.config.debug) {
            Logger.setLevel('DEBUG');
        }

        // Initialize Agent with LLM configuration
        // Default: Transformers.js runs Qwen2.5-0.5B-Instruct locally on CPU (auto-downloads & caches)
        // Switch to OpenAI-compatible endpoint: set provider='openai', baseURL='http://localhost:8080/v1'
        const hasOpenAIEndpoint = this.config.openaiBaseURL;
        this.agent = new Agent({
            id: `chatbot-${this.config.nick}`,
            lm: {
                provider: hasOpenAIEndpoint ? 'openai' : 'transformers',
                baseURL: this.config.ollamaUrl,
                modelName: hasOpenAIEndpoint ? this.config.model : undefined,
                openai: hasOpenAIEndpoint ? {
                    baseURL: this.config.openaiBaseURL,
                    apiKey: this.config.openaiApiKey || 'sk-dummy'
                } : undefined,
                temperature: 0.7,
                maxTokens: 256
            },
            inputProcessing: {
                enableNarseseFallback: true,
                checkNarseseSyntax: true,
                lmTemperature: 0.7
            },
            rateLimit: {
                // IRC-safe rate limiting (prevents "Excess Flood" kicks)
                perChannelMax: 3,        // Only 3 messages per channel
                perChannelInterval: 8000, // Over 8 seconds (very conservative)
                globalMax: 10,           // 10 messages total
                globalInterval: 10000    // Over 10 seconds
            },
            workspace: join(__dirname, '../../workspace')
        });

        // Initialize the agent
        await this.agent.initialize();
        Logger.info('✅ Agent initialized');

        // Manually create and register IRC channel
        const ircChannel = new IRCChannel({
            id: 'irc',
            host: this.config.host,
            port: this.config.port,
            nick: this.config.nick,
            username: this.config.nick.toLowerCase(),
            realname: 'SeNARS Intelligent Bot',
            tls: this.config.tls,
            channels: [this.config.channel],
            rateLimit: { interval: 4000 }
        });
        
        this.agent.channelManager.register(ircChannel);
        Logger.info('✅ IRC Channel registered');

        // Initialize Intelligent Message Processor with Ollama
        this.messageProcessor = new IntelligentMessageProcessor(this.agent, {
            botNick: this.config.nick,
            personality: this.config.personality,
            respondToMentions: true,
            respondToQuestions: true,
            respondToCommands: true,
            respondToGreeting: true,
            learnFromConversation: true,
            verbose: this.config.debug,
            agentConfig: this.agent.agentCfg
        });
        Logger.info('✅ Message Processor initialized');

        // Wire SemanticMemory to agent if enabled by capabilities
        if (isEnabled(this.agent.agentCfg, 'semanticMemory') && !this.agent._semanticMemory) {
            const { SemanticMemory } = await import('../../src/memory/SemanticMemory.js');
            this.agent._semanticMemory = new SemanticMemory({
                dataDir: join(this.agent.agentCfg.workspace?.memoryDir ?? 'agent/memory', 'semantic'),
                embedderConfig: this.agent.agentCfg.embedder ?? {}
            });
            await this.agent._semanticMemory.initialize();
            Logger.info('✅ SemanticMemory wired to agent');
        }

        // Set up enhanced channel event handling
        this._setupChannelHandlers();

        // Register MeTTa primitives for chatbot-specific operations
        this._registerChatbotMeTTaPrimitives();

        Logger.info('✅ ChatBot initialization complete');
    }

    _setupChannelHandlers() {
        const ircChannel = this.agent.channelManager?.get('irc');

        if (!ircChannel) {
            Logger.warn('IRC channel not available');
            return;
        }

        // Handle ALL messages (channel and PM) through single handler
        // The isPrivate flag in metadata tells us which it is
        ircChannel.on('message', async (msg) => {
            // Ignore server/system messages immediately
            if (!msg.from || msg.from === 'Server' || msg.from === 'AUTH' || msg.from === '*' || msg.from === '' || msg.from === 'unknown') {
                return;
            }

            // Ignore notices (server operational messages like hostname lookups)
            if (msg.metadata?.type === 'notice') return;

            const isPrivate = msg.metadata?.isPrivate || false;
            const channel = msg.metadata?.channel || this.config.channel;

            if (isPrivate) {
                Logger.info(`[IRC PM] From ${msg.from}: ${msg.content}`);
            } else {
                Logger.debug(`[IRC Channel ${channel}] ${msg.from}: ${msg.content}`);
            }

            await this._handleMessage(msg, isPrivate);
        });

        // Handle user joins
        ircChannel.on('user_joined', ({ nick, channel }) => {
            Logger.debug(`[IRC] ${nick} joined ${channel}`);
            // Greet new users (with rate limiting consideration)
            if (channel === this.config.channel && nick !== this.config.nick) {
                setTimeout(async () => {
                    await this._sendWithRateLimit(channel,
                        `Welcome ${nick}! 👋 I'm ${this.config.nick}. Ask me anything or type !help.`
                    );
                }, 1000);
            }
        });

        // Handle CTCP queries
        ircChannel.on('ctcp', ({ from, command, data }) => {
            Logger.debug(`[IRC CTCP] ${from} queried ${command}: ${data}`);
        });

        // Handle connection events
        ircChannel.on('connected', (event) => {
            Logger.info(`🔌 Connected to IRC as ${event.nick}`);

            // Send join message after a delay
            setTimeout(async () => {
                Logger.info('📢 Sending join announcement...');
                try {
                    await this._sendWithRateLimit(this.config.channel,
                        `🤖 ${this.config.nick} online! AI assistant here. Ask anything or type !help.`
                    );
                    Logger.info('✅ Join announcement sent');
                } catch (e) {
                    Logger.error('Failed to send join message:', e);
                }
            }, 2000);
        });

        ircChannel.on('disconnected', () => {
            Logger.warn('❌ Disconnected from IRC');
        });

        ircChannel.on('error', (err) => {
            Logger.error('IRC Error:', err);
        });
    }

    _registerChatbotMeTTaPrimitives() {
        if (!this.agent.metta) return;

        // Register additional primitives for chatbot operations
        const ground = this.agent.metta.ground;

        // Get conversation history
        ground.register('get-history', (channelAtom, userAtom) => {
            const channel = channelAtom.toString().replace(/"/g, '');
            const user = userAtom?.toString().replace(/"/g, '') || null;

            const contextKey = user ? `${channel}:${user}` : channel;
            const context = this.messageProcessor.contexts.get(contextKey);

            if (context) {
                const history = context.messages.map(m =>
                    `${m.from}: ${m.content}`
                ).join('\n');
                return this.agent.metta.grounded(history);
            }
            return this.agent.metta.sym('Empty');
        });

        // Clear conversation context
        ground.register('clear-context', (channelAtom, userAtom) => {
            const channel = channelAtom.toString().replace(/"/g, '');
            const user = userAtom?.toString().replace(/"/g, '') || null;

            if (user) {
                this.messageProcessor.clearContext(`${channel}:${user}`);
            } else {
                // Clear all contexts for channel
                for (const key of this.messageProcessor.contexts.keys()) {
                    if (key.startsWith(channel)) {
                        this.messageProcessor.clearContext(key);
                    }
                }
            }
            return this.agent.metta.sym('True');
        });

        // Get bot stats
        ground.register('get-stats', () => {
            const stats = this.messageProcessor.getStats();
            const rateStats = this.agent.channelManager?.getRateLimitStats?.() || {};
            return this.agent.metta.grounded(JSON.stringify({
                processor: stats,
                rateLimiter: rateStats
            }));
        });
    }

    async _handleMessage(msg, isPrivate = false) {
        try {
            // Ignore messages from the bot itself to prevent feedback loops
            if (msg.from === this.config.nick) return;

            // Ignore server/system messages
            if (!msg.from || msg.from === 'Server' || msg.from === 'AUTH' || msg.from === '*' || msg.from === 'unknown') {
                return;
            }

            const channel = msg.metadata?.channel || this.config.channel;
            const content = msg.content ?? '';
            Logger.info(`[Message] ${isPrivate ? 'PM' : 'Channel'} from ${msg.from} in ${channel}: ${content.substring(0, 60)}...`);

            // Process message through intelligent processor
            const result = await this.messageProcessor.processMessage(msg);

            if (!result.shouldRespond || !result.response) return;

            // Don't respond if IRC isn't connected yet
            const ircChannel = this.agent.channelManager?.get('irc');
            if (ircChannel?.status !== 'connected') {
                Logger.debug(`[Response] Skipped - IRC not connected (status: ${ircChannel?.status ?? 'unknown'})`);
                return;
            }

            // Response target: PM goes to user, channel message stays in channel
            const target = isPrivate ? msg.from : channel;

            Logger.info(`[Response] Sending to ${target} (${isPrivate ? 'PM' : 'Channel'})`);

            const maxLineLength = 350;
            const responseLines = this._splitIntoLines(result.response, maxLineLength);
            const batches = this._batchLines(responseLines, maxLineLength);

            for (const batch of batches) {
                await this._sendWithRateLimit(target, batch);
            }

            Logger.info(`[Sent] ${responseLines.length} line(s) → ${batches.length} msg(s) to ${target}`);
        } catch (error) {
            Logger.error('Error handling message:', error);
        }
    }

    /**
     * Split text into IRC-safe lines at sentence/space/newline boundaries
     */
    _splitIntoLines(text, maxLength) {
        const clean = text.replace(/\r\n/g, '\n').trim();
        // Pre-split on newlines first (IRC newlines in a single say() = flood)
        const rawLines = clean.split('\n').map(l => l.trim()).filter(l => l);

        const lines = [];
        for (const rawLine of rawLines) {
            if (rawLine.length <= maxLength) {
                lines.push(rawLine);
            } else {
                // Long line — split at sentence or space boundary
                let remaining = rawLine;
                while (remaining.length > maxLength) {
                    let splitAt = remaining.lastIndexOf('.', maxLength);
                    if (splitAt < maxLength / 2) splitAt = remaining.lastIndexOf(' ', maxLength);
                    if (splitAt < 1) splitAt = maxLength;
                    else splitAt++;
                    lines.push(remaining.substring(0, splitAt).trim());
                    remaining = remaining.substring(splitAt).trim();
                }
                if (remaining) lines.push(remaining);
            }
        }
        return lines.length ? lines : [clean.substring(0, maxLength)];
    }

    /**
     * Batch short consecutive lines into single messages to reduce IRC line count
     * Never merges section headers, MeTTa atoms, or structural output
     */
    _batchLines(lines, maxLength) {
        const BATCH_CHAR_LIMIT = Math.floor(maxLength * 0.8);
        const SECTION_HEADER_RE = /^(===|[A-Z_]+[\s:(]|LLM:|\([a-z]+)/;
        const batches = [];
        let current = '';

        for (const line of lines) {
            const isStructural = SECTION_HEADER_RE.test(line) || line.length > BATCH_CHAR_LIMIT;
            if (isStructural) {
                if (current) batches.push(current);
                batches.push(line);
                current = '';
            } else {
                const candidate = current ? `${current} ${line}` : line;
                if (candidate.length > maxLength) {
                    if (current) batches.push(current);
                    current = line;
                } else {
                    current = candidate;
                }
            }
        }
        if (current) batches.push(current);
        return batches.length ? batches : lines;
    }

    /**
     * Strip bot nick prefix from message content: "SeNARchy: hi" → "hi"
     */
    _stripNickPrefix(content) {
        return content.replace(new RegExp(`^\\s*${this.config.nick}[,:\\s]+\\s*`, 'i'), '').trim();
    }

    async _sendWithRateLimit(target, content, metadata = {}) {
        try {
            await this.agent.channelManager.sendMessage('irc', target, content, metadata);
        } catch (error) {
            Logger.error('Failed to send message:', error);
        }
    }

    async start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.startTime = Date.now();
        
        Logger.info('🚀 Starting ChatBot...');
        
        // Connect IRC channel
        const ircChannel = this.agent.channelManager?.get('irc');
        if (ircChannel) {
            try {
                await ircChannel.connect();
                Logger.info('✅ IRC connected');
            } catch (error) {
                Logger.error('Failed to connect IRC:', error);
            }
        }

        // Set up graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());

        // Keep alive
        Logger.info('👂 Bot is running. Press Ctrl+C to stop.');
        
        // Periodic status report
        this.statusInterval = setInterval(() => {
            this._reportStatus();
        }, 300000); // Every 5 minutes
    }

    _reportStatus() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(uptime / 60);
        const hours = Math.floor(mins / 60);
        
        const stats = this.messageProcessor?.getStats() || {};
        const rateStats = this.agent.channelManager?.getRateLimitStats?.() || {};
        
        Logger.info(`📊 Status Report:
   Uptime: ${hours}h ${mins % 60}m
   Messages processed: ${stats.messagesProcessed || 0}
   Responses generated: ${stats.responsesGenerated || 0}
   Questions answered: ${stats.questionsAnswered || 0}
   Commands executed: ${stats.commandsExecuted || 0}
   Rate limit tokens: ${rateStats.globalTokens ?? 'N/A'}
   Active contexts: ${stats.activeContexts ?? 0}`);
    }

    async shutdown() {
        if (!this.isRunning) return;
        
        Logger.info('👋 Shutting down ChatBot...');
        
        this.isRunning = false;
        
        // Clear status interval
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }

        // Send goodbye message
        try {
            await this._sendWithRateLimit(this.config.channel, 
                `Bot shutting down. Goodbye!`
            );
        } catch (e) {
            // Ignore send errors during shutdown
        }

        // Disconnect channels
        await this.agent.channelManager?.shutdown();
        
        // Shutdown agent
        await this.agent.shutdown();
        
        Logger.info('✅ ChatBot shutdown complete');
        process.exit(0);
    }
}

// Main entry point
async function main() {
    const config = parseArgs();
    
    try {
        const bot = new IntelligentChatBot(config);
        await bot.initialize();
        await bot.start();
    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (process.argv[1]?.endsWith('run-intelligent-chatbot.js')) {
    main();
}

export { IntelligentChatBot };
