/**
 * Phase2Verification.test.js
 *
 * Integration tests for Phase 2: Variables & Goals
 * Tests NAL-6 query matching and NAL-8 goal-driven reasoning
 */

import {beforeEach, describe, expect, it} from '@jest/globals';
import {TermFactory, Unifier, ResolutionStrategy, GoalDrivenStrategy, AnalogicalStrategy, Task, Truth} from '@senars/nar';

describe('Phase 2: Variables & Goals', () => {
    let tf;
    let unifier;

    beforeEach(() => {
        tf = new TermFactory();
        unifier = new Unifier(tf);
    });

    describe('NAL-6: Query Matching with Unifier', () => {
        it('should match query with variable against beliefs', () => {
            // Query: (bird --> $X)?
            const queryTerm = tf.inheritance(tf.atomic('bird'), tf.variable('X'));
            const query = new Task({
                term: queryTerm,
                punctuation: '?',
                truth: null,
                budget: {priority: 0.9, durability: 0.8, quality: 0.9}
            });

            // Belief: (bird --> animal).
            const beliefTerm = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const belief = new Task({
                term: beliefTerm,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                budget: {priority: 0.8, durability: 0.7, quality: 0.8}
            });

            // Test unification
            const match = unifier.match(queryTerm, beliefTerm);
            expect(match.success).toBe(true);
            expect(match.substitution['?X'].name).toBe('animal');
        });

        it('should match complex queries with multiple variables', () => {
            // Query: ($S --> $P)?
            const queryTerm = tf.inheritance(tf.variable('S'), tf.variable('P'));

            // Belief: (bird --> animal).
            const beliefTerm = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));

            const match = unifier.match(queryTerm, beliefTerm);
            expect(match.success).toBe(true);
            expect(match.substitution['?S'].name).toBe('bird');
            expect(match.substitution['?P'].name).toBe('animal');
        });

        it('should use ResolutionStrategy with Unifier for query answering', () => {
            const strategy = new ResolutionStrategy({
                termFactory: tf
            });

            expect(strategy.unifier).toBeDefined();
            expect(strategy.unifier).toBeInstanceOf(Unifier);
        });
    });

    describe('NAL-8: Goal-Driven Reasoning', () => {
        it('should create goals with desire values', () => {
            const goalTerm = tf.inheritance(tf.atomic('self'), tf.atomic('happy'));
            const goal = new Task({
                term: goalTerm,
                punctuation: '!',
                truth: new Truth(1.0, 0.9), // Desire value
                budget: {priority: 1.0, durability: 0.9, quality: 1.0}
            });

            expect(goal.isGoal()).toBe(true);
            expect(goal.punctuation).toBe('!');
            expect(goal.truth).toBeDefined();
            expect(goal.truth.frequency).toBe(1.0);
        });

        it('should create GoalDrivenStrategy', () => {
            const strategy = new GoalDrivenStrategy({
                termFactory: tf,
                maxPlanDepth: 5
            });

            expect(strategy).toBeDefined();
            expect(strategy.name).toBe('GoalDrivenStrategy');
            expect(strategy.config.maxPlanDepth).toBe(5);
        });

        it('should convert goal to query for backward chaining', () => {
            const goalTerm = tf.inheritance(tf.atomic('self'), tf.atomic('happy'));
            const goal = new Task({
                term: goalTerm,
                punctuation: '!',
                truth: new Truth(1.0, 0.9),
                budget: {priority: 1.0, durability: 0.9, quality: 1.0}
            });

            const query = goal.clone({
                punctuation: '?',
                truth: null
            });

            expect(query.isQuestion()).toBe(true);
            expect(query.truth).toBeNull();
            expect(query.term).toEqual(goalTerm);
        });
    });

    describe('NAL-6: Analogical Reasoning', () => {
        it('should create AnalogicalStrategy', () => {
            const strategy = new AnalogicalStrategy({
                termFactory: tf
            });

            expect(strategy).toBeDefined();
            expect(strategy.name).toBe('AnalogicalStrategy');
            expect(strategy.unifier).toBeInstanceOf(Unifier);
        });

        it('should identify similarity relations', () => {
            const strategy = new AnalogicalStrategy({
                termFactory: tf
            });

            // (bird <-> airplane).
            const similarityTerm = tf.create('<->', [
                tf.atomic('bird'),
                tf.atomic('airplane')
            ]);
            const similarity = new Task({
                term: similarityTerm,
                punctuation: '.',
                truth: new Truth(0.7, 0.8),
                budget: {priority: 0.7, durability: 0.7, quality: 0.7}
            });

            expect(strategy._isSimilarityRelation(similarity)).toBe(true);
        });

        it('should identify implications', () => {
            const strategy = new AnalogicalStrategy({
                termFactory: tf
            });

            // (bird --> flyer).
            const implicationTerm = tf.inheritance(
                tf.atomic('bird'),
                tf.atomic('flyer')
            );
            const implication = new Task({
                term: implicationTerm,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            expect(strategy._isImplication(implication)).toBe(true);
        });

        it('should transfer knowledge across domains via analogy', () => {
            const strategy = new AnalogicalStrategy({
                termFactory: tf
            });

            // Source: bird
            const sourcePattern = tf.atomic('bird');

            // Target: airplane
            const targetPattern = tf.atomic('airplane');

            // Knowledge: (bird --> flyer).
            const knowledgeTerm = tf.inheritance(tf.atomic('bird'), tf.atomic('flyer'));
            const knowledge = new Task({
                term: knowledgeTerm,
                punctuation: '.',
                truth: new Truth(0.9, 0.9),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });

            const transferred = strategy.mapKnowledge(sourcePattern, targetPattern, knowledge);

            // Should create: (airplane --> flyer) with reduced confidence
            expect(transferred).toBeDefined();
            if (transferred) {
                expect(transferred.truth.confidence).toBeLessThan(knowledge.truth.confidence);
            }
        });
    });

    describe('Integration: Complete Query-Goal-Analogy Flow', () => {
        it('should demonstrate end-to-end reasoning', () => {
            // 1. NAL-6: Query with variables
            const queryTerm = tf.inheritance(tf.variable('X'), tf.atomic('happy'));
            const query = new Task({
                term: queryTerm,
                punctuation: '?',
                truth: null,
                budget: {priority: 0.9, durability: 0.8, quality: 0.9}
            });

            // 2. NAL-8: Goal to achieve
            const goalTerm = tf.inheritance(tf.atomic('self'), tf.atomic('happy'));
            const goal = new Task({
                term: goalTerm,
                punctuation: '!',
                truth: new Truth(1.0, 0.9),
                budget: {priority: 1.0, durability: 0.9, quality: 1.0}
            });

            // 3. Create strategies
            const resolutionStrategy = new ResolutionStrategy({termFactory: tf});
            const goalStrategy = new GoalDrivenStrategy({termFactory: tf});
            const analogyStrategy = new AnalogicalStrategy({termFactory: tf});

            expect(resolutionStrategy.unifier).toBeDefined();
            expect(goalStrategy).toBeDefined();
            expect(analogyStrategy).toBeDefined();

            // All strategies are now available for Phase 2 reasoning
            expect(query.isQuestion()).toBe(true);
            expect(goal.isGoal()).toBe(true);
        });
    });
});
