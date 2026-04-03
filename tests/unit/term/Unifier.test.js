/**
 * Unifier.test.js
 *
 * Comprehensive test suite for the Unifier class.
 * Tests both two-way unification and one-way pattern matching.
 */

import {beforeEach, describe, expect, it} from '@jest/globals';
import {Unifier, TermFactory} from '@senars/nar';

describe('Unifier', () => {
    let unifier;
    let tf;

    beforeEach(() => {
        tf = new TermFactory();
        unifier = new Unifier(tf);
    });

    describe('unify (two-way)', () => {
        it('should unify identical atomic terms', () => {
            const t1 = tf.atomic('bird');
            const t2 = tf.atomic('bird');
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(true);
            expect(result.substitution).toEqual({});
        });

        it('should fail to unify different atomic terms', () => {
            const t1 = tf.atomic('bird');
            const t2 = tf.atomic('cat');
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(false);
        });

        it('should unify variable with atomic term', () => {
            const v = tf.variable('X');
            const t = tf.atomic('bird');
            const result = unifier.unify(v, t);
            expect(result.success).toBe(true);
            expect(result.substitution['?X']).toEqual(t);
        });

        it('should unify two different variables', () => {
            const v1 = tf.variable('X');
            const v2 = tf.variable('Y');
            const result = unifier.unify(v1, v2);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'] || result.substitution['?Y']).toBeDefined();
        });

        it('should unify compound terms with matching structure', () => {
            const t1 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const t2 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(true);
        });

        it('should fail to unify compound terms with different operators', () => {
            const t1 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const t2 = tf.similarity(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(false);
        });

        it('should unify compound terms with variables', () => {
            const t1 = tf.inheritance(tf.variable('X'), tf.atomic('animal'));
            const t2 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'].name).toBe('bird');
        });

        it('should unify multiple variables consistently', () => {
            // (X -> Y) with (bird -> animal)
            const t1 = tf.inheritance(tf.variable('X'), tf.variable('Y'));
            const t2 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'].name).toBe('bird');
            expect(result.substitution['?Y'].name).toBe('animal');
        });

        it('should respect existing substitution', () => {
            const v = tf.variable('X');
            const t1 = tf.atomic('bird');
            const t2 = tf.atomic('bird');
            const existingSub = {'?X': t1};
            const result = unifier.unify(v, t2, existingSub);
            expect(result.success).toBe(true);
            expect(result.substitution['?X']).toEqual(t1);
        });

        it('should fail when variable is bound to different term', () => {
            const v = tf.variable('X');
            const t1 = tf.atomic('bird');
            const t2 = tf.atomic('cat');
            const existingSub = {'?X': t1};
            const result = unifier.unify(v, t2, existingSub);
            expect(result.success).toBe(false);
        });

        it('should handle occurs check (prevent infinite structures)', () => {
            // X = f(X) should fail
            const v = tf.variable('X');
            const t = tf.create('f', [v]);
            const result = unifier.unify(v, t);
            expect(result.success).toBe(false);
        });

        it('should unify nested compound terms', () => {
            // ((bird -> flyer) -> belief) with ((X -> flyer) -> belief)
            const t1 = tf.inheritance(
                tf.inheritance(tf.atomic('bird'), tf.atomic('flyer')),
                tf.atomic('belief')
            );
            const t2 = tf.inheritance(
                tf.inheritance(tf.variable('X'), tf.atomic('flyer')),
                tf.atomic('belief')
            );
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'].name).toBe('bird');
        });

        it('should fail to unify compound terms with different arity', () => {
            const t1 = tf.create('f', [tf.atomic('a'), tf.atomic('b')]);
            const t2 = tf.create('f', [tf.atomic('a')]);
            const result = unifier.unify(t1, t2);
            expect(result.success).toBe(false);
        });

        it('should chain substitutions transitively', () => {
            // First unify X with Y, then Y with bird
            const x = tf.variable('X');
            const y = tf.variable('Y');
            const bird = tf.atomic('bird');

            let result = unifier.unify(x, y);
            expect(result.success).toBe(true);

            result = unifier.unify(y, bird, result.substitution);
            expect(result.success).toBe(true);

            // Apply substitution to X should give bird
            const xValue = unifier.applySubstitution(x, result.substitution);
            expect(xValue.name).toBe('bird');
        });
    });

    describe('match (one-way)', () => {
        it('should match pattern variable to concrete term', () => {
            const pattern = tf.variable('X');
            const term = tf.atomic('bird');
            const result = unifier.match(pattern, term);
            expect(result.success).toBe(true);
            expect(result.substitution['?X']).toEqual(term);
        });

        it('should treat variables in concrete term as constants', () => {
            const pattern = tf.atomic('bird');
            const termWithVar = tf.variable('Y');
            const result = unifier.match(pattern, termWithVar);
            expect(result.success).toBe(false);
        });

        it('should match compound pattern to compound term', () => {
            const pattern = tf.inheritance(tf.variable('X'), tf.atomic('animal'));
            const term = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.match(pattern, term);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'].name).toBe('bird');
        });

        it('should match multiple variables in pattern', () => {
            const pattern = tf.inheritance(tf.variable('S'), tf.variable('P'));
            const term = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const result = unifier.match(pattern, term);
            expect(result.success).toBe(true);
            expect(result.substitution['?S'].name).toBe('bird');
            expect(result.substitution['?P'].name).toBe('animal');
        });

        it('should not bind variables in the concrete term', () => {
            const pattern = tf.variable('X');
            const term = tf.variable('Y'); // Should be treated as constant
            const result = unifier.match(pattern, term);
            expect(result.success).toBe(true);
            // X should be bound to Y as a constant
            expect(result.substitution['?X']).toEqual(term);
            // Y should NOT be in substitution
            expect(result.substitution['?Y']).toBeUndefined();
        });

        it('should respect existing substitution in pattern matching', () => {
            const pattern = tf.variable('X');
            const term = tf.atomic('bird');
            const existingSub = {'?X': tf.atomic('bird')};
            const result = unifier.match(pattern, term, existingSub);
            expect(result.success).toBe(true);
        });

        it('should fail when pattern variable is bound to different term', () => {
            const pattern = tf.variable('X');
            const term = tf.atomic('cat');
            const existingSub = {'?X': tf.atomic('bird')};
            const result = unifier.match(pattern, term, existingSub);
            expect(result.success).toBe(false);
        });

        it('should match nested patterns', () => {
            const pattern = tf.inheritance(
                tf.inheritance(tf.variable('X'), tf.atomic('flyer')),
                tf.variable('Y')
            );
            const term = tf.inheritance(
                tf.inheritance(tf.atomic('bird'), tf.atomic('flyer')),
                tf.atomic('belief')
            );
            const result = unifier.match(pattern, term);
            expect(result.success).toBe(true);
            expect(result.substitution['?X'].name).toBe('bird');
            expect(result.substitution['?Y'].name).toBe('belief');
        });
    });

    describe('applySubstitution', () => {
        it('should apply substitution to variable', () => {
            const v = tf.variable('X');
            const sub = {'?X': tf.atomic('bird')};
            const result = unifier.applySubstitution(v, sub);
            expect(result.name).toBe('bird');
        });

        it('should apply substitution recursively', () => {
            const v = tf.variable('X');
            const sub = {
                '?X': tf.variable('Y'),
                '?Y': tf.atomic('bird')
            };
            const result = unifier.applySubstitution(v, sub);
            expect(result.name).toBe('bird');
        });

        it('should apply substitution to compound terms', () => {
            const term = tf.inheritance(tf.variable('X'), tf.atomic('animal'));
            const sub = {'?X': tf.atomic('bird')};
            const result = unifier.applySubstitution(term, sub);
            expect(result.components[0].name).toBe('bird');
            expect(result.components[1].name).toBe('animal');
        });

        it('should not modify term when no substitution applies', () => {
            const term = tf.atomic('bird');
            const sub = {'?X': tf.atomic('cat')};
            const result = unifier.applySubstitution(term, sub);
            expect(result).toEqual(term);
        });

        it('should apply partial substitutions in compound terms', () => {
            const term = tf.inheritance(tf.variable('X'), tf.variable('Y'));
            const sub = {'?X': tf.atomic('bird')};
            const result = unifier.applySubstitution(term, sub);
            expect(result.components[0].name).toBe('bird');
            expect(result.components[1].name).toBe('?Y');
        });
    });

    describe('complex scenarios', () => {
        it('should handle syllogistic pattern matching', () => {
            // Pattern: (S -> M), (M -> P) => (S -> P)
            const premise1 = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const premise2 = tf.inheritance(tf.atomic('animal'), tf.atomic('living'));

            const pattern1 = tf.inheritance(tf.variable('S'), tf.variable('M'));
            const pattern2 = tf.inheritance(tf.variable('M'), tf.variable('P'));

            const result1 = unifier.match(pattern1, premise1);
            expect(result1.success).toBe(true);

            const result2 = unifier.match(pattern2, premise2, result1.substitution);
            expect(result2.success).toBe(true);

            expect(result2.substitution['?S'].name).toBe('bird');
            expect(result2.substitution['?M'].name).toBe('animal');
            expect(result2.substitution['?P'].name).toBe('living');
        });

        it('should handle variable renaming in rule application', () => {
            // Pattern: (X -> Y), (Y -> Z)
            // Instance 1: (bird -> animal), (animal -> living)
            // Instance 2: (cat -> animal), (animal -> moving)
            // Should have different bindings for each instance

            const pattern1 = tf.inheritance(tf.variable('X'), tf.variable('Y'));
            const pattern2 = tf.inheritance(tf.variable('Y'), tf.variable('Z'));

            // First application
            const p1a = tf.inheritance(tf.atomic('bird'), tf.atomic('animal'));
            const p2a = tf.inheritance(tf.atomic('animal'), tf.atomic('living'));

            let r1 = unifier.match(pattern1, p1a);
            let r2 = unifier.match(pattern2, p2a, r1.substitution);

            expect(r2.substitution['?X'].name).toBe('bird');
            expect(r2.substitution['?Z'].name).toBe('living');

            // Second application (independent)
            const p1b = tf.inheritance(tf.atomic('cat'), tf.atomic('animal'));
            const p2b = tf.inheritance(tf.atomic('animal'), tf.atomic('moving'));

            r1 = unifier.match(pattern1, p1b);
            r2 = unifier.match(pattern2, p2b, r1.substitution);

            expect(r2.substitution['?X'].name).toBe('cat');
            expect(r2.substitution['?Z'].name).toBe('moving');
        });
    });
});
