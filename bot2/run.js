#!/usr/bin/env node

/**
 * SeNARS Bot2 — Unified Entry Point
 *
 * Single cognitive pipeline (MeTTaLoop) with config-driven embodiments.
 * Modes are just which embodiments get registered — same loop, same pipeline.
 */

import { Agent } from '@senars/agent';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_CONFIG_PATH = join(__dirname, 'run.config.json');

const DEFAULTS = {
    mode: 'irc',
    nick: 'SeNARchy',
    host: null,
    hostedPort: 6668,
    port: 6667,
    channel: '##metta',
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    provider: 'transformers',
    tls: false,
    debug: false,
    profile: 'parity',
    loop: { budget: 50, sleepMs: 2000 },
};

function loadFileConfig(path) {
    if (!path || !existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch { return null; }
}

function mergeConfig(fileConfig, cli) {
    const base = { ...DEFAULTS, ...fileConfig };
    const irc = { ...(fileConfig?.irc ?? {}), ...(fileConfig?.channels?.irc ?? {}) };
    const lm = { ...(fileConfig?.lm ?? {}) };

    return {
        mode: cli.mode ?? base.mode,
        profile: cli.profile ?? base.profile ?? DEFAULTS.profile,
        nick: cli.nick ?? base.bot?.nick ?? base.nick,
        host: cli.host ?? irc.host ?? base.host,
        port: cli.port ?? irc.port ?? base.port,
        channel: cli.channel ?? irc.channel ?? base.channel,
        tls: cli.tls ?? irc.tls ?? base.tls,
        provider: cli.provider ?? lm.provider ?? base.provider,
        model: cli.model ?? base.lm?.modelName ?? lm.modelName ?? base.model,
        openaiBaseURL: cli.openaiBaseURL ?? base.lm?.openai?.baseURL ?? lm.openai?.baseURL,
        openaiApiKey: cli.openaiApiKey ?? base.lm?.openai?.apiKey ?? lm.openai?.apiKey,
        debug: cli.debug ?? base.debug ?? false,
        loop: { ...DEFAULTS.loop, ...(base.loop ?? {}) },
    };
}

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
            case '--provider': cli.provider = next; i++; break;
            case '--openai-base-url': cli.openaiBaseURL = next; i++; break;
            case '--openai-api-key': cli.openaiApiKey = next; i++; break;
            case '--tls': cli.tls = true; break;
            case '--debug': cli.debug = true; break;
            case '--help': printHelp(); process.exit(0);
        }
    }
    return cli;
}

function printHelp() {
    console.log(`
SeNARS Bot2 — Unified Entry Point

Usage: node run.js [options]

Modes:
  irc         IRC bot (embedded server if no --host, default)
  cli         CLI mode (stdin/stdout)
  demo        Scripted demo

Options:
  --config <path>       Config file (default: run.config.json)
  --mode <mode>         irc|cli|demo
  --profile <name>      minimal|parity|evolved|full
  --nick, -n <nick>     Bot nickname (default: SeNARchy)
  --channel, -c <chan>  IRC channel (default: ##metta)
  --host, -h <host>     IRC server (default: embedded 127.0.0.1:6668)
  --port, -p <port>     IRC port (default: 6667)
  --model, -m <model>   LLM model name
  --provider <prov>     transformers|openai|ollama|dummy
  --openai-base-url     OpenAI-compatible endpoint
  --openai-api-key      API key
  --tls                 Enable TLS
  --debug               Debug logging
  --help                Show this help
`);
}

async function createBot(config) {
    const hasOpenAIEndpoint = !!config.openaiBaseURL;
    const provider = hasOpenAIEndpoint ? 'openai' : config.provider;

    Logger.info(`Bot2 [mode=${config.mode}, profile=${config.profile}, provider=${provider}]`);
    Logger.info(`Nick: ${config.nick}`);

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
        loop: config.loop,
        workspace: join(__dirname, '../../workspace'),
    });

    await agent.initialize();
    Logger.info('Agent initialized');

    await warmupLLM(agent);

    const embodiments = await createEmbodiments(config);
    for (const emb of embodiments) {
        agent.embodimentBus.register(emb);
    }
    for (const emb of embodiments) {
        await emb.connect();
    }

    return {
        start: () => agent.startMeTTaLoop(),
        shutdown: async () => {
            await agent.shutdown();
            for (const emb of embodiments) await emb.disconnect?.();
        },
    };
}

async function warmupLLM(agent) {
    if (!agent.ai) {
        Logger.warn('No LLM configured');
        agent._mettaLoopBuilder?.resolveLlmReady();
        return;
    }
    try {
        Logger.info('Warming up LLM...');
        const result = await Promise.race([
            agent.ai.generate('Hi', { maxTokens: 16 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('LLM warm-up timed out')), 60000)),
        ]);
        Logger.info(`LLM ready: ${result?.text?.substring(0, 80) ?? '(empty)'}`);
    } catch (err) {
        Logger.warn(`LLM warm-up failed: ${err.message}`);
    } finally {
        agent._mettaLoopBuilder?.resolveLlmReady();
    }
}

async function createEmbodiments(config) {
    switch (config.mode) {
        case 'irc': return await createIRCEmbodiment(config);
        case 'cli': return [createCLIEmbodiment(config)];
        case 'demo': return [createDemoEmbodiment(config)];
        default: throw new Error(`Unknown mode: ${config.mode}`);
    }
}

async function createIRCEmbodiment(config) {
    let host = config.host;
    let port = config.port;
    let hostedServer = null;

    if (!host) {
        const { MockIRCServer } = await import('./tests/integration/irc/MockIRCServer.js');
        hostedServer = new MockIRCServer();
        await hostedServer.start(config.hostedPort ?? 6668);
        host = '127.0.0.1';
        port = hostedServer.port;
        Logger.info(`Embedded IRC server: 127.0.0.1:${port}`);
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
        rateLimit: { interval: 4000 },
    });

    if (hostedServer) {
        ircChannel._hostedServer = hostedServer;
        const origDisconnect = ircChannel.disconnect.bind(ircChannel);
        ircChannel.disconnect = async () => { await origDisconnect(); await hostedServer.stop(); };
    }

    ircChannel.on('connected', () => Logger.info(`Connected to IRC as ${config.nick}`));
    return [ircChannel];
}

function createCLIEmbodiment(config) {
    return new CLIEmbodiment({ id: 'cli', nick: config.nick });
}

function createDemoEmbodiment(config) {
    return new DemoEmbodiment({ id: 'demo', nick: config.nick, channel: config.channel });
}

async function main() {
    const cli = parseArgs();
    const configPath = cli.configPath ?? (existsSync(DEFAULT_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : null);
    const fileConfig = configPath ? loadFileConfig(configPath) : null;
    if (fileConfig) Logger.info(`Loaded config: ${configPath}`);

    const config = mergeConfig(fileConfig, cli);
    if (config.debug) Logger.setLevel('DEBUG');

    try {
        const bot = await createBot(config);
        Logger.info('Starting MeTTaLoop...');
        await bot.start();
    } catch (error) {
        Logger.error('Fatal:', error);
        process.exit(1);
    }
}

if (process.argv[1]?.endsWith('run.js')) main();
export { createBot, mergeConfig, parseArgs };
