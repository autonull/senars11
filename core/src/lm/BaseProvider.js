import {EventEmitter} from 'events';

export class BaseProvider extends EventEmitter {
    constructor(config = {}) {
        super();
        this.id = config.id || this.constructor.name.toLowerCase();
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 100;
        this.config = config;
        this.eventBus = config.eventBus || null;
        this.debug = config.debug ?? false;
        this.loadTimeout = config.loadTimeout ?? 60000; // 60s default timeout for model loading
    }

    _emitDebug(message, data = {}) {
        if (this.debug && this.eventBus) {
            this.eventBus.emit('lm:debug', {
                provider: this.id,
                message,
                timestamp: Date.now(),
                ...data
            });
        }
    }

    _emitEvent(eventName, data = {}) {
        const payload = {
            provider: this.id,
            timestamp: Date.now(),
            ...data
        };

        // Emit locally for listeners on this provider
        this.emit(eventName, payload);

        // Emit to central event bus if configured
        if (this.eventBus) {
            this.eventBus.emit(eventName, payload);
        }
    }

    async _withTimeout(promise, timeoutMs, operation = 'operation') {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        return Promise.race([promise, timeoutPromise]);
    }

    async process(prompt, options = {}) {
        return typeof this.generateText === 'function'
            ? this.generateText(prompt, options)
            : prompt;
    }

    async generateHypothesis(observations, options = {}) {
        const observationsText = observations.join('\n');
        const prompt = `Based on these observations:\n${observationsText}\n\nGenerate a hypothesis about what might be happening:`;
        return this.process(prompt, options);
    }

    async streamText(prompt, options = {}) {
        throw new Error(`Streaming not implemented for ${this.constructor.name}. Implement in subclass.`);
    }

    getModelName() {
        return this.config.modelName || this.id;
    }
}