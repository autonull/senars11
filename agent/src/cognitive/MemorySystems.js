import { generateId } from '@senars/core';
import { contentOverlap } from './TextAnalysis.js';

export class SensoryBuffer {
    #buffer = [];
    constructor(capacity = 20) { this.capacity = capacity; }
    add(item) {
        this.#buffer.unshift({ ...item, added: Date.now() });
        if (this.#buffer.length > this.capacity) this.#buffer.pop();
    }
    getRecent(count = 5) { return this.#buffer.slice(0, count); }
    clear() { this.#buffer = []; }
}

export class WorkingMemory {
    #slots = [];
    constructor(capacity = 7) { this.capacity = capacity; }
    add(item) {
        const exists = this.#slots.find(s => s.content === item.content && s.source === item.source);
        if (exists) { exists.activation = Math.min(1.0, exists.activation + 0.2); exists.added = Date.now(); }
        else { this.#slots.unshift({ ...item, activation: 1.0, added: Date.now() }); if (this.#slots.length > this.capacity) this.#slots.pop(); }
    }
    decay(rate = 0.01) { this.#slots.forEach(s => { s.activation -= rate; }); this.#slots = this.#slots.filter(s => s.activation > 0.2); }
    getContents() { return this.#slots.map(s => ({ content: s.content, activation: s.activation })); }
    clear() { this.#slots = []; }
}

export class EpisodicMemory {
    #episodes = [];
    constructor(limit = 1000) { this.limit = limit; }
    add(episode) { this.#episodes.push({ ...episode, id: generateId('ep') }); if (this.#episodes.length > this.limit) this.#episodes.shift(); }
    getRelevant(current, count = 5) {
        const currentContent = current.content?.toLowerCase() ?? '';
        return this.#episodes.map(ep => ({ episode: ep, score: this.#relevanceScore(ep, currentContent) })).sort((a, b) => b.score - a.score).slice(0, count).map(s => s.episode);
    }
    search(query) { const q = query.toLowerCase(); return this.#episodes.filter(ep => ep.perception?.content?.toLowerCase().includes(q)); }
    #relevanceScore(episode, currentContent) {
        let score = Math.max(0, 1 - (Date.now() - episode.timestamp) / 3600000);
        const epContent = episode.perception?.content?.toLowerCase() ?? '';
        currentContent.split(/\s+/).forEach(word => { if (word.length > 3 && epContent.includes(word)) score += 0.1; });
        return score;
    }
}

export class CognitiveSemanticMemory {
    #knowledge = new Map();
    constructor(limit = 5000) { this.limit = limit; }
    add(knowledge) { const key = this.#indexKey(knowledge); if (!this.#knowledge.has(key)) this.#knowledge.set(key, []); this.#knowledge.get(key).push({ ...knowledge, added: Date.now(), accessCount: 0 }); if (this.#knowledge.size > this.limit) this.#prune(); }
    getRelevant(current, count = 10) {
        const key = this.#indexKey({ content: current.content });
        const results = this.#knowledge.has(key) ? [...this.#knowledge.get(key)] : [];
        for (const [k, items] of this.#knowledge.entries()) { if (k !== key && results.length < count) results.push(...items.slice(0, 2)); }
        results.forEach(item => { item.accessCount++; });
        return results.slice(0, count);
    }
    search(query) {
        const q = query.toLowerCase();
        const results = [];
        for (const items of this.#knowledge.values()) { items.forEach(item => { if (item.content?.toLowerCase().includes(q)) results.push(item); }); }
        return results;
    }
    #indexKey(knowledge) { const match = (knowledge.content ?? '').match(/\b(\w{4,})\b/); return match ? match[1].toLowerCase() : 'general'; }
    #prune() {
        const sorted = [...this.#knowledge.entries()].map(([key, items]) => ({ key, items: [...items].sort((a, b) => b.accessCount - a.accessCount) }));
        sorted.sort((a, b) => (a.items[0]?.accessCount ?? 0) - (b.items[0]?.accessCount ?? 0));
        let removed = 0;
        for (const entry of sorted) { if (removed >= this.#knowledge.size - this.limit) break; entry.items.pop(); removed++; }
    }
}

export class ProceduralMemory {
    #rules = new Map();
    constructor() { this.#initDefaults(); }
    #initDefaults() {
        this.add({ condition: { intent: 'greeting' }, actionType: 'respond', action: 'Hello! How can I help you today?' });
        this.add({ condition: { intent: 'command', command: 'help' }, actionType: 'respond', action: 'I can answer questions, remember facts, and help with various tasks. Just ask!' });
    }
    add(rule) { this.#rules.set(generateId('rule'), { ...rule, usage: 0 }); }
    match(perception) {
        const features = perception.features ?? {};
        const matches = [];
        for (const rule of this.#rules.values()) {
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

export class AttentionMechanism {
    #history = [];
    constructor({ threshold = 0.3 } = {}) { this.threshold = threshold; this.currentFocus = null; }
    select(perception, workingMemory, semanticMemory) {
        const attended = { ...perception, attentionWeight: perception.salience };
        workingMemory.getContents().forEach(wm => { if (this.#contentOverlap(perception.content, wm.content)) attended.attentionWeight += 0.2; });
        const semantic = semanticMemory.getRelevant(perception, 3);
        if (semantic.length > 0) attended.attentionWeight += 0.1 * semantic.length;
        attended.attentionWeight = Math.min(1.0, attended.attentionWeight);
        this.#history.push({ item: attended, timestamp: Date.now() });
        if (this.#history.length > 50) this.#history.shift();
        if (attended.attentionWeight >= this.threshold) this.currentFocus = attended;
        return attended;
    }
    #contentOverlap(a, b) {
        return contentOverlap(a, b);
    }
    getState() { return { currentFocus: this.currentFocus?.content ?? null, threshold: this.threshold, historyLength: this.#history.length }; }
}
