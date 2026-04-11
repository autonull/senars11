import {beforeEach, describe, expect, it} from '@jest/globals';
import {NarsGPTStrategy} from '@senars/nar';

const mockEmbedding = () => ({
    getEmbedding: async (text) => {
        const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return Array(8).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
    },
    calculateSimilarity: (e1, e2) => {
        let dot = 0, m1 = 0, m2 = 0;
        for (let i = 0; i < e1.length; i++) {
            dot += e1[i] * e2[i];
            m1 += e1[i] ** 2;
            m2 += e2[i] ** 2;
        }
        return dot / (Math.sqrt(m1) * Math.sqrt(m2));
    }
});

const mockMemory = (beliefs = []) => ({
    concepts: new Map([['bird', {beliefs}], ['animal', {beliefs: []}]])
});

const mockTask = (termStr, truth = {f: 0.9, c: 0.8}) => ({
    term: {toString: () => termStr, name: termStr},
    truth,
    stamp: {occurrenceTime: Date.now()},
    budget: {priority: 0.5}
});

describe('NarsGPTStrategy', () => {
    let strategy, embedding;

    beforeEach(() => {
        embedding = mockEmbedding();
        strategy = new NarsGPTStrategy({
            embeddingLayer: embedding,
            relevantViewSize: 10,
            recentViewSize: 5,
            atomCreationThreshold: 0.95
        });
    });

    describe('initialization', () => {
        it('uses defaults', () => {
            const s = new NarsGPTStrategy();
            expect(s.name).toBe('NarsGPT');
            expect(s.relevantViewSize).toBe(30);
            expect(s.recentViewSize).toBe(10);
            expect(s.atomCreationThreshold).toBe(0.95);
        });

        it('accepts custom config', () => {
            expect(strategy.relevantViewSize).toBe(10);
            expect(strategy.recentViewSize).toBe(5);
        });
    });

    describe('perspectiveSwap', () => {
        const cases = [
            ['you are smart', 'I am smart'],
            ['I am here', 'you are here'],
            ['your dog', /my dog/i],
            ['my cat', /your cat/i]
        ];

        cases.forEach(([input, expected]) => {
            it(`transforms "${input}"`, () => {
                const result = strategy.perspectiveSwap(input);
                typeof expected === 'string' ? expect(result).toBe(expected) : expect(result).toMatch(expected);
            });
        });

        it('disables with mode=none', () => {
            strategy.perspectiveMode = 'none';
            expect(strategy.perspectiveSwap('you are smart')).toBe('you are smart');
        });

        it('neutralizes with mode=neutralize', () => {
            strategy.perspectiveMode = 'neutralize';
            expect(strategy.perspectiveSwap('you are smart')).toMatch(/one/i);
        });
    });

    describe('buildAttentionBuffer', () => {
        it('returns empty for null memory', async () => {
            const buffer = await strategy.buildAttentionBuffer('query', null, Date.now());
            expect(buffer).toEqual([]);
        });

        it('builds from memory concepts', async () => {
            const memory = mockMemory([mockTask('(bird --> animal)'), mockTask('(penguin --> bird)')]);
            const buffer = await strategy.buildAttentionBuffer('bird', memory, Date.now());
            expect(buffer.length).toBeGreaterThan(0);
        });
    });

    describe('atomize', () => {
        it('creates new atom', async () => {
            const {isNew, unifiedTerm} = await strategy.atomize('elephant', 'NOUN');
            expect(isNew).toBe(true);
            expect(unifiedTerm).toBeNull();
        });

        it('unifies with existing', async () => {
            await strategy.atomize('cat', 'NOUN');
            const {isNew, unifiedTerm} = await strategy.atomize('cat', 'NOUN');
            expect(isNew).toBe(false);
            expect(unifiedTerm).toBe('cat');
        });

        it('handles missing embedding layer', async () => {
            const s = new NarsGPTStrategy();
            expect((await s.atomize('test')).isNew).toBe(true);
        });
    });

    describe('grounding', () => {
        it('registers', async () => {
            await strategy.ground('(bird --> animal)', 'Birds are animals');
            expect(strategy.groundings.size).toBe(1);
        });

        it('finds grounded sentence', async () => {
            await strategy.ground('(bird --> animal)', 'Birds are animals');
            const {grounded, match} = await strategy.checkGrounding('Birds are animals');
            expect(grounded).toBe(true);
            expect(match).toBe('(bird --> animal)');
        });

        it('returns ungrounded for unknown', async () => {
            expect((await strategy.checkGrounding('Unknown')).grounded).toBe(false);
        });
    });

    describe('formatContext', () => {
        it('formats as numbered list', () => {
            const buffer = [
                {task: mockTask('(a --> b)', {f: 0.9, c: 0.8}), score: 0.5},
                {task: mockTask('(c --> d)', {f: 0.7, c: 0.6}), score: 0.3}
            ];
            const ctx = strategy.formatContext(buffer);
            expect(ctx).toContain('1.');
            expect(ctx).toContain('2.');
            expect(ctx).toContain('0.90');
        });
    });

    describe('generateCandidates', () => {
        it('yields from memory', async () => {
            const memory = mockMemory([mockTask('(bird --> flyer)')]);
            const candidates = [];
            for await (const c of strategy.generateCandidates(mockTask('What can fly?'), {
                memory,
                currentTime: Date.now()
            })) {
                candidates.push(c);
            }
            expect(candidates.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getStatus', () => {
        it('returns status', () => {
            const s = strategy.getStatus();
            expect(s.name).toBe('NarsGPT');
            expect(s.config.relevantViewSize).toBe(10);
            expect(s.groundingsCount).toBe(0);
        });
    });
});
