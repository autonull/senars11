#!/usr/bin/env node

/**
 * Bot Configuration — Loading, Merging, CLI Parsing
 *
 * Three-layer precedence:  DEFAULTS < file config < CLI flags
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { Logger } from '@senars/core';

// Resolve __dirname in both ESM and Jest environments
let __dirname;
try {
    const { fileURLToPath, dirname } = await import('url');
    __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
    __dirname = resolve(process.cwd(), 'bot/src');
}

export const DEFAULT_CONFIG_PATH = join(__dirname, 'bot.config.json');

export const DEFAULTS = Object.freeze({
    mode: 'irc',
    nick: 'SeNARchy',
    personality: 'helpful, curious, and concise. You engage genuinely and remember context.',
    host: null,
    hostedPort: 6668,
    port: 6667,
    channel: '##metta',
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    provider: 'transformers',
    tls: false,
    debug: false,
    profile: 'parity',
    maxContextLength: 30,
    contextWindowMs: 3_600_000,
    rateLimit: { perChannelMax: 3, perChannelInterval: 8000, globalMax: 10, globalInterval: 10_000 },
    loop: { budget: 50, sleepMs: 2000 },
});

export function loadFileConfig(path) {
    if (!path || !existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { Logger.warn(`Failed to load config from ${path}: ${e.message}`); return null; }
}

/**
 * Merge defaults, file config, and CLI args. CLI wins.
 */
export function mergeConfig(fileConfig, cli) {
    const base = { ...DEFAULTS, ...fileConfig };
    const irc = { ...(fileConfig?.irc ?? {}), ...(fileConfig?.channels?.irc ?? {}) };
    const lm = { ...(fileConfig?.lm ?? {}) };

    // Determine provider — OpenAI endpoint overrides default, explicit provider wins all
    const hasOpenAIEndpoint = !!(cli.openaiBaseURL ?? base.lm?.openai?.baseURL ?? lm.openai?.baseURL);
    const explicitProvider = cli.provider ?? lm.provider;
    // If file config has provider and no CLI override, use it
    const fileProvider = fileConfig?.provider;
    const provider = explicitProvider ?? fileProvider ?? (hasOpenAIEndpoint ? 'openai' : DEFAULTS.provider);

    // Build embodiment config from --mode or explicit embodiments
    const embodiments = fileConfig?.embodiments ?? buildEmbodimentsFromMode(cli.mode ?? base.mode);

    return {
        mode: cli.mode ?? base.mode,
        profile: cli.profile ?? base.profile ?? DEFAULTS.profile,
        nick: cli.nick ?? base.bot?.nick ?? base.nick,
        personality: cli.personality ?? base.bot?.personality ?? base.personality,
        host: cli.host ?? irc.host ?? base.host,
        port: cli.port ?? irc.port ?? base.port,
        channel: cli.channel ?? irc.channel ?? base.channel,
        tls: cli.tls ?? irc.tls ?? base.tls,
        provider,
        model: cli.model ?? base.lm?.modelName ?? lm.modelName ?? base.model,
        openaiBaseURL: cli.openaiBaseURL ?? base.lm?.openai?.baseURL ?? lm.openai?.baseURL,
        openaiApiKey: cli.openaiApiKey ?? base.lm?.openai?.apiKey ?? lm.openai?.apiKey,
        debug: cli.debug ?? base.debug ?? false,
        maxContextLength: base.bot?.maxContextLength ?? base.maxContextLength,
        contextWindowMs: base.bot?.contextWindowMs ?? base.contextWindowMs,
        rateLimit: { ...DEFAULTS.rateLimit, ...(base.rateLimit ?? {}) },
        loop: { ...DEFAULTS.loop, ...(base.loop ?? {}) },
        capabilities: { ...(base.capabilities ?? {}) },
        workspace: base.workspace,
        embodiments,
    };
}

function buildEmbodimentsFromMode(mode) {
    const all = {
        irc: { enabled: false },
        cli: { enabled: false },
        demo: { enabled: false },
    };
    if (all[mode]) all[mode].enabled = true;
    return all;
}

export function parseArgs(argv) {
    const args = argv ?? process.argv.slice(2);
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
            case '--personality': cli.personality = next; i++; break;
            case '--multi': cli.multi = true; break;
            case '--help': printHelp(); process.exit(0);
        }
    }
    return cli;
}

/**
 * Load and merge config from CLI args + file.
 */
export async function loadConfig(cli) {
    const cliArgs = typeof cli === 'string' ? parseArgs(cli.split(/\s+/)) : (cli ?? parseArgs());
    const configPath = cliArgs.configPath ?? (existsSync(DEFAULT_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : null);
    const fileConfig = configPath ? loadFileConfig(configPath) : null;

    if (fileConfig) Logger.info(`📄 Loaded config: ${configPath}`);

    const config = mergeConfig(fileConfig, cliArgs);

    // --multi enables all embodiments with enabled:true in file config
    if (cliArgs.multi && fileConfig?.embodiments) {
        // Already handled by file config
    }

    if (config.debug) Logger.setLevel('DEBUG');

    return config;
}

export function printHelp() {
    console.log(`
SeNARS Bot — Unified Entry Point

Usage: node run.js [options]

Modes:
  irc         IRC bot (embedded server if no --host, default)
  cli         CLI mode (stdin/stdout)
  demo        Scripted demo
  multi       All enabled embodiments from config

Options:
  --config <path>       Config file (default: bot.config.json)
  --mode <mode>         irc|cli|demo|multi
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
  --personality <text>  Bot personality
  --multi               Enable all embodiments from config
  --help                Show this help
`);
}
