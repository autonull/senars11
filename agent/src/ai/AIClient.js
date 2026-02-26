import {generateObject, generateText, streamText} from 'ai';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';
import {createOllama} from 'ollama-ai-provider';
import {TransformersJSProvider} from '../../../core/src/lm/TransformersJSProvider.js';
import {WebLLMProvider} from '../../../core/src/lm/WebLLMProvider.js';
import {DummyProvider} from '../../../core/src/lm/DummyProvider.js';

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
        this.providers.set('dummy', (modelName) => this._createDummyModel(modelName));
    }

    _createAIProviderAdapter(provider, effectiveModel) {
        return {
            specificationVersion: 'v1',
            provider: provider.constructor.name,
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                const prompt = AIClient._extractPrompt(options);
                let result;

                // Support both generate (WebLLM) and generateText (Transformers/Dummy)
                // Also WebLLM supports tools, others might not yet fully
                if (typeof provider.generate === 'function') {
                    result = await provider.generate(prompt, {
                        temperature: options.temperature ?? 0.7,
                        maxTokens: options.maxTokens ?? 256,
                        tools: options.tools,
                        toolChoice: options.toolChoice
                    });
                } else {
                     const text = await provider.generateText(prompt, {
                        temperature: options.temperature ?? 0.7,
                        maxTokens: options.maxTokens ?? 256
                    });
                    result = { text };
                }

                const responseText = result.text || '';
                const toolCalls = (result.toolCalls || []).map(tc => ({
                    toolCallId: tc.id,
                    toolName: tc.function.name,
                    args: tc.function.arguments
                }));

                const content = [{type: 'text', text: responseText}];
                if (toolCalls.length > 0) {
                    toolCalls.forEach(tc => {
                        content.push({
                            type: 'tool-call',
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            args: tc.args
                        });
                    });
                }

                return {
                    text: responseText,
                    // COMPATIBILITY: internal SDK processing requires content array
                    content: content,
                    finishReason: result.finishReason || 'stop',
                    usage: result.usage || {
                        promptTokens: prompt.length,
                        completionTokens: responseText.length,
                        inputTokens: prompt.length,
                        outputTokens: responseText.length
                    },
                    rawCall: {rawPrompt: prompt, rawSettings: {}},
                    toolCalls: toolCalls,
                    warnings: [],
                    logprobs: undefined
                };
            },

            async doStream(options) {
                const prompt = AIClient._extractPrompt(options);
                const controller = new TransformableStream();

                (async () => {
                    try {
                        let stream;
                        if (typeof provider.streamText === 'function') {
                            stream = provider.streamText(prompt, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                        } else {
                            // Fallback if no streaming supported: generate full text and stream it as one chunk
                             const text = await provider.generateText(prompt, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                            stream = (async function*() { yield text; })();
                        }

                        // Handle both AsyncIterable (stream) and Promise (fallback) if implementation varies
                        // But here we ensured stream is iterable or generator
                        if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
                             for await (const chunk of stream) {
                                controller.enqueue({type: 'text-delta', textDelta: chunk});
                            }
                        } else {
                            // Should not happen with current logic, but safe fallback
                             const text = await stream;
                             controller.enqueue({type: 'text-delta', textDelta: text});
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

    _createDummyModel(modelName) {
        const effectiveModel = modelName || 'dummy-model';
        const cacheKey = `dummy:${effectiveModel}`;

        if (!this.modelInstances.has(cacheKey)) {
            this.modelInstances.set(cacheKey, new DummyProvider({
                ...this.config,
                modelName: effectiveModel
            }));
        }
        return this._createAIProviderAdapter(this.modelInstances.get(cacheKey), effectiveModel);
    }

    _createWebLLMModel(modelName) {
        const effectiveModel = modelName || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        const cacheKey = `webllm:${effectiveModel}`;

        if (!this.modelInstances.has(cacheKey)) {
            this.modelInstances.set(cacheKey, new WebLLMProvider({
                modelName: effectiveModel
            }));
        }
        return this._createAIProviderAdapter(this.modelInstances.get(cacheKey), effectiveModel);
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
        return this._createAIProviderAdapter(this.modelInstances.get(cacheKey), effectiveModel);
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
