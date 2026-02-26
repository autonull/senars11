import {BaseProvider} from './BaseProvider.js';

export class DummyProvider extends BaseProvider {
    constructor(options = {}) {
        super(options);
        this.id = options.id || 'dummy';
        this.latency = options.latency || 0;
        this.responseTemplate = options.responseTemplate || 'Response to: {prompt}';
        this.mockResponses = options.mockResponses || {};
    }

    async generateText(prompt, options = {}) {
        if (this.latency > 0) {
            await new Promise(resolve => setTimeout(resolve, this.latency));
        }

        if (this.mockResponses && this.mockResponses[prompt]) {
            return this.mockResponses[prompt];
        }

        return this.responseTemplate.replace('{prompt}', prompt);
    }

    async invoke(prompt) {
        return this.generateText(prompt);
    }

    async* streamText(prompt, options = {}) {
        const text = await this.generateText(prompt, options);
        const chunkSize = 5;
        for (let i = 0; i < text.length; i += chunkSize) {
            yield text.slice(i, i + chunkSize);
            if (this.latency > 0) await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    async generateEmbedding(text) {
        if (this.latency > 0) {
            await new Promise(resolve => setTimeout(resolve, this.latency));
        }
        return Array.from({length: 16}, (_, i) => Math.sin(text.charCodeAt(i % text.length) + i));
    }
}
