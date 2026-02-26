import {handleError} from '@senars/core';
import {AGENT_EVENTS} from './constants.js';

export class AgentStreamer {
    constructor(agent) {
        this.agent = agent;
        this._currentToolCalls = [];
    }

    async accumulateStreamResponse(input) {
        return (await Array.fromAsync(this.streamExecution(input)))
            .filter(chunk => chunk.type === "agent_response")
            .map(chunk => chunk.content)
            .join('') || "No response generated.";
    }

    async* streamExecution(input) {
        if (!this.agent.ai) {
            yield* this._handleMissingProvider(input);
            return;
        }

        try {
            const {fullStream} = await this.agent.ai.stream(input, {
                temperature: this.agent.inputProcessingConfig.lmTemperature
            });

            for await (const chunk of fullStream) {
                if (chunk.type === 'text-delta') {
                    yield {type: "agent_response", content: chunk.textDelta};
                } else if (chunk.type === 'tool-call') {
                    yield {type: "tool_call", name: chunk.toolName, args: chunk.args};
                    this._emit(AGENT_EVENTS.TOOL_CALL, {name: chunk.toolName, args: chunk.args, id: chunk.toolCallId});
                } else if (chunk.type === 'tool-result') {
                    yield {type: "tool_result", content: JSON.stringify(chunk.result)};
                } else if (chunk.type === 'error') {
                    yield {type: "error", content: chunk.error};
                }
            }
        } catch (error) {
            yield* this._handleStreamingError(error, input);
            throw error;
        }
    }

    _handleMissingProvider(input) {
        return this._handleStreamingError(new Error("No AI Provider configured"), input);
    }

    async* _handleMissingProvider(input) {
        if (this.agent.inputProcessingConfig.enableNarseseFallback && this.agent.inputProcessor._isPotentialNarsese(input)) {
            try {
                const result = await this.agent.inputProcessor.processNarsese(input);
                yield {type: "agent_response", content: result || "Input processed"};
                return;
            } catch (error) {
                yield {type: "agent_response", content: "❌ Agent initialized but Narsese processing failed."};
                return;
            }
        }
        yield {type: "agent_response", content: "❌ No LM provider available and input not recognized as Narsese."};
    }


    async* _handleStreamingError(error, input) {
        if (!this.agent.inputProcessingConfig.enableNarseseFallback || !this.agent.inputProcessor._isPotentialNarsese(input)) {
            console.error('Streaming execution error:', {error, input});
        }
        yield {type: "error", content: `❌ Streaming error: ${error.message}`};
    }

    _emit(event, payload) {
        this.agent.emit?.(event, payload);
    }

    async processInputStreaming(input, onChunk, onStep) {
        const trimmed = input.trim();
        if (!trimmed) {
            const res = await this.agent.executeCommand('next');
            onChunk?.(res);
            return res;
        }

        if (trimmed.startsWith('/') || this.agent.commandRegistry.get(trimmed.split(' ')[0])) {
            const res = await this.agent.inputProcessor.processInput(input); // processInput handles commands
            onChunk?.(res);
            return res;
        }

        try {
            let fullResponse = "";
            for await (const chunk of this.streamExecution(trimmed)) {
                onStep?.(chunk);
                if (chunk.type === 'agent_response') {
                    fullResponse += chunk.content;
                    onChunk?.(chunk.content);
                } else if (chunk.type === 'tool_call') {
                    onChunk?.(`\n[Calling tool: ${chunk.name}...]\n`);
                } else if (chunk.type === 'tool_result') {
                    onChunk?.(`\n[Tool result: ${chunk.content}]\n`);
                }
            }
            return fullResponse;
        } catch (error) {
            if (this.agent.inputProcessingConfig.enableNarseseFallback && this.agent.inputProcessor._isPotentialNarsese(trimmed)) {
                try {
                    const res = await this.agent.inputProcessor.processNarsese(trimmed);
                    onChunk?.(res);
                    return res;
                } catch (e) {
                    const msg = `💭 Agent processed: Input "${trimmed}" may not be valid Narsese. LM Error: ${error.message}`;
                    onChunk?.(msg);
                    return msg;
                }
            }
            const msg = handleError(error, 'Agent processing');
            onChunk?.(msg);
            return msg;
        }
    }
}
