#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { Agent } from '../Agent.js';
import { CLIChannel } from '../io/channels/CLIChannel.js';
import { Logger } from '@senars/core';

const __dir = dirname(fileURLToPath(import.meta.url));

const DUMMY_PROVIDER = {
    provider: 'dummy',
    modelName: 'dummy',
    generate: async (ctx) => ({
        text: `[dummy] I received: ${(ctx ?? '').slice(0, 80)}${(ctx ?? '').length > 80 ? '...' : ''}`,
        model: 'dummy',
        usage: { promptTokens: 0, completionTokens: 0 }
    })
};

async function main() {
    const args = process.argv.slice(2);
    const useDummy = args.includes('--provider') && args[args.indexOf('--provider') + 1] === 'dummy';

    const agentConfig = useDummy
        ? { lm: DUMMY_PROVIDER, capabilities: { mettaControlPlane: false }, profile: 'minimal' }
        : await loadAgentConfig();

    const agent = new Agent(agentConfig);
    await agent.initialize();

    const cli = new CLIChannel({ prompt: 'senars> ' });
    agent.embodimentBus.register(cli);
    await cli.connect();

    Logger.info('[chat-cli] Ready. Type messages or /quit to exit.');

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const prompt = () => rl.question('senars> ', handleInput);

    async function handleInput(line) {
        const trimmed = line.trim();
        if (!trimmed) { prompt(); return; }
        if (trimmed === '/quit' || trimmed === '/exit') {
            Logger.info('[chat-cli] Goodbye.');
            await cli.disconnect();
            await agent.shutdown();
            rl.close();
            process.exit(0);
        }

        try {
            const response = await agent.processInput(trimmed);
            await cli.sendMessage('user', response ?? '(no response)', { isBotResponse: true });
        } catch (err) {
            Logger.error('[chat-cli]', err.message);
            await cli.sendMessage('user', `Error: ${err.message}`, { error: true });
        }
        prompt();
    }

    prompt();
}

async function loadAgentConfig() {
    try {
        const raw = await readFile(resolve(__dir, '../../workspace/agent.json'), 'utf8');
        const cfg = JSON.parse(raw);
        return { ...cfg, lm: cfg.lm ?? { provider: 'openai', modelName: 'gpt-4o-mini' } };
    } catch {
        Logger.warn('[chat-cli] No agent.json found, using defaults.');
        return { profile: 'parity', capabilities: {}, lm: { provider: 'openai', modelName: 'gpt-4o-mini' } };
    }
}

main().catch(err => {
    console.error('[chat-cli] Fatal:', err.message);
    process.exit(1);
});
