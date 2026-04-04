import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

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

export class SemanticMemory extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.concepts = new Map();
        this.relationships = new Map();
        this._metricsTracker = new MetricsTracker({ conceptsLearned: 0, relationshipsLearned: 0 });
    }

    get metrics() { return this._metricsTracker; }

    learnConcept(name, features, metadata = {}) {
        const concept = {
            name, features,
            metadata: { learnedAt: Date.now(), usageCount: 0, ...metadata }
        };
        this.concepts.set(name, concept);
        this.metrics.increment('conceptsLearned');
        return concept;
    }

    learnRelationship(from, to, type, strength = 1.0) {
        const key = `${from}->${to}:${type}`;
        const relationship = { from, to, type, strength, learnedAt: Date.now() };
        this.relationships.set(key, relationship);
        this.metrics.increment('relationshipsLearned');
        return relationship;
    }

    getConcept(name) {
        const concept = this.concepts.get(name);
        if (concept) concept.metadata.usageCount++;
        return concept;
    }

    getRelatedConcepts(name, options = {}) {
        const { type, limit = 10 } = options;
        const related = [];

        for (const [key, rel] of this.relationships) {
            if (rel.from === name && (!type || rel.type === type)) {
                const target = this.concepts.get(rel.to);
                if (target) related.push({ concept: target, relationship: rel });
            }
            if (rel.to === name && (!type || rel.type === type)) {
                const source = this.concepts.get(rel.from);
                if (source) related.push({ concept: source, relationship: rel });
            }
        }

        return related.slice(0, limit);
    }

    findSimilarConcepts(features, options = {}) {
        const { limit = 5, threshold = 0.5 } = options;
        const similarities = [];

        for (const [name, concept] of this.concepts) {
            const similarity = this._computeFeatureSimilarity(features, concept.features);
            if (similarity >= threshold) similarities.push({ name, concept, similarity });
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
