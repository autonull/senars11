/**
 * Server command testing
 * Tests all major server commands to ensure they work properly with the UI
 */

import {TestNARWeb} from '../../src/testing/TestNARWeb.js';

async function runServerCommandTests() {
    console.log('🚀 Starting server command tests...\n');

    const testResults = {
        passed: 0,
        failed: 0,
        total: 0,
        errors: []
    };

    const serverCommands = [
        {
            name: 'Step Command',
            command: '*step',
            description: 'Execute a single reasoning step'
        },
        {
            name: 'Run Command',
            command: '*run',
            description: 'Start continuous reasoning cycles'
        },
        {
            name: 'Stop Command', 
            command: '*stop',
            description: 'Stop continuous reasoning cycles'
        },
        {
            name: 'Reset Command',
            command: '*reset',
            description: 'Reset the NAR system'
        },
        {
            name: 'Help Command',
            command: '*help',
            description: 'Show help information'
        },
        {
            name: 'Configuration Commands',
            command: '*volume=10',
            description: 'Set system volume parameter'
        },
        {
            name: 'Decision Threshold',
            command: '*decisionthreshold=0.5',
            description: 'Set decision threshold'
        },
        {
            name: 'Babbling Threshold',
            command: '*babblingThreshold=0.1',
            description: 'Set babbling threshold'
        }
    ];

    for (const cmd of serverCommands) {
        testResults.total++;
        
        try {
            console.log(`🧪 Testing: ${cmd.name} - ${cmd.command} (${cmd.description})`);
            
            const test = new TestNARWeb();
            await test
                .input(cmd.command)  // Send the command
                .run(2)              // Run for a few cycles to allow processing
                .execute();
            
            console.log(`    ✅ Passed`);
            testResults.passed++;
            
        } catch (error) {
            console.log(`    ❌ Failed: ${error.message}`);
            testResults.failed++;
            testResults.errors.push({
                command: cmd.command,
                error: error.message
            });
        }
    }

    // Summary
    console.log('\n📋 Server Command Test Summary:');
    console.log(`  Total commands tested: ${testResults.total}`);
    console.log(`  Passed: ${testResults.passed}`);
    console.log(`  Failed: ${testResults.failed}`);
    console.log(`  Success rate: ${testResults.total > 0 ? Math.round((testResults.passed / testResults.total) * 100) : 0}%`);
    
    if (testResults.errors.length > 0) {
        console.log('\n❌ Failed commands:');
        for (const error of testResults.errors) {
            console.log(`  - ${error.command}: ${error.error}`);
        }
    }
    
    const allPassed = testResults.failed === 0;
    console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL COMMANDS WORKED' : '❌ SOME COMMANDS FAILED'}`);
    
    return allPassed;
}

// Run the tests if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    runServerCommandTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Server command test execution failed:', error);
            process.exit(1);
        });
}

export { runServerCommandTests };