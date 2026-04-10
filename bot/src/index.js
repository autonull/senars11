/**
 * SeNARS Bot 2.0 — Thin Runtime
 *
 * Programmatic API:
 *   import { createBot } from '@senars/bot';
 *   const bot = await createBot(config);
 *   await bot.start();
 */

import { Agent } from '@senars/agent';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';
import { EmbeddedIRCServer } from './EmbeddedIRCServer.js';

export async function createBot(config) {
    const agent = new Agent(config);
    await agent.initialize();

    const ircCfg = config.embodiments?.irc;
    if (ircCfg?.enabled && !ircCfg.host) {
        const server = new EmbeddedIRCServer(ircCfg.port, ircCfg.tls);
        await server.start();
        ircCfg.host = '127.0.0.1';
        ircCfg.port = server.port;
    }

    for (const [type, embCfg] of Object.entries(config.embodiments ?? {})) {
        if (!embCfg.enabled) {
            continue;
        }
        const emb = await createEmbodiment(type, embCfg, agent);
        if (emb) {
            await agent.embodimentBus.register(emb);
        }
    }

    return {
        agent,
        start: () => agent.startMeTTaLoop(),
        shutdown: () => agent.shutdown(),
        get status() {
            return {
                profile: config.profile,
                nick: config.nick,
                embodiments: Object.fromEntries(
                    Object.entries(config.embodiments ?? {})
                        .filter(([, v]) => v.enabled)
                        .map(([k]) => [k, { status: 'active' }])
                ),
            };
        },
    };
}

function createEmbodiment(type, cfg, agent) {
    switch (type) {
        case 'irc': return new IRCChannel(cfg, agent);
        case 'cli': return new CLIEmbodiment(cfg, agent);
        case 'demo': return new DemoEmbodiment(cfg, agent);
        default: return null;
    }
}
