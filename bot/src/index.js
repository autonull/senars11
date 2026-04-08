/**
 * SeNARS Bot — Unified Bot Runtime
 *
 * Single cognitive pipeline with config-driven multi-embodiment support.
 *
 * Programmatic API:
 *   import { createBot, Bot, registerEmbodimentFactory } from '@senars/bot';
 *   const bot = await createBot(config);
 *   await bot.start();
 *
 * Extending:
 *   registerEmbodimentFactory('nostr', createNostrEmbodiment);
 */

import { Agent } from '@senars/agent';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback } from '@senars/core';
import { EmbeddedIRCServer } from './EmbeddedIRCServer.js';

const fallbackBotDir = () => join(process.cwd(), 'bot/src');
const __dirname = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackBotDir);
const __root = join(__dirname, '../..');

const DEFAULT_LM = {
    provider: 'transformers',
    modelName: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    temperature: 0.7,
    maxTokens: 256,
};

/**
 * Embodiment factory registry. External packages can add new types
 * via registerEmbodimentFactory(type, fn).
 *
 * Factory signature: (def, cfg, ctx) => Promise<Embodiment[]>
 *   def  — embodiment definition from config (e.g. { host, port, channels })
 *   cfg  — merged bot config
 *   ctx  — lifecycle context { onCleanup(fn) }
 */
const _embodimentFactories = new Map();

function registerBuiltinFactories() {
    _embodimentFactories.set('irc', createIRCEmbodiment);
    _embodimentFactories.set('cli', createCLIEmbodiment);
    _embodimentFactories.set('demo', createDemoEmbodiment);
}
registerBuiltinFactories();

/**
 * Register a custom embodiment factory.
 * @param {string} type - embodiment type identifier (e.g. 'nostr', 'matrix')
 * @param {function} factory - async (def, cfg, ctx) => Embodiment[]
 */
export function registerEmbodimentFactory(type, factory) {
    if (typeof factory !== 'function') {
        throw new TypeError(`Embodiment factory for "${type}" must be a function`);
    }
    _embodimentFactories.set(type, factory);
    Logger.info(`[Bot] Registered embodiment factory: ${type}`);
}

export class Bot {
    #config;
    #agent;
    #embodiments = [];
    #started = false;
    #startTime;
    #cleanupFns = [];
    #shutdownCalled = false;
    #loopState = { running: false, paused: false, cycleCount: 0, llmReady: false };
    #readyResolve;
    #readyReject;
    #readyPromise;

    /**
     * @param {object} config — merged config from mergeConfig() or loadConfig()
     */
    constructor(config) {
        this.#config = Object.freeze({ ...config });
        this.#readyPromise = new Promise((resolve, reject) => {
            this.#readyResolve = resolve;
            this.#readyReject = reject;
        });
    }

    get config() { return this.#config; }
    get agent() { return this.#agent; }
    get isStarted() { return this.#started; }
    get startTime() { return this.#startTime; }

    /**
     * Promise that resolves when the bot is fully initialized (agent, LLM, embodiments).
     * Rejects if initialization fails.
     */
    get ready() { return this.#readyPromise; }

    /**
     * Bot status snapshot. Safe for health checks and monitoring.
     * Does not reach into Agent internals — tracks state locally.
     */
    get status() {
        return {
            started: this.#started,
            uptime: this.#startTime ? Date.now() - this.#startTime : 0,
            profile: this.#config.profile,
            nick: this.#config.nick,
            loop: { ...this.#loopState },
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

        Logger.info(`[Bot] SeNARS Bot [profile=${cfg.profile}]`);
        Logger.info(`[Bot] Nick: ${cfg.nick ?? 'SeNARchy'}`);
        Logger.info(`[Bot] Provider: ${provider} | Model: ${lmCfg.modelName}`);
        if (hasOpenAI) Logger.info(`[Bot] Endpoint: ${cfg.openaiBaseURL}`);

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

        // Agent.initialize() builds MeTTaLoopBuilder + MeTTaLoopStarter.
        // Without it, startMeTTaLoop() throws.
        await this.#agent.initialize();

        // Mirror loop state from Agent internals (one-time hookup).
        this.#syncLoopState();

        // Warm up LLM before embodiments connect — prevents race condition.
        await this.#warmupLLM();

        // Create and register embodiments.
        await this.#createEmbodiments();

        this.#readyResolve();
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
        Logger.info('[Bot] Starting MeTTaLoop...');

        // Start the cognitive loop with an error boundary so a crash
        // doesn't silently leave the bot in a half-alive state.
        try {
            await this.#agent.startMeTTaLoop();
        } catch (err) {
            Logger.error('[Bot] MeTTaLoop crashed:', err.message);
            this.#started = false;
            await this.shutdown();
            throw err;
        }

        return this;
    }

    async shutdown() {
        if (this.#shutdownCalled) return;
        this.#shutdownCalled = true;
        this.#started = false;
        this.#readyReject?.(new Error('Bot shutting down'));

        await this.#agent?.shutdown();

        for (const emb of this.#embodiments) {
            try { await emb.disconnect?.(); }
            catch (e) { Logger.warn(`[Bot] Embodiment ${emb.id} disconnect error:`, e.message); }
        }

        for (const fn of this.#cleanupFns) {
            try { await fn(); }
            catch (e) { Logger.warn('[Bot] Cleanup error:', e.message); }
        }
        this.#cleanupFns = [];
        this.#embodiments = [];

        Logger.info('[Bot] Shutdown complete');
    }

    /* ── Internal ─────────────────────────────────────────────────────── */

    /**
     * Hook into the Agent's MeTTaLoopBuilder to track loop state locally.
     * This avoids reaching into Agent internals in the status getter.
     */
    #syncLoopState() {
        const builder = this.#agent._mettaLoopBuilder;
        if (!builder) return;

        const update = () => {
            this.#loopState.running = builder.isRunning ?? false;
            this.#loopState.paused = builder.isPaused ?? false;
            this.#loopState.cycleCount = builder.loopState?.cycleCount ?? 0;
            this.#loopState.llmReady = builder._llmReady ?? false;
        };

        builder.on?.('cycle-end', update);
        builder.on?.('start', update);
        builder.on?.('halt', update);
        update();
    }

    async #warmupLLM() {
        const agent = this.#agent;
        const builder = agent._mettaLoopBuilder;
        if (!agent.ai) {
            Logger.warn('[Bot] No LLM configured — bot will log but not respond');
            builder?.resolveLlmReady();
            return;
        }
        let timer;
        try {
            Logger.info('[Bot] Warming up LLM...');
            const result = await Promise.race([
                agent.ai.generate('Hi', { maxTokens: 16 }),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('LLM warm-up timeout (60s)')), 60_000);
                })
            ]);
            if (result?.text) {
                Logger.info(`[Bot] LLM ready (${result.model ?? this.#config.lm?.modelName})`);
            } else {
                Logger.warn('[Bot] LLM returned empty — model may not be loaded');
            }
        } catch (err) {
            Logger.warn(`[Bot] LLM warm-up failed: ${err.message} — will retry on demand`);
        } finally {
            clearTimeout(timer);
            builder?.resolveLlmReady();
        }
    }

    async #createEmbodiments() {
        const cfg = this.#config;
        const embDefs = cfg.embodiments ?? this.#defaultEmbodiments();
        const ctx = { onCleanup: (fn) => this.#cleanupFns.push(fn) };

        for (const [type, def] of Object.entries(embDefs)) {
            if (!def?.enabled) continue;
            const factory = _embodimentFactories.get(type);
            if (!factory) {
                Logger.warn(`[Bot] Unknown embodiment type: "${type}" — skipped`);
                continue;
            }
            try {
                const embs = await factory(def, cfg, ctx);
                for (const emb of embs) {
                    this.#agent.embodimentBus.register(emb);
                    this.#embodiments.push(emb);
                }
            } catch (err) {
                Logger.error(`[Bot] Embodiment "${type}" failed to initialize:`, err.message);
            }
        }

        if (!this.#embodiments.length) {
            Logger.warn('[Bot] No embodiments configured — bot has no I/O');
        }
    }

    #defaultEmbodiments() {
        const mode = this.#config.mode ?? 'irc';
        return { [mode]: { enabled: true } };
    }
}

/* ── Embodiment Factories ─────────────────────────────────────────────── */

/**
 * IRC embodiment factory.
 * Starts an embedded EmbeddedIRCServer when no host is provided.
 */
async function createIRCEmbodiment(def, cfg, ctx) {
    let host = def.host ?? cfg.host;
    let port = def.port ?? cfg.port ?? 6667;

    if (!host) {
        const server = new EmbeddedIRCServer();
        await server.start(def.hostedPort ?? cfg.hostedPort ?? 6668);
        host = '127.0.0.1';
        port = server.port;
        ctx.onCleanup(() => server.stop());

        // Wire server lifecycle events to Bot logging
        server.on('client-registered', ({ nick }) => Logger.info(`[IRC] Client registered: ${nick}`));
        server.on('user-joined', ({ nick, channel }) => Logger.info(`[IRC] ${nick} joined ${channel}`));
        server.on('user-quit', ({ nick, reason }) => Logger.info(`[IRC] ${nick} quit: ${reason}`));

        Logger.info(`[Bot] Embedded IRC server: 127.0.0.1:${port}`);
    }

    const channels = def.channels ?? [cfg.channel ?? '##metta'];
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

    irc.on('connected', () => Logger.info(`[Bot] IRC connected as ${nick}`));
    return [irc];
}

/**
 * CLI embodiment factory — stdin/stdout interaction.
 */
function createCLIEmbodiment(def, cfg) {
    return [new CLIEmbodiment({ id: 'cli', nick: cfg.nick ?? 'SeNARchy' })];
}

/**
 * Demo embodiment factory — scripted message playback.
 */
function createDemoEmbodiment(def, cfg) {
    return [new DemoEmbodiment({
        id: 'demo',
        nick: cfg.nick ?? 'SeNARchy',
        channel: def.channel ?? cfg.channel ?? '##metta',
    })];
}

/* ── Public Factory ───────────────────────────────────────────────────── */

/**
 * Create and initialize a Bot in one call.
 * @param {object} config — merged config from mergeConfig() or loadConfig()
 * @returns {Promise<Bot>}
 */
export async function createBot(config) {
    const bot = new Bot(config);
    await bot.initialize();
    return bot;
}
