import { TermFactory } from '../../core/src/term/TermFactory.js';
import { MeTTaInterpreter } from '../../core/src/metta/MeTTaInterpreter.js';

/**
 * Test utility functions for MeTTa tests
 * Provides helpers for common test patterns and assertions
 */
export class MeTTaTestUtils {
    /**
     * Create a standard test interpreter instance
     * @param {Object} options - Optional interpreter configuration
     * @returns {MeTTaInterpreter}
     */
    static createInterpreter(options = {}) {
        const termFactory = new TermFactory();
        // The previous call was new MeTTaInterpreter(null, { ... })
        // But MeTTaInterpreter constructor is (options = {})
        // So we should merge options and pass as first argument.

        // Handle if options contains termFactory, etc.
        const interpreterOptions = {
            termFactory,
            typeChecking: false,
            ...options
        };

        return new MeTTaInterpreter(interpreterOptions);
    }

    /**
     * Assert that a value is a valid superposition
     * @param {*} value - Value to check
     * @param {Array} expectedValues - Expected values in superposition
     */
    static assertSuperposition(value, expectedValues) {
        expect(value.type).toBe('superposition');
        expect(value.values).toEqual(expectedValues);
    }

    /**
     * Create a predicate with product arguments
     * @param {TermFactory} tf - Term factory
     * @param {string} name - Predicate name
     * @param {...string} args - Argument names
     * @returns {Term}
     */
    static predWithArgs(tf, name, ...args) {
        return tf.predicate(
            tf.atomic(name),
            tf.product(...args.map(a => tf.atomic(a)))
        );
    }

    /**
     * Create an equality term from strings
     * @param {TermFactory} tf - Term factory
     * @param {string|Term} lhs - Left-hand side
     * @param {string|Term} rhs - Right-hand side
     * @returns {Term}
     */
    static equalityRule(tf, lhs, rhs) {
        const leftTerm = typeof lhs === 'string' ? tf.atomic(lhs) : lhs;
        const rightTerm = typeof rhs === 'string' ? tf.atomic(rhs) : rhs;
        return tf.equality(leftTerm, rightTerm);
    }

    /**
     * Get common term factory for tests
     * @returns {TermFactory}
     */
    static createTermFactory() {
        return new TermFactory();
    }
}

/**
 * Common test data for parameterized tests
 */
export const TestData = {
    // Type inference test cases
    typeInferenceCases: [
        ['Symbol', 'foo'],
        ['Variable', '$x'],
        ['Number', '42'],
        ['Number', '3.14'],
        ['Boolean', 'True'],
        ['Boolean', 'False']
    ],

    // Superposition collapse operations
    collapseOperations: [
        ['collapse', (nd, s) => nd.collapse(s), (val, original) => original.values.includes(val)],
        ['collapseFirst', (nd, s) => nd.collapseFirst(s), (val, original) => val === original.values[0]],
        ['collapseAll', (nd, s) => nd.collapseAll(s), (val, original) => Array.isArray(val) && val.length === original.values.length]
    ],

    // Arithmetic operations
    arithmeticOps: [
        ['+', [5, 10], 15],
        ['-', [10, 5], 5],
        ['*', [7, 6], 42],
        ['/', [20, 4], 5]
    ]
};
