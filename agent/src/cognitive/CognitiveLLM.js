/**
 * CognitiveLLM.js - LLM Interface for Cognitive Architecture
 * 
 * Provides:
 * - Context-aware language understanding
 * - Response generation with cognitive state
 * - Natural language to cognitive representations
 */
import { OllamaClient } from '../ai/OllamaClient.js';
import { Logger } from '@senars/core';

export class CognitiveLLM {
    constructor(config = {}) {
        this.client = new OllamaClient({
            baseURL: config.baseURL || 'http://localhost:11434',
            model: config.model || 'hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K',
            temperature: config.temperature ?? 0.7,
            maxTokens: config.maxTokens ?? 300
        });
        
        this.agentName = config.agentName || 'SeNARchy';
        this.personality = config.personality || 'helpful, curious, and concise';
        
        Logger.info('[CognitiveLLM] Initialized');
    }

    /**
     * Reason about cognitive context
     */
    async reason(context) {
        const prompt = this._buildReasoningPrompt(context);
        
        try {
            const result = await this.client.generate([
                { role: 'system', content: this._getSystemPrompt() },
                { role: 'user', content: prompt }
            ]);
            
            return {
                response: result.text.trim(),
                type: this._detectResponseType(result.text),
                confidence: 0.8
            };
        } catch (error) {
            Logger.error('[CognitiveLLM] Reasoning error:', error);
            return {
                response: "I'm processing that...",
                type: 'response',
                confidence: 0.3
            };
        }
    }

    /**
     * Generate response with full cognitive context
     */
    async generateResponse(input, cognitiveState) {
        const prompt = this._buildResponsePrompt(input, cognitiveState);
        
        try {
            const result = await this.client.generate([
                { role: 'system', content: this._getSystemPrompt() },
                { role: 'user', content: prompt }
            ], {
                maxTokens: 200,
                temperature: 0.7
            });
            
            return {
                text: result.text.trim(),
                source: 'cognitive_llm'
            };
        } catch (error) {
            Logger.error('[CognitiveLLM] Generation error:', error);
            return {
                text: this._fallbackResponse(input),
                source: 'fallback'
            };
        }
    }

    /**
     * Understand intent from natural language
     */
    async understandIntent(text) {
        const prompt = `Analyze this message and extract:
1. Intent (question, greeting, statement, command, etc.)
2. Key entities mentioned
3. Sentiment (positive, negative, neutral)
4. Topics

Message: "${text}"

Respond in JSON format:
{"intent": "...", "entities": [], "sentiment": "...", "topics": []}`;

        try {
            const result = await this.client.generate([
                { role: 'system', content: 'You are a natural language understanding assistant. Respond in valid JSON.' },
                { role: 'user', content: prompt }
            ]);
            
            try {
                return JSON.parse(result.text.trim());
            } catch {
                return this._heuristicIntent(text);
            }
        } catch {
            return this._heuristicIntent(text);
        }
    }

    /**
     * Extract facts from conversation for memory
     */
    async extractFacts(text, speaker) {
        const prompt = `Extract any factual claims from this statement that should be remembered.
Speaker: ${speaker}
Statement: "${text}"

Return facts in JSON array format:
[{"fact": "...", "confidence": 0.8}, ...]

If no facts to extract, return empty array [].`;

        try {
            const result = await this.client.generate([
                { role: 'system', content: 'Extract facts. Return valid JSON array.' },
                { role: 'user', content: prompt }
            ]);
            
            try {
                return JSON.parse(result.text.trim());
            } catch {
                return [];
            }
        } catch {
            return [];
        }
    }

    /**
     * Build reasoning prompt from cognitive context
     */
    _buildReasoningPrompt(context) {
        const parts = [];
        
        // Current perception
        if (context.currentPerception) {
            parts.push(`Current input: "${context.currentPerception.content}"`);
            parts.push(`From: ${context.currentPerception.metadata?.from || 'unknown'}`);
        }
        
        // Working memory context
        if (context.workingMemory && context.workingMemory.length > 0) {
            parts.push('\nRecent context:');
            context.workingMemory.slice(-3).forEach(wm => {
                parts.push(`- ${wm.content}`);
            });
        }
        
        // Relevant episodic memories
        if (context.relevantEpisodes && context.relevantEpisodes.length > 0) {
            parts.push('\nRelated past interactions:');
            context.relevantEpisodes.slice(-2).forEach(ep => {
                parts.push(`- ${ep.perception?.content?.substring(0, 80)}...`);
            });
        }
        
        // Relevant semantic knowledge
        if (context.relevantFacts && context.relevantFacts.length > 0) {
            parts.push('\nRelevant knowledge:');
            context.relevantFacts.slice(-3).forEach(fact => {
                parts.push(`- ${fact.content?.substring(0, 60)}...`);
            });
        }
        
        // User context
        if (context.userContext) {
            parts.push(`\nAbout ${context.userContext.userId}:`);
            parts.push(`- Interactions: ${context.userContext.interactionCount}`);
            if (context.userContext.topics.length > 0) {
                parts.push(`- Topics: ${context.userContext.topics.slice(-5).join(', ')}`);
            }
        }
        
        parts.push('\nWhat is the appropriate response?');
        
        return parts.join('\n');
    }

    /**
     * Build response generation prompt
     */
    _buildResponsePrompt(input, cognitiveState) {
        const parts = [];
        
        parts.push(`You are ${this.agentName}, ${this.personality}.`);
        parts.push('Respond naturally in 1-2 sentences. Be helpful but concise.\n');
        
        if (cognitiveState.context) {
            parts.push(`Context: ${cognitiveState.context}`);
        }
        
        parts.push(`\nUser said: "${input}"`);
        parts.push('\nYour response:');
        
        return parts.join('\n');
    }

    /**
     * Get system prompt
     */
    _getSystemPrompt() {
        return `You are ${this.agentName}, an intelligent AI assistant.
Personality: ${this.personality}

Guidelines:
- Be helpful, curious, and concise
- Respond in 1-2 sentences for IRC chat
- Show genuine interest in users
- Admit when you don't know something
- Be friendly but professional
- Remember context from the conversation
- Ask follow-up questions when appropriate`;
    }

    /**
     * Detect response type
     */
    _detectResponseType(text) {
        const lower = text.toLowerCase();
        
        if (lower.includes('?')) return 'question';
        if (lower.match(/\b(hi|hello|hey|greetings)\b/)) return 'greeting';
        if (lower.match(/\b(thanks|thank you)\b/)) return 'acknowledgment';
        if (lower.match(/\b(sorry|apologize)\b/)) return 'apology';
        
        return 'response';
    }

    /**
     * Heuristic intent detection (fallback)
     */
    _heuristicIntent(text) {
        const lower = text.toLowerCase();
        const result = {
            intent: 'statement',
            entities: [],
            sentiment: 'neutral',
            topics: []
        };
        
        // Intent detection
        if (lower.includes('?')) result.intent = 'question';
        else if (lower.match(/\b(hi|hello|hey)\b/)) result.intent = 'greeting';
        else if (lower.startsWith('!')) result.intent = 'command';
        
        // Entity extraction
        const mentions = text.match(/@(\w+)/g);
        if (mentions) result.entities.push(...mentions.map(m => m.slice(1)));
        
        // Sentiment
        if (lower.match(/\b(good|great|awesome|love|like)\b/)) result.sentiment = 'positive';
        else if (lower.match(/\b(bad|terrible|hate|wrong)\b/)) result.sentiment = 'negative';
        
        return result;
    }

    /**
     * Fallback response
     */
    _fallbackResponse(input) {
        const fallbacks = [
            "Interesting! Tell me more.",
            "I see. What else is on your mind?",
            "Thanks for sharing that.",
            "I'm processing that. Can you elaborate?"
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
