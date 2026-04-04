import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { CausalGraph } from '../systems/CausalGraph.js';
import { Memory as CoreMemory } from '@senars/nar';
import { generateId } from '@senars/core';

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
    useCoreMemory: true,
    coreMemoryConfig: {}
};

export class EpisodicMemory extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.buffer = [];
        this.symbolicIndex = new Map();
        this.temporalIndex = new Map();
        this.causalGraph = this.config.useCausalIndexing ? new CausalGraph() : null;
        this._metricsTracker = new MetricsTracker({
            itemsStored: 0, itemsRetrieved: 0, consolidationsPerformed: 0
        });
        this.consolidationBuffer = [];
        this.coreMemory = this.config.useCoreMemory
            ? new CoreMemory({ ...this.config.coreMemoryConfig, maxConcepts: this.config.semanticCapacity })
            : null;
    }

    get metrics() { return this._metricsTracker; }

    store(item, options = {}) {
        const { timestamp = Date.now(), priority = 1.0, tags = [] } = options;
        const experience = { ...item, id: generateId('exp'), timestamp, priority, tags, decay: 1.0 };

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
        if (item.symbol) {
            if (!this.symbolicIndex.has(item.symbol)) this.symbolicIndex.set(item.symbol, []);
            this.symbolicIndex.get(item.symbol).push(index);
        }

        const timeBucket = Math.floor(item.timestamp / 60000);
        if (!this.temporalIndex.has(timeBucket)) this.temporalIndex.set(timeBucket, []);
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

        if (pattern.symbol && this.symbolicIndex.has(pattern.symbol)) {
            const indices = this.symbolicIndex.get(pattern.symbol);
            results = indices.map(i => this.buffer[i]);
        }

        if (pattern.startTime && pattern.endTime) {
            const timeBuckets = [];
            for (let t = pattern.startTime; t <= pattern.endTime; t += 60000) {
                const bucket = Math.floor(t / 60000);
                if (this.temporalIndex.has(bucket)) timeBuckets.push(...this.temporalIndex.get(bucket));
            }
            const timeResults = timeBuckets.map(i => this.buffer[i]);
            results = results.length > 0 ? results.filter(r => timeResults.includes(r)) : timeResults;
        }

        if (pattern.tags && pattern.tags.length > 0) {
            results = results.filter(r => pattern.tags.some(t => r.tags.includes(t)));
        }

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
        if (!current.symbol) return this._retrieveBySimilarity(current, limit, threshold);
        return this.query({ symbol: current.symbol }, { limit });
    }

    _retrieveBySimilarity(current, limit, threshold) {
        const similarities = this.buffer.map((item, i) => ({
            item, index: i, similarity: this._computeSimilarity(current, item)
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

        const groups = this._groupSimilarExperiences(this.consolidationBuffer);
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
        if (this.config.autoRebuildIndex) this._rebuildIndex();
    }

    _rebuildIndex() {
        this.symbolicIndex.clear();
        this.temporalIndex.clear();
        this.buffer.forEach((item, idx) => this._indexItem(item, idx));
    }

    getTrajectory(trajectoryId) {
        return this.buffer.filter(e => e.trajectoryId === trajectoryId);
    }

    getRecentEpisodes(count = 10) {
        const episodes = new Map();
        for (const item of this.buffer.slice().reverse()) {
            if (item.episode !== undefined) {
                if (!episodes.has(item.episode)) episodes.set(item.episode, []);
                episodes.get(item.episode).push(item);
                if (episodes.size >= count) break;
            }
        }

        return Array.from(episodes.entries()).map(([id, items]) => ({
            id, items, totalReward: items.reduce((s, i) => s + (i.reward ?? 0), 0)
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
        return { buffer: this.buffer.slice(-100), stats: this.getStats() };
    }
}
