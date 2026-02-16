#!/usr/bin/env node

import React from 'react';
import {render} from 'ink';
import {Config} from '../app/Config.js';
import {App} from '../app/App.js';
import {TUI} from './components/TUI.js';

class Repl {
    constructor() {
        this.config = Config.parse();
        this.app = new App(this.config);
        this.inkInstance = null;
    }

    async start() {
        this.log.info('🤖 SeNARS Unified Agent REPL - Hybrid Intelligence Lab\n');

        if (!this.config.lm.enabled && !this.config.demo) {
            this.log.info('ℹ️ LM not enabled. Use --provider <name> --modelName <name> to enable Agent capabilities.');
        } else if (this.config.lm.enabled) {
            this.log.info(`ℹ️ LM Enabled: Provider=${this.config.lm.provider}, Model=${this.config.lm.modelName}`);
        }

        this.log.info('🚀 Starting REPL engine...\n');
        const agent = await this.app.start({ startAgent: false });
        this.log.info('✅ Engine ready. Rendering UI...');

        this.inkInstance = render(React.createElement(TUI, { engine: agent, app: this.app }));
    }

    async shutdown() {
        this.inkInstance?.unmount();
        await this.app.shutdown();
        this.log.info('\n👋 Agent REPL session ended.');
    }
}

async function main() {
    const repl = new Repl();

    try {
        await repl.start();
    } catch (error) {
        console.error('❌ Error starting Agent REPL:', {error: error.message, stack: error.stack});
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
