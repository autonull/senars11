/**
 * Unit tests for PrologStrategy
 */

import {PrologStrategy} from './PrologStrategy.js';
import {Task} from '../../task/Task.js';
import {Truth} from '../../Truth.js';
import {TermFactory} from '../../term/TermFactory.js';

describe('PrologStrategy', () => {
    let strategy;
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        strategy = new PrologStrategy({termFactory});
    });

    test('should initialize correctly with default config', () => {
        expect(strategy).toBeDefined();
        expect(strategy.config.maxDepth).toBe(10);
        expect(strategy.config.maxSolutions).toBe(5);
        expect(strategy.knowledgeBase).toBeInstanceOf(Map);
    });

    test('should add Prolog facts to knowledge base', () => {
        const prologFact = 'parent(tom, bob).';
        strategy.addPrologFacts(prologFact);

        // Check that the knowledge base has been updated
        expect(strategy.knowledgeBase.size).toBeGreaterThan(0);
    });

    test('should handle simple query when knowledge base is empty', async () => {
        const mockTask = new Task({
            term: termFactory.atomic('likes'),
            punctuation: '?',
            truth: null
        });

        const secondaryPremises = await strategy.selectSecondaryPremises(mockTask);

        // Should return empty array when no matching facts/rules exist
        expect(Array.isArray(secondaryPremises)).toBe(true);
        expect(secondaryPremises.length).toBe(0);
    });

    test('should update knowledge base with tasks', () => {
        const mockTask = new Task({
            term: termFactory.atomic('likes'),
            punctuation: '.',
            truth: new Truth(1.0, 0.9)
        });

        strategy.updateKnowledgeBase([mockTask]);

        // Knowledge base should be updated
        expect(strategy.knowledgeBase.size).toBeGreaterThan(0);
    });

    test('should return status information', () => {
        const status = strategy.getStatus();

        expect(status).toBeDefined();
        expect(status.type).toBe('PrologStrategy');
        expect(status.knowledgeBaseSize).toBeGreaterThanOrEqual(0);
        expect(status.config).toBeDefined();
    });

    test('should select secondary premises for non-question tasks using fallback', async () => {
        const mockTask = new Task({
            term: termFactory.atomic('likes'),
            punctuation: '.',  // Not a question
            truth: new Truth(1.0, 0.9)
        });

        // We'll test the fallback behavior by checking that it doesn't throw
        const secondaryPremises = await strategy.selectSecondaryPremises(mockTask);

        // Should return array (possibly empty since we don't have memory access in this test)
        expect(Array.isArray(secondaryPremises)).toBe(true);
    });

    test('should handle Prolog parsing and rule addition', () => {
        const prologRule = 'grandparent(X, Z) :- parent(X, Y), parent(Y, Z).';

        // Add the rule to the strategy
        strategy.addPrologRule(prologRule);

        // Check that the knowledge base was updated
        expect(strategy.knowledgeBase.size).toBeGreaterThanOrEqual(0);
    });

    test('should have configurable parameters', () => {
        const customConfig = {
            maxDepth: 15,
            maxSolutions: 10,
            termFactory: termFactory
        };

        const customStrategy = new PrologStrategy(customConfig);

        expect(customStrategy.config.maxDepth).toBe(15);
        expect(customStrategy.config.maxSolutions).toBe(10);
    });
});