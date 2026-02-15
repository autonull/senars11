/**
 * @file comprehensive-web-test.js
 * @description Comprehensive end-to-end test for SeNARS web UI
 */

import {TestNARWeb} from '../../src/testing/TestNARWeb.js';

async function runComprehensiveWebTest() {
    console.log('🧪 Starting comprehensive SeNARS Web UI test...\n');

    try {
        // Test 1: Basic statement input and retrieval
        console.log('📋 Test 1: Basic statement input and retrieval');
        const test1 = new TestNARWeb();
        await test1
            .input('<robin --> bird>', 1.0, 0.9)  // Input: Robin is a bird
            .run(10)  // Execute cycles to process the input
            .expect('<robin --> bird>')  // Expect to find the statement
            .execute();
        console.log('✅ Test 1 passed: Basic statement input and retrieval\n');

        // Test 2: Simple inference (Deduction)
        console.log('📋 Test 2: Simple inference (Deduction)');
        const test2 = new TestNARWeb();
        await test2
            .input('<bird --> animal>', 1.0, 0.9)  // Birds are animals
            .input('<robin --> bird>', 1.0, 0.9)   // Robin is a bird
            .run(30)  // More cycles for inference
            .expect('<robin --> animal>')  // Should derive: Robin is an animal
            .execute();
        console.log('✅ Test 2 passed: Simple inference (Deduction)\n');

        // Test 3: Contraposition (Input: If bird then animal. Therefore: If not animal then not bird.)
        console.log('📋 Test 3: Contraposition');
        const test3 = new TestNARWeb();
        await test3
            .input('<bird --> animal>', 1.0, 0.9)
            .run(20)
            .expect('<(\\animal) --> (\\bird)>')  // Expect contraposition
            .execute();
        console.log('✅ Test 3 passed: Contraposition\n');

        // Test 4: Induction (Generalization)
        console.log('📋 Test 4: Induction (Generalization)');
        const test4 = new TestNARWeb();
        await test4
            .input('<robin --> bird>', 0.9, 0.8)
            .input('<robin --> flyer>', 0.9, 0.8)
            .run(25)
            .expect('<bird --> flyer>')  // Expect: birds are flyers (inductive inference)
            .execute();
        console.log('✅ Test 4 passed: Induction (Generalization)\n');

        // Test 5: Temporal inference
        console.log('📋 Test 5: Temporal inference');
        const test5 = new TestNARWeb();
        await test5
            .input('<(robin &/ seed) --> foodsource>.')  // Robin seeks seeds
            .input('<(seed &/ ground) --> location>.')   // Seeds are on ground
            .run(40)
            .expect('<(robin &/ ground) --> location>?')  // Question: Is robin on ground?
            .execute();
        console.log('✅ Test 5 passed: Temporal inference\n');

        console.log('🎉 All comprehensive web UI tests passed successfully!');
        console.log('The SeNARS web interface is working correctly with the NAR system.');
        
    } catch (error) {
        console.error('❌ Comprehensive web test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

async function runSimpleWebTest() {
    console.log('🧪 Starting simple web test...\n');

    try {
        // Simple test to verify basic functionality
        const test = new TestNARWeb();
        await test
            .input('<a --> b>', 0.9, 0.8)
            .run(5)
            .expect('<a --> b>')
            .execute();
        
        console.log('✅ Simple web test passed!\n');
    } catch (error) {
        console.error('❌ Simple web test failed:', error.message);
        process.exit(1);
    }
}

// Run tests based on command line arguments
async function runTests() {
    const testType = process.argv[2] || 'simple';
    
    if (testType === 'comprehensive') {
        await runComprehensiveWebTest();
    } else if (testType === 'simple') {
        await runSimpleWebTest();
    } else {
        console.log(`Unknown test type: ${testType}`);
        console.log('Usage: node comprehensive-web-test.js [simple|comprehensive]');
        process.exit(1);
    }
}

// Export for use in other modules
export { runTests, runSimpleWebTest, runComprehensiveWebTest };

// Run if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    runTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}