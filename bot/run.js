#!/usr/bin/env node

/**
 * SeNARS Bot — CLI Entry Point
 *
 * Thin wrapper over the Bot class. All logic is in src/index.js and src/config.js.
 *
 * Usage:
 *   node run.js                    — IRC mode (default, embedded server)
 *   node run.js --mode cli         — CLI mode (stdin/stdout)
 *   node run.js --mode demo        — Demo mode
 *   node run.js --mode multi       — All enabled embodiments
 *   node run.js --host irc.example.com — Connect to real IRC server
 */

import { createBot } from './src/index.js';
import { loadConfig, printHelp } from './src/config.js';
import { Logger } from '@senars/core';

async function main() {
    const args = process.argv.slice(2);

    // Handle --help before loading config
    if (args.includes('--help')) { printHelp(); process.exit(0); }

    const config = await loadConfig(args);

    // Handle --mode multi: enable all embodiments
    if (config.mode === 'multi' && config.embodiments) {
        for (const emb of Object.values(config.embodiments)) {
            if (emb.enabled !== false) emb.enabled = true;
        }
    }

    try {
        const bot = await createBot(config);

        // Graceful shutdown
        const shutdown = async (signal) => {
            Logger.info(`Received ${signal}, shutting down...`);
            await bot.shutdown();
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        await bot.start();
    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

if (process.argv[1]?.endsWith('run.js')) main();
export { createBot } from './src/index.js';
export { mergeConfig, parseArgs, loadConfig, DEFAULTS, DEFAULT_CONFIG_PATH } from './src/config.js';
