/**
 * DemoEmbodiment.js — scripted message embodiment for demos
 *
 * Emits a predefined sequence of messages into the EmbodimentBus.
 * Receives responses via sendMessage() and logs them.
 *
 * Usage:
 *   const demo = new DemoEmbodiment({ nick: 'SeNARchy', messages: [...] });
 *   agent.embodimentBus.register(demo);
 *   await demo.connect();  // starts emitting messages
 */
import { Embodiment } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';

export class DemoEmbodiment extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            id: config.id ?? 'demo',
            name: 'Demo',
            description: 'Scripted demo message embodiment',
            capabilities: ['text-input', 'text-output'],
            isPublic: false,
            isInternal: false,
        });
        this.type = 'demo';
        this._nick = config.nick ?? 'Bot';
        this._messages = config.messages ?? DEFAULT_MESSAGES;
        this._channel = config.channel ?? 'demo';
        this._running = false;
    }

    async connect() {
        this.setStatus('connected');
        this._running = true;

        console.log('\n── Demo Session ──────────────────────────────');

        for (const msg of this._messages) {
            if (!this._running) break;
            setTimeout(() => {
                if (!this._running) return;
                Logger.info(`  ${msg.from}: ${msg.content}`);
                this.emitMessage({
                    from: msg.from,
                    content: msg.content,
                    metadata: { isPrivate: false, channel: this._channel },
                });
            }, msg.delay);
        }

        const lastDelay = this._messages[this._messages.length - 1]?.delay ?? 0;
        setTimeout(() => {
            if (this._running) {
                console.log('── Demo Complete ─────────────────────────────');
                this.disconnect();
            }
        }, lastDelay + 3000);

        this.emit('connected', { nick: this._nick });
        Logger.info('✅ Demo embodiment running.');
    }

    async disconnect() {
        this._running = false;
        this.setStatus('disconnected');
    }

    async sendMessage(target, content) {
        if (this.status !== 'connected') return false;
        console.log(`\n  ${this._nick}: ${content}\n`);
        return true;
    }
}

const DEFAULT_MESSAGES = [
    { from: 'Alice', content: 'Hi there!', delay: 1000 },
    { from: 'Alice', content: 'What can you help me with?', delay: 3000 },
    { from: 'Bob', content: '!help', delay: 5000 },
    { from: 'Bob', content: '!context', delay: 7000 },
    { from: 'Alice', content: 'Tell me something interesting.', delay: 9000 },
];
