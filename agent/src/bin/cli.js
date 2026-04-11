#!/usr/bin/env node

import React from 'react';
import {render} from 'ink';
import {Config, Logger} from '@senars/core';
import {App} from '../app/App.js';
import {TUI} from '../cli/components/TUI.js';
import {Command} from 'commander';
import {config as dotenvConfig} from 'dotenv';
import {dirname} from 'path';
import {fileURLToPath} from 'url';

// Load .env
dotenvConfig();

const program = new Command();
const __dirname = dirname(fileURLToPath(import.meta.url));

program
    .name('agent-cli')
    .description('SeNARS Agent CLI with Vercel AI SDK')
    .version('1.0.0')
    .option('-p, --provider <name>', 'AI Provider (openai, anthropic)')
    .option('-m, --model <name>', 'Model name')
    .option('--api-key <key>', 'API Key (overrides env)')
    .argument('[provider]', 'AI Provider')
    .argument('[model]', 'Model name')
    .action(async (providerArg, modelArg, options) => {
        // 1. Prefer Flags
        // 2. Fallback to Positional Args
        // 3. Fallback to Defaults
        const provider = options.provider || providerArg || 'dummy';
        const model = options.model || modelArg;

        // Propagate back to config
        options.provider = provider;
        options.model = model;


        // Setup Config
        const config = Config.parse();

        // Override config with CLI options
        if (options.provider) {
            config.lm = config.lm || {};
            config.lm.provider = options.provider;
            if (options.apiKey) {
                config.lm[options.provider] = {apiKey: options.apiKey};
            }
        }
        if (options.model) {
            config.lm.modelName = options.model;
        }

        const app = new App(config);
        const log = Logger;

        log.info('🤖 SeNARS Unified Agent CLI\n');
        log.info(`ℹ️ Provider: ${config.lm?.provider || 'default'}, Model: ${config.lm?.modelName || 'default'}`);

        try {
            log.info('🚀 Starting Agent...');
            const agent = await app.start({startAgent: false});
            log.info('✅ Agent ready. Launching TUI...');

            const {waitUntilExit} = render(React.createElement(TUI, {engine: agent, app: app}));
            await waitUntilExit();

            await app.shutdown();
            process.exit(0);

        } catch (error) {
            console.error('❌ Error starting Agent:', error);
            process.exit(1);
        }
    });

program.parse(process.argv);
