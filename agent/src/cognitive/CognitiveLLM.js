/**
 * CognitiveLLM.js - LLM Interface for Cognitive Architecture
 * 
 * Provides context-aware language understanding and response generation
 * integrated with cognitive state (memory, attention, user models).
 */
import { OllamaClient } from '../ai/OllamaClient.js';
import { Logger } from '@senars/core';
import { analyzeText, detectResponseType } from './TextAnalysis.js';

export class CognitiveLLM {
    constructor(config = {}) {
        this.client = new OllamaClient({
            baseURL: config.baseURL ?? 'http://localhost:11434',
            model: config.model ?? 'hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K',
            temperature: config.temperature ?? 0.7,
            maxTokens: config.maxTokens ?? 300
        });
        this.agentName = config.agentName ?? 'SeNARchy';
        this.personality = config.personality ?? 'helpful, curious, and concise';
        Logger.info('[CognitiveLLM] Initialized');
    }

    async reason(context) {
        const prompt = this._buildReasoningPrompt(context);
        try {
            const result = await this.client.generate([
                { role: 'system', content: this._getSystemPrompt() },
                { role: 'user', content: prompt }
            ]);
            return { response: result.text.trim(), type: detectResponseType(result.text), confidence: 0.8 };
        } catch (error) {
            Logger.error('[CognitiveLLM] Reasoning error:', error);
            return { response: "I'm processing that...", type: 'response', confidence: 0.3 };
        }
    }

    async generateResponse(input, cognitiveState) {
        const prompt = this._buildResponsePrompt(input, cognitiveState);
        try {
            const result = await this.client.generate([
                { role: 'system', content: this._getSystemPrompt() },
                { role: 'user', content: prompt }
            ], { maxTokens: 200, temperature: 0.7 });
            return { text: result.text.trim(), source: 'cognitive_llm' };
        } catch (error) {
            Logger.error('[CognitiveLLM] Generation error:', error);
            return { text: this._fallbackResponse(input), source: 'fallback' };
        }
    }

    async understandIntent(text) {
        const prompt = `Analyze: "${text}"\nExtract: intent, entities, sentiment, topics.\nRespond as JSON.`;
        try {
            const result = await this.client.generate([
                { role: 'system', content: 'You are a natural language understanding assistant. Respond in valid JSON.' },
                { role: 'user', content: prompt }
            ]);
            try { return JSON.parse(result.text.trim()); } catch { return this._heuristicIntent(text); }
        } catch { return analyzeText(text); }
    }

    _fallbackResponse(input) {
        const fallbacks = ["Interesting! Tell me more.", "I see. What else is on your mind?", "Thanks for sharing that.", "I'm processing that. Can you elaborate?"];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
