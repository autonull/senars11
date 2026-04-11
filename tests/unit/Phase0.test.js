import {beforeEach, describe, expect, it} from '@jest/globals';
import {NarseseParser, TermFactory, Unifier} from '@senars/nar';
import * as TermUtils from '@senars/nar/src/term/TermUtils.js';

describe('Phase 0 Implementation', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    describe('TermUtils', () => {
        it('should check equality correctly', () => {
            const t1 = termFactory.atomic('A');
            const t2 = termFactory.atomic('A');
            const t3 = termFactory.atomic('B');

            expect(TermUtils.termsEqual(t1, t2)).toBe(true);
            expect(TermUtils.termsEqual(t1, t3)).toBe(false);
        });

        it('should identify variables', () => {
            const v = termFactory.variable('?x');
            const c = termFactory.atomic('A');

            expect(TermUtils.isVariable(v)).toBe(true);
            expect(TermUtils.isVariable(c)).toBe(false);
        });

        it('should identify compound terms', () => {
            const c = termFactory.inheritance(termFactory.atomic('A'), termFactory.atomic('B'));
            const a = termFactory.atomic('A');

            expect(TermUtils.isCompound(c)).toBe(true);
            expect(TermUtils.isCompound(a)).toBe(false);
        });
    });

    describe('Unifier', () => {
        let unifier;

        beforeEach(() => {
            unifier = new Unifier(termFactory);
        });

        it('should unify two identical terms', () => {
            const t1 = termFactory.atomic('A');
            const result = unifier.unify(t1, t1);
            expect(result.success).toBe(true);
        });

        it('should unify variable with constant', () => {
            const v = termFactory.variable('?x');
            const c = termFactory.atomic('A');
            const result = unifier.unify(v, c);

            expect(result.success).toBe(true);
            expect(result.substitution['?x']).toBeDefined();
            expect(result.substitution['?x'].name).toBe('A');
        });

        it('should perform pattern matching (one-way unification)', () => {
            const pattern = termFactory.inheritance(termFactory.variable('?s'), termFactory.atomic('bird'));
            const term = termFactory.inheritance(termFactory.atomic('robin'), termFactory.atomic('bird'));

            const result = unifier.match(pattern, term);

            expect(result.success).toBe(true);
            expect(result.substitution['?s'].name).toBe('robin');
        });

        it('should fail pattern matching if constants mismatch', () => {
            const pattern = termFactory.inheritance(termFactory.variable('?s'), termFactory.atomic('bird'));
            const term = termFactory.inheritance(termFactory.atomic('dog'), termFactory.atomic('mammal'));

            const result = unifier.match(pattern, term);
            expect(result.success).toBe(false);
        });
    });

    describe('Negation Simplification', () => {
        let parser;

        beforeEach(() => {
            parser = new NarseseParser(termFactory);
        });

        it('should parse negation as inverted frequency', () => {
            const input = '--(bird --> flyer). %0.9;0.9%';
            const result = parser.parse(input);

            // Term should be unwrapped
            expect(result.term.operator).toBe('-->');
            expect(result.term.components[0].name).toBe('bird');
            expect(result.term.components[1].name).toBe('flyer');

            // Frequency should be inverted (1 - 0.9 = 0.1)
            expect(result.truthValue.frequency).toBeCloseTo(0.1);
            expect(result.truthValue.confidence).toBe(0.9);
        });

        it('should not invert if no truth value provided', () => {
            const input = '--(bird --> flyer).';
            const result = parser.parse(input);
            // If no truth value, it returns the negation term as is
            expect(result.term.operator).toBe('--');
        });
    });
});
