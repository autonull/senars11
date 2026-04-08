/**
 * SemanticMemory.js — Embedding-backed persistent memory
 *
 * Architecture:
 * - AtomStore: PersistentSpace for atoms with metadata (MeTTa triplets)
 * - VectorIndex: Private HNSW index for cosine similarity search
 * - Embedder: Lazy-loaded @huggingface/transformers or OpenAI API fallback
 *
 * Memory atom format:
 *   (memory-atom
 *     :id        "mem_1743432000_abc"
 *     :timestamp 1743432000000
 *     :content   "User prefers terse explanations"
 *     :source    "irc:##metta:user42"
 *     :type      :semantic  ; :semantic | :episodic | :procedural | :pinned
 *     :truth     (stv 0.9 0.8)
 *     :tags      ("preference" "style")
 *   )
 */

import { Logger } from '@senars/core';
import { Embedder } from './Embedder.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * Private VectorIndex class using HNSW for approximate nearest neighbor search.
 * Falls back to brute-force cosine similarity for small datasets (< 1000 items).
 */
class VectorIndex {
    constructor(dimensions, dataDir) {
        this._dimensions = dimensions;
        this._dataDir = dataDir;
        this._hnsw = null;
        this._itemMap = new Map(); // id → label (HNSW label)
        this._labelCounter = 0;
        this._restored = false;
    }

    async _ensureHNSW() {
        if (this._hnsw) return;
        try {
            const NodeHNSW = (await import('hnswlib-node')).default;
            this._hnsw = new NodeHNSW(this._dimensions, 'cosine');
            Logger.info(`[VectorIndex] HNSW initialized (${this._dimensions} dims)`);
        } catch (err) {
            Logger.warn('[VectorIndex] HNSW not available, using brute-force');
            this._hnsw = null;
        }
    }

    async add(id, vector) {
        await this._ensureHNSW();
        const label = this._labelCounter++;
        this._itemMap.set(id, label);

        if (this._hnsw) {
            this._hnsw.addPoint(vector, label);
        }
        // Brute-force: vector stored in _itemMap implicitly via id
    }

    async search(queryVector, k = 10) {
        await this._ensureHNSW();

        // Brute-force fallback
        if (!this._hnsw || this._itemMap.size < 1000) {
            return this._bruteForceSearch(queryVector, k);
        }

        // HNSW search
        const results = this._hnsw.searchKnn(queryVector, k);
        return results.map(({ label, distance }) => {
            const id = [...this._itemMap].find(([_, l]) => l === label)?.[0];
            return { id, score: 1 - distance };
        }).filter(r => r.id !== undefined);
    }

    _bruteForceSearch(queryVector, k) {
        const scores = [];
        for (const [id, _] of this._itemMap) {
            const vector = this._vectors?.get(id);
            if (vector) {
                const score = cosineSimilarity(queryVector, vector);
                scores.push({ id, score });
            }
        }
        return scores.sort((a, b) => b.score - a.score).slice(0, k);
    }

    // For brute-force mode, store vectors in memory
    setVectors(vectors) {
        this._vectors = vectors;
    }

    getVectors() {
        return this._vectors;
    }

    async save() {
        if (!this._hnsw) return;
        const indexPath = join(this._dataDir, 'index.bin');
        // HNSW save not directly supported; we rebuild on restore
        Logger.debug('[VectorIndex] Index rebuild on restore (HNSW limitation)');
    }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * SemanticMemory: Main class exposing high-level API.
 */
export class SemanticMemory {
    constructor(config = {}) {
        this._config = config;
        this._dataDir = config.dataDir ?? join(__dir, '../../memory');
        this._embedder = new Embedder({
            model: config.embedder ?? 'Xenova/all-MiniLM-L6-v2',
            dimensions: config.vectorDimensions ?? 384,
            fallback: config.embedderFallback // { provider: 'openai', apiKey: '...' }
        });
        this._index = new VectorIndex(
            config.vectorDimensions ?? 384,
            this._dataDir
        );
        this._atoms = new Map(); // id → atom object
        this._vectors = new Map(); // id → vector array
        this._restored = false;
    }

    /**
     * Initialize: restore atoms from disk, rebuild index.
     */
    async initialize() {
        if (this._restored) return;

        await mkdir(this._dataDir, { recursive: true });

        // Restore atoms from atoms.metta
        const atomsPath = join(this._dataDir, 'atoms.metta');
        const vecPath = join(this._dataDir, 'atoms.vec');

        try {
            const atomsContent = await readFile(atomsPath, 'utf8');
            this._parseAtoms(atomsContent);
            Logger.info(`[SemanticMemory] Restored ${this._atoms.size} atoms`);
        } catch (err) {
            Logger.debug('[SemanticMemory] No existing atoms, starting fresh');
        }

        try {
            const vecContent = await readFile(vecPath, 'utf8');
            this._parseVectors(vecContent);
            this._index.setVectors(this._vectors);
            Logger.info(`[SemanticMemory] Restored ${this._vectors.size} vectors`);
        } catch (err) {
            Logger.debug('[SemanticMemory] No existing vectors, will embed on demand');
        }

        this._restored = true;
    }

    _parseAtoms(content) {
        // Simple parser for (memory-atom :key value ...) format
        const lines = content.split('\n');
        let currentAtom = null;
        let currentKey = null;
        let inTags = false;
        let tags = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('(memory-atom')) {
                currentAtom = {};
                inTags = false;
                tags = [];
                continue;
            }
            if (trimmed === ')') {
                if (currentAtom && currentAtom.id) {
                    if (tags.length > 0) currentAtom.tags = tags;
                    this._atoms.set(currentAtom.id, currentAtom);
                }
                currentAtom = null;
                continue;
            }
            if (!currentAtom) continue;

            // Parse :key value
            const match = trimmed.match(/^:(\w+)\s*(.*)$/);
            if (match) {
                currentKey = match[1];
                let value = match[2].trim();

                if (currentKey === 'tags' && value.startsWith('(')) {
                    inTags = true;
                    tags = value.slice(1, -1).split('"').filter(s => s.trim()).map(s => s.trim());
                } else if (currentKey === 'truth') {
                    // Parse (stv f c)
                    const stvMatch = value.match(/\(stv\s+([\d.]+)\s+([\d.]+)\)/);
                    if (stvMatch) {
                        currentAtom.truth = {
                            frequency: parseFloat(stvMatch[1]),
                            confidence: parseFloat(stvMatch[2])
                        };
                    }
                } else if (currentKey === 'timestamp' || currentKey === 'id') {
                    currentAtom[currentKey] = value.replace(/"/g, '');
                } else {
                    currentAtom[currentKey] = value.replace(/^"|"$/g, '');
                }
            }
        }
    }

    _parseVectors(content) {
        // Parse id vector format
        const lines = content.split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            const [id, ...vecParts] = line.split('|');
            if (id && vecParts.length > 0) {
                const vec = vecParts.join('').split(',').map(parseFloat);
                this._vectors.set(id.trim(), vec);
            }
        }
    }

    /**
     * Store a memory atom with embedding.
     * @param {Object} params
     * @param {string} params.content - The memory content
     * @param {string} [params.type='semantic'] - :semantic | :episodic | :procedural | :pinned
     * @param {string} [params.source='local'] - Source identifier
     * @param {string[]} [params.tags=[]] - Tags for categorization
     * @param {Object} [params.truth={frequency: 0.9, confidence: 0.8}] - NAL truth values
     * @returns {Promise<string>} Memory ID
     */
    async remember({ content, type = 'semantic', source = 'local', tags = [], truth = { frequency: 0.9, confidence: 0.8 } }) {
        await this.initialize();

        const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const vector = await this._embedder.embed(content);

        const atom = {
            id,
            timestamp: Date.now(),
            content,
            source,
            type,
            truth,
            tags: Array.isArray(tags) ? tags : (tags.split?.(',') ?? [])
        };

        this._atoms.set(id, atom);
        this._vectors.set(id, vector);
        this._index.add(id, vector);

        await this._persist();
        Logger.debug(`[SemanticMemory] remember: ${id}`);
        return id;
    }

    /**
     * Query memories by semantic similarity.
     * @param {string} query - Query text
     * @param {number} [k=10] - Number of results
     * @param {Object} [options]
     * @param {string} [options.type] - Filter by memory type
     * @param {number} [options.minScore=0.0] - Minimum similarity threshold
     * @returns {Promise<Array>} Array of { id, content, type, score, ... }
     */
    async query(queryText, k = 10, options = {}) {
        await this.initialize();

        const queryVector = await this._embedder.embed(queryText);
        const results = await this._index.search(queryVector, k * 2); // Get more to filter

        const filtered = [];
        for (const { id, score } of results) {
            const atom = this._atoms.get(id);
            if (!atom) continue;
            if (options.type && atom.type !== options.type) continue;
            if (score < (options.minScore ?? 0.0)) continue;
            filtered.push({
                id: atom.id,
                content: atom.content,
                type: atom.type,
                source: atom.source,
                tags: atom.tags,
                truth: atom.truth,
                timestamp: atom.timestamp,
                score
            });
        }

        return filtered.slice(0, k);
    }

    /**
     * Pin a memory to always appear in context.
     * @param {string} memoryId - ID of memory to pin
     * @returns {Promise<boolean>} Success
     */
    async pin(memoryId) {
        await this.initialize();
        const atom = this._atoms.get(memoryId);
        if (!atom) return false;
        atom.type = 'pinned';
        await this._persist();
        return true;
    }

    /**
     * Remove memories matching a query.
     * @param {string} queryText - Query to match
     * @param {number} [k=10] - Max to remove
     * @returns {Promise<number>} Number removed
     */
    async forget(queryText, k = 10) {
        await this.initialize();
        const results = await this.query(queryText, k, { minScore: 0.5 });
        let removed = 0;
        for (const { id } of results) {
            if (this._atoms.delete(id)) {
                this._vectors.delete(id);
                removed++;
            }
        }
        if (removed > 0) await this._persist();
        return removed;
    }

    /**
     * Get pinned memories for context.
     * @param {number} [maxChars=3000] - Character budget
     * @returns {Promise<Array>}
     */
    async getPinned(maxChars = 3000) {
        await this.initialize();
        const pinned = [...this._atoms.values()]
            .filter(a => a.type === 'pinned')
            .sort((a, b) => b.timestamp - a.timestamp);

        const result = [];
        let chars = 0;
        for (const atom of pinned) {
            if (chars + atom.content.length > maxChars) break;
            result.push(atom);
            chars += atom.content.length;
        }
        return result;
    }

    /**
     * Get recent episodic memories for context.
     * @param {number} [maxItems=20] - Max items
     * @param {number} [maxChars=8000] - Character budget
     * @returns {Promise<Array>}
     */
    async getRecent(maxItems = 20, maxChars = 8000) {
        await this.initialize();
        const episodic = [...this._atoms.values()]
            .filter(a => a.type === 'episodic' || a.type === 'semantic')
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, maxItems);

        const result = [];
        let chars = 0;
        for (const atom of episodic) {
            if (chars + atom.content.length > maxChars) break;
            result.push(atom);
            chars += atom.content.length;
        }
        return result;
    }

    /**
     * Persist atoms and vectors to disk.
     */
    async _persist() {
        await mkdir(this._dataDir, { recursive: true });

        // Write atoms.metta
        const atomsContent = [...this._atoms.values()]
            .map(a => `(memory-atom
  :id        "${a.id}"
  :timestamp ${a.timestamp}
  :content   "${a.content}"
  :source    "${a.source}"
  :type      :${a.type}
  :truth     (stv ${a.truth.frequency} ${a.truth.confidence})
  :tags      (${a.tags.map(t => `"${t}"`).join(' ')})
)`)
            .join('\n');

        await writeFile(join(this._dataDir, 'atoms.metta'), atomsContent);

        // Write atoms.vec sidecar
        const vecContent = [...this._vectors.entries()]
            .map(([id, vec]) => `${id}|${vec.join(',')}`)
            .join('\n');

        await writeFile(join(this._dataDir, 'atoms.vec'), vecContent);

        await this._index.save();
    }

    /**
     * Get memory statistics.
     */
    get stats() {
        return {
            totalAtoms: this._atoms.size,
            totalVectors: this._vectors.size,
            byType: {
                semantic: [...this._atoms.values()].filter(a => a.type === 'semantic').length,
                episodic: [...this._atoms.values()].filter(a => a.type === 'episodic').length,
                procedural: [...this._atoms.values()].filter(a => a.type === 'procedural').length,
                pinned: [...this._atoms.values()].filter(a => a.type === 'pinned').length
            }
        };
    }
}
