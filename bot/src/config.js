/**
 * Bot Configuration — Loading, Merging, CLI Parsing, Validation
 *
 * Three-layer precedence: DEFAULTS < file config < CLI args
 *
 * Canonical config shape (the only shape):
 *   { profile, nick, personality, embodiments: { irc, cli, demo }, lm, loop, rateLimit, capabilities, debug, workspace }
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback } from '@senars/core';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
export const DEFAULT_CONFIG_PATH = resolve(__dirname, '..', 'bot.config.json');

/* ── Profiles ─────────────────────────────────────────────────────────── */

export const PROFILES = Object.freeze({
    minimal: Object.freeze({
        profile: 'minimal',
        nick: 'SeNARchy',
        embodiments: Object.freeze({
            irc: { enabled: false },
            cli: { enabled: true },
            demo: { enabled: false },
        }),
        lm: Object.freeze({
            provider: 'transformers',
            modelName: 'HuggingFaceTB/SmolLM2-360M-Instruct',
            temperature: 0.7,
            maxTokens: 128,
        }),
        loop: Object.freeze({ budget: 10, sleepMs: 1000 }),
        capabilities: Object.freeze({
            contextBudgets: false,
            semanticMemory: false,
            auditLog: false,
            persistentHistory: false,
            goalPursuit: false,
        }),
    }),
});

/* ── Defaults ─────────────────────────────────────────────────────────── */

export const DEFAULTS = Object.freeze({
    profile: 'parity',
    nick: 'SeNARchy',
    personality: 'helpful, curious, and concise. You engage genuinely and remember context.',
    lm: {
        provider: 'transformers',
        modelName: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
        temperature: 0.7,
        maxTokens: 256,
    },
    loop: { budget: 50, sleepMs: 2000 },
    rateLimit: { perChannelMax: 3, perChannelInterval: 8000, globalMax: 10, globalInterval: 10_000 },
    maxContextLength: 30,
    contextWindowMs: 3_600_000,
    embodiments: Object.freeze({
        irc: { enabled: false, host: null, port: 6667, channels: ['##metta'], tls: false },
        cli: { enabled: false },
        demo: { enabled: false },
    }),
});

const KNOWN_PROFILES = new Set(['minimal', 'parity', 'evolved', 'full']);
const KNOWN_PROVIDERS = new Set(['transformers', 'openai', 'ollama', 'dummy']);
const KNOWN_MODES = new Set(['irc', 'cli', 'demo', 'multi']);

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Load a JSON config file. Returns null on failure (logged as warning).
 */
export function loadFileConfig(path) {
    if (!path || !existsSync(path)) {return null;}
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { Logger.warn(`[Bot] Failed to load config from ${path}: ${e.message}`); return null; }
}

/**
 * Merge defaults, file config, and CLI args. CLI wins.
 * Profile defaults are applied before file/CLI overrides.
 */
export function mergeConfig(fileConfig, cli) {
    const fc = fileConfig ?? {};
    const profileName = cli.profile ?? fc.profile ?? DEFAULTS.profile;
    const profileDefaults = PROFILES[profileName] ?? {};

    // Profile defaults for embodiments
    const profileEmbs = profileDefaults.embodiments ?? {};
    const fileEmbs = fc.embodiments ?? {};
    const ircOverrides = {};
    if (cli.host !== undefined) {ircOverrides.host = cli.host;}
    if (cli.port !== undefined) {ircOverrides.port = cli.port;}
    if (cli.channel !== undefined) {ircOverrides.channels = [cli.channel];}
    if (cli.tls !== undefined) {ircOverrides.tls = cli.tls;}
    const ircEmb = deepMerge({}, profileEmbs.irc ?? {}, fileEmbs.irc ?? {}, ircOverrides);
    const cliEmb = deepMerge({}, profileEmbs.cli ?? {}, fileEmbs.cli ?? {});
    const demoEmb = deepMerge({}, profileEmbs.demo ?? {}, fileEmbs.demo ?? {});
    const embodiments = mergeEmbodiments({ irc: ircEmb, cli: cliEmb, demo: demoEmb }, cli.mode, cli.multi);

    const hasOpenAI = !!(cli.openaiBaseURL ?? fc.lm?.openai?.baseURL);
    const provider = cli.provider ?? fc.lm?.provider ?? (hasOpenAI ? 'openai' : (profileDefaults.lm?.provider ?? DEFAULTS.lm.provider));
    const lmOverrides = {};
    if (cli.model !== undefined) {lmOverrides.modelName = cli.model;}

    const profileCaps = profileDefaults.capabilities ?? {};
    const fileCaps = fc.capabilities ?? {};

    return {
        profile: profileName,
        nick: cli.nick ?? fc.nick ?? profileDefaults.nick ?? DEFAULTS.nick,
        personality: cli.personality ?? fc.personality ?? DEFAULTS.personality,
        provider,
        lm: deepMerge({}, DEFAULTS.lm, profileDefaults.lm ?? {}, fc.lm ?? {}, lmOverrides, { provider }),
        loop: deepMerge({}, DEFAULTS.loop, profileDefaults.loop ?? {}, fc.loop ?? {}),
        rateLimit: deepMerge({}, DEFAULTS.rateLimit, fc.rateLimit ?? {}),
        maxContextLength: fc.maxContextLength ?? DEFAULTS.maxContextLength,
        contextWindowMs: fc.contextWindowMs ?? DEFAULTS.contextWindowMs,
        capabilities: { ...profileCaps, ...fileCaps },
        workspace: fc.workspace,
        debug: cli.debug ?? fc.debug ?? false,
        embodiments,
    };
}

/**
 * Parse CLI args. Unknown flags produce a warning and are ignored.
 */
export function parseArgs(argv) {
    const args = argv ?? process.argv.slice(2);
    const cli = {};
    const valueFlags = new Set([
        '--config', '--mode', '--profile', '--nick', '-n',
        '--channel', '-c', '--host', '-h', '--port', '-p',
        '--model', '-m', '--provider', '--openai-base-url', '--openai-api-key', '--personality',
    ]);
    const known = new Set([...valueFlags, '--tls', '--debug', '--multi', '--help']);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('-') && !known.has(arg)) {
            Logger.warn(`[Bot] Unknown flag ignored: ${arg}`);
            continue;
        }
        const next = args[i + 1];
        if (valueFlags.has(arg) && (next === undefined || next.startsWith('-'))) {
            Logger.warn(`[Bot] Flag ${arg} requires a value — ignored`);
            continue;
        }
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
 * Load and merge config from CLI args + file. Main entry point.
 */
export async function loadConfig(cli) {
    const cliArgs = typeof cli === 'string' ? parseArgs(cli.split(/\s+/)) : (cli ?? parseArgs());
    const configPath = cliArgs.configPath ?? resolveConfigPath(cliArgs);
    const fileConfig = configPath ? loadFileConfig(configPath) : null;
    if (fileConfig) {Logger.info(`[Bot] Loaded config: ${configPath}`);}

    const config = mergeConfig(fileConfig, cliArgs);
    if (config.debug) {Logger.setLevel('DEBUG');}

    const errors = validateConfig(config);
    if (errors.length) {
        Logger.error(`[Bot] Config validation errors:\n${  errors.map(e => `  - ${e}`).join('\n')}`);
        throw new Error(`Invalid bot config:\n${errors.join('\n')}`);
    }

    return config;
}

/**
 * Validate a merged config object. Returns array of error strings.
 */
export function validateConfig(cfg) {
    const errors = [];
    if (cfg.profile && !KNOWN_PROFILES.has(cfg.profile)) {
        errors.push(`Unknown profile "${cfg.profile}". Must be one of: ${[...KNOWN_PROFILES].join(', ')}`);
    }
    if (cfg.provider && !KNOWN_PROVIDERS.has(cfg.provider)) {
        errors.push(`Unknown provider "${cfg.provider}". Must be one of: ${[...KNOWN_PROVIDERS].join(', ')}`);
    }
    if (cfg.lm?.temperature !== undefined && (cfg.lm.temperature < 0 || cfg.lm.temperature > 2)) {
        errors.push(`LM temperature ${cfg.lm.temperature} out of range [0, 2]`);
    }
    if (cfg.lm?.maxTokens !== undefined && (!Number.isInteger(cfg.lm.maxTokens) || cfg.lm.maxTokens < 1)) {
        errors.push(`LM maxTokens must be a positive integer, got ${cfg.lm.maxTokens}`);
    }
    if (cfg.loop?.budget !== undefined && (!Number.isInteger(cfg.loop.budget) || cfg.loop.budget < 1)) {
        errors.push(`Loop budget must be a positive integer, got ${cfg.loop.budget}`);
    }
    if (cfg.loop?.sleepMs !== undefined && (!Number.isInteger(cfg.loop.sleepMs) || cfg.loop.sleepMs < 0)) {
        errors.push(`Loop sleepMs must be a non-negative integer, got ${cfg.loop.sleepMs}`);
    }
    if (cfg.nick !== undefined && (typeof cfg.nick !== 'string' || !cfg.nick.trim())) {
        errors.push(`Nick must be a non-empty string, got "${cfg.nick}"`);
    }
    if (cfg.embodiments && typeof cfg.embodiments !== 'object') {
        errors.push('Embodiments must be an object');
    }
    return errors;
}

export function printHelp() {
    console.log(`
SeNARS Bot — Unified Entry Point

Usage: node run.js [options]

Modes:
  irc         IRC bot (embedded server if no --host, default)
  cli         CLI mode (stdin/stdout)
  demo        Scripted demo
  multi       All embodiments enabled simultaneously

Options:
  --config <path>       Config file (default: bot/bot.config.json)
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
  --multi               Enable all embodiments
  --help                Show this help
`);
}

/* ── Internal ─────────────────────────────────────────────────────────── */

/**
 * Merge embodiment configs from file config with CLI mode/multi flags.
 * --mode X enables only embodiment X. --multi enables all.
 */
function mergeEmbodiments(fileEmbs, mode, multi) {
    const defaults = structuredClone(DEFAULTS.embodiments);
    const base = fileEmbs ? deepMerge(structuredClone(defaults), fileEmbs) : defaults;

    // --mode multi and --multi both enable all embodiments
    if (multi || mode === 'multi') {
        for (const emb of Object.values(base)) {
            if (emb && typeof emb === 'object') {emb.enabled = true;}
        }
        return base;
    }

    if (mode && KNOWN_MODES.has(mode) && mode !== 'multi') {
        for (const key of Object.keys(base)) {base[key].enabled = false;}
        if (base[mode]) {base[mode].enabled = true;}
        else {Logger.warn(`[Bot] Unknown mode "${mode}" — no embodiments enabled`);}
        return base;
    }

    return base;
}

function deepMerge(target, ...sources) {
    for (const src of sources) {
        for (const key of Object.keys(src)) {
            if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key]) && target[key] && typeof target[key] === 'object') {
                target[key] = deepMerge({}, target[key], src[key]);
            } else {
                target[key] = src[key];
            }
        }
    }
    return target;
}

function resolveConfigPath(cliArgs) {
    if (cliArgs.configPath) {return cliArgs.configPath;}
    return existsSync(DEFAULT_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : null;
}
