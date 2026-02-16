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
        this.modelName = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        this.isInitialized = false;
    }

    async initialize() {
        this.logger.log('Initializing LM Agent Controller...', 'system');
        this.emit('model-load-start', { modelName: this.modelName });

        try {
            // Initialize AIClient with WebLLM provider
            this.aiClient = new AIClient({
                provider: 'webllm',
                modelName: this.modelName
            });

            // Set up event forwarding from WebLLM provider
            const provider = this.aiClient.modelInstances.get(`webllm:${this.modelName}`);
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
            }

            // Initialize tools bridge
            this.toolsBridge = new AgentToolsBridge();
            await this.toolsBridge.initialize();

            this.logger.log('LM Agent Controller initialized', 'success');

        } catch (error) {
            this.logger.log(`LM Controller initialization error: ${error.message}`, 'error');
            this.emit('model-load-error', { error: error.message });
            throw error;
        }
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

            // Prepare messages
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.conversationHistory
            ];

            // Generate response
            const result = await this.aiClient.generate(userMessage, {
                provider: 'webllm',
                model: this.modelName,
                temperature: options.temperature ?? 0.7,
                maxTokens: options.maxTokens ?? 512
            });

            const assistantMessage = result.text || '';

            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage
            });

            // Check if response includes tool calls (simple parsing for now)
            await this.handleToolCalls(assistantMessage);

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
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.conversationHistory
            ];

            const result = await this.aiClient.stream(userMessage, {
                provider: 'webllm',
                model: this.modelName,
                temperature: options.temperature ?? 0.7,
                maxTokens: options.maxTokens ?? 512
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
        const tools = this.toolsBridge.getToolDescriptions();

        return `You are an AI assistant integrated with the SeNARS cognitive architecture. You have access to the following tools:

${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

You can help users:
1. Query and manipulate the NAR (Non-Axiomatic Reasoning) system
2. Add beliefs and goals in Narsese format
3. Run inference cycles and observe results
4. Configure system parameters
5. Generate and execute MeTTa code for self-programming

When users ask you to perform actions that require tools, explain what you would do and mention the relevant tool. Be helpful and educational about the system's capabilities.`;
    }

    /**
     * Simple tool call detection and handling
     * Future: Implement proper function calling with AI SDK
     */
    async handleToolCalls(response) {
        // For now, this is a placeholder
        // In future iterations, we'll use AI SDK's tool calling feature
        // to properly integrate with the tools

        // Example: detect patterns like "I'll use the nar_control tool..."
        // and actually execute the tool

        return null;
    }

    getAvailableTools() {
        return this.toolsBridge ? this.toolsBridge.getToolDescriptions() : [];
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    async destroy() {
        if (this.aiClient) {
            await this.aiClient.destroy();
        }
        this.removeAllListeners();
    }
}
