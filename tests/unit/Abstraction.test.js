/**
 * Abstraction.test.js
 *
 * Verifies the flexibility of the Rule Engine abstraction using Discriminators.
 */

import {beforeEach, describe, expect, it} from '@jest/globals';
import {RuleCompiler, RuleExecutor, Unifier, TermFactory, StandardDiscriminators} from '@senars/nar';

describe('Rule Engine Abstraction', () => {
    let termFactory;
    let unifier;

    beforeEach(() => {
        termFactory = new TermFactory();
        unifier = new Unifier(termFactory);
    });

    it('should compile and execute using StandardDiscriminators', () => {
        const compiler = new RuleCompiler(termFactory, StandardDiscriminators);

        const rule = {
            id: 'test_rule',
            pattern: {
                p: {operator: '-->', subject: '$S', predicate: '$P'},
                s: {operator: '-->', subject: '$P', predicate: '$M'}
            },
            conclusion: () => ({
                term: termFactory.atomic('result'),
                truth: {frequency: 1, confidence: 0.9},
                punctuation: '.'
            })
        };

        const tree = compiler.compile([rule]);
        const executor = new RuleExecutor(tree, unifier, StandardDiscriminators);

        const p = {term: termFactory.create('-->', [termFactory.atomic('A'), termFactory.atomic('B')])};
        const s = {term: termFactory.create('-->', [termFactory.atomic('B'), termFactory.atomic('C')])};

        const results = executor.execute(p, s, {termFactory});
        expect(results.length).toBe(1);
        expect(results[0].term.name).toBe('result');
    });

    it('should support custom discriminators', () => {
        // Define a custom discriminator that checks if the subject is "special"
        const SpecialSubjectDiscriminator = {
            name: 'SpecialSubject',
            getPatternValue: (p, s) => {
                // If pattern subject is explicitly 'special', return 'yes', else '*'
                return p.subject === 'special' ? 'yes' : '*';
            },
            getInstanceValue: (pTerm, sTerm) => {
                // Check if pTerm subject is 'special'
                return pTerm.components[0].name === 'special' ? 'yes' : 'no';
            }
        };

        const customDiscriminators = [SpecialSubjectDiscriminator];
        const compiler = new RuleCompiler(termFactory, customDiscriminators);

        const rule = {
            id: 'special_rule',
            pattern: {
                p: {operator: '-->', subject: 'special', predicate: '$P'},
                s: {operator: '-->', subject: '$P', predicate: '$M'}
            },
            conclusion: () => ({
                term: termFactory.atomic('special_result'),
                truth: {frequency: 1, confidence: 0.9},
                punctuation: '.'
            })
        };

        const tree = compiler.compile([rule]);
        const executor = new RuleExecutor(tree, unifier, customDiscriminators);

        // Case 1: Subject is 'special' -> Should match
        const p1 = {term: termFactory.create('-->', [termFactory.atomic('special'), termFactory.atomic('B')])};
        const s1 = {term: termFactory.create('-->', [termFactory.atomic('B'), termFactory.atomic('C')])};

        const results1 = executor.execute(p1, s1, {termFactory});
        expect(results1.length).toBe(1);

        // Case 2: Subject is 'normal' -> Should NOT match (value 'no' vs rule value 'yes')
        const p2 = {term: termFactory.create('-->', [termFactory.atomic('normal'), termFactory.atomic('B')])};
        const s2 = {term: termFactory.create('-->', [termFactory.atomic('B'), termFactory.atomic('C')])};

        const results2 = executor.execute(p2, s2, {termFactory});
        expect(results2.length).toBe(0);
    });
});
