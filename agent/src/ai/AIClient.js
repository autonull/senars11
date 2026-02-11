import {generateObject, generateText, streamText} from 'ai';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';
import {createOllama} from 'ollama-ai-provider';
import {TransformersJSProvider} from '@senars/core/src/lm/TransformersJSProvider.js';
import {WebLLMProvider} from '@senars/core/src/lm/WebLLMProvider.js';

export class AIClient {
    constructor(config = {}) {
        this.config = config;
        this.providers = new Map();
        this.modelInstances = new Map();
        const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
        this.defaultProvider = config.provider || config.lm?.provider || (isBrowser ? 'webllm' : 'transformers');
        this.defaultModel = config.model || config.modelName || config.lm?.modelName;
        this._initializeProviders(config);
    }

    static _extractPrompt(options) {
        if (typeof options.prompt === 'string') return options.prompt;
        if (Array.isArray(options.prompt)) {
            return options.prompt.map(msg => {
                if (typeof msg === 'string') return msg;
                if (msg.content) return msg.content;
                if (msg.text) return msg.text;
                if (Array.isArray(msg.content)) {
                    return msg.content.map(c => c.text || '').join('');
                }
                return JSON.stringify(msg);
            }).join('\n');
        }
        return String(options.prompt || '');
    }

    _initializeProviders(config) {
        if (config.openai?.apiKey || process.env.OPENAI_API_KEY) {
            const openai = createOpenAI({
                apiKey: config.openai?.apiKey || process.env.OPENAI_API_KEY,
                compatibility: 'strict',
            });
            this.providers.set('openai', (modelName) => openai(modelName || 'gpt-4o'));
        }

        if (config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) {
            const anthropic = createAnthropic({
                apiKey: config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
            });
            this.providers.set('anthropic', (modelName) => anthropic(modelName || 'claude-3-5-sonnet-20241022'));
        }

        const ollamaBaseURL = config.ollama?.baseURL || config.baseURL || 'http://localhost:11434';
        const ollama = createOllama({baseURL: ollamaBaseURL});
        this.providers.set('ollama', (modelName) => ollama(modelName || 'llama3.2'));

        this.providers.set('transformers', (modelName) => this._createTransformersModel(modelName));
        this.providers.set('webllm', (modelName) => this._createWebLLMModel(modelName));
    }

    _createWebLLMModel(modelName) {
        const effectiveModel = modelName || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        const cacheKey = `webllm:${effectiveModel}`;

        if (!this.modelInstances.has(cacheKey)) {
            this.modelInstances.set(cacheKey, new WebLLMProvider({
                modelName: effectiveModel
            }));
        }
        const provider = this.modelInstances.get(cacheKey);

        return {
            specificationVersion: 'v2',
            provider: 'webllm',
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                const prompt = AIClient._extractPrompt(options);
                const text = await provider.generateText(prompt, {
                    temperature: options.temperature ?? 0.7,
                    maxTokens: options.maxTokens ?? 256
                });

                const responseText = text || '';

                return {
                    text: responseText,
                    content: [{type: 'text', text: responseText}],
                    finishReason: 'stop',
                    usage: {
                        promptTokens: 0,
                        completionTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0
                    },
                    rawCall: {rawPrompt: prompt, rawSettings: {}},
                    toolCalls: [],
                    warnings: [],
                    logprobs: undefined
                };
            },

            async doStream(options) {
                const prompt = AIClient._extractPrompt(options);
                const controller = new TransformableStream();

                (async () => {
                    try {
                        const stream = provider.streamText(prompt, {
                            temperature: options.temperature ?? 0.7,
                            maxTokens: options.maxTokens ?? 256
                        });

                        for await (const chunk of stream) {
                            controller.enqueue({type: 'text-delta', textDelta: chunk});
                        }

                        controller.enqueue({
                            type: 'finish',
                            finishReason: 'stop',
                            usage: {promptTokens: 0, completionTokens: 0, inputTokens: 0, outputTokens: 0}
                        });
                        controller.close();
                    } catch (error) {
                        controller.error(error);
                    }
                })();

                return {
                    stream: controller.readable,
                    rawCall: {rawPrompt: prompt, rawSettings: {}},
                    warnings: []
                };
            }
        };
    }

    _createTransformersModel(modelName) {
        const effectiveModel = modelName || 'Xenova/t5-small';
        const cacheKey = `transformers:${effectiveModel}`;

        if (!this.modelInstances.has(cacheKey)) {
            this.modelInstances.set(cacheKey, new TransformersJSProvider({
                modelName: effectiveModel,
                loadTimeout: 120000
            }));
        }
        const provider = this.modelInstances.get(cacheKey);

        return {
            specificationVersion: 'v2', // COMPATIBILITY: Must be v2 for AI SDK 5.0+
            provider: 'transformers-js',
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                const prompt = AIClient._extractPrompt(options);
                const text = await provider.generateText(prompt, {
                    temperature: options.temperature ?? 0.7,
                    maxTokens: options.maxTokens ?? 256
                });

                const responseText = text || '';

                return {
                    text: responseText,
                    // COMPATIBILITY: internal SDK processing requires content array
                    content: [{type: 'text', text: responseText}],
                    finishReason: 'stop',
                    usage: {
                        promptTokens: 0,
                        completionTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0
                    },
                    rawCall: {rawPrompt: prompt, rawSettings: {}},
                    toolCalls: [],
                    warnings: [],
                    logprobs: undefined
                };
            },

            async doStream(options) {
                const prompt = AIClient._extractPrompt(options);
                const controller = new TransformableStream();

                (async () => {
                    try {
                        const text = await provider.generateText(prompt, {
                            temperature: options.temperature ?? 0.7,
                            maxTokens: options.maxTokens ?? 256
                        });
                        controller.enqueue({type: 'text-delta', textDelta: text || ''});
                        controller.enqueue({
                            type: 'finish',
                            finishReason: 'stop',
                            usage: {promptTokens: 0, completionTokens: 0, inputTokens: 0, outputTokens: 0}
                        });
                        controller.close();
                    } catch (error) {
                        controller.error(error);
                    }
                })();

                return {
                    stream: controller.readable,
                    rawCall: {rawPrompt: prompt, rawSettings: {}},
                    warnings: []
                };
            }
        };
    }

    getModel(providerName, modelName) {
        const effectiveProvider = providerName || this.defaultProvider;
        const effectiveModel = modelName || this.defaultModel;

        const factory = this.providers.get(effectiveProvider);
        if (!factory) {
            throw new Error(`Provider '${effectiveProvider}' not found`);
        }
        return factory(effectiveModel);
    }

    async generate(prompt, options = {}) {
        const model = this.getModel(options.provider, options.model);
        return generateText({model, prompt, ...options});
    }

    async stream(prompt, options = {}) {
        const model = this.getModel(options.provider, options.model);
        return streamText({model, prompt, ...options});
    }

    async generateObject(prompt, schema, options = {}) {
        const model = this.getModel(options.provider, options.model);
        return generateObject({model, schema, prompt, ...options});
    }

    async destroy() {
        for (const [key, instance] of this.modelInstances) {
            if (instance.destroy) await instance.destroy();
        }
        this.modelInstances.clear();
    }
}

class TransformableStream {
    constructor() {
        const self = this;
        this.readable = new ReadableStream({
            start(controller) {
                self._controller = controller;
            }
        });
    }

    enqueue(chunk) {
        this._controller?.enqueue(chunk);
    }

    close() {
        this._controller?.close();
    }

    error(err) {
        this._controller?.error(err);
    }
}
