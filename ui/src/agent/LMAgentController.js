/**
 * @file LMAgentController.js
 * @description Controller for LM-based agent interactions with WebLLM
 */

import EventEmitter from 'eventemitter3';
import { AIClient } from '@senars/agent/src/ai/AIClient.js';
import { AgentToolsBridge } from './AgentToolsBridge.js';

export class LMAgentController extends EventEmitter {
    constructor(logger) {
        super();
        this.logger = logger;
        this.aiClient = null;
        this.toolsBridge = null;
        this.conversationHistory = [];
        this.config = {
            provider: 'webllm',
            modelName: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            apiKey: '',
            baseUrl: ''
        };
        this.isInitialized = false;
    }

    async initialize(config = {}) {
        this.config = { ...this.config, ...config };

        this.logger.log(`Initializing LM Agent Controller (${this.config.provider}: ${this.config.modelName})...`, 'system');
        this.emit('model-load-start', { modelName: this.config.modelName });

        try {
            // Teardown existing client if any
            if (this.aiClient) {
                // Assuming AIClient has destroy or we just drop it
                if (typeof this.aiClient.destroy === 'function') {
                    await this.aiClient.destroy();
                }
            }

            // Initialize AIClient
            this.aiClient = this._createAIClient({
                provider: this.config.provider,
                modelName: this.config.modelName,
                apiKey: this.config.apiKey,
                baseUrl: this.config.baseUrl
            });

            // Set up event forwarding from WebLLM provider if applicable
            if (this.config.provider === 'webllm') {
                const provider = this.aiClient.modelInstances.get(`webllm:${this.config.modelName}`);
                if (provider) {
                    provider.on('lm:model-dl-progress', (data) => {
                        this.emit('model-dl-progress', data);
                    });

                    provider.on('lm:model-load-complete', (data) => {
                        this.emit('model-load-complete', data);
                        this.isInitialized = true;
                    });

                    provider.on('lm:model-load-error', (data) => {
                        this.emit('model-load-error', data);
                    });
                } else {
                    // If provider instance not immediately available (synch issue?), assume ready or wait
                    // For WebLLM, it usually emits events during load.
                    // If it's another provider, we might just be ready immediately.
                    this.isInitialized = true;
                    this.emit('model-load-complete', { modelName: this.config.modelName, elapsedMs: 0 });
                }
            } else {
                // For API providers, initialization is instant
                this.isInitialized = true;
                this.emit('model-load-complete', { modelName: this.config.modelName, elapsedMs: 0 });
            }

            // Initialize tools bridge if not already
            if (!this.toolsBridge) {
                this.toolsBridge = new AgentToolsBridge();
                await this.toolsBridge.initialize();
            }

            this.logger.log('LM Agent Controller initialized', 'success');

        } catch (error) {
            this.logger.log(`LM Controller initialization error: ${error.message}`, 'error');
            this.emit('model-load-error', { error: error.message });
            throw error;
        }
    }

    async reconfigure(newConfig) {
        return this.initialize(newConfig);
    }

    /**
     * Send a message to the LM and get response
     * @param {string} userMessage - User's message
     * @param {Object} options - Generation options
     * @returns {Promise<string>} LM response
     */
    async chat(userMessage, options = {}) {
        if (!this.isInitialized) {
            throw new Error('LM Controller not initialized');
        }

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        try {
            // Build system prompt with tool information
            const systemPrompt = this.buildSystemPrompt();

            const result = await this.aiClient.generate(userMessage, {
                provider: this.config.provider,
                model: this.config.modelName,
                temperature: options.temperature ?? 0.7,
                maxTokens: options.maxTokens ?? 512,
                systemPrompt: systemPrompt,
                messages: [...this.conversationHistory]
            });

            const assistantMessage = result.text || '';

            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage
            });

            // Check if response includes tool calls
            const toolResults = await this.handleToolCalls(assistantMessage);

            // If tools were executed, we might want to return that info or trigger another generation
            // For now, let's just log it and potentially return the augmented history if needed
            if (toolResults && toolResults.length > 0) {
                 this.logger.log(`Tools executed: ${toolResults.length}`, 'system');
                 // In a full agent loop, we would feed this back to the LM.
                 // For now, we rely on the UI or next user message to see the result
                 // because the results are added to history in handleToolCalls
            }

            return assistantMessage;

        } catch (error) {
            this.logger.log(`Chat error: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Stream a response from the LM
     * @param {string} userMessage - User's message
     * @param {Function} onChunk - Callback for each chunk
     * @param {Object} options - Generation options
     */
    async *streamChat(userMessage, options = {}) {
        if (!this.isInitialized) {
            throw new Error('LM Controller not initialized');
        }

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        try {
            const systemPrompt = this.buildSystemPrompt();

            const result = await this.aiClient.stream(userMessage, {
                provider: this.config.provider,
                model: this.config.modelName,
                temperature: options.temperature ?? 0.7,
                maxTokens: options.maxTokens ?? 512,
                systemPrompt: systemPrompt,
                messages: [...this.conversationHistory]
            });

            let fullResponse = '';

            for await (const textPart of result.textStream) {
                fullResponse += textPart;
                yield textPart;
            }

            // Add complete response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse
            });

            // Handle tool calls if present
            await this.handleToolCalls(fullResponse);

        } catch (error) {
            this.logger.log(`Stream chat error: ${error.message}`, 'error');
            throw error;
        }
    }

    buildSystemPrompt() {
        const tools = this.toolsBridge ? this.toolsBridge.getToolDescriptions() : [];

        return `You are an AI assistant integrated with the SeNARS cognitive architecture. You have access to the following tools:

${tools.map(t => `- ${t.name}: ${t.description} (Args: ${JSON.stringify(t.parameters)})`).join('\n')}

To use a tool, you MUST output a JSON object in a Markdown code block like this:

\`\`\`json
{
    "tool": "tool_name",
    "parameters": {
        "arg_name": "value"
    }
}
\`\`\`

You can help users:
1. Query and manipulate the NAR (Non-Axiomatic Reasoning) system
2. Add beliefs and goals in Narsese format
3. Run inference cycles and observe results
4. Configure system parameters
5. Generate and execute MeTTa code for self-programming

When users ask you to perform actions that require tools, explain what you would do and then output the tool call JSON.`;
    }

    /**
     * Tool call detection and handling
     * Parses the response for JSON code blocks specifying a tool.
     */
    async handleToolCalls(response) {
        if (!this.toolsBridge) return null;

        const toolRegex = /```json\s*({[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?})\s*```/g;
        let match;
        const results = [];

        while ((match = toolRegex.exec(response)) !== null) {
            try {
                const toolJson = JSON.parse(match[1]);
                if (toolJson.tool) {
                    this.logger.log(`Executing tool: ${toolJson.tool}`, 'system');

                    const result = await this.toolsBridge.executeTool(toolJson.tool, toolJson.parameters || {});

                    const resultMessage = {
                        role: 'system',
                        content: `Tool '${toolJson.tool}' execution result:\n${JSON.stringify(result, null, 2)}`
                    };

                    this.conversationHistory.push(resultMessage);
                    results.push({ tool: toolJson.tool, result });

                    this.emit('tool-executed', { tool: toolJson.tool, result });
                }
            } catch (e) {
                this.logger.log(`Failed to parse tool call: ${e.message}`, 'error');
            }
        }

        return results;
    }

    getAvailableTools() {
        return this.toolsBridge ? this.toolsBridge.getToolDescriptions() : [];
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    _createAIClient(config) {
        return new AIClient(config);
    }

    async destroy() {
        if (this.aiClient && typeof this.aiClient.destroy === 'function') {
            await this.aiClient.destroy();
        }
        this.removeAllListeners();
    }
}
