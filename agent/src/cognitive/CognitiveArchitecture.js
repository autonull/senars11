/**
 * CognitiveArchitecture - LIDA model cognitive cycle for agent
 * Integrates working memory, attention, reasoning (MeTTa + LLM), and MCP tools.
 */
import { Logger } from '@senars/core';
import { EventEmitter } from 'events';
import { SensoryBuffer, WorkingMemory, EpisodicMemory, SemanticMemory, ProceduralMemory, AttentionMechanism } from './MemorySystems.js';

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
            attention: { threshold: config.attentionThreshold ?? 0.3, decayRate: config.decayRate ?? 0.01 },
            reasoning: { depth: config.inferenceDepth ?? 3, maxTime: config.maxInferenceTime ?? 500 }
        };

        this.agentName = this.config.agentName;
        this.state = { cycle: 0, phase: 'idle', goals: [], currentFocus: null };
        this.memories = {
            sensory: new SensoryBuffer(this.config.memory.sensorySize),
            working: new WorkingMemory(this.config.memory.workingCapacity),
            episodic: new EpisodicMemory(this.config.memory.episodicLimit),
            semantic: new SemanticMemory(this.config.memory.semanticLimit),
            procedural: new ProceduralMemory()
        };
        this.attention = new AttentionMechanism(this.config.attention);
        this.userModels = new Map();
        this.reasoner = null;
        this.llm = null;
        this.mcpClient = null;

        Logger.info(`[Cognitive] Architecture initialized: ${this.agentName}`);
    }

    setReasoner(r) { this.reasoner = r; Logger.info('[Cognitive] Reasoner attached'); }
    setLLM(l) { this.llm = l; Logger.info('[Cognitive] LLM attached'); }
    setMCPClient(c) { this.mcpClient = c; Logger.info('[Cognitive] MCP Client attached'); }

    async cognitiveCycle(percept) {
        this.state.cycle++;
        this.state.phase = 'perceive';
        try {
            const perception = this.#perceive(percept);
            this.state.phase = 'attend';
            const attended = this.attention.select(perception, this.memories.working, this.memories.semantic);
            this.memories.working.add(attended);
            this.state.phase = 'reason';
            const reasoning = await this.#reason(attended);
            this.state.phase = 'act';
            const action = this.#selectAction(reasoning, attended);
            const result = await this.#execute(action);
            await this.#learn(percept, attended, reasoning, action, result);
            this.state.phase = 'idle';
            return { perception, attended, reasoning, action, result };
        } catch (error) {
            Logger.error('[Cognitive] Cycle error:', error);
            this.state.phase = 'error';
            throw error;
        }
    }

    #perceive(stimulus) {
        const perception = {
            id: `percept_${Date.now()}`, timestamp: Date.now(),
            type: stimulus.type ?? 'message', source: stimulus.source ?? 'unknown',
            content: stimulus.content, metadata: stimulus.metadata ?? {},
            salience: this.#calculateSalience(stimulus)
        };
        this.memories.sensory.add(perception);
        perception.features = this.#extractFeatures(perception);
        return perception;
    }

    #calculateSalience(s) {
        const content = s.content?.toLowerCase() ?? '';
        let salience = 0.5;
        if (content.includes(this.agentName.toLowerCase())) salience += 0.3;
        if (content.includes('?')) salience += 0.2;
        if (s.metadata?.isPrivate) salience += 0.2;
        if (['love', 'hate', 'happy', 'sad', 'angry'].some(w => content.includes(w))) salience += 0.15;
        return Math.min(1.0, salience);
    }

    #extractFeatures(perception) {
        const content = perception.content?.toLowerCase() ?? '';
        const features = { entities: [], intents: [], sentiment: 'neutral', topics: [] };
        for (const { regex, type } of [
            { type: 'person', regex: /@(\w+)/g },
            { type: 'topic', regex: /#(\w+)/g },
            { type: 'technical', regex: /\b(AI|ML|NLP|API|HTTP|JSON)\b/gi }
        ]) {
            const matches = content.match(regex);
            if (matches) features.entities.push(...matches.map(m => ({ type, value: m.replace(/[@#]/g, '') })));
        }
        if (content.match(/[?]|^(what|how|why|explain|tell me)\s/i)) features.intents.push('question');
        if (content.match(/^[!/]/)) features.intents.push('command');
        if (content.match(/\b(hi|hello|hey|greetings)\b/i)) features.intents.push('greeting');
        if (['good', 'great', 'love', 'like', 'thanks'].some(w => content.includes(w))) features.sentiment = 'positive';
        else if (['bad', 'hate', 'wrong', 'error'].some(w => content.includes(w))) features.sentiment = 'negative';
        return features;
    }

    async #reason(attended) {
        const reasoning = { metta: null, llm: null, conclusions: [], confidence: 0 };
        if (this.reasoner) {
            try {
                const mettaResult = await this.reasoner.reason(attended);
                reasoning.metta = mettaResult;
                if (mettaResult?.conclusions) { reasoning.conclusions.push(...mettaResult.conclusions); reasoning.confidence += 0.3; }
            } catch (e) { Logger.debug('[Cognitive] MeTTa reasoning skipped:', e.message); }
        }
        if (this.llm) {
            try {
                const llmResult = await this.llm.reason(this.#buildLLMContext(attended));
                reasoning.llm = llmResult;
                if (llmResult?.response) {
                    reasoning.conclusions.push({ source: 'llm', content: llmResult.response, type: llmResult.type ?? 'response' });
                    reasoning.confidence += 0.5;
                }
            } catch (e) { Logger.debug('[Cognitive] LLM reasoning skipped:', e.message); }
        }
        reasoning.confidence = Math.min(1.0, reasoning.confidence);
        return reasoning;
    }

    #buildLLMContext(attended) {
        return {
            agentName: this.agentName, personality: this.config.personality,
            currentPerception: attended,
            workingMemory: this.memories.working.getContents(),
            relevantEpisodes: this.memories.episodic.getRelevant(attended, 3),
            relevantFacts: this.memories.semantic.getRelevant(attended, 5),
            userContext: attended.metadata?.from ? this.userModels.get(attended.metadata.from) : null
        };
    }

    #selectAction(reasoning, attended) {
        const action = { type: 'none', content: null, target: null, priority: 0, metadata: {} };
        const procedures = this.memories.procedural.match(attended);
        if (procedures.length > 0) {
            const proc = procedures[0];
            return { type: proc.actionType, content: proc.action, target: null, priority: 0.8, metadata: {} };
        }
        if (reasoning.conclusions.length > 0) {
            const conclusion = reasoning.conclusions[0];
            if (['response', 'answer'].includes(conclusion.type)) {
                action.type = 'respond'; action.content = conclusion.content; action.priority = reasoning.confidence;
            } else if (conclusion.type === 'tool_call') {
                action.type = 'tool'; action.content = conclusion.tool; action.metadata = conclusion.args; action.priority = 0.9;
            }
        }
        if (action.type === 'none') {
            const features = attended.features;
            if (features.intents.some(i => ['question', 'greeting'].includes(i)) || attended.content?.toLowerCase().includes(this.agentName.toLowerCase())) {
                action.type = 'respond';
                action.content = reasoning.llm?.response ?? this.#defaultResponse(features);
                action.priority = 0.5;
            }
        }
        action.target = attended.metadata?.isPrivate ? attended.metadata.from : (attended.metadata?.channel ?? this.config.defaultChannel);
        return action;
    }

    #defaultResponse(features) {
        if (features.intents.includes('greeting')) return `Hello! I'm ${this.agentName}. How can I help?`;
        if (features.intents.includes('question')) return "That's interesting. Let me think...";
        return "I see. Tell me more.";
    }

    async #execute(action) {
        const result = { success: false, output: null, error: null };
        try {
            switch (action.type) {
                case 'respond': result.output = action.content; result.success = true; break;
                case 'tool':
                    if (this.mcpClient) { result.output = await this.mcpClient.callTool(action.content, action.metadata); result.success = true; }
                    else result.error = 'No MCP client available';
                    break;
                case 'remember': this.memories.semantic.add(action.content); result.output = 'Remembered.'; result.success = true; break;
                default: result.error = `Unknown action type: ${action.type}`;
            }
        } catch (error) { result.error = error.message; }
        return result;
    }

    async #learn(percept, attended, reasoning, action, result) {
        this.memories.episodic.add({
            timestamp: Date.now(), perception, attended,
            reasoning: { metta: reasoning.metta ? 'success' : 'none', llm: reasoning.llm ? 'success' : 'none' },
            action, result
        });
        if (result.success && action.type === 'respond') {
            const knowledge = this.#extractKnowledge(percept);
            if (knowledge) this.memories.semantic.add(knowledge);
        }
        const userId = percept.metadata?.from;
        if (userId) this.#updateUserModel(userId, percept, action, result);
    }

    #extractKnowledge(percept) {
        const content = percept.content ?? '';
        for (const pattern of [/(\w+) is (?:a|an|the) (\w+)/i, /(\w+) lives in (\w+)/i, /(\w+) likes (\w+)/i, /I (?:live|work|study) in (\w+)/i]) {
            const match = content.match(pattern);
            if (match) return { type: 'fact', content: match[0], source: percept.metadata?.from ?? 'unknown', confidence: 0.7 };
        }
        return null;
    }

    #updateUserModel(userId, percept, action, result) {
        if (!this.userModels.has(userId)) {
            this.userModels.set(userId, { userId, firstSeen: Date.now(), lastInteraction: Date.now(), interactionCount: 0, preferences: {}, topics: [], sentiment: 'neutral' });
        }
        const model = this.userModels.get(userId);
        model.lastInteraction = Date.now();
        model.interactionCount++;
        const features = percept.features ?? {};
        if (features.entities) features.entities.forEach(e => { if (!model.topics.includes(e.value)) model.topics.push(e.value); });
        model.sentiment = features.sentiment ?? 'neutral';
    }

    getState() {
        return { cycle: this.state.cycle, phase: this.state.phase, workingMemory: this.memories.working.getContents(), attention: this.attention.getState(), userCount: this.userModels.size };
    }
}
