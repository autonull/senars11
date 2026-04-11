#!/usr/bin/env node

/**
 * SeNARS Bot 2.0 — CLI Entry Point
 *
 * Usage:
 *   node run.js                    — IRC mode (default, embedded server)
 *   node run.js --mode cli         — CLI mode (stdin/stdout)
 *   node run.js --profile minimal  — Minimal profile
 *   node run.js --host irc.example.com — Connect to real IRC server
 */

import { Logger } from '@senars/core';
import { createBot } from './src/index.js';
import { loadConfig } from './src/config.js';

let _mainRunning = false;

async function main() {
    if (_mainRunning) {
        return;
    }
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
