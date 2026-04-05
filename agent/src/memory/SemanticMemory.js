/**
 * SemanticMemory.js — Embedding-backed persistent memory
 */
import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback, fallbackMemoryDir, cosineSimilarity, generateId } from '@senars/core';
import { Embedder } from './Embedder.js';
import { MettaParser, toMettaAtom } from './MettaParser.js';

const __dataDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackMemoryDir);

class VectorIndex {
    constructor(dimensions, dataDir) {
        this._dimensions = dimensions;
        this._dataDir = dataDir;
        this._hnsw = null;
        this._itemMap = new Map();
        this._vectors = new Map();
        this._labelCounter = 0;
    }

    async _ensureHNSW() {
        if (this._hnsw) {return;}
        try {
            const NodeHNSW = (await import('hnswlib-node')).default;
            this._hnsw = new NodeHNSW(this._dimensions, 'cosine');
            Logger.info(`[VectorIndex] HNSW initialized (${this._dimensions} dims)`);
        } catch {
            Logger.warn('[VectorIndex] HNSW not available, using brute-force');
            this._hnsw = null;
        }
    }

    async add(id, vector) {
        await this._ensureHNSW();
        const label = this._labelCounter++;
        this._itemMap.set(id, label);
        this._vectors.set(id, vector);
        if (this._hnsw) {this._hnsw.addPoint(vector, label);}
    }

    async search(queryVector, k = 10) {
        await this._ensureHNSW();
        if (!this._hnsw || this._itemMap.size < 1000) {return this._bruteForceSearch(queryVector, k);}
        const results = this._hnsw.searchKnn(queryVector, k);
        return results.map(({ label, distance }) => {
            const id = [...this._itemMap].find(([, l]) => l === label)?.[0];
            return { id, score: 1 - distance };
        }).filter(r => r.id !== undefined);
    }

    _bruteForceSearch(queryVector, k) {
        const scores = [];
        for (const [id, vector] of this._vectors?.entries() ?? []) {
            scores.push({ id, score: cosineSimilarity(queryVector, vector) });
        }
        return scores.sort((a, b) => b.score - a.score).slice(0, k);
    }

    setVectors(vectors) { this._vectors = vectors; }
    async save() { if (this._hnsw) {Logger.debug('[VectorIndex] Index rebuild on restore (HNSW limitation)');} }
}

export class SemanticMemory {
    constructor({ dataDir = join(__dataDir, '../../workspace/semantic'), autoPinThreshold = 3 } = {}) {
        this._dataDir = dataDir;
        this._atoms = new Map();
        this._vectors = new Map();
        this._vectorIndex = new VectorIndex(384, dataDir);
        this._embedder = new Embedder();
        this._restored = false;
        this._accessCount = new Map();
        this._autoPinThreshold = autoPinThreshold;
    }

    get _index() { return this._vectorIndex; }

    async initialize() {
        if (this._restored) {return;}
        await mkdir(this._dataDir, { recursive: true });
        try {
            const atomsContent = await readFile(join(this._dataDir, 'atoms.metta'), 'utf8');
            this._parseAtoms(atomsContent);
            Logger.info(`[SemanticMemory] Restored ${this._atoms.size} atoms`);
        } catch {
            Logger.debug('[SemanticMemory] No existing atoms, starting fresh');
        }
        try {
            const vecContent = await readFile(join(this._dataDir, 'atoms.vec'), 'utf8');
            this._parseVectors(vecContent);
            this._index.setVectors(this._vectors);
            Logger.info(`[SemanticMemory] Restored ${this._vectors.size} vectors`);
        } catch {
            Logger.debug('[SemanticMemory] No existing vectors, will embed on demand');
        }
        this._restored = true;
    }

    _parseAtoms(content) {
        const parser = new MettaParser();
        parser.registerHandler('memory-atom', (atom) => atom);
        parser.registerHandler('memory-item', (item) => item);
        const parsed = parser.parse(content);
        for (const atom of parsed) {
            if (atom.id) {this._atoms.set(atom.id, atom);}
        }
    }

    _parseVectors(content) {
        for (const line of content.split('\n')) {
            if (!line.trim()) {continue;}
            const [id, ...vecParts] = line.split('|');
            if (id && vecParts.length > 0) {this._vectors.set(id.trim(), vecParts.join('').split(',').map(parseFloat));}
        }
    }

    async remember({ content, atom, type = 'semantic', source = 'local', tags = [], truth = { frequency: 0.9, confidence: 0.8 } }) {
        await this.initialize();
        const id = generateId('mem');
        const contentStr = atom ? (typeof atom === 'string' ? atom : atom.toString?.() ?? String(atom)) : content;
        const vector = await this._embedder.embed(contentStr);
        this._atoms.set(id, { id, timestamp: Date.now(), content: contentStr, atom: atom ?? contentStr, source, type, truth, tags: Array.isArray(tags) ? tags : (tags.split?.(',') ?? []) });
        this._vectors.set(id, vector);
        await this._index.add(id, vector);
        await this._persist();
        Logger.debug(`[SemanticMemory] remember: ${id}`);
        return id;
    }

async query(queryText, k = 10, options = {}) {
        await this.initialize();
        const queryVector = await this._embedder.embed(queryText);
        const results = await this._index.search(queryVector, k * 2);
        const filtered = results
        .map(({ id, score }) => { const atom = this._atoms.get(id); return atom ? { ...atom, score } : null; })
        .filter(atom => atom && (!options.type || atom.type === options.type) && atom.score >= (options.minScore ?? 0.0))
        .slice(0, k);
        for (const atom of filtered) {
            const count = (this._accessCount.get(atom.id) || 0) + 1;
            this._accessCount.set(atom.id, count);
            if (count >= this._autoPinThreshold && atom.type !== 'pinned') {
                await this.pin(atom.id);
                Logger.debug(`[SemanticMemory] Auto-pinned ${atom.id} after ${count} accesses`);
            }
        }
        return filtered;
    }

    async pin(memoryId) {
        await this.initialize();
        const atom = this._atoms.get(memoryId);
        if (!atom) {return false;}
        atom.type = 'pinned';
        await this._persist();
        return true;
    }

    async consolidate(options = {}) {
        await this.initialize();
        const { maxAgeMs = 7 * 24 * 60 * 60 * 1000, minAccessCount = 1, pruneLowAccess = false } = options;
        const now = Date.now();
        let pinned = 0, pruned = 0;

        for (const [id, atom] of this._atoms) {
            const accessCount = this._accessCount.get(id) || 0;
            if (accessCount >= this._autoPinThreshold && atom.type !== 'pinned') {
                atom.type = 'pinned';
                pinned++;
                Logger.debug(`[SemanticMemory] Consolidated: auto-pinned ${id}`);
            }
            if (pruneLowAccess && accessCount < minAccessCount && atom.type !== 'pinned') {
                const age = now - (atom.timestamp || 0);
                if (age > maxAgeMs) {
                    this._atoms.delete(id);
                    this._vectors.delete(id);
                    pruned++;
                }
            }
        }
        if (pinned > 0 || pruned > 0) {
            await this._persist();
            Logger.info(`[SemanticMemory] Consolidation: ${pinned} pinned, ${pruned} pruned`);
        }
        return { pinned, pruned };
    }

    async forget(queryText, k = 10) {
        await this.initialize();
        const results = await this.query(queryText, k, { minScore: 0.5 });
        let removed = 0;
        for (const { id } of results) { if (this._atoms.delete(id)) { this._vectors.delete(id); removed++; } }
        if (removed > 0) {await this._persist();}
        return removed;
    }

    async getRecent(maxItems = 20, maxChars = 8000) {
        return this._getByType(['episodic', 'semantic'], maxItems, maxChars);
    }

    async getPinned(maxChars = 3000) {
        return this._getByType('pinned', Infinity, maxChars);
    }

    async _getByType(types, maxItems, maxChars) {
        await this.initialize();
        const typeSet = Array.isArray(types) ? new Set(types) : new Set([types]);
        const result = [];
        let chars = 0;
        for (const atom of [...this._atoms.values()].filter(a => typeSet.has(a.type)).sort((a, b) => b.timestamp - a.timestamp).slice(0, maxItems)) {
            if (chars + atom.content.length > maxChars) {break;}
            result.push(atom);
            chars += atom.content.length;
        }
        return result;
    }

    async _persist() {
        await mkdir(this._dataDir, { recursive: true });
        const atomsContent = [...this._atoms.values()].map(a => toMettaAtom('memory-item', {
            id: a.id,
            timestamp: String(a.timestamp),
            atom: a.atom ?? a.content,
            source: a.source,
            type: `:${a.type}`,
            truth: `(stv ${a.truth.frequency} ${a.truth.confidence})`,
            tags: a.tags.join(' ')
        })).join('\n');
        await writeFile(join(this._dataDir, 'atoms.metta'), atomsContent);
        await writeFile(join(this._dataDir, 'atoms.vec'), [...this._vectors.entries()].map(([id, vec]) => `${id}|${vec.join(',')}`).join('\n'));
        await this._index.save();
    }

    get stats() {
        const byType = { semantic: 0, episodic: 0, procedural: 0, pinned: 0 };
        for (const { type } of this._atoms.values()) { if (type in byType) {byType[type]++;} }
        return { totalAtoms: this._atoms.size, totalVectors: this._vectors.size, byType };
    }
}
