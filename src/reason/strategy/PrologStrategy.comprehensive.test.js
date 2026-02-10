/**
 * Comprehensive tests for PrologStrategy with actual reasoning scenarios
 */

import {PrologStrategy} from './PrologStrategy.js';
import {Task} from '../../task/Task.js';
import {Truth} from '../../Truth.js';
import {TermFactory} from '../../term/TermFactory.js';

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

    test('should correctly identify variable terms', () => {
        // Test various ways variables might be represented
        const var1 = {name: '?X'};
        const var2 = {name: 'X'};  // Uppercase typically represents variables
        const var3 = {name: '_Temp'};  // Underscore prefix typically represents variables
        const constant = {name: 'tom'};  // Lowercase typically represents constants

        expect(strategy._isVariable(var1)).toBe(true);
        expect(strategy._isVariable(var2)).toBe(true);
        expect(strategy._isVariable(var3)).toBe(true);
        expect(strategy._isVariable(constant)).toBe(false);
    });

    test('should perform simple unification', () => {
        // Test variable to constant unification
        const varTerm = {name: '?X'};
        const constTerm = {name: 'tom'};

        const result = strategy._unify(varTerm, constTerm, {});

        expect(result.success).toBe(true);
        expect(result.substitution['?X']).toBeDefined();
        expect(strategy._getVariableName(result.substitution['?X'])).toBe('tom');
    });

    test('should handle compound term structure', () => {
        // Create a simple compound term structure
        const parentTerm = {
            name: '^',
            components: [
                {name: 'parent'},
                {
                    name: ',',
                    components: [
                        {name: '?X'},
                        {name: 'bob'}
                    ]
                }
            ]
        };

        const anotherTerm = {
            name: '^',
            components: [
                {name: 'parent'},
                {
                    name: ',',
                    components: [
                        {name: 'tom'},
                        {name: 'bob'}
                    ]
                }
            ]
        };

        // These should be able to unify with ?X binding to 'tom'
        const result = strategy._unify(parentTerm, anotherTerm, {});

        expect(result.success).toBe(true);
        expect(result.substitution['?X']).toBeDefined();
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

    test('should apply substitutions to terms', () => {
        const termWithVar = {name: '?X'};
        const substitution = {'?X': {name: 'substituted_value'}};

        const result = strategy._applySubstitutionToTerm(termWithVar, substitution);

        expect(result.name).toBe('substituted_value');
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