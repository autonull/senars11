import {beforeEach, describe, expect, it} from '@jest/globals';
import {ForgettingStrategy} from '@senars/nar/src/memory/forgetting/ForgettingStrategy.js';
import {PriorityForgettingStrategy} from '@senars/nar/src/memory/forgetting/PriorityForgettingStrategy.js';
import {LRUForgettingStrategy} from '@senars/nar/src/memory/forgetting/LRUForgettingStrategy.js';
import {FIFOForgettingStrategy} from '@senars/nar/src/memory/forgetting/FIFOForgettingStrategy.js';
import {ForgettingStrategyFactory} from '@senars/nar/src/memory/forgetting/ForgettingStrategyFactory.js';

describe('ForgettingStrategy', () => {
    describe('Base Class', () => {
        it('should throw error when forget() is not implemented', () => {
            const strategy = new ForgettingStrategy();
            expect(() => strategy.forget(new Map(), {})).toThrow();
        });

        it('should derive name from class name', () => {
            class CustomForgettingStrategy extends ForgettingStrategy {
                forget() {
                    return null;
                }
            }

            const strategy = new CustomForgettingStrategy();
            expect(strategy.getName()).toBe('custom');
        });
    });

    describe('PriorityForgettingStrategy', () => {
        let strategy;
        let concepts;

        beforeEach(() => {
            strategy = new PriorityForgettingStrategy();
            concepts = new Map();
        });

        it('should return null for empty concept map', () => {
            const result = strategy.forget(concepts, {});
            expect(result).toBeNull();
        });

        it('should forget concept with lowest activation', () => {
            const term1 = {toString: () => 'A'};
            const term2 = {toString: () => 'B'};
            const term3 = {toString: () => 'C'};

            concepts.set(term1, {activation: 0.5});
            concepts.set(term2, {activation: 0.2}); // Lowest
            concepts.set(term3, {activation: 0.8});

            const result = strategy.forget(concepts, {});
            expect(result).toBe(term2);
        });

        it('should default to 0.1 activation if undefined', () => {
            const term1 = {toString: () => 'A'};
            const term2 = {toString: () => 'B'};

            concepts.set(term1, {activation: 0.5});
            concepts.set(term2, {}); // No activation, defaults to 0.1

            const result = strategy.forget(concepts, {});
            expect(result).toBe(term2);
        });

        it('should have correct strategy name', () => {
            expect(strategy.getName()).toBe('priority');
        });
    });

    describe('LRUForgettingStrategy', () => {
        let strategy;
        let concepts;

        beforeEach(() => {
            strategy = new LRUForgettingStrategy();
            concepts = new Map();
        });

        it('should return null for empty concept map', () => {
            const result = strategy.forget(concepts, {});
            expect(result).toBeNull();
        });

        it('should forget least recently accessed concept', () => {
            const term1 = {toString: () => 'A'};
            const term2 = {toString: () => 'B'};
            const term3 = {toString: () => 'C'};

            concepts.set(term1, {lastAccessed: 1000}); // Oldest
            concepts.set(term2, {lastAccessed: 3000});
            concepts.set(term3, {lastAccessed: 2000});

            const result = strategy.forget(concepts, {});
            expect(result).toBe(term1);
        });

        it('should default to 0 lastAccessed if undefined', () => {
            const term1 = {toString: () => 'A'};
            const term2 = {toString: () => 'B'};

            concepts.set(term1, {lastAccessed: 1000});
            concepts.set(term2, {}); // No lastAccessed, defaults to 0

            const result = strategy.forget(concepts, {});
            expect(result).toBe(term2);
        });

        it('should have correct strategy name', () => {
            expect(strategy.getName()).toBe('lru');
        });
    });

    describe('FIFOForgettingStrategy', () => {
        let strategy;
        let concepts;

        beforeEach(() => {
            strategy = new FIFOForgettingStrategy();
            concepts = new Map();
        });

        it('should return null for empty concept map', () => {
            const result = strategy.forget(concepts, {});
            expect(result).toBeNull();
        });

        it('should forget first concept in insertion order', () => {
            const term1 = {toString: () => 'A'};
            const term2 = {toString: () => 'B'};
            const term3 = {toString: () => 'C'};

            concepts.set(term1, {activation: 0.9}); // First inserted
            concepts.set(term2, {activation: 0.5});
            concepts.set(term3, {activation: 0.1});

            const result = strategy.forget(concepts, {});
            expect(result).toBe(term1);
        });

        it('should have correct strategy name', () => {
            expect(strategy.getName()).toBe('fifo');
        });
    });

    describe('ForgettingStrategyFactory', () => {
        it('should create PriorityForgettingStrategy for "priority"', () => {
            const strategy = ForgettingStrategyFactory.create('priority');
            expect(strategy).toBeInstanceOf(PriorityForgettingStrategy);
        });

        it('should create LRUForgettingStrategy for "lru"', () => {
            const strategy = ForgettingStrategyFactory.create('lru');
            expect(strategy).toBeInstanceOf(LRUForgettingStrategy);
        });

        it('should create FIFOForgettingStrategy for "fifo"', () => {
            const strategy = ForgettingStrategyFactory.create('fifo');
            expect(strategy).toBeInstanceOf(FIFOForgettingStrategy);
        });

        it('should throw error for unknown policy', () => {
            expect(() => ForgettingStrategyFactory.create('unknown')).toThrow(/Unknown forgetting policy/);
        });

        it('should provide list of available strategies', () => {
            const strategies = ForgettingStrategyFactory.getAvailableStrategies();
            expect(strategies).toEqual(['priority', 'lru', 'fifo']);
        });
    });
});
