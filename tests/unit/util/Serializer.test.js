import {beforeEach, describe, expect, test} from '@jest/globals';
import {Serializer} from '@senars/nar/src/util/Serializer.js';
import {Punctuation, Task, TermFactory, Truth} from '@senars/nar';

describe('Serializer', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    describe('JSON Serialization', () => {
        test('serializes Task to JSON', () => {
            const term = termFactory.create('a');
            const task = new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: new Truth(1.0, 0.9)
            });

            const json = Serializer.toJSON(task);
            expect(json).toBeDefined();
            expect(json.term).toBeDefined();
            expect(json.punctuation).toBe('.');
            expect(json.truth).toBeDefined();
        });

        test('toJSON returns JSON structure for serializable entities', () => {
            const term = termFactory.create('a');
            const task = new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: new Truth(1.0, 0.9)
            });

            const json = Serializer.toJSON(task);
            expect(typeof json).toBe('object');
            expect(json.version).toBe('1.0.0');
        });
    });

    describe('Narsese Conversion', () => {
        test('converts Term to Narsese string', () => {
            const term = termFactory.create('a');
            const narsese = Serializer.toNarsese(term);

            expect(typeof narsese).toBe('string');
            expect(narsese).toContain('a');
        });

        test('parses Narsese string to entity', () => {
            const narsese = '(a --> b).';
            const result = Serializer.fromNarsese(narsese);

            expect(result).toBeDefined();
        });

        test('round-trip Narsese conversion', () => {
            const narsese = 'a.';
            const parsed = Serializer.fromNarsese(narsese);
            expect(parsed).toBeDefined();
        });
    });

    describe('Format Detection', () => {
        test('detects JSON format', () => {
            const input = '{"term": "a", "punctuation": "."}';
            expect(Serializer.detect(input)).toBe('json');
        });

        test('detects Narsese format', () => {
            const input = '(a --> b).';
            expect(Serializer.detect(input)).toBe('narsese');
        });

        test('detects object format', () => {
            const input = {term: 'a'};
            expect(Serializer.detect(input)).toBe('object');
        });
    });

    describe('Universal Parser', () => {
        test('parses Narsese string', () => {
            const result = Serializer.parse('a.');
            expect(result).toBeDefined();
        });

        test('passes through objects', () => {
            const obj = {term: 'a'};
            const result = Serializer.parse(obj);
            expect(result).toBe(obj);
        });
    });

    describe('State Management', () => {
        test('exports NAR state structure', () => {
            const mockNAR = {
                memory: {
                    serialize: () => ({concepts: []})
                },
                config: {
                    toJSON: () => ({debug: false})
                }
            };

            const state = Serializer.exportState(mockNAR);

            expect(state.version).toBe('1.0.0');
            expect(state.timestamp).toBeDefined();
            expect(state.nar).toBeDefined();
            expect(state.nar.memory).toBeDefined();
            expect(state.nar.config).toBeDefined();
        });

        test('handles missing components gracefully', () => {
            const mockNAR = {};
            const state = Serializer.exportState(mockNAR);

            expect(state.version).toBe('1.0.0');
            expect(state.nar).toBeDefined();
        });
    });

    describe('Versioning', () => {
        test('migrates legacy state without version', () => {
            const legacyState = {
                nar: {memory: {}}
            };

            const migrated = Serializer.migrate(legacyState, '1.0.0');
            expect(migrated.version).toBe('1.0.0');
        });

        test('preserves current version state', () => {
            const state = {
                version: '1.0.0',
                nar: {memory: {}}
            };

            const migrated = Serializer.migrate(state, '1.0.0');
            expect(migrated.version).toBe('1.0.0');
        });
    });

    describe('Utility Methods', () => {
        test('isSerializable identifies serializable entities', () => {
            const term = termFactory.create('a');
            const task = new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: new Truth(1.0, 0.9)
            });

            expect(Serializer.isSerializable(task)).toBe(true);
            expect(Serializer.isSerializable(null)).toBe(false);
            expect(Serializer.isSerializable({})).toBe(false);
        });

        test('getEntityType identifies entity types', () => {
            const term = termFactory.create('a');
            const task = new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: new Truth(1.0, 0.9)
            });

            expect(Serializer.getEntityType(task)).toBe('task');
            expect(Serializer.getEntityType(term)).toBe('term');
            expect(Serializer.getEntityType({})).toBe('unknown');
        });
    });

    describe('Error Handling', () => {
        test('throws on null entity serialization', () => {
            expect(() => Serializer.toJSON(null)).toThrow();
        });

        test('throws on null entity deserialization', () => {
            expect(() => Serializer.fromJSON(null)).toThrow();
        });

        test('throws on invalid Narsese', () => {
            expect(() => Serializer.fromNarsese(123)).toThrow();
        });

        test('throws on unknown export type', () => {
            expect(() => Serializer.fromJSON({}, 'unknown-type')).toThrow();
        });
    });
});
