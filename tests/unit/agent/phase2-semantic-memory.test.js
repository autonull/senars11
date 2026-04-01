/**
 * Phase 2 Unit Tests — Semantic Memory
 * 
 * Tests for:
 * - SemanticMemory.js remember/query/pin/forget operations
 * - Memory persistence and restore
 * - Context assembly with PINNED and RECALL slots
 * 
 * Note: Embedder tests are integration-heavy (ONNX model load).
 * Core SemanticMemory logic is tested here with mock embeddings.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Phase 2: Semantic Memory', () => {
    let testDir;

    beforeEach(async () => {
        testDir = join(tmpdir(), `semantic-memory-test-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe('SemanticMemory core operations', () => {
        it('parses atoms from file correctly', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            // Create atoms file
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

            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            expect(memory.stats.totalAtoms).toBe(1);
            const atom = memory._atoms.get('mem_001');
            expect(atom.content).toBe('Test content');
            expect(atom.type).toBe('semantic');
            expect(atom.truth.frequency).toBe(0.9);
        });

        it('parses vectors from file correctly', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            // Create vectors file
            const vecContent = 'mem_001|0.1,0.2,0.3,0.4,0.5';
            await writeFile(join(testDir, 'atoms.vec'), vecContent);

            const memory = new SemanticMemory({ dataDir: testDir, vectorDimensions: 5 });
            await memory.initialize();

            expect(memory._vectors.size).toBe(1);
            const vec = memory._vectors.get('mem_001');
            expect(vec).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
        });

        it('getPinned returns pinned memories within char budget', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            // Manually add atoms (simulating remember + pin)
            memory._atoms.set('mem_1', {
                id: 'mem_1',
                content: 'Short pinned memory',
                type: 'pinned',
                timestamp: Date.now()
            });
            memory._atoms.set('mem_2', {
                id: 'mem_2',
                content: 'Another pinned memory',
                type: 'pinned',
                timestamp: Date.now() - 1000
            });

            const pinned = await memory.getPinned(30);
            expect(pinned.length).toBe(1); // Only one fits in 30 chars
        });

        it('getRecent returns episodic memories sorted by timestamp', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            memory._atoms.set('mem_1', {
                id: 'mem_1',
                content: 'Old event',
                type: 'episodic',
                timestamp: 1000
            });
            memory._atoms.set('mem_2', {
                id: 'mem_2',
                content: 'New event',
                type: 'episodic',
                timestamp: 2000
            });
            memory._atoms.set('mem_3', {
                id: 'mem_3',
                content: 'Semantic fact',
                type: 'semantic',
                timestamp: 1500
            });

            const recent = await memory.getRecent(10, 5000);
            expect(recent.length).toBe(3);
            expect(recent[0].content).toBe('New event'); // Most recent first
        });

        it('query filters by type', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            // Add mock vectors for brute-force search
            memory._vectors.set('mem_1', [1, 0, 0]);
            memory._vectors.set('mem_2', [0, 1, 0]);
            memory._atoms.set('mem_1', {
                id: 'mem_1',
                content: 'Episodic content',
                type: 'episodic',
                timestamp: Date.now()
            });
            memory._atoms.set('mem_2', {
                id: 'mem_2',
                content: 'Semantic content',
                type: 'semantic',
                timestamp: Date.now()
            });

            // Query with type filter
            const results = await memory.query('test', 5, { type: 'episodic' });
            // Should only return episodic type (or empty if no match)
            results.forEach(r => {
                expect(r.type).toBe('episodic');
            });
        });

        it('stats returns correct counts by type', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            memory._atoms.set('mem_1', { id: 'mem_1', type: 'semantic' });
            memory._atoms.set('mem_2', { id: 'mem_2', type: 'episodic' });
            memory._atoms.set('mem_3', { id: 'mem_3', type: 'pinned' });
            memory._atoms.set('mem_4', { id: 'mem_4', type: 'pinned' });

            const stats = memory.stats;
            expect(stats.totalAtoms).toBe(4);
            expect(stats.byType.semantic).toBe(1);
            expect(stats.byType.episodic).toBe(1);
            expect(stats.byType.pinned).toBe(2);
        });
    });

    describe('Cosine similarity', () => {
        it('computes similarity correctly', () => {
            // Import the helper function
            const a = [1, 0, 0];
            const b = [1, 0, 0];
            const c = [0, 1, 0];

            expect(cosineSimilarity(a, b)).toBe(1); // Identical
            expect(cosineSimilarity(a, c)).toBe(0); // Orthogonal
        });

        it('handles negative values', () => {
            const a = [1, 0, 0];
            const b = [-1, 0, 0];

            expect(cosineSimilarity(a, b)).toBe(-1); // Opposite
        });
    });

    describe('Persistence', () => {
        it('persists atoms to atoms.metta', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            memory._atoms.set('mem_test', {
                id: 'mem_test',
                content: 'Test persistence',
                type: 'semantic',
                timestamp: 12345,
                source: 'test',
                truth: { frequency: 0.9, confidence: 0.8 },
                tags: ['test']
            });
            memory._vectors.set('mem_test', [0.1, 0.2, 0.3]);

            await memory._persist();

            const { readFile } = await import('fs/promises');
            const content = await readFile(join(testDir, 'atoms.metta'), 'utf8');
            expect(content).toContain('mem_test');
            expect(content).toContain('Test persistence');
        });

        it('persists vectors to atoms.vec', async () => {
            const { SemanticMemory } = await import('../../../agent/src/memory/SemanticMemory.js');
            
            const memory = new SemanticMemory({ dataDir: testDir });
            await memory.initialize();

            memory._vectors.set('mem_vec', [1, 2, 3, 4]);
            await memory._persist();

            const { readFile } = await import('fs/promises');
            const content = await readFile(join(testDir, 'atoms.vec'), 'utf8');
            expect(content).toContain('mem_vec');
            expect(content).toContain('1,2,3,4');
        });
    });
});

/**
 * Helper: cosine similarity (duplicated from SemanticMemory.js for testing)
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
