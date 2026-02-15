/**
 * @file test-buffering-batching.js
 * @description Test buffering/batching mechanisms with small capacities
 *
 * This test specifically validates the system's behavior under constrained memory conditions
 * to ensure robust operation regardless of buffer capacity settings.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';
import { TestConfig } from './test-config.js';
import { BaseUITest, TestError } from './test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BufferingBatchingTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.smallBuffer) {
        super(config, { headless: true });
        this.testResults.bufferingTests = [];
        this.testResults.batchingTests = [];
    }

    initTestResults() {
        const baseResults = super.initTestResults();
        return {
            ...baseResults,
            bufferingTests: [],
            batchingTests: []
        };
    }

    async testBufferingUnderLoad() {
        console.log('\n🧪 Testing buffering mechanisms under load with small capacities...');

        // Test input that forces buffer management due to small capacity
        const testInputs = [];
        for (let i = 0; i < 10; i++) {
            testInputs.push(`<buffer_test_${i} --> concept_${i}>.`);
        }

        console.log(`   Sending ${testInputs.length} inputs to stress the buffer...`);

        for (let i = 0; i < testInputs.length; i++) {
            const input = testInputs[i];

            try {
                console.log(`   Processing input ${i+1}/10: ${input.substring(0, 30)}...`);

                // Use inherited method to execute command
                await this.executeCommand(input, 300);

                // Verify the system is still responsive by checking for basic response
                const isResponsive = await this.page.evaluate(() => {
                    const inputField = document.querySelector('#repl-input');
                    return inputField !== null;
                });

                if (isResponsive) {
                    console.log(`   ✅ System remains responsive after input ${i+1}`);
                    this.testResults.bufferingTests.push({
                        input: input,
                        status: 'processed',
                        index: i
                    });
                } else {
                    throw new Error(`System became unresponsive after input ${i+1}`);
                }

            } catch (error) {
                console.error(`   ❌ Error processing input ${i+1}: ${error.message}`);
                this.testResults.bufferingTests.push({
                    input: input,
                    status: 'failed',
                    error: error.message,
                    index: i
                });
                this.testResults.errors.push(error);
            }
        }

        console.log('✅ Buffering under load test completed');
    }

    async testBatchingMechanisms() {
        console.log('\n🧪 Testing batching mechanisms with small batch sizes...');

        // Test reasoning with small batch sizes to ensure proper batching
        const batchCommands = [
            '*step',  // Single step as defined in small batch config
            '*volume=2',  // Set volume to small number
            '<batch_test --> concept>.'  // Test input
        ];

        for (let i = 0; i < batchCommands.length; i++) {
            const command = batchCommands[i];

            try {
                console.log(`   Executing batch command ${i+1}: ${command}`);

                await this.executeCommand(command, 800); // Wait for small batch processing

                console.log(`   ✅ Command executed: ${command}`);

                this.testResults.batchingTests.push({
                    command: command,
                    status: 'executed',
                    index: i
                });

            } catch (error) {
                console.error(`   ❌ Error executing batch command: ${error.message}`);
                this.testResults.batchingTests.push({
                    command: command,
                    status: 'failed',
                    error: error.message,
                    index: i
                });
                this.testResults.errors.push(error);
            }
        }

        console.log('✅ Batching mechanisms test completed');
    }

    async testReasoningModes() {
        console.log('\n🧠 Testing different reasoning modes with constrained buffers...');

        try {
            // Test step mode
            console.log('   Testing step mode reasoning...');
            await this.executeCommand('*step', 500);
            console.log('   ✅ Step mode executed');

            // Add some inputs to create reasoning workload
            await this.executeCommand('<reasoning_test_1 --> concept>.', 300);
            await this.executeCommand('<reasoning_test_2 --> concept>.', 300);

            // Test continuous mode simulation with multiple steps
            console.log('   Testing continuous mode simulation...');
            for (let i = 0; i < 3; i++) {
                await this.executeCommand('*step', 400); // Wait between steps
                console.log(`   Continuous step ${i+1}/3 completed`);
            }

            console.log('✅ Reasoning modes test completed');

            this.testResults.batchingTests.push({
                test: 'reasoning_modes',
                status: 'completed'
            });

        } catch (error) {
            console.error(`   ❌ Reasoning modes test failed: ${error.message}`);
            this.testResults.errors.push(error);
        }
    }

    async runCompleteTest() {
        console.log('🚀 Starting buffering/batching mechanisms test with small capacities...\n');

        try {
            // Use inherited methods
            await this.startNARServer({ port: this.config.port, narOptions: this.config.narOptions });
            await this.startUIServer({ uiPort: this.config.uiPort });
            await this.startBrowser();
            await this.navigateAndConnect();

            // Run buffering tests
            await this.testBufferingUnderLoad();

            // Run batching tests
            await this.testBatchingMechanisms();

            // Test reasoning modes
            await this.testReasoningModes();

            console.log('\n✅ All buffering/batching tests completed successfully!');
            return true;

        } catch (error) {
            console.error(`\n❌ Buffering/batching test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    async generateTestReport() {
        console.log('\n📋=== BUFFERING/BATCHING TEST REPORT ===');

        console.log(`\n🔧 Setup: ${this.testResults.setup ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n📦 Buffering Tests: ${this.testResults.bufferingTests.length} inputs processed`);
        const bufferingPassed = this.testResults.bufferingTests.filter(t => t.status === 'processed').length;
        const bufferingFailed = this.testResults.bufferingTests.filter(t => t.status === 'failed').length;
        console.log(`  Passed: ${bufferingPassed}`);
        console.log(`  Failed: ${bufferingFailed}`);

        console.log(`\n🔄 Batching Tests: ${this.testResults.batchingTests.length} operations tested`);
        const batchingPassed = this.testResults.batchingTests.filter(t => t.status !== 'failed').length;
        const batchingFailed = this.testResults.batchingTests.filter(t => t.status === 'failed').length;
        console.log(`  Passed: ${batchingPassed}`);
        console.log(`  Failed: ${batchingFailed}`);

        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {
                console.log(`  • ${error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }

        const overallSuccess = this.testResults.setup && 
                              bufferingFailed === 0 && 
                              batchingFailed === 0 && 
                              this.testResults.errors.length === 0;

        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        console.log(`\n📊 Summary:`);
        console.log(`  - Tested with concept bag capacity: ${this.config.narOptions.memory.conceptBag.capacity}`);
        console.log(`  - Tested with task bag capacity: ${this.config.narOptions.memory.taskBag.capacity}`);
        console.log(`  - Tested with max tasks per cycle: ${this.config.narOptions.cycle.maxTasksPerCycle}`);

        return overallSuccess;
    }

    async tearDown() {
        console.log('\n🛑 Shutting down buffering/batching test environment...');

        // Close browser
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                console.warn('Warning closing browser:', e.message);
            }
        }

        // Kill UI process
        if (this.uiProcess) {
            try {
                this.uiProcess.kill();
            } catch (e) {
                console.warn('Warning killing UI process:', e.message);
            }
        }

        // Kill NAR process
        if (this.narProcess) {
            try {
                this.narProcess.kill();
            } catch (e) {
                console.warn('Warning killing NAR process:', e.message);
            }
        }

        console.log('✅ Buffering/batching test environment cleaned up');
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
    const testRunner = new BufferingBatchingTest();
    testRunner.run().catch(console.error);
}

export { BufferingBatchingTest };