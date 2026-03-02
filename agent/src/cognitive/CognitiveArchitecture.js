/**
 * CognitiveArchitecture.js - Modern Cognitive Architecture
 * 
 * Integrates:
 * - Working Memory with Attention (Global Workspace Theory)
 * - Multiple Memory Systems (Episodic, Semantic, Procedural)
 * - MeTTa Reasoning Engine
 * - LLM for language understanding/generation
 * - MCP for tool integration
 * 
 * Architecture inspired by: LIDA, ACT-R, SOAR, and modern neural-symbolic AI
 */
import { Logger } from '@senars/core';
import { EventEmitter } from 'events';

export class CognitiveArchitecture extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            // Memory configuration
            workingMemoryCapacity: config.workingMemoryCapacity ?? 7, // Miller's number
            sensoryBufferSize: config.sensoryBufferSize ?? 20,
            episodicMemoryLimit: config.episodicMemoryLimit ?? 1000,
            semanticMemoryLimit: config.semanticMemoryLimit ?? 5000,
            
            // Attention configuration
            attentionThreshold: config.attentionThreshold ?? 0.3,
            decayRate: config.decayRate ?? 0.01,
            
            // Reasoning configuration
            inferenceDepth: config.inferenceDepth ?? 3,
            maxInferenceTime: config.maxInferenceTime ?? 500,
            
            // LLM configuration
            llmContextLength: config.llmContextLength ?? 4000,
            
            // Identity
            agentName: config.agentName ?? 'SeNARchy',
            agentPersonality: config.agentPersonality ?? 'helpful, curious, and concise'
        };

        this.agentName = this.config.agentName;
        
        // Initialize memory systems
        this.memories = {
            sensory: new SensoryBuffer(this.config.sensoryBufferSize),
            working: new WorkingMemory(this.config.workingMemoryCapacity),
            episodic: new EpisodicMemory(this.config.episodicMemoryLimit),
            semantic: new SemanticMemory(this.config.semanticMemoryLimit),
            procedural: new ProceduralMemory()
        };

        // Attention mechanism (Global Workspace)
        this.attention = new AttentionMechanism(this.config);

        // Reasoning engine (MeTTa)
        this.reasoner = null; // Will be injected
        
        // LLM interface
        this.llm = null; // Will be injected
        
        // MCP client for tools
        this.mcpClient = null; // Will be injected
        
        // Current cognitive state
        this.state = {
            cycle: 0,
            phase: 'idle', // perceive, attend, reason, act
            goals: [],
            currentFocus: null
        };

        // User models for personalization
        this.userModels = new Map();

        Logger.info(`[Cognitive] Architecture initialized: ${this.agentName}`);
    }

    /**
     * Inject dependencies
     */
    setReasoner(reasoner) {
        this.reasoner = reasoner;
        Logger.info('[Cognitive] Reasoner attached');
    }

    setLLM(llm) {
        this.llm = llm;
        Logger.info('[Cognitive] LLM attached');
    }

    setMCPClient(client) {
        this.mcpClient = client;
        Logger.info('[Cognitive] MCP Client attached');
    }

    /**
     * Cognitive Cycle - Main processing loop
     * Based on LIDA cognitive cycle model
     */
    async cognitiveCycle(percept) {
        this.state.cycle++;
        this.state.phase = 'perceive';
        
        try {
            // 1. PERCEPTION - Add to sensory memory
            const perception = await this._perceive(percept);
            
            // 2. ATTENTION - Select what to focus on
            this.state.phase = 'attend';
            const attended = this.attention.select(perception, this.memories.working, this.memories.semantic);
            
            // 3. UPDATE WORKING MEMORY
            this.memories.working.add(attended);
            
            // 4. REASONING - Use MeTTa + LLM
            this.state.phase = 'reason';
            const reasoning = await this._reason(attended);
            
            // 5. ACTION SELECTION
            this.state.phase = 'act';
            const action = await this._selectAction(reasoning, attended);
            
            // 6. EXECUTE ACTION
            const result = await this._execute(action);
            
            // 7. LEARN - Store in appropriate memory
            await this._learn(percept, attended, reasoning, action, result);
            
            this.state.phase = 'idle';
            
            return {
                perception,
                attended,
                reasoning,
                action,
                result
            };
            
        } catch (error) {
            Logger.error('[Cognitive] Cycle error:', error);
            this.state.phase = 'error';
            throw error;
        }
    }

    /**
     * Perception - Process incoming stimuli
     */
    async _perceive(stimulus) {
        const perception = {
            id: `percept_${Date.now()}`,
            timestamp: Date.now(),
            type: stimulus.type || 'message',
            source: stimulus.source || 'unknown',
            content: stimulus.content,
            metadata: stimulus.metadata || {},
            salience: this._calculateSalience(stimulus)
        };
        
        // Add to sensory buffer
        this.memories.sensory.add(perception);
        
        // Extract features for attention
        perception.features = this._extractFeatures(perception);
        
        return perception;
    }

    /**
     * Calculate salience of stimulus
     */
    _calculateSalience(stimulus) {
        let salience = 0.5; // Base salience
        
        // Mentions of agent name are highly salient
        if (stimulus.content?.toLowerCase().includes(this.agentName.toLowerCase())) {
            salience += 0.3;
        }
        
        // Questions are salient
        if (stimulus.content?.includes('?')) {
            salience += 0.2;
        }
        
        // Direct messages are salient
        if (stimulus.metadata?.isPrivate) {
            salience += 0.2;
        }
        
        // Emotional content is salient
        const emotionalWords = ['love', 'hate', 'happy', 'sad', 'angry', 'excited', 'worried'];
        if (emotionalWords.some(w => stimulus.content?.toLowerCase().includes(w))) {
            salience += 0.15;
        }
        
        return Math.min(1.0, salience);
    }

    /**
     * Extract features for attention and reasoning
     */
    _extractFeatures(perception) {
        const features = {
            entities: [],
            intents: [],
            sentiment: 'neutral',
            topics: []
        };
        
        const content = perception.content?.toLowerCase() || '';
        
        // Simple entity extraction (can be enhanced with NER)
        const entityPatterns = [
            /@(\w+)/g,  // Usernames
            /#(\w+)/g,  // Hashtags/topics
            /\b(AI|ML|NLP|robot|computer|code|python|javascript)\b/gi  // Tech terms
        ];
        
        for (const pattern of entityPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                features.entities.push(...matches.map(m => m.replace(/[@#]/g, '')));
            }
        }
        
        // Intent detection
        if (content.includes('?') || content.startsWith('what ') || content.startsWith('how ') || 
            content.startsWith('why ') || content.startsWith('explain ') || content.startsWith('tell me')) {
            features.intents.push('question');
        }
        
        if (content.startsWith('!') || content.startsWith('/')) {
            features.intents.push('command');
        }
        
        if (content.match(/\b(hi|hello|hey|greetings)\b/i)) {
            features.intents.push('greeting');
        }
        
        // Simple sentiment
        const positive = ['good', 'great', 'awesome', 'excellent', 'love', 'like', 'thanks', 'thank'];
        const negative = ['bad', 'terrible', 'hate', 'wrong', 'error', 'fail'];
        
        if (positive.some(w => content.includes(w))) {
            features.sentiment = 'positive';
        } else if (negative.some(w => content.includes(w))) {
            features.sentiment = 'negative';
        }
        
        return features;
    }

    /**
     * Reasoning - Combine MeTTa and LLM
     */
    async _reason(attended) {
        const reasoning = {
            metta: null,
            llm: null,
            conclusions: [],
            confidence: 0
        };
        
        // 1. MeTTa reasoning for logical inference
        if (this.reasoner) {
            try {
                const mettaResult = await this.reasoner.reason(attended);
                reasoning.metta = mettaResult;
                if (mettaResult?.conclusions) {
                    reasoning.conclusions.push(...mettaResult.conclusions);
                    reasoning.confidence += 0.3;
                }
            } catch (e) {
                Logger.debug('[Cognitive] MeTTa reasoning skipped:', e.message);
            }
        }
        
        // 2. LLM reasoning for natural language understanding
        if (this.llm) {
            try {
                const context = this._buildLLMContext(attended);
                const llmResult = await this.llm.reason(context);
                reasoning.llm = llmResult;
                if (llmResult?.response) {
                    reasoning.conclusions.push({
                        source: 'llm',
                        content: llmResult.response,
                        type: llmResult.type || 'response'
                    });
                    reasoning.confidence += 0.5;
                }
            } catch (e) {
                Logger.debug('[Cognitive] LLM reasoning skipped:', e.message);
            }
        }
        
        reasoning.confidence = Math.min(1.0, reasoning.confidence);
        
        return reasoning;
    }

    /**
     * Build context for LLM
     */
    _buildLLMContext(attended) {
        const context = {
            agentName: this.agentName,
            personality: this.config.agentPersonality,
            currentPerception: attended,
            workingMemory: this.memories.working.getContents(),
            relevantEpisodes: this.memories.episodic.getRelevant(attended, 3),
            relevantFacts: this.memories.semantic.getRelevant(attended, 5),
            userContext: null
        };
        
        // Add user-specific context
        const userId = attended.metadata?.from || attended.metadata?.user;
        if (userId) {
            context.userContext = this.userModels.get(userId);
        }
        
        return context;
    }

    /**
     * Action Selection - Decide what to do
     */
    async _selectAction(reasoning, attended) {
        const action = {
            type: 'none',
            content: null,
            target: null,
            priority: 0,
            metadata: {}
        };
        
        // Check for procedural rules
        const procedures = this.memories.procedural.match(attended);
        if (procedures.length > 0) {
            const proc = procedures[0];
            action.type = proc.actionType;
            action.content = proc.action;
            action.priority = 0.8;
            return action;
        }
        
        // Use reasoning conclusions
        if (reasoning.conclusions.length > 0) {
            const conclusion = reasoning.conclusions[0];
            
            if (conclusion.type === 'response' || conclusion.type === 'answer') {
                action.type = 'respond';
                action.content = conclusion.content;
                action.priority = reasoning.confidence;
            } else if (conclusion.type === 'tool_call') {
                action.type = 'tool';
                action.content = conclusion.tool;
                action.metadata = conclusion.args;
                action.priority = 0.9;
            }
        }
        
        // Default: respond if question or mention
        if (action.type === 'none') {
            const features = attended.features;
            if (features.intents.includes('question') || 
                features.intents.includes('greeting') ||
                attended.content?.toLowerCase().includes(this.agentName.toLowerCase())) {
                action.type = 'respond';
                action.content = reasoning.llm?.response || this._getDefaultResponse(features);
                action.priority = 0.5;
            }
        }
        
        // Set target
        if (attended.metadata?.channel) {
            action.target = attended.metadata.isPrivate ? attended.metadata.from : attended.metadata.channel;
        }
        
        return action;
    }

    /**
     * Default responses when no reasoning available
     */
    _getDefaultResponse(features) {
        if (features.intents.includes('greeting')) {
            return `Hello! I'm ${this.agentName}. How can I help?`;
        }
        if (features.intents.includes('question')) {
            return "That's an interesting question. Let me think about it...";
        }
        return "I see. Tell me more.";
    }

    /**
     * Execute selected action
     */
    async _execute(action) {
        const result = {
            success: false,
            output: null,
            error: null
        };
        
        try {
            switch (action.type) {
                case 'respond':
                    result.output = action.content;
                    result.success = true;
                    break;
                    
                case 'tool':
                    if (this.mcpClient) {
                        result.output = await this.mcpClient.callTool(action.content, action.metadata);
                        result.success = true;
                    } else {
                        result.error = 'No MCP client available';
                    }
                    break;
                    
                case 'remember':
                    this.memories.semantic.add(action.content);
                    result.output = 'Remembered.';
                    result.success = true;
                    break;
                    
                case 'query_memory':
                    result.output = this.memories.semantic.search(action.content);
                    result.success = true;
                    break;
                    
                default:
                    result.error = `Unknown action type: ${action.type}`;
            }
        } catch (error) {
            result.error = error.message;
        }
        
        return result;
    }

    /**
     * Learn from experience
     */
    async _learn(percept, attended, reasoning, action, result) {
        // Store in episodic memory
        this.memories.episodic.add({
            timestamp: Date.now(),
            perception: percept,
            attended,
            reasoning: {
                metta: reasoning.metta ? 'success' : 'none',
                llm: reasoning.llm ? 'success' : 'none'
            },
            action,
            result
        });
        
        // Extract and store semantic knowledge
        if (result.success && action.type === 'respond') {
            // Learn from successful interactions
            const knowledge = this._extractKnowledge(percept, action);
            if (knowledge) {
                this.memories.semantic.add(knowledge);
            }
        }
        
        // Update user model
        const userId = percept.metadata?.from;
        if (userId) {
            this._updateUserModel(userId, percept, action, result);
        }
    }

    /**
     * Extract knowledge from interaction
     */
    _extractKnowledge(percept, action) {
        // Simple extraction - can be enhanced with NLP
        const content = percept.content;
        
        // Look for factual statements
        const factPatterns = [
            /(\w+) is (?:a|an|the) (\w+)/i,
            /(\w+) lives in (\w+)/i,
            /(\w+) likes (\w+)/i,
            /I (?:live|work|study) in (\w+)/i
        ];
        
        for (const pattern of factPatterns) {
            const match = content.match(pattern);
            if (match) {
                return {
                    type: 'fact',
                    content: match[0],
                    source: percept.metadata?.from || 'unknown',
                    confidence: 0.7
                };
            }
        }
        
        return null;
    }

    /**
     * Update user model
     */
    _updateUserModel(userId, percept, action, result) {
        if (!this.userModels.has(userId)) {
            this.userModels.set(userId, {
                userId,
                firstSeen: Date.now(),
                lastInteraction: Date.now(),
                interactionCount: 0,
                preferences: {},
                topics: [],
                sentiment: 'neutral'
            });
        }

        const model = this.userModels.get(userId);
        model.lastInteraction = Date.now();
        model.interactionCount++;

        // Track topics
        const features = percept.features || {};
        if (features.entities) {
            for (const entity of features.entities) {
                if (!model.topics.includes(entity)) {
                    model.topics.push(entity);
                }
            }
        }

        // Track sentiment
        model.sentiment = features.sentiment || 'neutral';
    }

    /**
     * Get cognitive state for debugging
     */
    getState() {
        return {
            cycle: this.state.cycle,
            phase: this.state.phase,
            workingMemory: this.memories.working.getContents(),
            attention: this.attention.getState(),
            userCount: this.userModels.size
        };
    }
}

/**
 * Sensory Buffer - Short-term sensory memory
 */
class SensoryBuffer {
    constructor(capacity = 20) {
        this.capacity = capacity;
        this.buffer = [];
    }

    add(item) {
        this.buffer.unshift({ ...item, added: Date.now() });
        if (this.buffer.length > this.capacity) {
            this.buffer.pop();
        }
    }

    getRecent(count = 5) {
        return this.buffer.slice(0, count);
    }

    clear() {
        this.buffer = [];
    }
}

/**
 * Working Memory - Active cognitive workspace
 */
class WorkingMemory {
    constructor(capacity = 7) {
        this.capacity = capacity;
        this.slots = [];
    }

    add(item) {
        // Check for duplicates
        const exists = this.slots.some(s => 
            s.content === item.content && s.source === item.source
        );
        
        if (!exists) {
            this.slots.unshift({
                ...item,
                activation: 1.0,
                added: Date.now()
            });
            
            if (this.slots.length > this.capacity) {
                this.slots.pop();
            }
        } else {
            // Boost activation of existing item
            const existing = this.slots.find(s => 
                s.content === item.content && s.source === item.source
            );
            if (existing) {
                existing.activation = Math.min(1.0, existing.activation + 0.2);
                existing.added = Date.now();
            }
        }
    }

    decay(rate = 0.01) {
        for (const slot of this.slots) {
            slot.activation -= rate;
        }
        // Remove low-activation items
        this.slots = this.slots.filter(s => s.activation > 0.2);
    }

    getContents() {
        return this.slots.map(s => ({
            content: s.content,
            activation: s.activation
        }));
    }

    clear() {
        this.slots = [];
    }
}

/**
 * Episodic Memory - Stored experiences
 */
class EpisodicMemory {
    constructor(limit = 1000) {
        this.limit = limit;
        this.episodes = [];
    }

    add(episode) {
        this.episodes.push({
            ...episode,
            id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        if (this.episodes.length > this.limit) {
            this.episodes.shift();
        }
    }

    getRelevant(current, count = 5) {
        // Simple relevance based on content overlap
        const currentContent = current.content?.toLowerCase() || '';
        
        const scored = this.episodes.map(ep => ({
            episode: ep,
            score: this._relevanceScore(ep, currentContent)
        }));
        
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(s => s.episode);
    }

    _relevanceScore(episode, currentContent) {
        let score = 0;
        
        // Recent episodes are more relevant
        const age = Date.now() - episode.timestamp;
        score += Math.max(0, 1 - age / 3600000); // Decay over 1 hour
        
        // Content overlap
        const epContent = episode.perception?.content?.toLowerCase() || '';
        const words = currentContent.split(/\s+/);
        for (const word of words) {
            if (word.length > 3 && epContent.includes(word)) {
                score += 0.1;
            }
        }
        
        return score;
    }

    search(query) {
        return this.episodes.filter(ep => 
            ep.perception?.content?.toLowerCase().includes(query.toLowerCase())
        );
    }
}

/**
 * Semantic Memory - General knowledge
 */
class SemanticMemory {
    constructor(limit = 5000) {
        this.limit = limit;
        this.knowledge = new Map(); // Indexed by topic/entity
    }

    add(knowledge) {
        const key = this._indexKey(knowledge);
        
        if (!this.knowledge.has(key)) {
            this.knowledge.set(key, []);
        }
        
        this.knowledge.get(key).push({
            ...knowledge,
            added: Date.now(),
            accessCount: 0
        });
        
        // Prune if over limit
        if (this.knowledge.size > this.limit) {
            this._prune();
        }
    }

    _indexKey(knowledge) {
        // Extract main topic/entity for indexing
        const content = knowledge.content || '';
        const match = content.match(/\b(\w{4,})\b/);
        return match ? match[1].toLowerCase() : 'general';
    }

    getRelevant(current, count = 10) {
        const key = this._indexKey({ content: current.content });
        const results = [];
        
        // Get from same topic
        if (this.knowledge.has(key)) {
            results.push(...this.knowledge.get(key));
        }
        
        // Get from related topics
        for (const [k, items] of this.knowledge.entries()) {
            if (k !== key && results.length < count) {
                results.push(...items.slice(0, 2));
            }
        }
        
        // Update access counts
        for (const item of results) {
            item.accessCount++;
        }
        
        return results.slice(0, count);
    }

    search(query) {
        const results = [];
        const q = query.toLowerCase();
        
        for (const items of this.knowledge.values()) {
            for (const item of items) {
                if (item.content?.toLowerCase().includes(q)) {
                    results.push(item);
                }
            }
        }
        
        return results;
    }

    _prune() {
        // Remove least accessed items
        let total = 0;
        const sorted = [];
        
        for (const [key, items] of this.knowledge.entries()) {
            sorted.push({ key, items: items.sort((a, b) => b.accessCount - a.accessCount) });
            total += items.length;
        }
        
        if (total > this.limit) {
            // Remove oldest/least accessed
            sorted.sort((a, b) => {
                const aScore = a.items[0]?.accessCount || 0;
                const bScore = b.items[0]?.accessCount || 0;
                return aScore - bScore;
            });
            
            let removed = 0;
            for (const entry of sorted) {
                if (removed >= total - this.limit) break;
                entry.items.pop();
                removed++;
            }
        }
    }
}

/**
 * Procedural Memory - Action rules
 */
class ProceduralMemory {
    constructor() {
        this.rules = new Map();
        this._initializeDefaultRules();
    }

    _initializeDefaultRules() {
        // Default conversational rules
        this.add({
            condition: { intent: 'greeting' },
            actionType: 'respond',
            action: 'Hello! How can I help you today?'
        });
        
        this.add({
            condition: { intent: 'command', command: 'help' },
            actionType: 'respond',
            action: 'I can answer questions, remember facts, and help with various tasks. Just ask!'
        });
    }

    add(rule) {
        const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.rules.set(id, { ...rule, id, usage: 0 });
    }

    match(perception) {
        const features = perception.features || {};
        const matches = [];
        
        for (const rule of this.rules.values()) {
            const condition = rule.condition || {};
            let score = 0;
            
            if (condition.intent && features.intents?.includes(condition.intent)) {
                score += 0.5;
            }
            if (condition.command && perception.content?.startsWith('!' + condition.command)) {
                score += 0.5;
            }
            if (condition.entity && features.entities?.includes(condition.entity)) {
                score += 0.3;
            }
            
            if (score > 0.4) {
                matches.push({ ...rule, score });
            }
        }
        
        return matches.sort((a, b) => b.score - a.score);
    }
}

/**
 * Attention Mechanism - Global Workspace
 */
class AttentionMechanism {
    constructor(config) {
        this.threshold = config.attentionThreshold ?? 0.3;
        this.currentFocus = null;
        this.history = [];
    }

    select(perception, workingMemory, semanticMemory) {
        // Calculate attention weights
        const attended = {
            ...perception,
            attentionWeight: perception.salience
        };
        
        // Boost based on working memory relevance
        const wmContents = workingMemory.getContents();
        for (const wm of wmContents) {
            if (this._contentOverlap(perception.content, wm.content)) {
                attended.attentionWeight += 0.2;
            }
        }
        
        // Boost based on semantic relevance
        const semantic = semanticMemory.getRelevant(perception, 3);
        if (semantic.length > 0) {
            attended.attentionWeight += 0.1 * semantic.length;
        }
        
        attended.attentionWeight = Math.min(1.0, attended.attentionWeight);
        
        // Track attention history
        this.history.push({
            item: attended,
            timestamp: Date.now()
        });
        if (this.history.length > 50) {
            this.history.shift();
        }
        
        // Update current focus
        if (attended.attentionWeight >= this.threshold) {
            this.currentFocus = attended;
        }
        
        return attended;
    }

    _contentOverlap(a, b) {
        if (!a || !b) return false;
        const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        
        let overlap = 0;
        for (const word of aWords) {
            if (bWords.has(word)) overlap++;
        }
        
        return overlap >= 2;
    }

    getState() {
        return {
            currentFocus: this.currentFocus?.content || null,
            threshold: this.threshold,
            historyLength: this.history.length
        };
    }
}
