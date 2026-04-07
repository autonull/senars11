#!/usr/bin/env node

/**
 * SeNARS Bot — Unified Entry Point
 *
 * Single cognitive pipeline (MeTTaLoop) with config-driven embodiments.
 * Modes are just which embodiments get registered — same loop, same pipeline.
 *
 * Usage:
 *   node run.js                    — IRC mode (default)
 *   node run.js --mode cli         — CLI mode (stdin/stdout)
 *   node run.js --mode demo        — Demo mode (scripted messages)
 *   node run.js --mode test        — Test mode (embedded IRC server)
 *
 * Config:
 *   --config <path>   Config file (default: bot.config.json in this dir)
 *   --profile <name>  Profile: minimal | parity | evolved | full
 *   --mode <mode>     Running mode: irc | cli | demo | test
 *   --nick <nick>     Bot nickname
 *   --channel <chan>  IRC channel
 *   --host <host>     IRC server
 *   --model <model>   LLM model name
 *   --openai-base-url OpenAI-compatible endpoint
 *   --openai-api-key  API key for OpenAI endpoint
 *   --tls             Enable TLS
 *   --debug           Debug logging
 *   --help            Show help
 */

import { Agent } from '@senars/agent';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';
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
    host: null,
    hostedPort: 6668,
    port: 6667,
    channel: '##metta',
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
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
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { Logger.warn(`Failed to load config from ${path}: ${e.message}`); return null; }
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
            case '--nick': case '-n': cli.nick = next; i++; break;
            case '--channel': case '-c': cli.channel = next; i++; break;
            case '--host': case '-h': cli.host = next; i++; break;
            case '--port': case '-p': cli.port = parseInt(next, 10); i++; break;
            case '--model': case '-m': cli.model = next; i++; break;
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
SeNARS Bot — Unified Entry Point

Usage: node run.js [options]

Modes:
  irc         IRC bot with cognitive architecture (default)
  cli         CLI-only mode (stdin/stdout)
  demo        Scripted demo with mock messages
  test        Test mode with embedded IRC server

Options:
  --config <path>       Config file (default: bot.config.json)
  --mode <mode>         Running mode (irc|cli|demo|test)
  --profile <name>      Profile: minimal|parity|evolved|full
  --nick, -n <nick>     Bot nickname (default: SeNARchy)
  --channel, -c <chan>  IRC channel (default: ##metta)
  --host, -h <host>     IRC server (default: irc.quakenet.org)
  --port, -p <port>     IRC port (default: 6667)
  --model, -m <model>   LLM model name
  --openai-base-url     OpenAI-compatible endpoint
  --openai-api-key      API key for OpenAI endpoint
  --tls                 Enable TLS
  --debug               Debug logging
  --personality <text>  Bot personality description
  --help                Show this help
`);
}

// ── Bot Factory ───────────────────────────────────────────────────────────

async function createBot(config) {
    const hasOpenAIEndpoint = !!config.openaiBaseURL;
    const provider = hasOpenAIEndpoint ? 'openai' : 'transformers';

    Logger.info(`🤖 SeNARS Bot [mode=${config.mode}, profile=${config.profile}]`);
    Logger.info(`   Nick: ${config.nick}`);
    Logger.info(`   Provider: ${provider}`);
    Logger.info(`   Model: ${config.model}`);
    if (hasOpenAIEndpoint) Logger.info(`   Endpoint: ${config.openaiBaseURL}`);

    const agent = new Agent({
        id: `bot-${config.nick}`,
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
    Logger.info('✅ Agent initialized');

    // Warm LLM BEFORE registering embodiments — prevents race condition
    await warmupLLM(agent, config);

    // Register embodiments based on mode
    const embodiments = await createEmbodiments(agent, config);
    for (const emb of embodiments) {
        agent.embodimentBus.register(emb);
    }

    // Connect all embodiments
    for (const emb of embodiments) {
        await emb.connect();
    }

    return {
        start: () => agent.startMeTTaLoop(),
        shutdown: async () => {
            await agent.shutdown();
            for (const emb of embodiments) {
                await emb.disconnect?.();
            }
        },
    };
}

async function warmupLLM(agent, config) {
    if (!agent.ai) {
        Logger.warn('⚠️  No LLM configured — bot will log but not respond');
        agent._mettaLoopBuilder?.resolveLlmReady();
        return;
    }
    try {
        Logger.info('🔥 Warming up LLM...');
        const result = await Promise.race([
            agent.ai.generate('Hi', { maxTokens: 16 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('LLM warm-up timed out (60s)')), 60000)),
        ]);
        if (result?.text) {
            Logger.info(`✅ LLM ready (${result.model ?? config.model})`);
        } else {
            Logger.warn('⚠️  LLM returned empty response — model may not be loaded');
        }
    } catch (err) {
        Logger.warn(`⚠️  LLM warm-up failed: ${err.message}`);
        Logger.info('   Bot will attempt responses on demand');
    } finally {
        agent._mettaLoopBuilder?.resolveLlmReady();
    }
}

async function createEmbodiments(agent, config) {
    switch (config.mode) {
        case 'irc':
            return await createIRCEmbodiment(config);
        case 'cli':
            return [createCLIEmbodiment(config)];
        case 'demo':
            return [createDemoEmbodiment(config)];
        case 'test':
            return await createTestEmbodiments(config);
        default:
            throw new Error(`Unknown mode: ${config.mode}`);
    }
}

async function createIRCEmbodiment(config) {
    let host = config.host;
    let port = config.port;
    let hostedServer = null;

    // If no external host, start embedded IRC server (for local testing)
    if (!host) {
        const { MockIRCServer } = await import('../../tests/integration/irc/MockIRCServer.js');
        hostedServer = new MockIRCServer();
        port = config.hostedPort ?? 6668;
        await hostedServer.start(port);
        host = '127.0.0.1';
        port = hostedServer.port;
        Logger.info('🏠 Hosting embedded IRC server');
        Logger.info(`   Address: 127.0.0.1:${port}`);
        Logger.info(`   Connect with: /server 127.0.0.1 ${port}`);
    }

    const ircChannel = new IRCChannel({
        id: 'irc',
        host,
        port,
        nick: config.nick,
        username: config.nick.toLowerCase(),
        realname: `${config.nick} SeNARS Bot`,
        tls: config.tls,
        channels: [config.channel],
        rateLimit: { interval: config.rateLimit?.perChannelInterval ?? 4000 },
    });

    if (hostedServer) {
        ircChannel._hostedServer = hostedServer;
        const origDisconnect = ircChannel.disconnect.bind(ircChannel);
        ircChannel.disconnect = async () => {
            await origDisconnect();
            await hostedServer.stop();
        };
    }

    ircChannel.on('connected', () => {
        Logger.info(`🔌 Connected to IRC as ${config.nick}`);
    });

    return [ircChannel];
}

function createCLIEmbodiment(config) {
    return new CLIEmbodiment({
        id: 'cli',
        nick: config.nick,
    });
}

function createDemoEmbodiment(config) {
    return new DemoEmbodiment({
        id: 'demo',
        nick: config.nick,
        channel: config.channel,
    });
}

async function createTestEmbodiments(config) {
    const { MockIRCServer } = await import('../../tests/integration/irc/MockIRCServer.js');
    const server = new MockIRCServer();
    const port = config.hostedPort ?? 6668;
    await server.start(port);

    Logger.info('🏠 Hosting embedded IRC server for test');
    Logger.info(`   Address: 127.0.0.1:${server.port}`);

    const ircChannel = new IRCChannel({
        id: 'irc',
        host: '127.0.0.1',
        port: server.port,
        nick: config.nick,
        username: config.nick.toLowerCase(),
        realname: `${config.nick} SeNARS Bot`,
        tls: false,
        channels: [config.channel],
    });

    ircChannel._hostedServer = server;
    const origDisconnect = ircChannel.disconnect.bind(ircChannel);
    ircChannel.disconnect = async () => {
        await origDisconnect();
        await server.stop();
    };

    return [ircChannel];
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
        Logger.info('🚀 Starting MeTTaLoop...');
        await bot.start();
    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

if (process.argv[1]?.endsWith('run.js')) main();
export { createBot, mergeConfig, parseArgs };
