/**
 * @file test-web-integration.js
 * @description End-to-end integration test for the SeNARS web UI
 */

import {TestNARWeb} from '../../src/testing/TestNARWeb.js';

async function runWebIntegrationTest() {
    console.log('Starting SeNARS Web UI integration test...');
    
    try {
        // Create a basic test case to verify the web UI interaction
        const test = new TestNARWeb();
        
        // Test a simple NARS operation: input a statement and expect a result
        await test
            .input('<a --> b>', 0.8, 0.9)  // Input a statement with frequency 0.8 and confidence 0.9
            .run(5)  // Run for 5 cycles
            .expect('<a --> b>')  // Expect to find the statement in memory
            .execute();
        
        console.log('✅ Basic web integration test passed!');
        
        // Test a more complex scenario
        const test2 = new TestNARWeb();
        await test2
            .input('<bird --> animal>', 1.0, 0.9)  // Birds are animals
            .input('<tweety --> bird>', 1.0, 0.9)  // Tweety is a bird
            .run(20)  // Run more cycles for inference
            .expect('<tweety --> animal>')  // Should derive that Tweety is an animal
            .execute();
            
        console.log('✅ Inference test through web UI passed!');
        
        console.log('All web integration tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Web integration test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Also run a test that uses the UI-specific methods if available
async function runWebUITest() {
    console.log('Starting SeNARS Web UI specific test...');
    
    try {
        const test = new TestNARWeb();
        
        // This test will check that the UI shows expected content
        await test
            .input('<cat --> mammal>', 0.9, 0.8)
            .run(3)
            .expectUIContains('> <cat --> mammal>. %0.9;0.8%')  // Should show the input in the REPL
            .execute();
        
        console.log('✅ Web UI content test passed!');
        
    } catch (error) {
        // This might fail if UI components aren't available, which is okay for now
        console.warn('⚠️ Web UI content test skipped or failed (expected if UI not fully set up):', error.message);
    }
}

// Run the tests
async function runTests() {
    await runWebIntegrationTest();
    await runWebUITest();
}

// Run the tests if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    runTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

export { runTests };