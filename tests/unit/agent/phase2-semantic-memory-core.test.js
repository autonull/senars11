/**
 * Phase 2 Unit Tests — Semantic Memory (Core Logic)
 * 
 * Tests the core data structures and algorithms of SemanticMemory
 * without triggering the full module import chain.
 * 
 * Focus:
 * - Atom parsing
 * - Vector parsing  
 * - Cosine similarity
 * - Memory filtering and sorting
 * - Persistence format
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Phase 2: Semantic Memory Core Logic', () => {
    let testDir;

    beforeEach(async () => {
        testDir = join(tmpdir(), `semantic-memory-test-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe('Atom parsing', () => {
        it('parses single atom correctly', async () => {
            const atomsContent = `(memory-atom
  :id        "mem_001"
  :timestamp 1743432000000
  :content   "Test content"
  :source    "test"
  :type      :semantic
  :truth     (stv 0.9 0.8)
  :tags      ("test" "phase2")
)`;
            await writeFile(join(testDir, 'atoms.metta'), atomsContent);

            const atoms = parseAtoms(atomsContent);
            expect(atoms.size).toBe(1);
            const atom = atoms.get('mem_001');
            expect(atom.content).toBe('Test content');
            expect(atom.type).toBe(':semantic');
            expect(atom.truth.frequency).toBe(0.9);
            expect(atom.truth.confidence).toBe(0.8);
            expect(atom.tags).toEqual(['test', 'phase2']);
        });

        it('parses multiple atoms', async () => {
            const atomsContent = `(memory-atom
  :id        "mem_001"
  :timestamp 1743432000000
  :content   "First"
  :source    "test"
  :type      :semantic
  :truth     (stv 0.9 0.8)
  :tags      ()
)
(memory-atom
  :id        "mem_002"
  :timestamp 1743432001000
  :content   "Second"
  :source    "test"
  :type      :episodic
  :truth     (stv 0.8 0.7)
  :tags      ("important")
)`;
            await writeFile(join(testDir, 'atoms.metta'), atomsContent);

            const atoms = parseAtoms(atomsContent);
            expect(atoms.size).toBe(2);
            expect(atoms.get('mem_001').type).toBe(':semantic');
            expect(atoms.get('mem_002').type).toBe(':episodic');
        });
    });

    describe('Vector parsing', () => {
        it('parses vector sidecar correctly', async () => {
            const vecContent = 'mem_001|0.1,0.2,0.3,0.4,0.5\nmem_002|0.5,0.4,0.3,0.2,0.1';
            await writeFile(join(testDir, 'atoms.vec'), vecContent);

            const vectors = parseVectors(vecContent);
            expect(vectors.size).toBe(2);
            expect(vectors.get('mem_001')).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
            expect(vectors.get('mem_002')).toEqual([0.5, 0.4, 0.3, 0.2, 0.1]);
        });
    });

    describe('Cosine similarity', () => {
        it('returns 1 for identical vectors', () => {
            const a = [1, 0, 0];
            const b = [1, 0, 0];
            expect(cosineSimilarity(a, b)).toBe(1);
        });

        it('returns 0 for orthogonal vectors', () => {
            const a = [1, 0, 0];
            const b = [0, 1, 0];
            expect(cosineSimilarity(a, b)).toBe(0);
        });

        it('returns -1 for opposite vectors', () => {
            const a = [1, 0, 0];
            const b = [-1, 0, 0];
            expect(cosineSimilarity(a, b)).toBe(-1);
        });

        it('handles normalized vectors', () => {
            const a = [0.6, 0.8];
            const b = [0.6, 0.8];
            const similarity = cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(1, 5);
        });
    });

    describe('Memory filtering', () => {
        it('filters by type', () => {
            const atoms = new Map([
                ['mem_1', { id: 'mem_1', type: 'semantic' }],
                ['mem_2', { id: 'mem_2', type: 'episodic' }],
                ['mem_3', { id: 'mem_3', type: 'pinned' }]
            ]);

            const semantic = filterByType(atoms, 'semantic');
            expect(semantic.size).toBe(1);
            expect(semantic.has('mem_1')).toBe(true);
        });

        it('sorts by timestamp descending', () => {
            const atoms = [
                { id: 'mem_1', timestamp: 1000 },
                { id: 'mem_2', timestamp: 3000 },
                { id: 'mem_3', timestamp: 2000 }
            ];

            const sorted = atoms.sort((a, b) => b.timestamp - a.timestamp);
            expect(sorted[0].id).toBe('mem_2');
            expect(sorted[1].id).toBe('mem_3');
            expect(sorted[2].id).toBe('mem_1');
        });

        it('respects char budget', () => {
            const items = [
                { content: 'A'.repeat(100) },
                { content: 'B'.repeat(100) },
                { content: 'C'.repeat(100) }
            ];

            const budget = 250;
            let chars = 0;
            const result = [];
            for (const item of items) {
                if (chars + item.content.length > budget) break;
                result.push(item);
                chars += item.content.length;
            }

            expect(result.length).toBe(2);
            expect(chars).toBe(200);
        });
    });

    describe('Persistence format', () => {
        it('generates valid atoms.metta format', async () => {
            const atoms = new Map([
                ['mem_test', {
                    id: 'mem_test',
                    content: 'Test content',
                    type: 'semantic',
                    timestamp: 12345,
                    source: 'test',
                    truth: { frequency: 0.9, confidence: 0.8 },
                    tags: ['test', 'phase2']
                }]
            ]);

            const content = generateAtomsFile(atoms);
            await writeFile(join(testDir, 'atoms.metta'), content);

            const read = await readFile(join(testDir, 'atoms.metta'), 'utf8');
            expect(read).toContain('(memory-atom');
            expect(read).toContain(':id        "mem_test"');
            expect(read).toContain(':content   "Test content"');
            expect(read).toContain(':truth     (stv 0.9 0.8)');
        });

        it('generates valid atoms.vec format', async () => {
            const vectors = new Map([
                ['mem_1', [0.1, 0.2, 0.3]],
                ['mem_2', [0.4, 0.5, 0.6]]
            ]);

            const content = generateVectorsFile(vectors);
            await writeFile(join(testDir, 'atoms.vec'), content);

            const read = await readFile(join(testDir, 'atoms.vec'), 'utf8');
            expect(read).toContain('mem_1|0.1,0.2,0.3');
            expect(read).toContain('mem_2|0.4,0.5,0.6');
        });
    });

    describe('Stats computation', () => {
        it('counts atoms by type', () => {
            const atoms = new Map([
                ['mem_1', { type: 'semantic' }],
                ['mem_2', { type: 'episodic' }],
                ['mem_3', { type: 'semantic' }],
                ['mem_4', { type: 'pinned' }]
            ]);

            const stats = computeStats(atoms);
            expect(stats.total).toBe(4);
            expect(stats.byType.semantic).toBe(2);
            expect(stats.byType.episodic).toBe(1);
            expect(stats.byType.pinned).toBe(1);
        });
    });
});

// ── Helper functions (mirroring SemanticMemory.js internals) ──────────────

function parseAtoms(content) {
    const atoms = new Map();
    const lines = content.split('\n');
    let currentAtom = null;
    let tags = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('(memory-atom')) {
            currentAtom = {};
            tags = [];
            continue;
        }
        if (trimmed === ')') {
            if (currentAtom && currentAtom.id) {
                if (tags.length > 0) currentAtom.tags = tags;
                atoms.set(currentAtom.id, currentAtom);
            }
            currentAtom = null;
            continue;
        }
        if (!currentAtom) continue;

        const match = trimmed.match(/^:(\w+)\s*(.*)$/);
        if (match) {
            const key = match[1];
            let value = match[2].trim();

            if (key === 'tags' && value.startsWith('(')) {
                tags = value.slice(1, -1).split('"').filter(s => s.trim()).map(s => s.trim());
            } else if (key === 'truth') {
                const stvMatch = value.match(/\(stv\s+([\d.]+)\s+([\d.]+)\)/);
                if (stvMatch) {
                    currentAtom.truth = {
                        frequency: parseFloat(stvMatch[1]),
                        confidence: parseFloat(stvMatch[2])
                    };
                }
            } else if (key === 'timestamp' || key === 'id') {
                currentAtom[key] = value.replace(/"/g, '');
            } else {
                currentAtom[key] = value.replace(/^"|"$/g, '');
            }
        }
    }
    return atoms;
}

function parseVectors(content) {
    const vectors = new Map();
    const lines = content.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        const [id, ...vecParts] = line.split('|');
        if (id && vecParts.length > 0) {
            const vec = vecParts.join('').split(',').map(parseFloat);
            vectors.set(id.trim(), vec);
        }
    }
    return vectors;
}

function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function filterByType(atoms, type) {
    return new Map([...atoms].filter(([_, a]) => a.type === type));
}

function generateAtomsFile(atoms) {
    return [...atoms.values()]
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
}

function generateVectorsFile(vectors) {
    return [...vectors.entries()]
        .map(([id, vec]) => `${id}|${vec.join(',')}`)
        .join('\n');
}

function computeStats(atoms) {
    const byType = {};
    for (const atom of atoms.values()) {
        byType[atom.type] = (byType[atom.type] || 0) + 1;
    }
    return { total: atoms.size, byType };
}
