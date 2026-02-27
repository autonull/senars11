#!/usr/bin/env node

/**
 * ChatBot Demo
 * Starts the SeNARS Agent with the MettaClaw parity script.
 */

import { Agent } from '../Agent.js';
import { Logger } from '@senars/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    Logger.info('🤖 Starting SeNARS ChatBot Demo...');

    // Path to the parity verification script
    const parityScriptPath = join(__dirname, '../../demo/mettaclaw_parity.metta');

    // Load script content
    let scriptContent;
    try {
        scriptContent = await fs.readFile(parityScriptPath, 'utf8');
    } catch (error) {
        Logger.error(`Failed to load script from ${parityScriptPath}:`, error);
        process.exit(1);
    }

    // Initialize Agent with Channel Support
    // We can pass dummy config for channels to ensure they initialize even without env vars
    const agent = new Agent({
        id: 'chatbot-demo',
        channelConfigPath: join(__dirname, '../../config/channels.json'), // Optional
        lm: { provider: 'dummy' }, // Use dummy LM for demo
        inputProcessing: { enableNarseseFallback: true }
    });

    await agent.initialize();
    Logger.info('✅ Agent initialized.');

    // Run the MeTTa script
    if (agent.metta) {
        Logger.info('📜 Running MeTTa Parity Script...');
        try {
            const result = agent.metta.run(scriptContent);
            Logger.info('Script Result:', result.toString());
        } catch (error) {
            Logger.error('Error running MeTTa script:', error);
        }
    } else {
        Logger.error('❌ MeTTa interpreter not available on Agent.');
    }

    // Keep alive for event handling demo
    Logger.info('👂 Listening for events (Press Ctrl+C to exit)...');

    // Simulate incoming message after a delay to test event handler
    setTimeout(async () => {
        Logger.info('--- Simulating Incoming Message ---');
        // We can simulate via ChannelManager if we exposed it, or just let it sit.
        // For demo purposes, we can manually trigger if we want to see the effect of `on-event`.
        // Since we don't have a real IRC server connected in this demo environment,
        // we can inject a mock message into the channel manager if we access it.

        if (agent.channelManager) {
            // Register a mock channel to simulate input
            const { Channel } = await import('../io/Channel.js');
            class MockLoopback extends Channel {
                constructor() { super({id: 'irc'}); this.type = 'irc'; this.status='connected'; }
                async sendMessage(t, c) { Logger.info(`[MockIRC] Sending: ${c} to ${t}`); return true; }
                async connect() {}
                async disconnect() {}
            }

            const mock = new MockLoopback();
            // We need to force register it, possibly overriding the real one if it failed to connect
            // Or just use a different ID.
            // The script listens to "irc", so we should try to use that ID.
            try {
                // If real IRC failed, ID might be free or taken.
                // ChannelManager checks for duplicates.
                if (!agent.channelManager.get('irc')) {
                    agent.channelManager.register(mock);
                } else {
                    Logger.warn('IRC channel already registered (real connection?), skipping mock injection.');
                }
            } catch (e) {}

            const irc = agent.channelManager.get('irc');
            if (irc) {
                irc.emitMessage('TestUser', 'Hello from the outside!');
            }
        }
    }, 3000);
}

main().catch(err => {
    Logger.error('Fatal Error:', err);
    process.exit(1);
});
