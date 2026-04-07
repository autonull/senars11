#!/usr/bin/env node

/**
 * SeNARS Bot — Unified Bot Runtime
 *
 * Single cognitive pipeline with config-driven multi-embodiment support.
 *
 *   import { createBot, Bot } from '@senars/bot';
 *   const bot = await createBot(config);
 *   await bot.start();
 */

import { Agent } from '@senars/agent';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';
import { join, resolve } from 'path';

// Resolve __dirname in both ESM and Jest environments
let __dirname;
try {
    const { fileURLToPath, dirname } = await import('url');
    __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
    __dirname = resolve(process.cwd(), 'bot/src');
}
const __root = join(__dirname, '../..');

const EMBODIMENT_FACTORIES = {
    irc: createIRCEmbodiment,
    cli: createCLIEmbodiment,
    demo: createDemoEmbodiment,
};

const DEFAULT_LM = {
    provider: 'transformers',
    modelName: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    temperature: 0.7,
    maxTokens: 256,
};

export class Bot {
    #config;
    #agent;
    #embodiments = [];
    #started = false;
    #startTime;
    #embeddedServers = [];

    constructor(config) {
        this.#config = Object.freeze({ ...config });
    }

    get config() { return this.#config; }
    get agent() { return this.#agent; }
    get isStarted() { return this.#started; }
    get startTime() { return this.#startTime; }

    get status() {
        const loop = this.#agent?._mettaLoopBuilder;
        return {
            started: this.#started,
            uptime: this.#startTime ? Date.now() - this.#startTime : 0,
            profile: this.#config.profile,
            nick: this.#config.nick,
            loop: loop ? {
                running: loop.isRunning ?? false,
                paused: loop.isPaused ?? false,
                cycleCount: loop.loopState?.cycleCount ?? 0,
            } : { running: false },
            llm: {
                ready: this.#agent?._mettaLoopBuilder?._llmReady ?? false,
                provider: this.#config.lm?.provider,
                model: this.#config.lm?.modelName,
            },
            embodiments: Object.fromEntries(
                this.#embodiments.map(e => [e.id, { status: e.status }])
            ),
        };
    }

    async initialize() {
        if (this.#agent) return this;

        const cfg = this.#config;
        const lmCfg = { ...DEFAULT_LM, ...(cfg.lm ?? {}) };
        const hasOpenAI = !!cfg.openaiBaseURL;
        const provider = hasOpenAI ? 'openai' : (lmCfg.provider ?? 'transformers');

        Logger.info(`🤖 SeNARS Bot [profile=${cfg.profile}]`);
        Logger.info(`   Nick: ${cfg.nick ?? 'SeNARchy'}`);
        Logger.info(`   Provider: ${provider} | Model: ${lmCfg.modelName}`);
        if (hasOpenAI) Logger.info(`   Endpoint: ${cfg.openaiBaseURL}`);

        this.#agent = new Agent({
            id: `bot-${cfg.nick ?? 'SeNARchy'}`,
            profile: cfg.profile ?? 'parity',
            lm: {
                provider,
                modelName: hasOpenAI ? undefined : lmCfg.modelName,
                openai: hasOpenAI ? { baseURL: cfg.openaiBaseURL, apiKey: cfg.openaiApiKey || 'sk-dummy' } : undefined,
                temperature: lmCfg.temperature,
                maxTokens: lmCfg.maxTokens,
            },
            inputProcessing: { enableNarseseFallback: true, checkNarseseSyntax: true },
            rateLimit: cfg.rateLimit,
            loop: cfg.loop,
            capabilities: cfg.capabilities,
            workspace: cfg.workspace ?? join(__root, 'workspace'),
        });

        await this.#agentInitialize();
        await this.#warmupLLM();
        await this.#createEmbodiments();

        return this;
    }

    async start() {
        if (!this.#agent) await this.initialize();
        if (this.#started) return this;

        for (const emb of this.#embodiments) {
            await emb.connect();
        }

        this.#started = true;
        this.#startTime = Date.now();
        Logger.info('🚀 Starting MeTTaLoop...');
        this.#agent.startMeTTaLoop();
        return this;
    }

    async shutdown() {
        this.#started = false;
        await this.#agent?.shutdown();
        for (const emb of this.#embodiments) {
            await emb.disconnect?.();
        }
        for (const srv of this.#embeddedServers) {
            await srv.stop?.();
        }
        Logger.info('👋 Bot shutdown complete');
    }

    /* ── Internal ─────────────────────────────────────────────────────── */

    async #agentInitialize() {
        // Agent.initialize doesn't exist; initialize means agent is ready after construction
        // The heavy init happens in startMeTTaLoop
        this.#agent._mettaLoopBuilder?.resolveLlmReady?.();
    }

    async #warmupLLM() {
        const agent = this.#agent;
        if (!agent.ai) {
            Logger.warn('⚠️  No LLM configured — bot will log but not respond');
            agent._mettaLoopBuilder?.resolveLlmReady();
            return;
        }
        try {
            Logger.info('🔥 Warming up LLM...');
            const result = await Promise.race([
                agent.ai.generate('Hi', { maxTokens: 16 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('LLM warm-up timed out (60s)')), 60_000)),
            ]);
            if (result?.text) {
                Logger.info(`✅ LLM ready (${result.model ?? this.#config.lm?.modelName})`);
            } else {
                Logger.warn('⚠️  LLM returned empty — model may not be loaded');
            }
        } catch (err) {
            Logger.warn(`⚠️  LLM warm-up failed: ${err.message} — will retry on demand`);
        } finally {
            agent._mettaLoopBuilder?.resolveLlmReady();
        }
    }

    async #createEmbodiments() {
        const cfg = this.#config;
        const embDefs = cfg.embodiments ?? this.#defaultEmbodiments();

        for (const [type, def] of Object.entries(embDefs)) {
            if (!def?.enabled) continue;
            const factory = EMBODIMENT_FACTORIES[type];
            if (!factory) {
                Logger.warn(`Unknown embodiment type: ${type}`);
                continue;
            }
            const embs = await factory(def, cfg);
            for (const emb of embs) {
                this.#agent.embodimentBus.register(emb);
                this.#embodiments.push(emb);
            }
        }

        if (!this.#embodiments.length) {
            Logger.warn('⚠️  No embodiments configured — bot has no I/O');
        }
    }

    #defaultEmbodiments() {
        // Backward compat: if --mode is set, enable only that embodiment
        const mode = this.#config.mode ?? 'irc';
        return { [mode]: { enabled: true } };
    }
}

/* ── Embodiment Factories ─────────────────────────────────────────────── */

async function createIRCEmbodiment(def, cfg) {
    let host = def.host ?? cfg.host;
    let port = def.port ?? cfg.port ?? 6667;
    let hostedServer = null;

    if (!host) {
        const { MockIRCServer } = await import('../../tests/integration/irc/MockIRCServer.js');
        hostedServer = new MockIRCServer();
        await hostedServer.start(def.hostedPort ?? cfg.hostedPort ?? 6668);
        host = '127.0.0.1';
        port = hostedServer.port;
        Logger.info(`🏠 Embedded IRC server: 127.0.0.1:${port}`);
    }

    const channels = def.channels ?? cfg.channels ?? [cfg.channel ?? '##metta'];
    const nick = cfg.nick ?? 'SeNARchy';

    const irc = new IRCChannel({
        id: 'irc',
        host,
        port,
        nick,
        username: nick.toLowerCase(),
        realname: `${nick} SeNARS Bot`,
        tls: def.tls ?? cfg.tls ?? false,
        channels,
        rateLimit: { interval: cfg.rateLimit?.perChannelInterval ?? 4000 },
    });

    if (hostedServer) {
        const origDisconnect = irc.disconnect.bind(irc);
        irc.disconnect = async () => { await origDisconnect(); await hostedServer.stop(); };
    }

    irc.on('connected', () => Logger.info(`🔌 IRC connected as ${nick}`));
    return [irc];
}

function createCLIEmbodiment(def, cfg) {
    return [new CLIEmbodiment({ id: 'cli', nick: cfg.nick ?? 'SeNARchy' })];
}

function createDemoEmbodiment(def, cfg) {
    return [new DemoEmbodiment({
        id: 'demo',
        nick: cfg.nick ?? 'SeNARchy',
        channel: def.channel ?? cfg.channel ?? '##metta',
    })];
}

/* ── Public Factory ───────────────────────────────────────────────────── */

export async function createBot(config) {
    const bot = new Bot(config);
    await bot.initialize();
    return bot;
}
