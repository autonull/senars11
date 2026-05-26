import {Logger} from '@senars/core';

export class OllamaClient {
    constructor(config = {}) {
        this.baseURL = config.baseURL || 'http://localhost:11434';
        this.model = config.model || 'llama3.2';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 512;
    }

    async generate(prompt, options = {}) {
        const messages = this._normalizeMessages(prompt);
        const payload = {
            model: options.model || this.model,
            messages,
            stream: false,
            options: {
                temperature: options.temperature ?? this.temperature,
                num_predict: options.maxTokens ?? this.maxTokens
            }
        };

        try {
            const response = await fetch(`${this.baseURL}/api/chat`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();
            return {
                text: result.message?.content || '',
                done: result.done,
                totalDuration: result.total_duration,
                loadDuration: result.load_duration
            };
        } catch (error) {
            Logger.error('Ollama generate error:', error);
            throw error;
        }
    }

    async* stream(prompt, options = {}) {
        const messages = this._normalizeMessages(prompt);
        const payload = {
            model: options.model || this.model,
            messages,
            stream: true,
            options: {
                temperature: options.temperature ?? this.temperature,
                num_predict: options.maxTokens ?? this.maxTokens
            }
        };

        try {
            const response = await fetch(`${this.baseURL}/api/chat`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const {done, value} = await reader.read();
                if (done) {
                    break;
                }
                const lines = decoder.decode(value).split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.message?.content) {
                            yield parsed.message.content;
                        }
                        if (parsed.done) {
                            return;
                        }
                    } catch { /* skip invalid JSON */
                    }
                }
            }
        } catch (error) {
            Logger.error('Ollama stream error:', error);
            throw error;
        }
    }

    _normalizeMessages(prompt) {
        if (Array.isArray(prompt)) {
            return prompt;
        }
        if (typeof prompt === 'string') {
            return [{role: 'user', content: prompt}];
        }
        if (prompt.messages && Array.isArray(prompt.messages)) {
            return prompt.messages;
        }
        return [{role: 'user', content: String(prompt)}];
    }

    async isAvailable() {
        try {
            const response = await fetch(`${this.baseURL}/api/tags`, {method: 'GET', timeout: 5000});
            return response.ok;
        } catch {
            return false;
        }
    }

    async listModels() {
        try {
            const response = await fetch(`${this.baseURL}/api/tags`);
            const result = await response.json();
            return result.models || [];
        } catch {
            return [];
        }
    }
}
