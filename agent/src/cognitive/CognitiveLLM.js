/**
 * CognitiveLLM.js - LLM Interface for Cognitive Architecture
 * 
 * Provides context-aware language understanding and response generation
 * integrated with cognitive state (memory, attention, user models).
 */
import { OllamaClient } from '../ai/OllamaClient.js';
import { Logger } from '@senars/core';

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
            return { response: result.text.trim(), type: this._detectResponseType(result.text), confidence: 0.8 };
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
        } catch { return this._heuristicIntent(text); }
    }

    async extractFacts(text, speaker) {
        const prompt = `Extract facts from "${text}" by ${speaker}.\nReturn JSON array: [{"fact": "...", "confidence": 0.8}].`;
        try {
            const result = await this.client.generate([
                { role: 'system', content: 'Extract facts. Return valid JSON array.' },
                { role: 'user', content: prompt }
            ]);
            try { return JSON.parse(result.text.trim()); } catch { return []; }
        } catch { return []; }
    }

    _buildReasoningPrompt(context) {
        const parts = [];
        if (context.currentPerception) {
            parts.push(`Current input: "${context.currentPerception.content}"`);
            parts.push(`From: ${context.currentPerception.metadata?.from ?? 'unknown'}`);
        }
        if (context.workingMemory?.length > 0) {
            parts.push('\nRecent context:');
            context.workingMemory.slice(-3).forEach(wm => { parts.push(`- ${wm.content}`); });
        }
        if (context.relevantEpisodes?.length > 0) {
            parts.push('\nRelated past:');
            context.relevantEpisodes.slice(-2).forEach(ep => { parts.push(`- ${ep.perception?.content?.substring(0, 80)}...`); });
        }
        if (context.relevantFacts?.length > 0) {
            parts.push('\nKnowledge:');
            context.relevantFacts.slice(-3).forEach(fact => { parts.push(`- ${fact.content?.substring(0, 60)}...`); });
        }
        if (context.userContext) {
            parts.push(`\nAbout ${context.userContext.userId}: ${context.userContext.interactionCount} interactions, topics: ${context.userContext.topics.slice(-5).join(', ')}`);
        }
        parts.push('\nWhat is the appropriate response?');
        return parts.join('\n');
    }

    _buildResponsePrompt(input, cognitiveState) {
        const parts = [
            `You are ${this.agentName}, ${this.personality}.`,
            'Respond in 1-2 sentences. Be helpful but concise.\n'
        ];
        if (cognitiveState.context) parts.push(`Context: ${cognitiveState.context}`);
        parts.push(`\nUser said: "${input}"\nYour response:`);
        return parts.join('\n');
    }

    _getSystemPrompt() {
        return `You are ${this.agentName}, an intelligent AI assistant.\nPersonality: ${this.personality}\n\nGuidelines:\n- Be helpful, curious, and concise\n- Respond in 1-2 sentences for IRC chat\n- Show genuine interest in users\n- Admit when you don't know something\n- Be friendly but professional\n- Remember context from the conversation\n- Ask follow-up questions when appropriate`;
    }

    _detectResponseType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('?')) return 'question';
        if (lower.match(/\b(hi|hello|hey|greetings)\b/)) return 'greeting';
        if (lower.match(/\b(thanks|thank you)\b/)) return 'acknowledgment';
        if (lower.match(/\b(sorry|apologize)\b/)) return 'apology';
        return 'response';
    }

    _heuristicIntent(text) {
        const lower = text.toLowerCase();
        const result = { intent: 'statement', entities: [], sentiment: 'neutral', topics: [] };
        if (lower.includes('?')) result.intent = 'question';
        else if (lower.match(/\b(hi|hello|hey)\b/)) result.intent = 'greeting';
        else if (lower.startsWith('!')) result.intent = 'command';
        const mentions = text.match(/@(\w+)/g);
        if (mentions) result.entities.push(...mentions.map(m => m.slice(1)));
        if (lower.match(/\b(good|great|awesome|love|like)\b/)) result.sentiment = 'positive';
        else if (lower.match(/\b(bad|terrible|hate|wrong)\b/)) result.sentiment = 'negative';
        return result;
    }

    _fallbackResponse(input) {
        const fallbacks = ["Interesting! Tell me more.", "I see. What else is on your mind?", "Thanks for sharing that.", "I'm processing that. Can you elaborate?"];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
