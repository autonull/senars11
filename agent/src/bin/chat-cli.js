#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { Agent } from '../Agent.js';
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

const COLORS = { cyan: '\x1b[36m', green: '\x1b[32m', magenta: '\x1b[35m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' };
const color = (text, c) => `${COLORS[c] ?? ''}${text}${COLORS.reset}`;

async function main() {
    const args = process.argv.slice(2);
    const useDummy = args.includes('--provider') && args[args.indexOf('--provider') + 1] === 'dummy';

    const agentConfig = useDummy
        ? { lm: DUMMY_PROVIDER, capabilities: { mettaControlPlane: false }, profile: 'minimal' }
        : await loadAgentConfig();

    const agent = new Agent(agentConfig);
    await agent.initialize();

    Logger.info(color('[chat-cli] Ready. Type messages or /quit to exit.', 'green'));

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const prompt = () => rl.question(color('senars> ', 'cyan'), handleInput);

    agent.embodimentBus.on('message', async (msg) => {
        const text = msg.content ?? '';
        if (text.startsWith('[user@')) return;
        process.stdout.write('\r\x1b[K');
        console.log(color('🤖', 'magenta'), text);
        prompt();
    });

    async function handleInput(line) {
        const trimmed = line.trim();
        if (!trimmed) { prompt(); return; }
        if (trimmed === '/quit' || trimmed === '/exit') {
            Logger.info(color('[chat-cli] Goodbye.', 'yellow'));
            await agent.shutdown();
            rl.close();
            process.exit(0);
        }

        try {
            const response = await agent.processInput(trimmed);
            if (response) {
                process.stdout.write('\r\x1b[K');
                console.log(color('🤖', 'magenta'), response);
            }
        } catch (err) {
            Logger.error('[chat-cli]', err.message);
            process.stdout.write('\r\x1b[K');
            console.log(color('❌', 'red'), `Error: ${err.message}`);
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
    console.error(color('[chat-cli] Fatal:', 'red'), err.message);
    process.exit(1);
});
