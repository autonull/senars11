import {generateObject, generateText, streamText} from 'ai';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';
import {OllamaClient} from './OllamaClient.js';
import {TransformersJSProvider, WebLLMProvider, DummyProvider} from '@senars/core';

export class AIClient {
    constructor(config = {}) {
        this.config = config;
        this.providers = new Map();
        this.modelInstances = new Map();
        const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
        this.defaultProvider = config.provider || config.lm?.provider || (isBrowser ? 'webllm' : 'transformers');
        this.defaultModel = config.model || config.modelName || config.lm?.modelName || 'HuggingFaceTB/SmolLM2-1.7B-Instruct';
        this._initializeProviders(config);
    }

    static _extractMessage(msg) {
        if (typeof msg === 'string') {return msg;}
        if (msg.content) {
            if (typeof msg.content === 'string') {return msg.content;}
            if (Array.isArray(msg.content)) {return msg.content.map(c => c.text || '').join('');}
        }
        if (msg.text) {return msg.text;}
        return JSON.stringify(msg);
    }

    static _extractPrompt(options) {
        const messages = options.messages ?? (Array.isArray(options.prompt) ? options.prompt : null);
        if (messages) {
            return messages.map(AIClient._extractMessage).join('\n');
        }
        return String(options.prompt ?? '');
    }

    #resolveArgs(prompt, options = {}) {
        const model = this.getModel(options.provider || prompt?.provider, options.model || prompt?.model);
        const args = { model, ...options };
        if (Array.isArray(prompt)) {args.messages = prompt;}
        else if (typeof prompt === 'string') {args.prompt = prompt;}
        else if (prompt?.messages) {args.messages = prompt.messages;}
        else if (prompt?.prompt && Array.isArray(prompt.prompt)) {args.messages = prompt.prompt;}
        else if (prompt?.prompt) {args.prompt = prompt.prompt;}
        if (args.tools && Object.keys(args.tools).length === 0) {delete args.tools;}
        return args;
    }

    _initializeProviders(config) {
        // OpenAI-compatible endpoint (llama.cpp server, vLLM, etc.)
        const openaiBaseURL = config.openai?.baseURL || config.baseURL;
        const openaiApiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY || 'sk-dummy';
        if (openaiBaseURL) {
            const openai = createOpenAI({
                apiKey: openaiApiKey,
                baseURL: openaiBaseURL,
                compatibility: 'compatible',
            });
            this.providers.set('openai', (modelName) => openai(modelName || 'default'));
        } else if (config.openai?.apiKey || process.env.OPENAI_API_KEY) {
            const openai = createOpenAI({
                apiKey: openaiApiKey,
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

        // Ollama provider with v2 spec wrapper
        const ollamaBaseURL = config.ollama?.baseURL || config.baseURL || 'http://localhost:11434';
        this.providers.set('ollama', (modelName) => this._createOllamaModel(ollamaBaseURL, modelName || 'llama3.2'));

        this.providers.set('transformers', (modelName) => this._createTransformersModel(modelName));
        this.providers.set('webllm', (modelName) => this._createWebLLMModel(modelName));
        this.providers.set('dummy', (modelName) => this._createDummyModel(modelName));
    }

_createOllamaModel(baseURL, modelName) {
    const client = new OllamaClient({ baseURL, model: modelName });
    return this._createOllamaAdapter(client, modelName);
}

_createOllamaAdapter(client, modelName) {
    const effectiveModel = modelName || 'llama3.2';
    const cacheKey = `ollama:${effectiveModel}`;

    if (!this.modelInstances.has(cacheKey)) {
        this.modelInstances.set(cacheKey, client);
    }

    return {
        specificationVersion: 'v2',
        provider: 'OllamaClient',
        modelId: effectiveModel,
        defaultObjectGenerationMode: undefined,

        async doGenerate(options) {
            const prompt = AIClient._extractPrompt(options);
            try {
                const result = await client.generate(prompt, {
                    temperature: options.temperature ?? 0.7,
                    maxTokens: options.maxTokens ?? 256
                });
                return {
                    text: result.text,
                    content: [{ type: 'text', text: result.text }],
                    finishReason: result.done ? 'stop' : 'length',
                    usage: {
                        promptTokens: prompt.length,
                        completionTokens: result.text.length
                    },
                    rawResponse: { headers: {} }
                };
            } catch (error) {
                return {
                    text: '',
                    content: [{ type: 'text', text: '' }],
                    finishReason: 'error',
                    usage: { promptTokens: 0, completionTokens: 0 },
                    rawResponse: { headers: {} },
                    warnings: [`Ollama error: ${error.message}`]
                };
            }
        },

        async doStream(options) {
            const prompt = AIClient._extractPrompt(options);
            const controller = new TransformableStream();

            try {
                for await (const chunk of client.stream(prompt, {
                    temperature: options.temperature ?? 0.7,
                    maxTokens: options.maxTokens ?? 256
                })) {
                    controller.enqueue({ type: 'text-delta', textDelta: chunk });
                }
                controller.enqueue({
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { promptTokens: 0, completionTokens: 0 }
                });
            } catch (error) {
                controller.error(error);
            }

            return {
                stream: controller.readable,
                rawCall: { rawPrompt: prompt, rawSettings: {} }
            };
        }
    };
}

    _createAIProviderAdapter(provider, effectiveModel) {
        return {
            specificationVersion: 'v2',
            provider: provider.constructor.name,
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                const {prompt} = options;
                const promptText = AIClient._extractPrompt(options);
                const promptMessages = Array.isArray(prompt) ? prompt : null;

                let result;
                if (typeof provider.generate === 'function') {
                    result = await provider.generate(promptMessages || promptText, {
                        temperature: options.temperature ?? 0.7,
                        maxTokens: options.maxTokens ?? 256,
                        tools: options.tools,
                        toolChoice: options.toolChoice
                    });
                } else {
                    const text = await provider.generateText(promptMessages || promptText, {
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
                    content,
                    finishReason: result.finishReason || 'stop',
                    usage: result.usage || {
                        promptTokens: promptText.length,
                        completionTokens: responseText.length,
                        inputTokens: promptText.length,
                        outputTokens: responseText.length
                    },
                    rawResponse: { headers: {} },
                    toolCalls,
                    warnings: [],
                };
            },

            async doStream(options) {
                const promptText = AIClient._extractPrompt(options);
                const {prompt} = options;
                const promptMessages = Array.isArray(prompt) ? prompt : null;

                const input = promptMessages || promptText;
                const controller = new TransformableStream();
                await (async () => {
                    try {
                        let stream;
                        if (typeof provider.streamText === 'function') {
                            stream = provider.streamText(input, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                        } else {
                            const text = await provider.generateText(input, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                            stream = (async function* () {
                                yield text;
                            })();
                        }
                        if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
                            for await (const chunk of stream) {
                                controller.enqueue({type: 'text-delta', textDelta: chunk});
                            }
                        } else {
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
                    rawCall: {rawPrompt: promptText, rawSettings: {}},
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

        const provider = this.modelInstances.get(cacheKey);

        // V2 Spec Implementation
        // I am explicitly setting it to 'v2' now as the error message says:
        // "AI SDK 5 only supports models that implement specification version 'v2'".
        return {
            specificationVersion: 'v2',
            provider: 'DummyProvider',
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                 const prompt = AIClient._extractPrompt(options);
                 const text = await provider.generateText(prompt);

                 return {
                    text,
                    content: [{ type: 'text', text }], // Required content array
                    finishReason: 'stop',
                    usage: {
                        promptTokens: prompt.length,
                        completionTokens: text.length
                    },
                    rawResponse: { headers: {} } // Required for v2
                 };
            },

             async doStream(options) {
                 const prompt = AIClient._extractPrompt(options);
                 const controller = new TransformableStream();

                 await (async () => {
                     try {
                         const stream = provider.streamText(prompt);
                         for await (const chunk of stream) {
                             controller.enqueue({type: 'text-delta', textDelta: chunk});
                         }
                         controller.enqueue({
                             type: 'finish',
                             finishReason: 'stop',
                             usage: {promptTokens: 0, completionTokens: 0}
                         });
                         controller.close();
                     } catch (e) {
                         controller.error(e);
                     }
                 })();

                 return {
                     stream: controller.readable,
                     rawCall: { rawPrompt: prompt, rawSettings: {} }
                 };
            }
        };
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
        const effectiveModel = modelName || 'onnx-community/Qwen2.5-0.5B-Instruct';
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
        return generateText(this.#resolveArgs(prompt, options));
    }

    async stream(prompt, options = {}) {
        return streamText(this.#resolveArgs(prompt, options));
    }

    async generateObject(prompt, schema, options = {}) {
        const model = this.getModel(options.provider, options.model);
        return generateObject({model, schema, prompt, ...options});
    }

    async destroy() {
        for (const [key, instance] of this.modelInstances) {
            if (instance.destroy) {await instance.destroy();}
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
