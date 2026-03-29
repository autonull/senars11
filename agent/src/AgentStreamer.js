import {Logger} from '@senars/core';
import {AGENT_EVENTS} from './constants.js';

export class AgentStreamer {
    constructor(agent) {
        this.agent = agent;
    }

    async* streamExecution(input) {
        const history = this.agent.getHistory();
        const systemPrompt = `You are a NARS (Non-Axiomatic Reasoning System) agent.
        Your goal is to process the user input and provide a helpful response.
        If the input is a task you can perform with available tools, use them.
        Current input: ${input}`;

        const messages = [
            {role: 'system', content: systemPrompt},
            ...history.map(h => ({role: 'user', content: h})),
            {role: 'user', content: input}
        ];

        try {
            // Pass tools if available
            const stream = await this.agent.ai.stream({
                prompt: messages,
                tools: this.agent.aiTools
            });

            for await (const chunk of stream) {
                yield chunk;
            }
        } catch (error) {
            Logger.error('Streaming error:', error);
            yield { type: 'error', error: error.message };
        }
    }

    async accumulateStreamResponse(input) {
        let fullResponse = '';
        try {
            // Pass tools here as well for non-streaming accumulation if needed
            // But streamExecution handles the call.
            // Wait, we need to call streamExecution or generate?
            // If we want tool use, we should use stream/generate with tools.
            // Let's use generate for simpler non-streaming return, or consume the stream.

            // Using generate to support tools properly in one go (AI SDK generateText handles multi-step tool calls automatically if configured, or returns tool calls)
            // But for deep integration, we might want the agent to 'think'.
            // For now, basic generate.

            const history = this.agent.getHistory();
            const messages = [
                { role: 'system', content: 'You are SeNARS Agent. Respond helpfully.' },
                ...history.slice(-10).map(h => ({ role: 'user', content: h })), // Limit history context
                { role: 'user', content: input }
            ];

            const result = await this.agent.ai.generate({
                prompt: messages,
                tools: this.agent.aiTools,
                maxSteps: 5 // Allow multi-step tool execution
            });

            fullResponse = result.text;

            this.agent.emit(AGENT_EVENTS.AGENT_RESPONSE, {
                input,
                response: fullResponse,
                timestamp: Date.now()
            });

            return fullResponse;

        } catch (error) {
            Logger.error('Accumulate stream error:', error);
            throw error;
        }
    }

    // Legacy support for processInputStreaming if needed
    async processInputStreaming(input, onChunk, onStep) {
        // ... existing implementation if strictly needed, or redirect to streamExecution
        for await (const chunk of this.streamExecution(input)) {
            if (chunk.type === 'text-delta') onChunk(chunk.textDelta);
        }
    }
}
