/**
 * @file integration.test.js
 * @description Unit tests for the TestNARWeb class infrastructure
 */

import {TestNARWeb} from '../../src/testing/TestNARWeb.js';

// Convert to Jest-style test
describe('Integration Test - TestNARWeb Infrastructure', () => {
    test('should initialize TestNARWeb class without errors', () => {
        const test = new TestNARWeb();

        // Add a simple input operation
        test.input('<test --> concept>', 0.9, 0.8);

        expect(test).toBeDefined();
        console.log('✅ TestNARWeb class instantiated successfully');
    });

    test('should allow operation chaining', () => {
        const test = new TestNARWeb();

        // Test chaining of operations
        const chainedTest = test
            .input('<test --> concept>', 0.9, 0.8)
            .run(1);

        expect(chainedTest).toBe(test); // Should return the same instance for chaining
    });

    test('should have all required methods', () => {
        const test = new TestNARWeb();

        // Check that all expected methods exist
        const expectedMethods = [
            'input', 'run', 'expect', 'expectNot', 'expectUIContains', 'expectUINotContains',
            'execute', 'startServer', 'stopServer', 'setup', 'teardown'
        ];

        expectedMethods.forEach(method => {
            expect(typeof test[method]).toBe('function');
        });

        console.log(`✅ All ${expectedMethods.length} required methods are present`);
    });
});

export {};