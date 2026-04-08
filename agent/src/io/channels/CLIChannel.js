/**
 * CLIChannel.js - Command Line Interface Channel
 * Provides interactive terminal-based communication.
 * Uses readline for input and supports colored output.
 * 
 * Phase 5: Updated to extend Embodiment for unified I/O abstraction
 */
import { Embodiment } from '../Embodiment.js';
import { Logger } from '@senars/core';
import * as readline from 'readline';

export class CLIChannel extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'CLI',
            description: config.description || 'Command-line interface',
            capabilities: config.capabilities || ['interactive', 'colored-output', 'history'],
            constraints: {},
            isPublic: false,
            isInternal: false,
            defaultSalience: config.defaultSalience ?? 0.8  // Higher salience for direct user input
        });
        
        this.type = 'cli';
        this.rl = null;
        this.inputQueue = [];
        this.waitingForInput = false;
        this.inputResolver = null;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 100;
        
        // Colors configuration
        this.colors = config.colors ?? true;
        this.colorScheme = config.colorScheme ?? {
            prompt: '\x1b[36m',    // Cyan
            user: '\x1b[32m',      // Green
            bot: '\x1b[35m',       // Magenta
            error: '\x1b[31m',     // Red
            info: '\x1b[33m',      // Yellow
            reset: '\x1b[0m'
        };
    }

    _colorize(text, color) {
        if (!this.colors) return text;
        return `${this.colorScheme[color] || ''}${text}${this.colorScheme.reset}`;
    }

    async connect() {
        if (this.status === 'connected') return;
        
        this.setStatus('connecting');

        try {
            // Create readline interface
            this.rl = readline.createInterface({
                input: config.inputStream ?? process.stdin,
                output: config.outputStream ?? process.stdout,
                prompt: this._colorize(`${this.config.prompt || 'senars> '} `, 'prompt'),
                historySize: this.maxHistory,
                completer: this._completer.bind(this),
                terminal: true
            });

            // Handle input
            this.rl.on('line', (line) => {
                this._handleInput(line);
            });

            this.rl.on('close', () => {
                Logger.info('[CLI] Input stream closed');
                this.emit('close');
            });

            // Handle SIGINT
            this.rl.on('SIGINT', () => {
                Logger.info('[CLI] SIGINT received');
                this.emit('sigint');
            });

            // Show prompt
            this.rl.prompt();
            
            this.setStatus('connected');
            this.emit('connected', { type: 'cli' });
            
            Logger.info('[CLI] Connected - Interactive terminal ready');
            
        } catch (error) {
            this.setStatus('error');
            throw error;
        }
    }

    _handleInput(line) {
        const trimmed = line.trim();

        // Add to history
        if (trimmed) {
            this.history.push(trimmed);
            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }
            this.historyIndex = this.history.length;
        }

        // Emit message event
        this.emitMessage({
            from: 'user',
            content: trimmed,
            metadata: {
                type: 'input',
                isPrivate: true
            }
        });

        // Resolve pending input promise if waiting
        if (this.waitingForInput && this.inputResolver) {
            this.inputResolver(trimmed);
            this.waitingForInput = false;
            this.inputResolver = null;
        }

        // Show prompt for next input
        if (this.status === 'connected') {
            this.rl.prompt();
        }
    }

    _completer(linePartial) {
        const commands = ['help', 'exit', 'quit', 'clear', 'history', 'status'];
        const hits = commands.filter(c => c.startsWith(linePartial.toLowerCase()));
        
        // Return completions
        return [hits.length ? hits : commands, linePartial];
    }

    async disconnect() {
        if (this.status === 'disconnected') return;
        
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        
        this.setStatus('disconnected');
        this.emit('disconnected');
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') {
            throw new Error('CLI not connected');
        }

        // Format output based on metadata
        let output;
        
        if (metadata.error) {
            output = this._colorize(`❌ ${content}`, 'error');
        } else if (metadata.action) {
            output = this._colorize(`* ${content} *`, 'info');
        } else if (metadata.from === 'bot' || metadata.isBotResponse) {
            output = this._colorize(`🤖 ${content}`, 'bot');
        } else if (metadata.system) {
            output = this._colorize(`ℹ️  ${content}`, 'info');
        } else {
            output = content;
        }

        // Add prefix if specified
        if (metadata.prefix) {
            output = `${metadata.prefix} ${output}`;
        }

        // Clear current line and write output
        if (this.rl.output) {
            readline.clearLine(this.rl.output, 0);
            readline.cursorTo(this.rl.output, 0);
            console.log(output);
            this.rl.prompt(true);
        }

        return true;
    }

    /**
     * Display a message without waiting for input
     */
    async display(content, options = {}) {
        return this.sendMessage('cli', content, {
            ...options,
            isBotResponse: true
        });
    }

    /**
     * Display an error message
     */
    async displayError(content) {
        return this.sendMessage('cli', content, { error: true });
    }

    /**
     * Display system info
     */
    async displayInfo(content) {
        return this.sendMessage('cli', content, { system: true });
    }

    /**
     * Prompt for input and wait for response
     */
    async promptInput(question) {
        if (this.status !== 'connected') {
            throw new Error('CLI not connected');
        }

        // Display question
        await this.sendMessage('cli', question, { prefix: this._colorize('?', 'info') });
        
        // Wait for input
        return new Promise((resolve) => {
            this.waitingForInput = true;
            this.inputResolver = resolve;
        });
    }

    /**
     * Clear the terminal screen
     */
    async clear() {
        if (this.rl.output) {
            readline.clearScreenDown(this.rl.output);
            readline.cursorTo(this.rl.output, 0, 0);
        }
        return true;
    }

    /**
     * Get command history
     */
    getHistory() {
        return [...this.history];
    }

    /**
     * Clear command history
     */
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
    }

    /**
     * Set custom prompt
     */
    setPrompt(prompt) {
        if (this.rl) {
            this.rl.setPrompt(this._colorize(`${prompt} `, 'prompt'));
        }
    }

    /**
     * Enable/disable colors
     */
    setColors(enabled) {
        this.colors = enabled;
    }
}
