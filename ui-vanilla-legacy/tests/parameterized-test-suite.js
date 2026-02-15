/**
 * @file parameterized-test-suite.js
 * @description Parameterized test suite that runs tests with different configurations
 * 
 * This suite tests the system with various configurations to ensure robustness
 * and follows the requirement to extend, abstract, or parameterize existing tests
 * to avoid redundant code.
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';
import { ExtendedIntegrationTest } from './integration/extended-integration-test.js';
import { BufferingBatchingTest } from './test-buffering-batching.js';

class ParameterizedTestSuite {
    constructor() {
        this.results = {
            extendedTests: [],
            bufferingTests: [],
            configurationTests: [],
            errors: []
        };
        this.testConfigurations = TestConfig.serverConfigs;
    }

    async runExtendedTestWithConfig(configName, config) {
        console.log(`\n🧪 Running Extended Integration Test with configuration: ${configName}`);
        console.log(`   Concept bag: ${config.narOptions.memory.conceptBag.capacity}`);
        console.log(`   Task bag: ${config.narOptions.memory.taskBag.capacity}`);
        console.log(`   Max tasks/cycle: ${config.narOptions.cycle.maxTasksPerCycle}`);

        try {
            // Create an extended test instance with the specific configuration
            const test = new ExtendedIntegrationTest(config);
            const success = await test.runCompleteTest();
            
            this.results.extendedTests.push({
                config: configName,
                success: success,
                configDetails: {
                    conceptBagCapacity: config.narOptions.memory.conceptBag.capacity,
                    taskBagCapacity: config.narOptions.memory.taskBag.capacity,
                    maxTasksPerCycle: config.narOptions.cycle.maxTasksPerCycle
                }
            });
            
            console.log(`✅ Extended test with ${configName} configuration: ${success ? 'PASSED' : 'FAILED'}`);
            return success;
            
        } catch (error) {
            console.error(`❌ Extended test with ${configName} configuration failed:`, error.message);
            this.results.extendedTests.push({
                config: configName,
                success: false,
                error: error.message,
                configDetails: {
                    conceptBagCapacity: config.narOptions.memory.conceptBag.capacity,
                    taskBagCapacity: config.narOptions.memory.taskBag.capacity,
                    maxTasksPerCycle: config.narOptions.cycle.maxTasksPerCycle
                }
            });
            this.results.errors.push(`Extended Test (${configName}): ${error.message}`);
            return false;
        }
    }

    async runBufferingTestWithConfig(configName, config) {
        console.log(`\n📦 Running Buffering/Batching Test with configuration: ${configName}`);
        console.log(`   Concept bag: ${config.narOptions.memory.conceptBag.capacity}`);
        console.log(`   Task bag: ${config.narOptions.memory.taskBag.capacity}`);
        console.log(`   Max tasks/cycle: ${config.narOptions.cycle.maxTasksPerCycle}`);

        try {
            // Create a buffering test instance with the specific configuration
            const test = new BufferingBatchingTest(config);
            const success = await test.run();
            
            this.results.bufferingTests.push({
                config: configName,
                success: success,
                configDetails: {
                    conceptBagCapacity: config.narOptions.memory.conceptBag.capacity,
                    taskBagCapacity: config.narOptions.memory.taskBag.capacity,
                    maxTasksPerCycle: config.narOptions.cycle.maxTasksPerCycle
                }
            });
            
            console.log(`✅ Buffering test with ${configName} configuration: ${success ? 'PASSED' : 'FAILED'}`);
            return success;
            
        } catch (error) {
            console.error(`❌ Buffering test with ${configName} configuration failed:`, error.message);
            this.results.bufferingTests.push({
                config: configName,
                success: false,
                error: error.message,
                configDetails: {
                    conceptBagCapacity: config.narOptions.memory.conceptBag.capacity,
                    taskBagCapacity: config.narOptions.memory.taskBag.capacity,
                    maxTasksPerCycle: config.narOptions.cycle.maxTasksPerCycle
                }
            });
            this.results.errors.push(`Buffering Test (${configName}): ${error.message}`);
            return false;
        }
    }

    async runAllConfigurations() {
        console.log('🚀 Starting Parameterized Test Suite with Multiple Configurations...\n');
        
        let allTestsPassed = true;
        
        // Run tests with each configuration
        for (const [configName, config] of Object.entries(this.testConfigurations)) {
            console.log(`\n🔧=== Testing Configuration: ${configName} ===`);
            
            // Run extended integration test with this configuration
            const extendedResult = await this.runExtendedTestWithConfig(configName, config);
            if (!extendedResult) {
                allTestsPassed = false;
            }
            
            // Run buffering/batching test with this configuration
            // Only run this specifically for the small buffer config since it's designed for that
            if (configName === 'smallBuffer') {
                const bufferingResult = await this.runBufferingTestWithConfig(configName, config);
                if (!bufferingResult) {
                    allTestsPassed = false;
                }
            }
            
            // Add a small delay between configurations to prevent resource conflicts
            await setTimeout(2000);
        }
        
        return allTestsPassed;
    }

    async generateParameterizedReport() {
        console.log('\n📋=== PARAMETERIZED TEST SUITE REPORT ===\n');
        
        console.log('🧪 Extended Integration Tests by Configuration:');
        let extendedAllPassed = true;
        for (const testResult of this.results.extendedTests) {
            const status = testResult.success ? '✅ PASS' : '❌ FAIL';
            console.log(`  ${testResult.config}: ${status}`);
            console.log(`    - Concept bag: ${testResult.configDetails.conceptBagCapacity}`);
            console.log(`    - Task bag: ${testResult.configDetails.taskBagCapacity}`);
            console.log(`    - Max tasks/cycle: ${testResult.configDetails.maxTasksPerCycle}`);
            if (!testResult.success && testResult.error) {
                console.log(`    - Error: ${testResult.error}`);
            }
        }
        
        console.log('\n📦 Buffering/Batching Tests by Configuration:');
        let bufferingAllPassed = true;
        for (const testResult of this.results.bufferingTests) {
            const status = testResult.success ? '✅ PASS' : '❌ FAIL';
            console.log(`  ${testResult.config}: ${status}`);
            console.log(`    - Concept bag: ${testResult.configDetails.conceptBagCapacity}`);
            console.log(`    - Task bag: ${testResult.configDetails.taskBagCapacity}`);
            console.log(`    - Max tasks/cycle: ${testResult.configDetails.maxTasksPerCycle}`);
            if (!testResult.success && testResult.error) {
                console.log(`    - Error: ${testResult.error}`);
            }
        }
        
        const extendedPassedCount = this.results.extendedTests.filter(t => t.success).length;
        const extendedTotalCount = this.results.extendedTests.length;
        
        const bufferingPassedCount = this.results.bufferingTests.filter(t => t.success).length;
        const bufferingTotalCount = this.results.bufferingTests.length;
        
        console.log(`\n📊 Summary:`);
        console.log(`  Extended Tests: ${extendedPassedCount}/${extendedTotalCount} passed`);
        console.log(`  Buffering Tests: ${bufferingPassedCount}/${bufferingTotalCount} passed`);
        
        if (this.results.errors.length > 0) {
            console.log(`\n❌ Total Errors Encountered: ${this.results.errors.length}`);
            this.results.errors.slice(0, 5).forEach(error => {
                console.log(`  • ${error}`);
            });
            if (this.results.errors.length > 5) {
                console.log(`  ... and ${this.results.errors.length - 5} more errors`);
            }
        }
        
        const overallSuccess = extendedPassedCount === extendedTotalCount && 
                              bufferingPassedCount === bufferingTotalCount && 
                              this.results.errors.length === 0;
        
        console.log(`\n🎯 Overall Parameterized Suite Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        
        return overallSuccess;
    }

    async run() {
        let success = false;

        try {
            success = await this.runAllConfigurations();
        } catch (error) {
            console.error('❌ Parameterized test suite failed:', error.message);
            this.results.errors.push(`Suite Error: ${error.message}`);
        } finally {
            const reportSuccess = this.generateParameterizedReport();

            const finalSuccess = success && reportSuccess;
            console.log(`\n🏁 Final Parameterized Suite Outcome: ${finalSuccess ? 'SUCCESS' : 'FAILURE'}`);

            // Exit with appropriate code
            process.exit(finalSuccess ? 0 : 1);
        }
    }
}

// Run the parameterized test suite if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const testSuite = new ParameterizedTestSuite();
    testSuite.run().catch(console.error);
}

export { ParameterizedTestSuite };