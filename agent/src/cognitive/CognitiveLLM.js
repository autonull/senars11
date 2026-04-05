/**
 * CognitiveLLM.js - LLM Interface for Cognitive Architecture
 * Delegates to the agent's AIClient (supports any provider: dummy, ollama, openai, etc.).
 */
import {Logger} from '@senars/core';
import {analyzeText, detectResponseType} from './TextAnalysis.js';

export class CognitiveLLM {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.agentName = config.agentName ?? 'SeNARchy';
        this.personality = config.personality ?? 'helpful, curious, and concise';
        Logger.info('[CognitiveLLM] Initialized');
    }

    async reason(context) {
        const prompt = this._buildReasoningPrompt(context);
        try {
            const result = await this.agent.ai.generate([
                {role: 'system', content: this._getSystemPrompt()},
                {role: 'user', content: prompt}
            ]);
            return {response: result.text.trim(), type: detectResponseType(result.text), confidence: 0.8};
        } catch (error) {
            Logger.error('[CognitiveLLM] Reasoning error:', error.message);
            return {response: "I'm processing that...", type: 'response', confidence: 0.3};
        }
    }

    async generateResponse(input, cognitiveState) {
        const prompt = this._buildResponsePrompt(input, cognitiveState);
        try {
            const result = await this.agent.ai.generate([
                {role: 'system', content: this._getSystemPrompt()},
                {role: 'user', content: prompt}
            ], {maxTokens: 200, temperature: 0.7});
            return {text: result.text.trim(), source: 'cognitive_llm'};
        } catch (error) {
            Logger.error('[CognitiveLLM] Generation error:', error.message);
            return {text: this._fallbackResponse(input), source: 'fallback'};
        }
    }

    async understandIntent(text) {
        const prompt = `Analyze: "${text}"\nExtract: intent, entities, sentiment, topics.\nRespond as JSON.`;
        try {
            const result = await this.agent.ai.generate([
                {role: 'system', content: 'You are a natural language understanding assistant. Respond in valid JSON.'},
                {role: 'user', content: prompt}
            ]);
            try {
                return JSON.parse(result.text.trim());
            } catch {
                return this._heuristicIntent(text);
            }
        } catch {
            return analyzeText(text);
        }
    }

    _getSystemPrompt() {
        return `You are ${this.agentName}, a cognitive AI assistant. ${this.personality}. 
Respond concisely. Use structured reasoning when appropriate.`;
    }

    _buildReasoningPrompt(context) {
        const ctx = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
        return `Analyze the following cognitive context and provide reasoning about what action to take:\n\n${ctx}`;
    }

    _buildResponsePrompt(input, cognitiveState) {
        const state = cognitiveState ? JSON.stringify(cognitiveState, null, 2) : 'No additional state.';
        return `Cognitive State:\n${state}\n\nUser input: ${input}\n\nGenerate an appropriate response.`;
    }

    _heuristicIntent(text) {
        const lower = text.toLowerCase().trim();
        const isQuestion = /[?]$/.test(lower) || /^(what|who|when|where|why|how|is|are|do|can|could|would|should)\b/.test(lower);
        const isCommand = /^[!/.]/.test(lower);
        const isGreeting = /^(hello|hi|hey|greetings|good morning|good evening)\b/.test(lower);
        return {
            intent: isCommand ? 'command' : isQuestion ? 'question' : isGreeting ? 'greeting' : 'statement',
            entities: [],
            sentiment: lower.includes('not') || lower.includes("don't") || lower.includes('bad') ? 'negative' : 'neutral',
            topics: lower.split(/\s+/).filter(w => w.length > 4).slice(0, 3)
        };
    }

    _fallbackResponse(input) {
        const fallbacks = ["Interesting! Tell me more.", "I see. What else is on your mind?", "Thanks for sharing that.", "I'm processing that. Can you elaborate?"];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
