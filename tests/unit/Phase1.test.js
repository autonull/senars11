import {beforeEach, describe, expect, it} from '@jest/globals';
import {RuleCompiler, RuleExecutor, StandardDiscriminators, TermFactory, Truth, Unifier} from '@senars/nar';
import {NAL4, NAL5} from '@senars/nar/src/reason/rules/nal/index.js';

describe('Phase 1: Rule Engine', () => {
    let termFactory;
    let unifier;
    let compiler;
    let executor;

    beforeEach(() => {
        termFactory = new TermFactory();
        unifier = new Unifier(termFactory);
        compiler = new RuleCompiler(termFactory, StandardDiscriminators);
    });

    describe('RuleCompiler', () => {
        it('should compile rules into a decision tree', () => {
            const tree = compiler.compile(NAL4);
            expect(tree).toBeDefined();
            expect(tree.children.size).toBeGreaterThan(0);
        });
    });

    describe('RuleExecutor', () => {
        beforeEach(() => {
            const rules = [...NAL4, ...NAL5];
            const tree = compiler.compile(rules);
            executor = new RuleExecutor(tree, unifier, StandardDiscriminators);
        });

        it('should execute Intersection rule (NAL-4)', () => {
            // (S --> M) & (P --> M) |- ((S & P) --> M) ?? 
            // Wait, my definition was:
            // p: (M --> T), s: (M --> P) |- (M --> (T & P))

            const M = termFactory.atomic('bird');
            const T = termFactory.atomic('flyer');
            const P = termFactory.atomic('animal');

            const p = {
                term: termFactory.inheritance(M, T),
                truth: new Truth(1.0, 0.9)
            };
            const s = {
                term: termFactory.inheritance(M, P),
                truth: new Truth(1.0, 0.9)
            };

            const context = {termFactory};
            const results = executor.execute(p, s, context);

            expect(results.length).toBeGreaterThan(0);
            const result = results[0];

            // Expected: (bird --> (flyer & animal))
            expect(result.term.operator).toBe('-->');
            expect(result.term.components[0].name).toBe('bird');
            expect(result.term.components[1].operator).toBe('&');
        });

        it('should execute Implication Deduction rule (NAL-5)', () => {
            // (M ==> P) & (S ==> M) |- (S ==> P)
            // p: (M ==> P), s: (S ==> M)

            const M = termFactory.atomic('M');
            const P = termFactory.atomic('P');
            const S = termFactory.atomic('S');

            const p = {
                term: termFactory.implication(M, P),
                truth: new Truth(1.0, 0.9)
            };
            const s = {
                term: termFactory.implication(S, M),
                truth: new Truth(1.0, 0.9)
            };

            const context = {termFactory};
            const results = executor.execute(p, s, context);

            expect(results.length).toBeGreaterThan(0);
            const result = results[0];

            // Expected: (S ==> P)
            expect(result.term.operator).toBe('==>');
            expect(result.term.components[0].name).toBe('S');
            expect(result.term.components[1].name).toBe('P');
        });
    });
});
