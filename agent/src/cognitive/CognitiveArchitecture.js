/**
 * CognitiveArchitecture.js - Modern Cognitive Architecture
 * 
 * Integrates working memory, attention, reasoning (MeTTa + LLM), and MCP tools.
 * Based on LIDA, ACT-R, and neural-symbolic AI principles.
 */
import { Logger } from '@senars/core';
import { EventEmitter } from 'events';

export class CognitiveArchitecture extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            agentName: config.agentName ?? 'SeNARchy',
            personality: config.personality ?? 'helpful, curious, and concise',
            memory: {
                workingCapacity: config.workingMemoryCapacity ?? 7,
                sensorySize: config.sensoryBufferSize ?? 20,
                episodicLimit: config.episodicMemoryLimit ?? 1000,
                semanticLimit: config.semanticMemoryLimit ?? 5000
            },
            attention: {
                threshold: config.attentionThreshold ?? 0.3,
                decayRate: config.decayRate ?? 0.01
            },
            reasoning: {
                depth: config.inferenceDepth ?? 3,
                maxTime: config.maxInferenceTime ?? 500
            }
        };

        this.agentName = this.config.agentName;
        this.state = { cycle: 0, phase: 'idle', goals: [], currentFocus: null };

        // Initialize memory systems with unified interface
        this.memories = {
            sensory: new SensoryBuffer(this.config.memory.sensorySize),
            working: new WorkingMemory(this.config.memory.workingCapacity),
            episodic: new EpisodicMemory(this.config.memory.episodicLimit),
            semantic: new SemanticMemory(this.config.memory.semanticLimit),
            procedural: new ProceduralMemory()
        };

        this.attention = new AttentionMechanism(this.config.attention);
        this.userModels = new Map();

        // Dependencies (injected)
        this.reasoner = null;
        this.llm = null;
        this.mcpClient = null;

        Logger.info(`[Cognitive] Architecture initialized: ${this.agentName}`);
    }

    setReasoner(reasoner) { this.reasoner = reasoner; Logger.info('[Cognitive] Reasoner attached'); }
    setLLM(llm) { this.llm = llm; Logger.info('[Cognitive] LLM attached'); }
    setMCPClient(client) { this.mcpClient = client; Logger.info('[Cognitive] MCP Client attached'); }

    /**
     * Main cognitive cycle (LIDA model)
     */
    async cognitiveCycle(percept) {
        this.state.cycle++;
        this.state.phase = 'perceive';

        try {
            const perception = this._perceive(percept);
            this.state.phase = 'attend';
            const attended = this.attention.select(perception, this.memories.working, this.memories.semantic);
            this.memories.working.add(attended);

            this.state.phase = 'reason';
            const reasoning = await this._reason(attended);

            this.state.phase = 'act';
            const action = this._selectAction(reasoning, attended);
            const result = await this._execute(action);

            await this._learn(percept, attended, reasoning, action, result);
            this.state.phase = 'idle';

            return { perception, attended, reasoning, action, result };
        } catch (error) {
            Logger.error('[Cognitive] Cycle error:', error);
            this.state.phase = 'error';
            throw error;
        }
    }

    _perceive(stimulus) {
        const perception = {
            id: `percept_${Date.now()}`,
            timestamp: Date.now(),
            type: stimulus.type ?? 'message',
            source: stimulus.source ?? 'unknown',
            content: stimulus.content,
            metadata: stimulus.metadata ?? {},
            salience: this._calculateSalience(stimulus)
        };

        this.memories.sensory.add(perception);
        perception.features = this._extractFeatures(perception);
        return perception;
    }

    _calculateSalience(s) {
        const content = s.content?.toLowerCase() ?? '';
        let salience = 0.5;

        if (content.includes(this.agentName.toLowerCase())) salience += 0.3;
        if (content.includes('?')) salience += 0.2;
        if (s.metadata?.isPrivate) salience += 0.2;
        if (['love', 'hate', 'happy', 'sad', 'angry'].some(w => content.includes(w))) salience += 0.15;

        return Math.min(1.0, salience);
    }

    _extractFeatures(perception) {
        const content = perception.content?.toLowerCase() ?? '';
        const features = { entities: [], intents: [], sentiment: 'neutral', topics: [] };

        // Entity extraction
        const patterns = [
            { type: 'person', regex: /@(\w+)/g },
            { type: 'topic', regex: /#(\w+)/g },
            { type: 'technical', regex: /\b(AI|ML|NLP|API|HTTP|JSON)\b/gi }
        ];

        patterns.forEach(({ regex, type }) => {
            const matches = content.match(regex);
            if (matches) features.entities.push(...matches.map(m => ({ type, value: m.replace(/[@#]/g, '') })));
        });

        // Intent detection
        if (content.match(/[?]|^(what|how|why|explain|tell me)\s/i)) features.intents.push('question');
        if (content.match(/^[!/]/)) features.intents.push('command');
        if (content.match(/\b(hi|hello|hey|greetings)\b/i)) features.intents.push('greeting');

        // Sentiment
        if (['good', 'great', 'love', 'like', 'thanks'].some(w => content.includes(w))) {
            features.sentiment = 'positive';
        } else if (['bad', 'hate', 'wrong', 'error'].some(w => content.includes(w))) {
            features.sentiment = 'negative';
        }

        return features;
    }

    async _reason(attended) {
        const reasoning = { metta: null, llm: null, conclusions: [], confidence: 0 };

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

        if (this.llm) {
            try {
                const context = this._buildLLMContext(attended);
                const llmResult = await this.llm.reason(context);
                reasoning.llm = llmResult;
                if (llmResult?.response) {
                    reasoning.conclusions.push({ source: 'llm', content: llmResult.response, type: llmResult.type ?? 'response' });
                    reasoning.confidence += 0.5;
                }
            } catch (e) {
                Logger.debug('[Cognitive] LLM reasoning skipped:', e.message);
            }
        }

        reasoning.confidence = Math.min(1.0, reasoning.confidence);
        return reasoning;
    }

    _buildLLMContext(attended) {
        return {
            agentName: this.agentName,
            personality: this.config.personality,
            currentPerception: attended,
            workingMemory: this.memories.working.getContents(),
            relevantEpisodes: this.memories.episodic.getRelevant(attended, 3),
            relevantFacts: this.memories.semantic.getRelevant(attended, 5),
            userContext: attended.metadata?.from ? this.userModels.get(attended.metadata.from) : null
        };
    }

    _selectAction(reasoning, attended) {
        const action = { type: 'none', content: null, target: null, priority: 0, metadata: {} };

        // Check procedural rules
        const procedures = this.memories.procedural.match(attended);
        if (procedures.length > 0) {
            const proc = procedures[0];
            return { type: proc.actionType, content: proc.action, target: null, priority: 0.8, metadata: {} };
        }

        // Use reasoning conclusions
        if (reasoning.conclusions.length > 0) {
            const conclusion = reasoning.conclusions[0];
            if (['response', 'answer'].includes(conclusion.type)) {
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

        // Default response for questions/greetings/mentions
        if (action.type === 'none') {
            const features = attended.features;
            if (features.intents.some(i => ['question', 'greeting'].includes(i)) ||
                attended.content?.toLowerCase().includes(this.agentName.toLowerCase())) {
                action.type = 'respond';
                action.content = reasoning.llm?.response ?? this._getDefaultResponse(features);
                action.priority = 0.5;
            }
        }

        // Set target
        action.target = attended.metadata?.isPrivate
            ? attended.metadata.from
            : (attended.metadata?.channel ?? this.config.defaultChannel);

        return action;
    }

    _getDefaultResponse(features) {
        if (features.intents.includes('greeting')) return `Hello! I'm ${this.agentName}. How can I help?`;
        if (features.intents.includes('question')) return "That's interesting. Let me think...";
        return "I see. Tell me more.";
    }

    async _execute(action) {
        const result = { success: false, output: null, error: null };

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
                default:
                    result.error = `Unknown action type: ${action.type}`;
            }
        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    async _learn(percept, attended, reasoning, action, result) {
        // Store episodic memory
        this.memories.episodic.add({
            timestamp: Date.now(),
            perception: percept,
            attended,
            reasoning: { metta: reasoning.metta ? 'success' : 'none', llm: reasoning.llm ? 'success' : 'none' },
            action,
            result
        });

        // Extract semantic knowledge
        if (result.success && action.type === 'respond') {
            const knowledge = this._extractKnowledge(percept);
            if (knowledge) this.memories.semantic.add(knowledge);
        }

        // Update user model
        const userId = percept.metadata?.from;
        if (userId) this._updateUserModel(userId, percept, action, result);
    }

    _extractKnowledge(percept) {
        const content = percept.content ?? '';
        const patterns = [
            /(\w+) is (?:a|an|the) (\w+)/i,
            /(\w+) lives in (\w+)/i,
            /(\w+) likes (\w+)/i,
            /I (?:live|work|study) in (\w+)/i
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return { type: 'fact', content: match[0], source: percept.metadata?.from ?? 'unknown', confidence: 0.7 };
            }
        }
        return null;
    }

    _updateUserModel(userId, percept, action, result) {
        if (!this.userModels.has(userId)) {
            this.userModels.set(userId, {
                userId, firstSeen: Date.now(), lastInteraction: Date.now(),
                interactionCount: 0, preferences: {}, topics: [], sentiment: 'neutral'
            });
        }

        const model = this.userModels.get(userId);
        model.lastInteraction = Date.now();
        model.interactionCount++;

        const features = percept.features ?? {};
        if (features.entities) {
            features.entities.forEach(e => {
                if (!model.topics.includes(e.value)) model.topics.push(e.value);
            });
        }
        model.sentiment = features.sentiment ?? 'neutral';
    }

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

// ============================================================================
// Memory Systems
// ============================================================================

class SensoryBuffer {
    constructor(capacity = 20) {
        this.capacity = capacity;
        this.buffer = [];
    }

    add(item) {
        this.buffer.unshift({ ...item, added: Date.now() });
        if (this.buffer.length > this.capacity) this.buffer.pop();
    }

    getRecent(count = 5) { return this.buffer.slice(0, count); }
    clear() { this.buffer = []; }
}

class WorkingMemory {
    constructor(capacity = 7) {
        this.capacity = capacity;
        this.slots = [];
    }

    add(item) {
        const exists = this.slots.find(s => s.content === item.content && s.source === item.source);
        if (exists) {
            exists.activation = Math.min(1.0, exists.activation + 0.2);
            exists.added = Date.now();
        } else {
            this.slots.unshift({ ...item, activation: 1.0, added: Date.now() });
            if (this.slots.length > this.capacity) this.slots.pop();
        }
    }

    decay(rate = 0.01) {
        this.slots.forEach(s => { s.activation -= rate; });
        this.slots = this.slots.filter(s => s.activation > 0.2);
    }

    getContents() { return this.slots.map(s => ({ content: s.content, activation: s.activation })); }
    clear() { this.slots = []; }
}

class EpisodicMemory {
    constructor(limit = 1000) {
        this.limit = limit;
        this.episodes = [];
    }

    add(episode) {
        this.episodes.push({ ...episode, id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` });
        if (this.episodes.length > this.limit) this.episodes.shift();
    }

    getRelevant(current, count = 5) {
        const currentContent = current.content?.toLowerCase() ?? '';
        return this.episodes
            .map(ep => ({ episode: ep, score: this._relevanceScore(ep, currentContent) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(s => s.episode);
    }

    _relevanceScore(episode, currentContent) {
        let score = Math.max(0, 1 - (Date.now() - episode.timestamp) / 3600000);
        const epContent = episode.perception?.content?.toLowerCase() ?? '';
        currentContent.split(/\s+/).forEach(word => {
            if (word.length > 3 && epContent.includes(word)) score += 0.1;
        });
        return score;
    }

    search(query) {
        const q = query.toLowerCase();
        return this.episodes.filter(ep => ep.perception?.content?.toLowerCase().includes(q));
    }
}

class SemanticMemory {
    constructor(limit = 5000) {
        this.limit = limit;
        this.knowledge = new Map();
    }

    add(knowledge) {
        const key = this._indexKey(knowledge);
        if (!this.knowledge.has(key)) this.knowledge.set(key, []);
        this.knowledge.get(key).push({ ...knowledge, added: Date.now(), accessCount: 0 });
        if (this.knowledge.size > this.limit) this._prune();
    }

    _indexKey(knowledge) {
        const match = (knowledge.content ?? '').match(/\b(\w{4,})\b/);
        return match ? match[1].toLowerCase() : 'general';
    }

    getRelevant(current, count = 10) {
        const key = this._indexKey({ content: current.content });
        const results = this.knowledge.has(key) ? [...this.knowledge.get(key)] : [];
        for (const [k, items] of this.knowledge.entries()) {
            if (k !== key && results.length < count) results.push(...items.slice(0, 2));
        }
        results.forEach(item => { item.accessCount++; });
        return results.slice(0, count);
    }

    search(query) {
        const q = query.toLowerCase();
        const results = [];
        for (const items of this.knowledge.values()) {
            items.forEach(item => {
                if (item.content?.toLowerCase().includes(q)) results.push(item);
            });
        }
        return results;
    }

    _prune() {
        const sorted = Array.from(this.knowledge.entries())
            .map(([key, items]) => ({ key, items: items.sort((a, b) => b.accessCount - a.accessCount) }));
        sorted.sort((a, b) => (a.items[0]?.accessCount ?? 0) - (b.items[0]?.accessCount ?? 0));
        let removed = 0;
        for (const entry of sorted) {
            if (removed >= this.knowledge.size - this.limit) break;
            entry.items.pop();
            removed++;
        }
    }
}

class ProceduralMemory {
    constructor() {
        this.rules = new Map();
        this._initializeDefaultRules();
    }

    _initializeDefaultRules() {
        this.add({ condition: { intent: 'greeting' }, actionType: 'respond', action: 'Hello! How can I help you today?' });
        this.add({ condition: { intent: 'command', command: 'help' }, actionType: 'respond', action: 'I can answer questions, remember facts, and help with various tasks. Just ask!' });
    }

    add(rule) {
        const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.rules.set(id, { ...rule, id, usage: 0 });
    }

    match(perception) {
        const features = perception.features ?? {};
        const matches = [];
        for (const rule of this.rules.values()) {
            const condition = rule.condition ?? {};
            let score = 0;
            if (condition.intent && features.intents?.includes(condition.intent)) score += 0.5;
            if (condition.command && perception.content?.startsWith('!' + condition.command)) score += 0.5;
            if (condition.entity && features.entities?.some(e => e.value === condition.entity)) score += 0.3;
            if (score > 0.4) matches.push({ ...rule, score });
        }
        return matches.sort((a, b) => b.score - a.score);
    }
}

class AttentionMechanism {
    constructor(config) {
        this.threshold = config.threshold ?? 0.3;
        this.currentFocus = null;
        this.history = [];
    }

    select(perception, workingMemory, semanticMemory) {
        const attended = { ...perception, attentionWeight: perception.salience };

        workingMemory.getContents().forEach(wm => {
            if (this._contentOverlap(perception.content, wm.content)) attended.attentionWeight += 0.2;
        });

        const semantic = semanticMemory.getRelevant(perception, 3);
        if (semantic.length > 0) attended.attentionWeight += 0.1 * semantic.length;

        attended.attentionWeight = Math.min(1.0, attended.attentionWeight);
        this.history.push({ item: attended, timestamp: Date.now() });
        if (this.history.length > 50) this.history.shift();

        if (attended.attentionWeight >= this.threshold) this.currentFocus = attended;
        return attended;
    }

    _contentOverlap(a, b) {
        if (!a || !b) return false;
        const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        let overlap = 0;
        for (const word of aWords) { if (bWords.has(word)) overlap++; }
        return overlap >= 2;
    }

    getState() {
        return { currentFocus: this.currentFocus?.content ?? null, threshold: this.threshold, historyLength: this.history.length };
    }
}
