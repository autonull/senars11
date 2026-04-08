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
 *   node run.js --mode multi       — All embodiments enabled
 *   node run.js --host irc.example.com — Connect to real IRC server
 */

import { createBot } from './src/index.js';
import { loadConfig } from './src/config.js';
import { Logger } from '@senars/core';

let _mainRunning = false;

async function main() {
    if (_mainRunning) return;
    _mainRunning = true;

    let config;
    try {
        config = await loadConfig();
    } catch (err) {
        Logger.error('[Bot] Configuration failed:', err.message);
        process.exit(1);
    }

    try {
        const bot = await createBot(config);

        const shutdown = async (signal) => {
            Logger.info(`[Bot] Received ${signal}, shutting down...`);
            await bot.shutdown();
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        await bot.start();
    } catch (error) {
        Logger.error('[Bot] Fatal:', error.message);
        process.exit(1);
    }
}

main();
