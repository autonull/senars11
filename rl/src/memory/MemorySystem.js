/**
 * Enhanced Memory and Grounding System
 * Leverages core/memory for unified memory management
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { CausalGraph } from '../cognitive/CognitiveSystem.js';
import { Memory as CoreMemory } from '@senars/core';

const MEMORY_DEFAULTS = {
    capacity: 10000,
    episodicCapacity: 1000,
    semanticCapacity: 500,
    autoRebuildIndex: true,
    consolidationThreshold: 100,
    retrievalK: 5,
    similarityThreshold: 0.7,
    useCausalIndexing: true,
    decayRate: 0.01,
    // Core memory integration
    useCoreMemory: true,
    coreMemoryConfig: {}
};

const GROUNDING_DEFAULTS = {
    precision: 10,
    prefix: 'state',
    valuePrefix: 'val',
    actionPrefix: 'op',
    useLearnedGrounding: true,
    groundingThreshold: 0.5
};

/**
 * Episodic Memory - Now leverages core/Memory for concept management
 */
export class EpisodicMemory extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.buffer = [];
        this.symbolicIndex = new Map();
        this.temporalIndex = new Map();
        this.causalGraph = this.config.useCausalIndexing ? new CausalGraph() : null;
        this._metricsTracker = new MetricsTracker({
            itemsStored: 0,
            itemsRetrieved: 0,
            consolidationsPerformed: 0
        });
        this.consolidationBuffer = [];
        
        // Optional core memory integration for concept-based storage
        this.coreMemory = this.config.useCoreMemory
            ? new CoreMemory({
                ...this.config.coreMemoryConfig,
                maxConcepts: this.config.semanticCapacity
            })
            : null;
    }

    get metrics() {
        return this._metricsTracker;
    }

    store(item, options = {}) {
        const { timestamp = Date.now(), priority = 1.0, tags = [] } = options;
        
        const experience = {
            ...item,
            id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            priority,
            tags,
            decay: 1.0
        };

        this.buffer.push(experience);
        this._indexItem(experience, this.buffer.length - 1);
        this.metrics.increment('itemsStored');

        if (this.config.useCausalIndexing && item.state && item.nextState) {
            this._updateCausalGraph(item);
        }

        this.consolidationBuffer.push(experience);
        if (this.consolidationBuffer.length >= this.config.consolidationThreshold) {
            this.consolidate();
        }

        if (this.buffer.length > this.config.capacity) {
            this._applyDecay();
            this._removeLowPriority();
        }

        return experience.id;
    }

    storeBatch(items, options = {}) {
        return items.map(item => this.store(item, options));
    }

    _indexItem(item, index) {
        // Symbolic index
        if (item.symbol) {
            if (!this.symbolicIndex.has(item.symbol)) {
                this.symbolicIndex.set(item.symbol, []);
            }
            this.symbolicIndex.get(item.symbol).push(index);
        }

        // Temporal index (by episode or time bucket)
        const timeBucket = Math.floor(item.timestamp / 60000); // 1-minute buckets
        if (!this.temporalIndex.has(timeBucket)) {
            this.temporalIndex.set(timeBucket, []);
        }
        this.temporalIndex.get(timeBucket).push(index);
    }

    _updateCausalGraph(item) {
        if (!this.causalGraph) return;

        const stateKey = JSON.stringify(item.state);
        const nextStateKey = JSON.stringify(item.nextState);

        if (!this.causalGraph.nodes.has(stateKey)) {
            this.causalGraph.addNode(stateKey, { type: 'state', data: item.state });
        }
        if (!this.causalGraph.nodes.has(nextStateKey)) {
            this.causalGraph.addNode(nextStateKey, { type: 'state', data: item.nextState });
        }

        this.causalGraph.addEdge(stateKey, nextStateKey, item.reward > 0 ? 0.8 : 0.3);
    }

    query(pattern, options = {}) {
        const { limit = this.config.retrievalK, sortBy = 'timestamp' } = options;
        
        let results = [];

        // Query by symbol
        if (pattern.symbol && this.symbolicIndex.has(pattern.symbol)) {
            const indices = this.symbolicIndex.get(pattern.symbol);
            results = indices.map(i => this.buffer[i]);
        }

        // Query by time range
        if (pattern.startTime && pattern.endTime) {
            const timeBuckets = [];
            for (let t = pattern.startTime; t <= pattern.endTime; t += 60000) {
                const bucket = Math.floor(t / 60000);
                if (this.temporalIndex.has(bucket)) {
                    timeBuckets.push(...this.temporalIndex.get(bucket));
                }
            }
            const timeResults = timeBuckets.map(i => this.buffer[i]);
            results = results.length > 0 ? results.filter(r => timeResults.includes(r)) : timeResults;
        }

        // Query by tags
        if (pattern.tags && pattern.tags.length > 0) {
            results = results.filter(r => pattern.tags.some(t => r.tags.includes(t)));
        }

        // Sort
        if (sortBy === 'timestamp') {
            results.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortBy === 'priority') {
            results.sort((a, b) => b.priority - a.priority);
        }

        this.metrics.increment('itemsRetrieved', results.length);
        return results.slice(0, limit);
    }

    retrieveSimilar(current, options = {}) {
        const { limit = this.config.retrievalK, threshold = this.config.similarityThreshold } = options;
        
        if (!current.symbol) {
            return this._retrieveBySimilarity(current, limit, threshold);
        }

        return this.query({ symbol: current.symbol }, { limit });
    }

    _retrieveBySimilarity(current, limit, threshold) {
        const similarities = this.buffer.map((item, i) => ({
            item,
            index: i,
            similarity: this._computeSimilarity(current, item)
        }));

        return similarities
            .filter(s => s.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit)
            .map(s => s.item);
    }

    _computeSimilarity(a, b) {
        if (!a.state || !b.state) return 0;

        const aState = Array.isArray(a.state) ? a.state : [a.state];
        const bState = Array.isArray(b.state) ? b.state : [b.state];

        // Cosine similarity
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(aState.length, bState.length);

        for (let i = 0; i < len; i++) {
            dot += aState[i] * bState[i];
            normA += aState[i] * aState[i];
            normB += bState[i] * bState[i];
        }

        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }

    consolidate() {
        if (this.consolidationBuffer.length === 0) return [];

        // Group similar experiences
        const groups = this._groupSimilarExperiences(this.consolidationBuffer);
        
        // Create consolidated memories
        const consolidated = groups.map(group => ({
            type: 'consolidated',
            pattern: group.pattern,
            count: group.items.length,
            avgReward: group.items.reduce((s, i) => s + (i.reward ?? 0), 0) / group.items.length,
            successRate: group.items.filter(i => (i.reward ?? 0) > 0).length / group.items.length,
            timestamp: Date.now()
        }));

        this.metrics.increment('consolidationsPerformed');
        this.consolidationBuffer = [];
        
        return consolidated;
    }

    _groupSimilarExperiences(experiences) {
        const groups = [];

        for (const exp of experiences) {
            const stateKey = Array.isArray(exp.state) ? exp.state.map(v => Math.round(v * 10)).join('_') : String(exp.state);
            
            let group = groups.find(g => g.pattern === stateKey);
            if (!group) {
                group = { pattern: stateKey, items: [] };
                groups.push(group);
            }
            group.items.push(exp);
        }

        return groups;
    }

    _applyDecay() {
        for (const item of this.buffer) {
            item.decay = Math.max(0, item.decay - this.config.decayRate);
            item.priority *= (1 - this.config.decayRate);
        }
    }

    _removeLowPriority() {
        const sorted = [...this.buffer].sort((a, b) => b.priority - a.priority);
        const removeCount = Math.floor(this.buffer.length * 0.1);
        const toRemove = sorted.slice(-removeCount);

        this.buffer = this.buffer.filter(item => !toRemove.includes(item));
        
        // Rebuild indices
        if (this.config.autoRebuildIndex) {
            this._rebuildIndex();
        }
    }

    _rebuildIndex() {
        this.symbolicIndex.clear();
        this.temporalIndex.clear();
        
        this.buffer.forEach((item, idx) => {
            this._indexItem(item, idx);
        });
    }

    getTrajectory(trajectoryId) {
        return this.buffer.filter(e => e.trajectoryId === trajectoryId);
    }

    getRecentEpisodes(count = 10) {
        const episodes = new Map();
        
        for (const item of this.buffer.slice().reverse()) {
            if (item.episode !== undefined) {
                if (!episodes.has(item.episode)) {
                    episodes.set(item.episode, []);
                }
                episodes.get(item.episode).push(item);
                
                if (episodes.size >= count) break;
            }
        }

        return Array.from(episodes.entries()).map(([id, items]) => ({
            id,
            items,
            totalReward: items.reduce((s, i) => s + (i.reward ?? 0), 0)
        }));
    }

    getStats() {
        return {
            totalItems: this.buffer.length,
            symbolicIndexSize: this.symbolicIndex.size,
            temporalIndexSize: this.temporalIndex.size,
            causalGraphNodes: this.causalGraph?.nodes?.size ?? 0,
            consolidationBufferSize: this.consolidationBuffer.length,
            metrics: this.metrics.getAll()
        };
    }

    clear() {
        this.buffer = [];
        this.symbolicIndex.clear();
        this.temporalIndex.clear();
        this.consolidationBuffer = [];
        this.causalGraph = this.config.useCausalIndexing ? new CausalGraph() : null;
        this.metrics.reset();
    }

    toJSON() {
        return {
            buffer: this.buffer.slice(-100),
            stats: this.getStats()
        };
    }
}

/**
 * Semantic Memory for learned knowledge
 */
export class SemanticMemory extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.concepts = new Map();
        this.relationships = new Map();
        this._metricsTracker = new MetricsTracker({ conceptsLearned: 0, relationshipsLearned: 0 });
    }

    get metrics() {
        return this._metricsTracker;
    }

    learnConcept(name, features, metadata = {}) {
        const concept = {
            name,
            features,
            metadata: {
                learnedAt: Date.now(),
                usageCount: 0,
                ...metadata
            }
        };

        this.concepts.set(name, concept);
        this.metrics.increment('conceptsLearned');
        return concept;
    }

    learnRelationship(from, to, type, strength = 1.0) {
        const key = `${from}->${to}:${type}`;
        const relationship = {
            from,
            to,
            type,
            strength,
            learnedAt: Date.now()
        };

        this.relationships.set(key, relationship);
        this.metrics.increment('relationshipsLearned');
        return relationship;
    }

    getConcept(name) {
        const concept = this.concepts.get(name);
        if (concept) {
            concept.metadata.usageCount++;
        }
        return concept;
    }

    getRelatedConcepts(name, options = {}) {
        const { type, limit = 10 } = options;
        const related = [];

        for (const [key, rel] of this.relationships) {
            if (rel.from === name && (!type || rel.type === type)) {
                const target = this.concepts.get(rel.to);
                if (target) {
                    related.push({ concept: target, relationship: rel });
                }
            }
            if (rel.to === name && (!type || rel.type === type)) {
                const source = this.concepts.get(rel.from);
                if (source) {
                    related.push({ concept: source, relationship: rel });
                }
            }
        }

        return related.slice(0, limit);
    }

    findSimilarConcepts(features, options = {}) {
        const { limit = 5, threshold = 0.5 } = options;
        
        const similarities = [];
        
        for (const [name, concept] of this.concepts) {
            const similarity = this._computeFeatureSimilarity(features, concept.features);
            if (similarity >= threshold) {
                similarities.push({ name, concept, similarity });
            }
        }

        return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }

    _computeFeatureSimilarity(a, b) {
        if (!a || !b) return 0;
        
        const aArr = Array.isArray(a) ? a : Object.values(a);
        const bArr = Array.isArray(b) ? b : Object.values(b);
        
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(aArr.length, bArr.length);

        for (let i = 0; i < len; i++) {
            dot += aArr[i] * bArr[i];
            normA += aArr[i] * aArr[i];
            normB += bArr[i] * bArr[i];
        }

        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }

    getStats() {
        return {
            conceptsCount: this.concepts.size,
            relationshipsCount: this.relationships.size,
            metrics: this.metrics.getAll()
        };
    }

    clear() {
        this.concepts.clear();
        this.relationships.clear();
        this.metrics.reset();
    }
}

/**
 * Enhanced Grounding with learned mappings
 */
export class LearnedGrounding extends Component {
    constructor(config = {}) {
        super(mergeConfig(GROUNDING_DEFAULTS, config));
        this.conceptMap = new Map();
        this.valueMap = new Map();
        this.actionMap = new Map();
        this.counter = 0;
        this._metricsTracker = new MetricsTracker({ liftsPerformed: 0, groundingsPerformed: 0 });
    }

    get metrics() {
        return this._metricsTracker;
    }

    lift(observation, options = {}) {
        const { precision = this.config.precision, prefix = this.config.prefix } = options;
        this.metrics.increment('liftsPerformed');

        if (typeof observation === 'number') {
            return this._liftNumber(observation, precision, this.config.valuePrefix);
        }
        
        if (Array.isArray(observation)) {
            return this._liftArray(observation, precision, prefix);
        }

        return String(observation);
    }

    _liftNumber(val, precision, prefix) {
        const bin = Math.floor(val * precision) / precision;
        return `${prefix}_${String(bin).replace('.', 'd')}`;
    }

    _liftArray(arr, precision, prefix) {
        const key = arr.map(x => String(Math.floor(x * precision) / precision).replace('.', 'd')).join('_');
        return `${prefix}_${key}`;
    }

    ground(symbols, options = {}) {
        this.metrics.increment('groundingsPerformed');

        if (this.conceptMap.has(symbols)) {
            return this.conceptMap.get(symbols);
        }

        return this._parseActionSymbol(symbols);
    }

    _parseActionSymbol(symbols) {
        if (typeof symbols !== 'string') return symbols;

        const stripped = symbols.startsWith('^') ? symbols.slice(1)
            : symbols.startsWith('op_') ? symbols.slice(3)
            : symbols;

        if (stripped.startsWith('(')) {
            const content = stripped.slice(1, -1).trim();
            if (!/[a-zA-Z>]/.test(content)) {
                const numbers = content.split(/[\s,]+/).filter(s => s).map(Number);
                if (numbers.every(n => !isNaN(n))) return numbers;
            }
        }

        if (stripped.startsWith('action_')) {
            return parseInt(stripped.split('_')[1], 10);
        }

        const num = parseFloat(stripped);
        return isNaN(num) ? symbols : num;
    }

    learnGrounding(symbol, value, type = 'concept') {
        if (type === 'concept') {
            this.conceptMap.set(symbol, value);
        } else if (type === 'value') {
            this.valueMap.set(symbol, value);
        } else if (type === 'action') {
            this.actionMap.set(symbol, value);
        }
        return this;
    }

    getGrounding(symbol) {
        return this.conceptMap.get(symbol) ?? 
               this.valueMap.get(symbol) ?? 
               this.actionMap.get(symbol);
    }

    hasGrounding(symbol) {
        return this.conceptMap.has(symbol) || 
               this.valueMap.has(symbol) || 
               this.actionMap.has(symbol);
    }

    update(obs, symbols) {
        this.conceptMap.set(symbols, obs);
    }

    clear() {
        this.conceptMap.clear();
        this.valueMap.clear();
        this.actionMap.clear();
        this.counter = 0;
        this.metrics.reset();
    }

    getStats() {
        return {
            conceptMappings: this.conceptMap.size,
            valueMappings: this.valueMap.size,
            actionMappings: this.actionMap.size,
            metrics: this.metrics.getAll()
        };
    }
}

/**
 * Unified Memory System combining episodic and semantic memory
 */
export class MemorySystem extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.episodic = new EpisodicMemory(config);
        this.semantic = new SemanticMemory(config);
        this.grounding = new LearnedGrounding(config);
        this._metricsTracker = new MetricsTracker({ queriesPerformed: 0 });
    }

    get metrics() {
        return this._metricsTracker;
    }

    async onInitialize() {
        await this.episodic.initialize();
        await this.semantic.initialize();
        await this.grounding.initialize();
        this.emit('initialized', { 
            episodicCapacity: this.config.episodicCapacity,
            semanticCapacity: this.config.semanticCapacity
        });
    }

    store(experience, options = {}) {
        const { useGrounding = true } = options;
        
        if (useGrounding) {
            experience.symbol = this.grounding.lift(experience.state);
        }

        return this.episodic.store(experience, options);
    }

    query(pattern, options = {}) {
        this.metrics.increment('queriesPerformed');
        return this.episodic.query(pattern, options);
    }

    learnConcept(name, features, metadata = {}) {
        return this.semantic.learnConcept(name, features, metadata);
    }

    getRelatedConcepts(name, options = {}) {
        return this.semantic.getRelatedConcepts(name, options);
    }

    getStats() {
        return {
            episodic: this.episodic.getStats(),
            semantic: this.semantic.getStats(),
            grounding: this.grounding.getStats(),
            metrics: this.metrics.getAll()
        };
    }

    async onShutdown() {
        await this.episodic.shutdown();
        await this.semantic.shutdown();
        await this.grounding.shutdown();
    }
}

export { EpisodicMemory as Memory };
export { SemanticMemory as Knowledge };
export { LearnedGrounding as Grounding };
export { MemorySystem as UnifiedMemory };
