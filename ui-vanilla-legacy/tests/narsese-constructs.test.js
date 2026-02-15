/**
 * Comprehensive Narsese construct testing
 * Tests all major Narsese constructs to ensure they work properly with the UI
 */

import {TestNARWeb} from '../../src/testing/TestNARWeb.js';

async function runNarseseConstructTests() {
    console.log('🚀 Starting comprehensive Narsese construct tests...\n');

    const testResults = {
        passed: 0,
        failed: 0,
        total: 0,
        errors: []
    };

    const testCases = [
        {
            name: 'Basic Statements',
            constructs: [
                '<subject --> predicate>.',
                '<cat --> animal>.',
                '<dog --> mammal>.',
                '<bird --> flyer>.'
            ],
            description: 'Simple inheritance relationships'
        },
        {
            name: 'Questions',
            constructs: [
                '<subject --> predicate>?',
                '<bird --> flyer>?',
                '<cat --> mammal>?'
            ],
            description: 'Simple questions about relationships'
        },
        {
            name: 'Goals',
            constructs: [
                '<subject --> predicate>!',
                '<be_happy --> state>!',
                '<find_food --> action>!'
            ],
            description: 'Simple goal statements'
        },
        {
            name: 'Truth Values',
            constructs: [
                '<subject --> predicate>. %1.0;0.9%',
                '<cat --> animal>. %0.8;0.7%',
                '<bird --> flyer>. %0.9;0.95%'
            ],
            description: 'Statements with frequency and confidence'
        },
        {
            name: 'Compound Terms',
            constructs: [
                '(a & b)',
                '(a | b)',
                '<a --> b>',
                '(a & (b | c))',
                '(a & b --> c).'
            ],
            description: 'Complex logical expressions'
        },
        {
            name: 'Variables',
            constructs: [
                '<?x --> entity>.',
                '<$x --> concept>.',
                '<#x --> variable>.',
                '*',
                '?x',
                '$x'
            ],
            description: 'Various variable types'
        },
        {
            name: 'Complex Expressions',
            constructs: [
                '<(a & b) --> c>.',
                '<a ==> b>.',
                '<a <=> b>.',
                '<(a & b) --> (c & d)>?'
            ],
            description: 'Advanced logical expressions'
        }
    ];

    for (const testCase of testCases) {
        console.log(`🧪 Testing: ${testCase.name} - ${testCase.description}`);
        
        for (const construct of testCase.constructs) {
            testResults.total++;
            
            try {
                console.log(`  Input: ${construct}`);
                
                const test = new TestNARWeb();
                await test
                    .input(construct)
                    .run(3) // Run for a few cycles
                    .execute();
                
                console.log(`    ✅ Passed`);
                testResults.passed++;
                
            } catch (error) {
                console.log(`    ❌ Failed: ${error.message}`);
                testResults.failed++;
                testResults.errors.push({
                    construct,
                    error: error.message
                });
            }
        }
        
        console.log(''); // Add space between test categories
    }

    // Summary
    console.log('📋 Test Summary:');
    console.log(`  Total constructs tested: ${testResults.total}`);
    console.log(`  Passed: ${testResults.passed}`);
    console.log(`  Failed: ${testResults.failed}`);
    console.log(`  Success rate: ${testResults.total > 0 ? Math.round((testResults.passed / testResults.total) * 100) : 0}%`);
    
    if (testResults.errors.length > 0) {
        console.log('\n❌ Failed constructs:');
        for (const error of testResults.errors) {
            console.log(`  - ${error.construct}: ${error.error}`);
        }
    }
    
    const allPassed = testResults.failed === 0;
    console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    return allPassed;
}

// Run the tests if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    runNarseseConstructTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

export { runNarseseConstructTests };