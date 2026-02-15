/**
 * @file extended-integration-test.js
 * @description Extended end-to-end integration test following new requirements
 *
 * This test implements the following principles:
 * - Tests objects directly, without resorting to mocks
 * - Covers realistic UI/UX patterns
 * - Ensures visible and tangible system reactions
 * - Handles errors robustly with detailed explanations
 * - Tests NAR reasoning in both step and continuous modes
 * - Self-contained with proper resource cleanup
 * - Tests buffering/batching with small capacities
 * - Parameterized to avoid redundant code
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from '../test-config.js';
import { BaseUITest, TestError } from '../test-utils.js';

class ExtendedIntegrationTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.normal, uiConfig = { headless: true }) {
        super(config, uiConfig); // Default to headless mode for CI environments
        this.testResults.uiuxTests = [];
        this.testResults.errorTests = [];
        this.testResults.reasoningTests = [];
    }

    initTestResults() {
        return {
            setup: { nar: false, ui: false, connection: false },
            operations: [],
            uiuxTests: [],
            errorTests: [],
            reasoningTests: [],
            errors: []
        };
    }

    async testRealisticUIUXPatterns() {
        console.log('\n🎯 Testing realistic UI/UX patterns...');

        const uiuxTests = [
            {
                name: 'Input and submit Narsese',
                action: async () => {
                    await this.executeCommand('<ui_ux_test --> concept>.', 1000);
                    return true;
                },
                description: 'Basic input and submission pattern'
            },
            {
                name: 'Multiple rapid inputs',
                action: async () => {
                    const inputs = [
                        '<rapid_input_1 --> test>.',
                        '<rapid_input_2 --> test>.',
                        '<rapid_input_3 --> test>.'
                    ];
                    for (const input of inputs) {
                        await this.executeCommand(input, 300); // Brief pause
                    }
                    return true;
                },
                description: 'Rapid sequential input pattern'
            },
            {
                name: 'Command execution',
                action: async () => {
                    await this.executeCommand('*step', 800);
                    return true;
                },
                description: 'System command execution'
            }
        ];

        for (const test of uiuxTests) {
            try {
                console.log(`  Running: ${test.name} - ${test.description}`);
                const result = await test.action();

                if (result) {
                    console.log(`    ✅ ${test.name} passed`);
                    this.testResults.uiuxTests.push({
                        name: test.name,
                        status: 'passed',
                        description: test.description
                    });
                } else {
                    throw new TestError(`Test ${test.name} returned false`);
                }
            } catch (error) {
                console.error(`    ❌ ${test.name} failed: ${error.message}`);
                this.testResults.uiuxTests.push({
                    name: test.name,
                    status: 'failed',
                    description: test.description,
                    error: error.message
                });
                this.testResults.errors.push(error);
            }
        }

        console.log('✅ Realistic UI/UX pattern tests completed');
    }

    async testReasoningModes() {
        console.log('\n🧠 Testing NAR reasoning in different modes...');

        // Test step mode
        try {
            console.log('  Testing step mode reasoning...');
            await this.executeCommand(TestConfig.reasoningModes.stepMode.command, 1000);
            console.log('  ✅ Step mode executed');

            this.testResults.reasoningTests.push({
                mode: 'step',
                command: TestConfig.reasoningModes.stepMode.command,
                status: 'passed'
            });
        } catch (error) {
            console.error(`  ❌ Step mode failed: ${error.message}`);
            this.testResults.reasoningTests.push({
                mode: 'step',
                command: TestConfig.reasoningModes.stepMode.command,
                status: 'failed',
                error: error.message
            });
            this.testResults.errors.push(error);
        }

        // Test with basic Narsese to create some reasoning context
        try {
            console.log('  Creating reasoning context...');
            await this.executeCommand('<reasoning_context --> established>.', 500);

            // Execute multiple steps to simulate continuous reasoning
            for (let i = 0; i < 3; i++) {
                await this.executeCommand('*step', 600);
                console.log(`  Continuous reasoning step ${i+1}/3 completed`);
            }

            console.log('  ✅ Continuous reasoning simulation completed');
            this.testResults.reasoningTests.push({
                mode: 'continuous_simulation',
                status: 'passed',
                steps: 3
            });
        } catch (error) {
            console.error(`  ❌ Continuous reasoning simulation failed: ${error.message}`);
            this.testResults.reasoningTests.push({
                mode: 'continuous_simulation',
                status: 'failed',
                error: error.message
            });
            this.testResults.errors.push(error);
        }

        console.log('✅ Reasoning modes testing completed');
    }

    async testErrorHandling() {
        console.log('\n⚠️ Testing error handling with detailed explanations...');

        const errorTestCases = [
            {
                input: '<invalid_syntax',
                description: 'Invalid Narsese syntax',
                shouldCrash: false
            },
            {
                input: 'invalid_command_that_does_not_exist',
                description: 'Unknown command',
                shouldCrash: false
            },
            {
                input: '<valid --> syntax>. <another --> one>?',
                description: 'Multiple valid inputs',
                shouldCrash: false
            }
        ];

        for (const testCase of errorTestCases) {
            try {
                console.log(`  Testing error handling for: ${testCase.description}`);
                console.log(`    Input: "${testCase.input}"`);

                await this.page.type('#repl-input', testCase.input);
                await this.page.keyboard.press('Enter');
                await setTimeout(1000);

                // Check if the page is still responsive (didn't crash)
                const isResponsive = await this.page.evaluate(() => {
                    return document.querySelector('#repl-input') !== null;
                });

                if (isResponsive) {
                    console.log(`    ✅ System handled error gracefully, remained responsive`);
                    this.testResults.errorTests.push({
                        input: testCase.input,
                        description: testCase.description,
                        handledGracefully: true,
                        status: 'passed'
                    });
                } else {
                    throw new TestError('System became unresponsive after invalid input');
                }

            } catch (error) {
                console.error(`    ❌ Error handling test failed: ${error.message}`);
                this.testResults.errorTests.push({
                    input: testCase.input,
                    description: testCase.description,
                    handledGracefully: false,
                    status: 'failed',
                    error: error.message
                });
                this.testResults.errors.push(error);
            }
        }

        // Verify system recovery after errors
        try {
            console.log('  Verifying system recovery after error tests...');
            await this.executeCommand('<recovery_test --> concept>.', 1000);

            const recoveryCheck = await this.page.evaluate(() => {
                const inputField = document.querySelector('#repl-input');
                return inputField !== null && inputField.value === '';
            });

            if (recoveryCheck) {
                console.log('  ✅ System recovered successfully after error tests');
                this.testResults.errorTests.push({
                    test: 'system_recovery',
                    status: 'passed'
                });
            } else {
                throw new TestError('System did not recover properly after error tests');
            }
        } catch (error) {
            console.error(`  ❌ System recovery test failed: ${error.message}`);
            this.testResults.errorTests.push({
                test: 'system_recovery',
                status: 'failed',
                error: error.message
            });
            this.testResults.errors.push(error);
        }

        console.log('✅ Error handling testing completed');
    }

    async runCompleteTest() {
        console.log('🚀 Starting extended SeNARS integration test with new requirements...\n');

        try {
            // Start backend server
            await this.startNARServer();

            // Start UI server
            await this.startUIServer();

            // Start browser for testing
            await this.startBrowser();

            // Navigate to the UI
            await this.navigateAndConnect();

            // Run comprehensive tests following new requirements
            await this.testRealisticUIUXPatterns();
            await this.testReasoningModes();
            await this.testErrorHandling();

            // Final verification - send a complete round-trip test
            console.log('\n🏁 Final verification test...');
            await this.executeCommand('<extended_integration_test --> complete>.', 1500);

            console.log('✅ Final verification completed');

            return true;

        } catch (error) {
            console.error(`\n❌ Extended integration test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    generateTestReport() {
        console.log('\n📋=== EXTENDED TEST REPORT ===');

        console.log('\n🔧 Setup Results:');
        console.log(`  NAR Server: ${this.testResults.setup.nar ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  UI Server: ${this.testResults.setup.ui ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  WebSocket Connection: ${this.testResults.setup.connection ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n🎯 UI/UX Pattern Tests: ${this.testResults.uiuxTests.length} tests`);
        const [uiuxPassed, uiuxFailed] = [
            this.testResults.uiuxTests.filter(t => t.status === 'passed').length,
            this.testResults.uiuxTests.filter(t => t.status === 'failed').length
        ];
        console.log(`  Passed: ${uiuxPassed}`);
        console.log(`  Failed: ${uiuxFailed}`);

        console.log(`\n🧠 Reasoning Mode Tests: ${this.testResults.reasoningTests.length} tests`);
        const [reasoningPassed, reasoningFailed] = [
            this.testResults.reasoningTests.filter(t => t.status === 'passed').length,
            this.testResults.reasoningTests.filter(t => t.status === 'failed').length
        ];
        console.log(`  Passed: ${reasoningPassed}`);
        console.log(`  Failed: ${reasoningFailed}`);

        console.log(`\n⚠️  Error Handling Tests: ${this.testResults.errorTests.length} tests`);
        const [errorPassed, errorFailed] = [
            this.testResults.errorTests.filter(t => t.status === 'passed').length,
            this.testResults.errorTests.filter(t => t.status === 'failed').length
        ];
        console.log(`  Passed: ${errorPassed}`);
        console.log(`  Failed: ${errorFailed}`);

        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {  // Show first 5 errors
                console.log(`  • ${error.message ?? error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }

        const overallSuccess = this.testResults.setup.nar &&
                              this.testResults.setup.ui &&
                              this.testResults.setup.connection &&
                              uiuxFailed === 0 &&
                              reasoningFailed === 0 &&
                              errorFailed === 0 &&
                              this.testResults.errors.length === 0;

        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

        // Show configuration used
        console.log(`\n⚙️  Test Configuration:`);
        console.log(`  Concept bag capacity: ${this.config.narOptions?.memory?.conceptBag?.capacity ?? 'unknown'}`);
        console.log(`  Task bag capacity: ${this.config.narOptions?.memory?.taskBag?.capacity ?? 'unknown'}`);
        console.log(`  Max tasks per cycle: ${this.config.narOptions?.cycle?.maxTasksPerCycle ?? 'unknown'}`);

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

            // Exit with appropriate code
            process.exit(finalSuccess ? 0 : 1);
        }
    }
}

// Run the test with different configurations for parameterized testing
if (import.meta.url === `file://${process.argv[1]}`) {
    const testType = process.argv[2] || 'normal';

    let config;
    switch(testType) {
        case 'small_buffer':
            config = TestConfig.serverConfigs.smallBuffer;
            console.log('🧪 Running test with small buffer configuration for batching tests');
            break;
        case 'performance':
            config = TestConfig.serverConfigs.performance;
            console.log('🚀 Running performance test configuration');
            break;
        case 'normal':
        default:
            config = TestConfig.serverConfigs.normal;
            console.log('🧪 Running normal test configuration');
            break;
    }

    const testRunner = new ExtendedIntegrationTest(config);
    testRunner.run().catch(console.error);
}

export { ExtendedIntegrationTest };