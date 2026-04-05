#!/usr/bin/env node

/**
 * SeNARS ChatBot — Unified Entry Point
 *
 * Modes:
 *   irc       — Full IRC bot with cognitive architecture (default)
 *   cognitive — LIDA cognitive cycle bot with IRC
 *   cli       — CLI-only mode (stdin/stdout, no IRC)
 *   demo      — Script-based demo with mock channel
 *
 * Config:
 *   --config <path>   Config file (default: bot.config.json in this dir)
 *   --profile <name>  Profile: minimal | parity | evolved | full
 *   --mode <mode>     Running mode
 *   --nick <nick>     Bot nickname
 *   --channel <chan>  IRC channel
 *   --host <host>     IRC server
 *   --model <model>   LLM model name
 *   --openai-base-url OpenAI-compatible endpoint
 *   --openai-api-key  API key for OpenAI endpoint
 *   --tls             Enable TLS
 *   --debug           Debug logging
 *   --help            Show help
 *
 * Examples:
 *   node run.js
 *   node run.js --mode cli
 *   node run.js --config ~/my-bot.json --debug
 *   node run.js --profile evolved --nick MyBot --channel #mychan
 */

import { Agent } from '@senars/agent';
import { Logger } from '@senars/core';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG_PATH = join(__dirname, 'bot.config.json');
const DEFAULTS = {
    mode: 'irc',
    nick: 'SeNARchy',
    personality: 'helpful, curious, and concise. You engage genuinely and remember context.',
    host: 'irc.quakenet.org',
    port: 6667,
    channel: '##metta',
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    // model: 'onnx-community/gemma-3n-E2B-it-ONNX',
    // model: 'onnx-community/Llama-3.2-3B-Instruct-ONNX',
    // model: 'onnx-community/Qwen2.5-1.5B-Instruct',
    tls: false,
    debug: false,
    profile: 'parity',
    maxContextLength: 30,
    contextWindowMs: 3_600_000,
    rateLimit: { perChannelMax: 3, perChannelInterval: 8000, globalMax: 10, globalInterval: 10000 },
    loop: { budget: 50, sleepMs: 2000 },
};

// ── Config Loading ────────────────────────────────────────────────────────

function loadFileConfig(path) {
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        Logger.warn(`Failed to load config from ${path}: ${e.message}`);
        return null;
    }
}

function mergeConfig(fileConfig, cli) {
    const base = { ...DEFAULTS, ...fileConfig };
    const irc = { ...(fileConfig?.irc ?? {}), ...(fileConfig?.channels?.irc ?? {}) };
    const lm = { ...(fileConfig?.lm ?? {}) };

    return {
        mode: cli.mode ?? base.mode,
        profile: cli.profile ?? base.profile ?? DEFAULTS.profile,
        nick: cli.nick ?? base.bot?.nick ?? base.nick,
        personality: cli.personality ?? base.bot?.personality ?? base.personality,
        host: cli.host ?? irc.host ?? base.host,
        port: cli.port ?? irc.port ?? base.port,
        channel: cli.channel ?? irc.channel ?? base.channel,
        tls: cli.tls ?? irc.tls ?? base.tls,
        model: cli.model ?? base.lm?.modelName ?? lm.modelName ?? base.model,
        openaiBaseURL: cli.openaiBaseURL ?? base.lm?.openai?.baseURL ?? lm.openai?.baseURL,
        openaiApiKey: cli.openaiApiKey ?? base.lm?.openai?.apiKey ?? lm.openai?.apiKey,
        debug: cli.debug ?? base.debug ?? false,
        maxContextLength: base.bot?.maxContextLength ?? base.maxContextLength,
        contextWindowMs: base.bot?.contextWindowMs ?? base.contextWindowMs,
        rateLimit: { ...DEFAULTS.rateLimit, ...(base.rateLimit ?? {}) },
        loop: { ...DEFAULTS.loop, ...(base.loop ?? {}) },
        capabilities: { ...(base.capabilities ?? {}) },
    };
}

// ── CLI Parsing ───────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const cli = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--config': cli.configPath = resolve(next); i++; break;
            case '--mode': cli.mode = next; i++; break;
            case '--profile': cli.profile = next; i++; break;
            case '--nick':
            case '-n': cli.nick = next; i++; break;
            case '--channel':
            case '-c': cli.channel = next; i++; break;
            case '--host':
            case '-h': cli.host = next; i++; break;
            case '--port':
            case '-p': cli.port = parseInt(next, 10); i++; break;
            case '--model':
            case '-m': cli.model = next; i++; break;
            case '--openai-base-url': cli.openaiBaseURL = next; i++; break;
            case '--openai-api-key': cli.openaiApiKey = next; i++; break;
            case '--tls': cli.tls = true; break;
            case '--debug': cli.debug = true; break;
            case '--personality': cli.personality = next; i++; break;
            case '--help': printHelp(); process.exit(0);
        }
    }

    return cli;
}

function printHelp() {
    console.log(`
SeNARS ChatBot — Unified Entry Point

Usage: node run.js [options]

Modes:
  irc         Full IRC bot with cognitive architecture (default)
  cognitive   LIDA cognitive cycle bot with IRC
  cli         CLI-only mode (stdin/stdout, no IRC)
  demo        Script-based demo with mock channel

Options:
  --config <path>       Config file (default: bot.config.json)
  --mode <mode>         Running mode (irc|cognitive|cli|demo)
  --profile <name>      Profile: minimal|parity|evolved|full
  --nick, -n <nick>     Bot nickname (default: SeNARchy)
  --channel, -c <chan>  IRC channel (default: ##metta)
  --host, -h <host>     IRC server (default: irc.quakenet.org)
  --port, -p <port>     IRC port (default: 6667)
  --model, -m <model>   LLM model name
  --openai-base-url     OpenAI-compatible endpoint (e.g. http://localhost:8080/v1)
  --openai-api-key      API key for OpenAI endpoint
  --tls                 Enable TLS
  --debug               Debug logging
  --personality <text>  Bot personality description
  --help                Show this help

Provider selection:
  - Default: Transformers.js runs models locally on CPU
  - With --openai-base-url: Uses OpenAI-compatible endpoint

Examples:
  # Local CPU inference, IRC
  node run.js

  # CLI mode (no IRC)
  node run.js --mode cli

  # OpenAI-compatible endpoint
  node run.js --openai-base-url http://localhost:8080/v1 --model my-model

  # Custom config
  node run.js --config ~/my-bot.json --debug
`);
}

// ── Bot Factory ───────────────────────────────────────────────────────────

async function createBot(config) {
    const hasOpenAIEndpoint = !!config.openaiBaseURL;
    const provider = hasOpenAIEndpoint ? 'openai' : 'transformers';

    // Quiet init logs for interactive modes (cli, demo)
    const quietMode = config.mode === 'cli' || config.mode === 'demo';
    const savedLevel = Logger.getLevel();
    if (quietMode) Logger.setLevel('WARN');

    if (!quietMode) {
        Logger.info(`🤖 SeNARS ChatBot [mode=${config.mode}, profile=${config.profile}]`);
        Logger.info(`   Nick: ${config.nick}`);
        Logger.info(`   Provider: ${provider}`);
        Logger.info(`   Model: ${config.model}`);
        if (hasOpenAIEndpoint) Logger.info(`   Endpoint: ${config.openaiBaseURL}`);
    } else {
        Logger.info(`🤖 SeNARS ChatBot [${config.model}]`);
    }

    const agent = new Agent({
        id: `chatbot-${config.nick}`,
        profile: config.profile,
        lm: {
            provider,
            modelName: hasOpenAIEndpoint ? undefined : config.model,
            openai: hasOpenAIEndpoint ? {
                baseURL: config.openaiBaseURL,
                apiKey: config.openaiApiKey || 'sk-dummy',
            } : undefined,
            temperature: 0.7,
            maxTokens: 256,
        },
        inputProcessing: { enableNarseseFallback: true, checkNarseseSyntax: true },
        rateLimit: config.rateLimit,
        loop: config.loop,
        workspace: join(__dirname, '../../workspace'),
    });

    await agent.initialize();
    if (quietMode) Logger.setLevel(savedLevel);
    Logger.info('✅ Agent initialized');

    switch (config.mode) {
        case 'irc':
            return createIRCBot(agent, config);
        case 'cognitive':
            return createCognitiveBot(agent, config);
        case 'cli':
            return createCLIBot(agent, config);
        case 'demo':
            return createDemoBot(agent, config);
        default:
            throw new Error(`Unknown mode: ${config.mode}`);
    }
}

async function createIRCBot(agent, config) {
    const { IntelligentChatBot } = await import('./run-intelligent-chatbot.js');
    const bot = new IntelligentChatBot(config);
    bot.agent = agent;
    bot.config = config;
    await bot.initialize();
    return { start: () => bot.start(), shutdown: () => bot.shutdown() };
}

async function createCognitiveBot(agent, config) {
    const { CognitiveIRCBot } = await import('./run-cognitive-bot.js');
    const bot = new CognitiveIRCBot(config);
    bot.agent = agent;
    bot.config = config;
    await bot.initialize();
    return { start: () => bot.start(), shutdown: () => bot.shutdown() };
}

async function createCLIBot(agent, config) {
    const readline = await import('readline');
    const { IntelligentMessageProcessor } = await import('@senars/agent/ai/index.js');

    const processor = new IntelligentMessageProcessor(agent, {
        botNick: config.nick,
        personality: config.personality,
        respondToMentions: true,
        respondToQuestions: true,
        respondToCommands: true,
        respondToGreeting: true,
        learnFromConversation: true,
        verbose: config.debug,
        agentConfig: agent.agentCfg,
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = prompt => new Promise(resolve => {
        if (rl.closed) return resolve(null);
        rl.question(prompt, resolve);
    });

    Logger.info('✅ CLI Bot ready. Type messages or !help. Ctrl+C to exit.');

    return {
        async start() {
            console.log(`\n${config.nick}: Online! Type your message (Ctrl+C to exit).\n`);
            while (!rl.closed) {
                const input = await question('> ');
                if (input === null || !input.trim()) continue;
                if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') break;
                try {
                    const result = await processor.processMessage({
                        from: 'user',
                        content: input,
                        metadata: { isPrivate: true, channel: 'cli' },
                        channelId: 'cli',
                    });
                    if (result.shouldRespond && result.response) {
                        console.log(`\n${config.nick}: ${result.response}\n`);
                    }
                } catch (e) {
                    Logger.error('Error:', e.message);
                }
            }
            if (!rl.closed) rl.close();
        },
        async shutdown() {
            rl.close();
            await agent.shutdown();
        },
    };
}

async function createDemoBot(agent, config) {
    const { Channel } = await import('@senars/agent/io/index.js');

    class MockChannel extends Channel {
        constructor() { super({ id: 'mock' }); this.type = 'mock'; this.status = 'connected'; }
        async sendMessage(target, content) {
            console.log(`\n  ${config.nick}: ${content}\n`);
            return true;
        }
        async connect() { this.status = 'connected'; this.emit('connected', { nick: config.nick }); }
        async disconnect() { this.status = 'disconnected'; }
        emitMessage(from, content, metadata = {}) {
            this.emit('message', { from, content, metadata: { isPrivate: false, channel: 'demo', ...metadata }, channelId: 'demo' });
        }
    }

    const mock = new MockChannel();
    agent.channelManager.register(mock);

    const { IntelligentMessageProcessor } = await import('@senars/agent/ai/index.js');
    const processor = new IntelligentMessageProcessor(agent, {
        botNick: config.nick,
        personality: config.personality,
        respondToMentions: true,
        respondToQuestions: true,
        respondToCommands: true,
        respondToGreeting: true,
        learnFromConversation: true,
        verbose: config.debug,
        agentConfig: agent.agentCfg,
    });

    mock.on('message', async (msg) => {
        if (msg.from === config.nick) return;
        console.log(`  ${msg.from}: ${msg.content}`);
        const result = await processor.processMessage(msg);
        if (result.shouldRespond && result.response) {
            await agent.channelManager.sendMessage('mock', 'demo', result.response);
        }
    });

    await mock.connect();

    const demoMessages = [
        { from: 'Alice', content: 'Hi there!', delay: 1000 },
        { from: 'Alice', content: 'What can you help me with?', delay: 3000 },
        { from: 'Bob', content: '!help', delay: 5000 },
        { from: 'Bob', content: '!context', delay: 7000 },
        { from: 'Alice', content: 'Tell me something interesting.', delay: 9000 },
    ];

    console.log('\n── Demo Session ──────────────────────────────');

    for (const msg of demoMessages) {
        setTimeout(() => mock.emitMessage(msg.from, msg.content), msg.delay);
    }

    const lastDelay = demoMessages[demoMessages.length - 1].delay + 3000;
    const shutdownFn = () => {
        console.log('── Demo Complete ─────────────────────────────');
        console.log('\nBot shutting down.');
        mock.disconnect();
        agent.shutdown().then(() => process.exit(0)).catch(() => process.exit(0));
    };
    setTimeout(shutdownFn, lastDelay);

    Logger.info('✅ Demo Bot running.');

    return {
        start() {
            process.on('SIGINT', () => this.shutdown());
            process.on('SIGTERM', () => this.shutdown());
        },
        async shutdown() {
            await mock.disconnect();
            await agent.shutdown();
            process.exit(0);
        },
    };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    const cli = parseArgs();
    const configPath = cli.configPath ?? (existsSync(DEFAULT_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : null);
    const fileConfig = configPath ? loadFileConfig(configPath) : null;

    if (fileConfig) {
        Logger.info(`📄 Loaded config: ${configPath}`);
    }

    const config = mergeConfig(fileConfig, cli);

    if (config.debug) Logger.setLevel('DEBUG');

    try {
        const bot = await createBot(config);
        await bot.start();
        if (config.mode === 'cli') process.exit(0);
    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

if (process.argv[1]?.endsWith('run.js')) main();
export { createBot, mergeConfig, parseArgs };
