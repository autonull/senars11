/**
 * @file NarsGPTStrategy.js
 * NARS-GPT style premise formation strategy with attention buffer,
 * term atomization, grounding, and perspective transformation.
 */

import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';

// Perspective transformation patterns
const SWAP_PATTERNS = [
    [/\byou are\b/gi, '___I_AM___'], [/\bi am\b/gi, '___YOU_ARE___'],
    [/\byou\b/gi, '___I___'], [/\bi\b/g, '___you___'],
    [/\byour\b/gi, '___MY___'], [/\bmy\b/gi, '___YOUR___'],
];
const SWAP_RESTORE = {
    '___I_AM___': 'I am', '___YOU_ARE___': 'you are',
    '___I___': 'I', '___you___': 'you',
    '___MY___': 'my', '___YOUR___': 'your'
};

const NEUTRALIZE_PATTERNS = [
    [/\b(I|you|we|they)\s+am\b/gi, 'one is'], [/\b(I|you|we|they)\s+are\b/gi, 'one is'],
    [/\b(I|you|he|she|we|they)\s+have\b/gi, 'one has'], [/\b(I|you|he|she|we|they)\s+had\b/gi, 'one had'],
    [/\bI\b/g, 'one'], [/\byou\b/gi, 'one'], [/\bwe\b/gi, 'one'],
    [/\bmy\b/gi, 'one\'s'], [/\byour\b/gi, 'one\'s'], [/\bour\b/gi, 'one\'s'],
    [/\bmine\b/gi, 'one\'s'], [/\byours\b/gi, 'one\'s'], [/\bours\b/gi, 'one\'s'],
    [/\bmyself\b/gi, 'oneself'], [/\byourself\b/gi, 'oneself'], [/\bourselves\b/gi, 'oneself'],
];

const DEFAULT_CONFIG = {
    relevantViewSize: 30, recentViewSize: 10,
    atomCreationThreshold: 0.95, eternalizationDistance: 3,
    perspectiveMode: 'swap', // 'swap' | 'neutralize' | 'none'
    relevanceThreshold: 0.3, groundingThreshold: 0.8,
    weights: {relevance: 0.7, recency: 0.3}
};

export class NarsGPTStrategy extends PremiseFormationStrategy {
    constructor(config = {}) {
        super({priority: config.priority ?? 0.9, ...config});
        this._name = 'NarsGPT';

        Object.assign(this, {
            embeddingLayer: config.embeddingLayer ?? null,
            eventBus: config.eventBus ?? null,
            ...DEFAULT_CONFIG,
            ...config,
            weights: {...DEFAULT_CONFIG.weights, ...config.weights}
        });

        // Legacy compat
        if (config.perspectiveSwapEnabled === false) this.perspectiveMode = 'none';
        if (config.perspectiveSwapEnabled === true && !config.perspectiveMode) this.perspectiveMode = 'swap';

        this.groundings = new Map();
        this.atoms = new Map();
        this._metrics = {attentionBufferBuilds: 0, atomizations: 0, groundingChecks: 0, perspectiveOps: 0};
    }

    get name() {
        return this._name;
    }

    get metrics() {
        return {...this._metrics, ...this._stats};
    }

    get perspectiveSwapEnabled() {
        return this.perspectiveMode === 'swap';
    }

    _getConcepts(memory) {
        return memory?.concepts ?? memory?._concepts;
    }

    _emit(event, data) {
        this.eventBus?.emit?.(event, data);
    }

    async* generateCandidates(primaryTask, context) {
        if (!context.memory) return;
        const termStr = primaryTask.term?.toString?.() ?? String(primaryTask.term);
        const buffer = await this.buildAttentionBuffer(termStr, context.memory, context.currentTime ?? Date.now());

        this._emit('narsgpt:candidates', {query: termStr, bufferSize: buffer.length});

        for (const item of buffer) {
            this._recordCandidate();
            yield {
                term: item.task.term, type: 'narsgpt-attention', priority: item.score,
                sourceTask: item.task, metadata: {relevance: item.relevance, recency: item.recency}
            };
        }
    }

    async buildAttentionBuffer(queryText, memory, currentTime) {
        this._metrics.attentionBufferBuilds++;
        if (!memory) return [];

        const relevant = await this._getRelevantItems(queryText, memory);
        const recent = this._getRecentItems(memory, currentTime);

        const seen = new Set();
        return [...relevant, ...recent]
            .filter(item => {
                const key = item.task.term?.toString?.() ?? String(item.task);
                return !seen.has(key) && seen.add(key);
            })
            .sort((a, b) => b.score - a.score);
    }

    async _getRelevantItems(queryText, memory) {
        if (!this.embeddingLayer) return [];

        try {
            const queryEmbed = await this.embeddingLayer.getEmbedding(queryText);
            const concepts = this._getConcepts(memory);
            if (!concepts) return [];

            const tasks = [];
            for (const [, concept] of concepts) {
                for (const task of concept.beliefs ?? []) tasks.push(task);
                if (tasks.length >= this.relevantViewSize * 2) break;
            }

            const results = [];
            for (const task of tasks) {
                const embed = await this.embeddingLayer.getEmbedding(task.term?.toString?.() ?? String(task.term));
                const relevance = this.embeddingLayer.calculateSimilarity(queryEmbed, embed);
                if (relevance > this.relevanceThreshold) {
                    results.push({task, relevance, recency: 0, score: relevance * this.weights.relevance});
                }
                if (results.length >= this.relevantViewSize) break;
            }
            return results.sort((a, b) => b.relevance - a.relevance).slice(0, this.relevantViewSize);
        } catch {
            return [];
        }
    }

    async batchScore(queryText, candidateTexts) {
        if (!this.embeddingLayer || !candidateTexts?.length) return [];
        try {
            const queryEmbed = await this.embeddingLayer.getEmbedding(queryText);
            const results = await Promise.all(
                candidateTexts.map(async text => ({
                    text,
                    similarity: this.embeddingLayer.calculateSimilarity(queryEmbed, await this.embeddingLayer.getEmbedding(text))
                }))
            );
            return results.sort((a, b) => b.similarity - a.similarity);
        } catch {
            return [];
        }
    }

    _getRecentItems(memory, currentTime) {
        const concepts = this._getConcepts(memory);
        if (!concepts) return [];

        const tasks = [];
        for (const [, concept] of concepts) {
            for (const task of concept.beliefs ?? []) {
                tasks.push({task, lastUsed: task.stamp?.occurrenceTime ?? task.creationTime ?? 0});
            }
        }

        return tasks
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .slice(0, this.recentViewSize)
            .map(({task, lastUsed}) => {
                const recency = Math.max(0, 1 - (currentTime - lastUsed) / 100000);
                return {task, relevance: 0, recency, score: recency * this.weights.recency};
            });
    }

    async atomize(termString, type = 'NOUN') {
        this._metrics.atomizations++;
        if (!this.embeddingLayer) return {isNew: true, unifiedTerm: null};

        try {
            const embedding = await this.embeddingLayer.getEmbedding(termString);
            for (const [existingTerm, data] of this.atoms) {
                if (data.type === type) {
                    const sim = this.embeddingLayer.calculateSimilarity(embedding, data.embedding);
                    if (sim >= this.atomCreationThreshold) {
                        this._emit('narsgpt:atomUnified', {term: termString, unifiedTo: existingTerm, similarity: sim});
                        return {isNew: false, unifiedTerm: existingTerm};
                    }
                }
            }
            this.atoms.set(termString, {embedding, type});
            this._emit('narsgpt:atomCreated', {term: termString, type});
            return {isNew: true, unifiedTerm: null};
        } catch {
            return {isNew: true, unifiedTerm: null};
        }
    }

    async ground(narsese, sentence) {
        if (!this.embeddingLayer) return;
        try {
            const embedding = await this.embeddingLayer.getEmbedding(sentence);
            this.groundings.set(narsese, {sentence, embedding});
            this._emit('narsgpt:grounded', {narsese, sentence});
        } catch { /* ignore */
        }
    }

    async checkGrounding(input) {
        this._metrics.groundingChecks++;
        if (!this.embeddingLayer || !this.groundings.size) return {grounded: false, match: null, similarity: 0};

        try {
            const inputEmbed = await this.embeddingLayer.getEmbedding(input);
            let bestMatch = null, bestSim = 0;

            for (const [narsese, {embedding}] of this.groundings) {
                const sim = this.embeddingLayer.calculateSimilarity(inputEmbed, embedding);
                if (sim > bestSim) {
                    bestSim = sim;
                    bestMatch = narsese;
                }
            }

            return {grounded: bestSim > this.groundingThreshold, match: bestMatch, similarity: bestSim};
        } catch {
            return {grounded: false, match: null, similarity: 0};
        }
    }

    eternalize(memory, currentTime) {
        const concepts = this._getConcepts(memory);
        if (!concepts) return;

        let count = 0;
        for (const [, concept] of concepts) {
            for (const task of concept.beliefs ?? []) {
                const occ = task.stamp?.occurrenceTime;
                if (occ !== undefined && occ !== 'eternal' && currentTime - occ >= this.eternalizationDistance) {
                    task.stamp.occurrenceTime = 'eternal';
                    count++;
                }
            }
        }
        if (count) this._emit('narsgpt:eternalized', {count});
    }

    // Perspective transformations

    perspectiveSwap(text) {
        if (this.perspectiveMode === 'none' || !text) return text;
        if (this.perspectiveMode === 'neutralize') return this.perspectiveNeutralize(text);

        this._metrics.perspectiveOps++;
        let result = ` ${text} `;
        for (const [pattern, placeholder] of SWAP_PATTERNS) result = result.replace(pattern, placeholder);
        for (const [placeholder, replacement] of Object.entries(SWAP_RESTORE)) {
            result = result.replaceAll(placeholder, replacement);
        }
        return result.trim();
    }

    perspectiveNeutralize(text) {
        if (!text) return text;
        this._metrics.perspectiveOps++;
        let result = text;
        for (const [pattern, replacement] of NEUTRALIZE_PATTERNS) result = result.replace(pattern, replacement);
        return result;
    }

    formatContext(buffer) {
        if (!buffer?.length) return '(No relevant memory items)';
        return buffer.map((item, i) => {
            const term = item.task.term?.toString?.() ?? String(item.task.term);
            const {f = 0, c = 0} = item.task.truth ?? {};
            return `${i + 1}. ${term}${item.task.truth ? ` {${f.toFixed(2)} ${c.toFixed(2)}}` : ''}`;
        }).join('\n');
    }

    reviseWithMemory(newTruth, memory, termString) {
        const concepts = this._getConcepts(memory);
        if (!concepts) return newTruth;

        for (const [, concept] of concepts) {
            for (const belief of concept.beliefs ?? []) {
                if (belief.term?.toString?.() === termString && belief.truth) {
                    const f1 = newTruth.f ?? newTruth.frequency ?? 0.9, c1 = newTruth.c ?? newTruth.confidence ?? 0.8;
                    const f2 = belief.truth.f ?? belief.truth.frequency ?? 0.9,
                        c2 = belief.truth.c ?? belief.truth.confidence ?? 0.8;
                    const w1 = c1 / (1 - c1), w2 = c2 / (1 - c2), w = w1 + w2;
                    return {frequency: (w1 * f1 + w2 * f2) / w, confidence: w / (w + 1)};
                }
            }
        }
        return newTruth;
    }

    reset() {
        this.groundings.clear();
        this.atoms.clear();
        this._metrics = {attentionBufferBuilds: 0, atomizations: 0, groundingChecks: 0, perspectiveOps: 0};
        this.resetStats();
    }

    getStatus() {
        return {
            ...super.getStatus(),
            name: this._name,
            config: {
                relevantViewSize: this.relevantViewSize, recentViewSize: this.recentViewSize,
                atomCreationThreshold: this.atomCreationThreshold, eternalizationDistance: this.eternalizationDistance,
                perspectiveMode: this.perspectiveMode, weights: this.weights
            },
            groundingsCount: this.groundings.size, atomsCount: this.atoms.size, metrics: this._metrics
        };
    }
}
