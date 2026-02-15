/**
 * @file test-continuous-reasoning-updates.js
 * @description Test real-time updates during continuous reasoning mode
 *
 * This test specifically validates that the UI receives and displays real-time
 * updates as the NAR performs continuous reasoning operations.
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';
import { BaseUITest, TestError } from './test-utils.js';

class ContinuousReasoningTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.normal) {
        super(config, { headless: true }); // Use headless mode for CI environments
        this.testResults.realTimeUpdates = [];
        this.testResults.continuousReasoning = [];
    }

    initTestResults() {
        return {
            setup: { nar: false, ui: false, connection: false },
            operations: [],
            realTimeUpdates: [],
            continuousReasoning: [],
            errors: []
        };
    }

    async setupContinuousReasoningScenario() {
        console.log('\n🔧 Setting up continuous reasoning scenario...');

        // Input initial premises that will generate inferences during continuous reasoning
        const premises = [
            '<bird --> animal>. :|: %1.00;0.90%',  // Birds are animals
            '<robin --> bird>. :|: %1.00;0.90%',  // Robins are birds
            '<ostrich --> bird>. :|: %1.00;0.90%', // Ostriches are birds
            '<(robin &/ seed) --> foraging>. :|: %1.00;0.80%' // Robins forage for seeds
        ];

        for (let i = 0; i < premises.length; i++) {
            const premise = premises[i];
            console.log(`   Adding premise ${i+1}/${premises.length}: ${premise.substring(0, 30)}...`);

            await this.executeCommand(premise, 500); // Brief pause between inputs

            this.testResults.continuousReasoning.push({
                type: 'premise_input',
                premise: premise,
                status: 'added',
                timestamp: Date.now()
            });
        }

        console.log('✅ Continuous reasoning premises added');
    }

    async monitorRealTimeUpdates() {
        console.log('\n👀 Monitoring real-time updates during continuous reasoning...');

        // Start continuous reasoning
        console.log('   Starting continuous reasoning mode...');
        await this.executeCommand('*run', 500);

        // Monitor the UI for real-time updates over 5 seconds
        const monitoringDuration = 5000; // 5 seconds
        const startTime = Date.now();
        let updateCount = 0;

        while (Date.now() - startTime < monitoringDuration) {
            // Check for visual updates in the UI
            const replOutputBefore = await this.page.evaluate(() => {
                const output = document.querySelector('#repl-output') ||
                              document.querySelector('.repl-output') ||
                              document.querySelector('[id*="output"]');
                return output ? output.textContent : '';
            });

            // Wait a bit to see if new content appears
            await setTimeout(500);

            const replOutputAfter = await this.page.evaluate(() => {
                const output = document.querySelector('#repl-output') ||
                              document.querySelector('.repl-output') ||
                              document.querySelector('[id*="output"]');
                return output ? output.textContent : '';
            });

            // Check if output changed (indicating new reasoning results)
            if (replOutputAfter.length > replOutputBefore.length) {
                updateCount++;
                console.log(`   🔄 Real-time update detected (update #${updateCount})`);

                this.testResults.realTimeUpdates.push({
                    type: 'output_change',
                    updateNumber: updateCount,
                    timestamp: Date.now(),
                    outputLengthBefore: replOutputBefore.length,
                    outputLengthAfter: replOutputAfter.length
                });
            }

            // Check for graph updates
            const graphHasContent = await this.page.evaluate(() => {
                const cyContainer = document.querySelector('#cy-container');
                if (!cyContainer) return false;

                return cyContainer.querySelector('svg') !== null ||
                       cyContainer.querySelector('canvas') !== null ||
                       cyContainer.querySelectorAll('[class*="node"], [class*="edge"]').length > 0 ||
                       cyContainer.querySelector('[id^="cytoscape"]') !== null;
            });

            if (graphHasContent) {
                updateCount++;
                console.log(`   📊 Graph update detected (update #${updateCount})`);

                this.testResults.realTimeUpdates.push({
                    type: 'graph_change',
                    updateNumber: updateCount,
                    timestamp: Date.now()
                });
            }
        }

        // Stop continuous reasoning
        console.log('   Stopping continuous reasoning mode...');
        await this.executeCommand('*stop', 500);

        console.log(`✅ Real-time monitoring completed. Detected ${updateCount} updates.`);
    }

    async testSingleStepUpdates() {
        console.log('\n🔍 Testing single step updates for comparison...');

        // Input a new premise
        await this.executeCommand('<fish --> animal>. :|: %1.00;0.90%', 300);

        // Execute single step
        let outputBeforeStep = await this.page.evaluate(() => {
            const output = document.querySelector('#repl-output') ||
                          document.querySelector('.repl-output') ||
                          document.querySelector('[id*="output"]');
            return output ? output.textContent : '';
        });

        await this.executeCommand('*step', 800); // Wait for step completion

        let outputAfterStep = await this.page.evaluate(() => {
            const output = document.querySelector('#repl-output') ||
                          document.querySelector('.repl-output') ||
                          document.querySelector('[id*="output"]');
            return output ? output.textContent : '';
        });

        const hasStepUpdate = outputAfterStep.length > outputBeforeStep.length;
        console.log(`   Single step update: ${hasStepUpdate ? '✅ YES' : '❌ NO'}`);

        this.testResults.continuousReasoning.push({
            type: 'single_step_test',
            hasUpdate: hasStepUpdate,
            timestamp: Date.now()
        });
    }

    async runCompleteTest() {
        console.log('🚀 Starting real-time continuous reasoning updates test...\n');

        try {
            // Start NAR server with continuous reasoning capabilities
            await this.startNARServer();

            // Start UI server
            await this.startUIServer();

            // Start browser for testing
            await this.startBrowser();

            // Navigate to UI and establish connection
            await this.navigateAndConnect();

            // Set up continuous reasoning scenario with premises
            await this.setupContinuousReasoningScenario();

            // Test single step updates first
            await this.testSingleStepUpdates();

            // Monitor real-time updates during continuous reasoning
            await this.monitorRealTimeUpdates();

            console.log('\n✅ Continuous reasoning real-time updates test completed!');
            this.testResults.setup = true;
            return true;

        } catch (error) {
            console.error(`\n❌ Continuous reasoning test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    generateTestReport() {
        console.log('\n📋=== CONTINUOUS REASONING TEST REPORT ===');

        console.log(`\n🔧 Setup: ${this.testResults.setup.nar && this.testResults.setup.ui && this.testResults.setup.connection ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n🔄 Real-time Updates: ${this.testResults.realTimeUpdates.length} updates detected`);
        const updateTypes = this.testResults.realTimeUpdates.reduce((acc, update) => {
            acc[update.type] = (acc[update.type] || 0) + 1;
            return acc;
        }, {});

        Object.entries(updateTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count} occurrences`);
        });

        console.log(`\n⚙️  Continuous Reasoning Operations: ${this.testResults.continuousReasoning.length} operations`);
        this.testResults.continuousReasoning.forEach((op, i) => {
            console.log(`  ${i+1}. ${op.type}: ${op.hasUpdate ? '✅' : op.status || '✅'}`);
        });

        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {
                console.log(`  • ${error.message || error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }

        const hasRealTimeUpdates = this.testResults.realTimeUpdates.length > 0;
        const overallSuccess = this.testResults.setup.nar &&
                              this.testResults.setup.ui &&
                              this.testResults.setup.connection &&
                              hasRealTimeUpdates &&
                              this.testResults.errors.length === 0;

        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ REAL-TIME UPDATES WORKING' : '❌ REAL-TIME UPDATES ISSUE'}`);
        console.log(`\n📊 Summary:`);
        console.log(`  - Real-time updates detected: ${hasRealTimeUpdates ? 'YES' : 'NO'}`);
        console.log(`  - Total updates captured: ${this.testResults.realTimeUpdates.length}`);

        return overallSuccess;
    }

    async run() {
        let success = false;

        try {
            success = await this.runCompleteTest();
        } finally {
            const reportSuccess = this.generateTestReport();
            await this.tearDown();

            // Return the more comprehensive result
            const finalSuccess = success && reportSuccess;
            console.log(`\n🏁 Final Test Outcome: ${finalSuccess ? 'SUCCESS' : 'FAILURE'}`);

            process.exit(finalSuccess ? 0 : 1);
        }
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const testRunner = new ContinuousReasoningTest();
    testRunner.run().catch(console.error);
}

export { ContinuousReasoningTest };