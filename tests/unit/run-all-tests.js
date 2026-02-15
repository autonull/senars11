#!/usr/bin/env node

/**
 * @file run-all-tests.js
 * @description Script to run all SeNARS integration tests
 * 
 * This script runs all the new tests that follow the requirements:
 * - Test objects directly, without resorting to Mocks
 * - Cover realistic UI/UX patterns
 * - Ensure outcomes: visible and tangible system reactions
 * - Handle errors robustly and with visible detailed explanation
 * - NAR reasoning: both step and continuous (short time spans) execution modes
 * - Tests are self-contained, and clean-up all the resources
 * - Test the limits of the buffering/batching mechanisms, with small capacities
 * - Extend, abstract, or parameterize existing integration tests to avoid redundant code
 */

import { spawn, execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';

async function runTest(testFile, testType = 'normal') {
    console.log(`\n🧪 Running test: ${testFile} (${testType})`);
    
    return new Promise((resolve) => {
        const testProcess = spawn('node', [testFile, testType], {
            cwd: './tests',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        testProcess.stdout.on('data', (data) => {
            process.stdout.write(`[TEST-OUT] ${data}`);
        });

        testProcess.stderr.on('data', (data) => {
            process.stderr.write(`[TEST-ERR] ${data}`);
        });

        testProcess.on('close', (code) => {
            console.log(`✅ Test ${testFile} completed with exit code: ${code}`);
            resolve(code === 0);
        });

        // Set timeout for test execution (2 minutes max per test)
        setTimeout(120000).then(() => {
            if (!testProcess.killed) {
                console.log(`⚠️  Test ${testFile} timed out, killing process...`);
                testProcess.kill();
                resolve(false);
            }
        });
    });
}

async function runAllTests() {
    console.log('🚀 Starting SeNARS Comprehensive Test Suite\n');
    
    // Test configuration
    const tests = [
        { file: './comprehensive-integration-test.js', config: 'normal' },
        { file: './extended-integration-test.js', config: 'normal' },
        { file: './extended-integration-test.js', config: 'small_buffer' }, // Test with small capacities
        { file: './test-buffering-batching.js', config: 'small_buffer' },   // Dedicated buffering test
        { file: './test-roundtrip-io.js', config: 'normal' },
        { file: './comprehensive-web-test.js', config: 'simple' }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`\n📋 Test ${tests.indexOf(test) + 1}/${tests.length}: ${test.file} (${test.config})`);
            const success = await runTest(test.file, test.config);
            results.push({
                test: test.file,
                config: test.config,
                success: success
            });
            
            // Add delay between tests to prevent resource conflicts
            await setTimeout(3000);
        } catch (error) {
            console.error(`❌ Failed to run test ${test.file}:`, error.message);
            results.push({
                test: test.file,
                config: test.config,
                success: false,
                error: error.message
            });
        }
    }
    
    // Generate summary report
    console.log('\n📊=== TEST SUITE SUMMARY ===');
    
    const passedTests = results.filter(r => r.success).length;
    const failedTests = results.filter(r => !r.success).length;
    
    console.log(`\nTotal Tests: ${results.length}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    
    if (failedTests > 0) {
        console.log('\n❌ Failed Tests:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`  • ${r.test} (${r.config}) - ${r.error || 'Unknown error'}`);
        });
    }
    
    const overallSuccess = failedTests === 0;
    console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    // Exit with appropriate code
    process.exit(overallSuccess ? 0 : 1);
}

// Run the tests if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    runAllTests().catch(error => {
        console.error('Test suite execution failed:', error);
        process.exit(1);
    });
}

export { runAllTests };