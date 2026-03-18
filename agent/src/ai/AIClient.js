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
        // Handle messages array (Vercel AI SDK format)
        if (options.messages && Array.isArray(options.messages)) {
            // Convert messages to a single text prompt
            return options.messages.map(msg => {
                if (typeof msg === 'string') return msg;
                if (msg.content) {
                    if (typeof msg.content === 'string') return msg.content;
                    if (Array.isArray(msg.content)) {
                        return msg.content.map(c => c.text || '').join('');
                    }
                }
                if (msg.text) return msg.text;
                return JSON.stringify(msg);
            }).join('\n');
        }
        
        // Handle prompt field
        if (typeof options.prompt === 'string') return options.prompt;
        if (Array.isArray(options.prompt)) {
            // Check if it's already a messages array [ {role, content} ]
            if (options.prompt.length > 0 && options.prompt[0].role) {
                return options.prompt.map(msg => {
                    if (typeof msg === 'string') return msg;
                    if (msg.content) {
                        if (typeof msg.content === 'string') return msg.content;
                        if (Array.isArray(msg.content)) {
                            return msg.content.map(c => c.text || '').join('');
                        }
                    }
                    if (msg.text) return msg.text;
                    return JSON.stringify(msg);
                }).join('\n');
            }
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

        // Ollama provider with v2 spec wrapper
        const ollamaBaseURL = config.ollama?.baseURL || config.baseURL || 'http://localhost:11434';
        this.providers.set('ollama', (modelName) => this._createOllamaModel(ollamaBaseURL, modelName || 'llama3.2'));

        this.providers.set('transformers', (modelName) => this._createTransformersModel(modelName));
        this.providers.set('webllm', (modelName) => this._createWebLLMModel(modelName));
        this.providers.set('dummy', (modelName) => this._createDummyModel(modelName));
    }

    _createOllamaModel(baseURL, modelName) {
        const ollama = createOllama({ baseURL });
        return ollama(modelName);
    }

    _createAIProviderAdapter(provider, effectiveModel) {
        return {
            specificationVersion: 'v1',
            provider: provider.constructor.name,
            modelId: effectiveModel,
            defaultObjectGenerationMode: undefined,

            async doGenerate(options) {
                // Determine prompt format. SDK calls with { prompt: [{role: 'user', content: ...}] } usually
                // But options passed to generateText are here.
                // generateText passes 'prompt' or 'messages' to the model adapter as 'inputFormat' and 'mode' in v2?
                // Actually, adapter receives { prompt: ... } where prompt is parsed.

                let promptText = '';
                if (Array.isArray(options.prompt)) {
                     // Convert messages to text prompt for legacy/simple providers
                     promptText = options.prompt.map(m => {
                         if (m.content && Array.isArray(m.content)) {
                             return `${m.role}: ${m.content.map(c => c.text).join('')}`;
                         }
                         return `${m.role}: ${m.content}`;
                     }).join('\n');
                } else {
                    promptText = String(options.prompt);
                }

                let result;

                // Support both generate (WebLLM) and generateText (Transformers/Dummy)
                if (typeof provider.generate === 'function') {
                    result = await provider.generate(promptText, {
                        temperature: options.temperature ?? 0.7,
                        maxTokens: options.maxTokens ?? 256,
                        tools: options.tools,
                        toolChoice: options.toolChoice
                    });
                } else {
                     const text = await provider.generateText(promptText, {
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
                        promptTokens: promptText.length,
                        completionTokens: responseText.length,
                        inputTokens: promptText.length,
                        outputTokens: responseText.length
                    },
                    rawCall: {rawPrompt: promptText, rawSettings: {}},
                    toolCalls: toolCalls,
                    warnings: [],
                    logprobs: undefined
                };
            },

            async doStream(options) {
                let promptText = '';
                if (Array.isArray(options.prompt)) {
                     promptText = options.prompt.map(m => {
                         if (m.content && Array.isArray(m.content)) {
                             return `${m.role}: ${m.content.map(c => c.text).join('')}`;
                         }
                         return `${m.role}: ${m.content}`;
                     }).join('\n');
                } else {
                    promptText = String(options.prompt);
                }

                const controller = new TransformableStream();

                (async () => {
                    try {
                        let stream;
                        if (typeof provider.streamText === 'function') {
                            stream = provider.streamText(promptText, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                        } else {
                            // Fallback if no streaming supported: generate full text and stream it as one chunk
                             const text = await provider.generateText(promptText, {
                                temperature: options.temperature ?? 0.7,
                                maxTokens: options.maxTokens ?? 256
                            });
                            stream = (async function*() { yield text; })();
                        }

                        // Handle both AsyncIterable (stream) and Promise (fallback) if implementation varies
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

                 (async () => {
                     try {
                         const stream = provider.streamText(prompt);
                         for await (const chunk of stream) {
                             controller.enqueue({ type: 'text-delta', textDelta: chunk });
                         }
                         controller.enqueue({
                             type: 'finish',
                             finishReason: 'stop',
                             usage: { promptTokens: 0, completionTokens: 0 }
                         });
                         controller.close();
                     } catch(e) { controller.error(e); }
                 })();

                 return {
                     stream: controller.readable,
                     rawCall: { rawPrompt: prompt, rawSettings: {} }
                 };
            }
        };
    }

    // ... (rest of methods)
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
        // AI SDK v5 generateText expects { model, messages, ... } or { model, prompt }
        // AgentStreamer passes 'prompt' which contains messages array.
        // We need to unwrap it if it's named 'prompt' but is messages.

        let args = { model: this.getModel(options.provider || prompt.provider, options.model || prompt.model), ...options };

        // If prompt is an object with 'prompt' property which is messages
        if (prompt && prompt.prompt && Array.isArray(prompt.prompt)) {
             args.messages = prompt.prompt;
        } else if (Array.isArray(prompt)) {
             args.messages = prompt;
        } else if (typeof prompt === 'string') {
             args.prompt = prompt;
        } else if (typeof prompt === 'object') {
             // prompt might be the whole options object from AgentStreamer if passed incorrectly,
             // but here prompt argument is usually the text or messages.
             // If prompt has messages property
             if (prompt.messages) args.messages = prompt.messages;
             else if (prompt.prompt) args.prompt = prompt.prompt;
        }

        // Clean up tools if empty to avoid validation errors
        if (args.tools && Object.keys(args.tools).length === 0) {
            delete args.tools;
        }

        return generateText(args);
    }

    async stream(prompt, options = {}) {
        let args = { model: this.getModel(options.provider || prompt.provider, options.model || prompt.model), ...options };

        if (prompt && prompt.prompt && Array.isArray(prompt.prompt)) {
             args.messages = prompt.prompt;
        } else if (Array.isArray(prompt)) {
             args.messages = prompt;
        } else if (typeof prompt === 'string') {
             args.prompt = prompt;
        } else if (typeof prompt === 'object') {
             if (prompt.messages) args.messages = prompt.messages;
             else if (prompt.prompt) args.prompt = prompt.prompt;
        }

        if (args.tools && Object.keys(args.tools).length === 0) {
            delete args.tools;
        }

        return streamText(args);
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
