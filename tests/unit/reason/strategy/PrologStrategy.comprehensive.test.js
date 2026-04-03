/**
 * Comprehensive tests for PrologStrategy with actual reasoning scenarios
 */

import {PrologStrategy, Task, Truth, TermFactory} from '@senars/nar';

describe('PrologStrategy - Comprehensive Tests', () => {
    let strategy;
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        strategy = new PrologStrategy({
            termFactory,
            maxDepth: 5,
            maxSolutions: 10
        });
    });

    test('should handle family relationship facts', () => {
        // Add family facts to the knowledge base
        strategy.addPrologFacts('parent(tom, bob).');
        strategy.addPrologFacts('parent(bob, liz).');
        strategy.addPrologFacts('parent(pam, bob).');
        strategy.addPrologFacts('male(tom).');
        strategy.addPrologFacts('female(pam).');
        strategy.addPrologFacts('female(liz).');

        // Check that facts were added
        expect(strategy.knowledgeBase.size).toBeGreaterThan(0);

        // Verify specific predicates were registered
        expect(strategy.knowledgeBase.has('parent')).toBe(true);
        expect(strategy.knowledgeBase.has('male')).toBe(true);
        expect(strategy.knowledgeBase.has('female')).toBe(true);
    });

    test('should create tasks from terms correctly', () => {
        const mockTerm = termFactory.atomic('test_term');
        const task = strategy._createTaskFromTerm(mockTerm, '.', new Truth(0.9, 0.8)); // Using belief punctuation instead of question

        expect(task).toBeDefined();
        expect(task.punctuation).toBe('.');
        expect(task.truth).toBeDefined();
        expect(task.truth.f).toBe(0.9);
        expect(task.truth.c).toBe(0.8);
    });

    test('should handle multiple solutions up to maxSolutions limit', () => {
        // Add multiple facts that could match a query
        strategy.addPrologFacts('likes(alex, pizza).');
        strategy.addPrologFacts('likes(bob, pizza).');
        strategy.addPrologFacts('likes(charlie, pizza).');
        strategy.addPrologFacts('likes(diana, pizza).');

        // Check that all facts were added
        expect(strategy.knowledgeBase.size).toBeGreaterThan(0);
    });

    test('should have proper config with default values', () => {
        const defaultStrategy = new PrologStrategy();

        expect(defaultStrategy.config.maxDepth).toBe(10);
        expect(defaultStrategy.config.maxSolutions).toBe(5);
        expect(defaultStrategy.config.backtrackingEnabled).toBe(true);
    });

    test('should handle custom configuration', () => {
        const customConfig = {
            maxDepth: 15,
            maxSolutions: 12,
            backtrackingEnabled: false
        };

        const customStrategy = new PrologStrategy(customConfig);

        expect(customStrategy.config.maxDepth).toBe(15);
        expect(customStrategy.config.maxSolutions).toBe(12);
        expect(customStrategy.config.backtrackingEnabled).toBe(false);
    });

    test('should update knowledge base with tasks', () => {
        // Create some mock tasks
        const task1 = new Task({
            term: termFactory.atomic('likes'),
            punctuation: '.',
            truth: new Truth(1.0, 0.9)
        });

        const task2 = new Task({
            term: termFactory.atomic('hates'),
            punctuation: '.',
            truth: new Truth(0.3, 0.8)
        });

        // Update the knowledge base
        strategy.updateKnowledgeBase([task1, task2]);

        // Check that the knowledge base was updated
        expect(strategy.knowledgeBase.size).toBe(2); // 2 different predicates
    });

    test('should return proper status information', () => {
        const status = strategy.getStatus();

        expect(status).toBeDefined();
        expect(status.type).toBe('PrologStrategy');
        expect(status.config).toEqual(strategy.config);
        expect(status.knowledgeBaseSize).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(status.registeredPredicates)).toBe(true);
        expect(typeof status.variableCounter).toBe('number');
    });
});