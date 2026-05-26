/**
 * CLIEmbodiment.js — stdin/stdout embodiment for MeTTaLoop
 *
 * Reads lines from stdin, emits them into the EmbodimentBus via emitMessage().
 * Receives responses via sendMessage() and writes to stdout.
 *
 * Usage:
 *   const cli = new CLIEmbodiment({ nick: 'SeNARchy' });
 *   agent.embodimentBus.register(cli);
 *   await cli.connect();  // starts reading stdin
 */
import { Embodiment } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';
import readline from 'readline';

export class CLIEmbodiment extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            id: config.id ?? 'cli',
            name: 'CLI',
            description: 'Command-line stdin/stdout interface',
            capabilities: ['text-input', 'text-output'],
            isPublic: false,
            isInternal: false,
        });
        this.type = 'cli';
        this._nick = config.nick ?? 'Bot';
        this._rl = null;
        this._inputClosed = false;
    }

    async connect() {
        if (!process.stdin.isTTY) {
            Logger.warn('[CLI] stdin is not a TTY — interactive mode may not work as expected');
        }

        this._rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        this.setStatus('connected');

        console.log(`\n${this._nick}: Online! Type messages or !help. Ctrl+C to exit.\n`);

        this._rl.on('line', (line) => {
            const content = line.trim();
            if (!content) return;
            if (content.toLowerCase() === 'quit' || content.toLowerCase() === 'exit') {
                this._inputClosed = true;
                this._rl.close();
                return;
            }
            this.emitMessage({
                from: 'user',
                content,
                metadata: { isPrivate: true, channel: 'cli' },
            });
        });

        this._rl.on('close', () => {
            this._inputClosed = true;
            Logger.info('[CLI] Input stream closed');
        });

        this.emit('connected', { nick: this._nick });
    }

    async disconnect() {
        this._inputClosed = true;
        if (this._rl && !this._rl.closed) {
            this._rl.close();
        }
        this.setStatus('disconnected');
    }

    async sendMessage(target, content) {
        // Always write to stdout regardless of connection status
        // (stdin may be closed while we still need to respond)
        console.log(`\n${this._nick}: ${content}\n${this._inputClosed ? '' : '> '}`);
        return true;
    }
}
