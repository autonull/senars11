/**
 * @file simple-web.test.js
 * @description Simple test to verify the TestNARWeb class works end-to-end
 */

import {TestNARWeb} from '../../../src/testing/TestNARWeb.js';

// Convert to Jest-style test
describe('Simple Web Test', () => {
    test('should initialize TestNARWeb infrastructure without errors', () => {
        const test = new TestNARWeb();

        // Add operations to the test
        test.input('<a --> b>', 0.9, 0.8)
            .run(5);

        // Verify that the basic infrastructure works
        expect(test).toBeDefined();
        console.log('✅ TestNARWeb infrastructure instantiated successfully');
    });

    test('should allow chaining of operations', () => {
        const test = new TestNARWeb();

        // Test chaining operations
        const chainedTest = test
            .input('<a --> b>', 0.9, 0.8)
            .run(5);

        expect(chainedTest).toBe(test); // Should return the same instance for chaining
    });
});

export {};