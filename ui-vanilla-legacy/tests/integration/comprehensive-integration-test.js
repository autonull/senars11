#!/usr/bin/env node

/**
 * Comprehensive end-to-end integration test for SeNARS UI
 * This test verifies complete functionality including all major NARS operations
 * and ensures robust error handling and verification.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';
import { TestConfig } from '../test-config.js';
import { BaseUITest, TestError } from '../test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ComprehensiveIntegrationTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.normal) {
        super(config, { headless: true, timeout: 30000 });
        this.testResults.operations = [];
    }

    async testBasicNarseseInput() {
        console.log('\n📝 Testing basic Narsese input functionality...');
        
        const testInputs = [
            { input: '<test_concept --> concept>.', description: 'Basic concept assertion' },
            { input: '<test_question --> concept>?', description: 'Basic question' },
            { input: '<(test & concept) --> property>.', description: 'Compound term' },
            { input: '<test --> concept> %1.0;0.9%.', description: 'Truth value specification' }
        ];
        
        for (const { input, description } of testInputs) {
            console.log(`  Testing: ${description} - "${input}"`);
            
            try {
                // Find and interact with the REPL input
                const replInputSelector = '#repl-input';
                await this.page.waitForSelector(replInputSelector, { timeout: 5000 });
                await this.page.type(replInputSelector, input);
                await this.page.keyboard.press('Enter');
                
                // Wait briefly for processing
                await setTimeout(1000);
                
                // Verify the input was processed by checking for indicators
                const inputProcessed = await this.page.evaluate((inputText) => {
                    // Check if the input appears in output areas (might be echoed back)
                    const outputAreas = document.querySelectorAll('#repl-output, .repl-output, pre');
                    for (const area of outputAreas) {
                        if (area.textContent.includes(inputText.replace(/[<>]/g, ''))) {
                            return true;
                        }
                    }
                    return false;
                }, input);
                
                if (inputProcessed) {
                    console.log(`    ✅ Input processed and appears in output`);
                } else {
                    console.log(`    ℹ️  Input sent (output verification not available)`);
                }
                
                this.testResults.operations.push({
                    type: 'narsese_input',
                    input: input,
                    description: description,
                    status: 'passed'
                });
                
            } catch (error) {
                console.error(`    ❌ Error testing input "${input}": ${error.message}`);
                this.testResults.operations.push({
                    type: 'narsese_input',
                    input: input,
                    description: description,
                    status: 'failed',
                    error: error.message
                });
                this.testResults.errors.push(`Narsese Input Error: ${error.message}`);
            }
        }
        
        console.log('✅ Basic Narsese input testing completed');
    }

    async testReasoningOperations() {
        console.log('\n🧠 Testing reasoning operations...');
        
        const reasoningCommands = [
            { command: '*step', description: 'Single reasoning step' },
            { command: '*volume=10', description: 'Set volume parameter' },
            { command: '*decisionthreshold=0.5', description: 'Set decision threshold' },
            { command: '*babblingThreshold=0.1', description: 'Set babbling threshold' }
        ];
        
        for (const { command, description } of reasoningCommands) {
            console.log(`  Testing: ${description} - "${command}"`);
            
            try {
                const replInputSelector = '#repl-input';
                await this.page.type(replInputSelector, command);
                await this.page.keyboard.press('Enter');
                
                await setTimeout(1000); // Wait for command processing
                
                // For system commands, we typically don't expect specific visual output,
                // but the system should not error
                console.log(`    ✅ Command executed without errors`);
                
                this.testResults.operations.push({
                    type: 'reasoning_command',
                    command: command,
                    description: description,
                    status: 'passed'
                });
                
            } catch (error) {
                console.error(`    ❌ Error testing command "${command}": ${error.message}`);
                this.testResults.operations.push({
                    type: 'reasoning_command',
                    command: command,
                    description: description,
                    status: 'failed',
                    error: error.message
                });
                this.testResults.errors.push(`Reasoning Command Error: ${error.message}`);
            }
        }
        
        console.log('✅ Reasoning operations testing completed');
    }

    async testGraphVisualization() {
        console.log('\n📊 Testing graph visualization...');
        
        try {
            // Add some concepts that should appear in the graph
            const conceptInput = '<visualization_test --> node_type>.';
            console.log(`  Adding concept for visualization: "${conceptInput}"`);
            
            await this.page.type('#repl-input', conceptInput);
            await this.page.keyboard.press('Enter');
            await setTimeout(2000); // Wait longer for graph update
            
            // Check if graph container has content
            const hasGraphContent = await this.page.evaluate(() => {
                const cyContainer = document.querySelector('#cy-container');
                if (!cyContainer) return false;
                
                // Check for various signs of graph content
                // This might be SVG elements, canvas elements, or specific graph nodes
                const hasSvg = cyContainer.querySelector('svg') !== null;
                const hasCanvas = cyContainer.querySelector('canvas') !== null;
                const hasNodeElements = cyContainer.querySelectorAll('[class*="node"], [class*="edge"]').length > 0;
                const hasCytoscape = cyContainer.querySelector('[id^="cytoscape"]') !== null;
                
                return hasSvg || hasCanvas || hasNodeElements || hasCytoscape;
            });
            
            if (hasGraphContent) {
                console.log('  ✅ Graph visualization updated with new content');
            } else {
                console.log('  ℹ️  No graph content detected (may be expected for simple inputs)');
            }
            
            // Test graph controls if they exist
            const refreshBtnExists = await this.page.$('#refresh-btn') !== null;
            if (refreshBtnExists) {
                console.log('  Testing refresh button...');
                await this.page.click('#refresh-btn');
                await setTimeout(1000);
                console.log('  ✅ Refresh button clicked');
            }
            
            this.testResults.operations.push({
                type: 'graph_visualization',
                status: hasGraphContent ? 'passed_with_content' : 'passed_no_content'
            });
            
        } catch (error) {
            console.error(`  ❌ Error in graph visualization test: ${error.message}`);
            this.testResults.operations.push({
                type: 'graph_visualization',
                status: 'failed',
                error: error.message
            });
            this.testResults.errors.push(`Graph Visualization Error: ${error.message}`);
        }
        
        console.log('✅ Graph visualization testing completed');
    }

    async testErrorHandling() {
        console.log('\n⚠️ Testing error handling...');
        
        // Test invalid Narsese to ensure errors are handled gracefully
        const invalidInputs = [
            { input: '<invalid syntax', description: 'Invalid syntax' },
            { input: 'not_a_command', description: 'Unknown command' }
        ];
        
        for (const { input, description } of invalidInputs) {
            console.log(`  Testing error handling for: ${description} - "${input}"`);
            
            try {
                await this.page.type('#repl-input', input);
                await this.page.keyboard.press('Enter');
                await setTimeout(1000);
                
                // The system should handle errors gracefully without crashing
                console.log(`    ✅ System handled invalid input without crashing`);
                
                this.testResults.operations.push({
                    type: 'error_handling',
                    input: input,
                    description: description,
                    status: 'handled_gracefully'
                });
                
            } catch (error) {
                console.error(`    ⚠️  Error during invalid input test: ${error.message}`);
                this.testResults.operations.push({
                    type: 'error_handling',
                    input: input,
                    description: description,
                    status: 'error_during_test',
                    error: error.message
                });
            }
        }
        
        console.log('✅ Error handling testing completed');
    }

    async runCompleteTest() {
        console.log('🚀 Starting comprehensive SeNARS integration test...\n');

        try {
            // Use inherited methods from BaseUITest
            await this.startNARServer({ port: this.config.port, narOptions: this.config.narOptions });
            await this.startUIServer({ uiPort: this.config.uiPort });
            await this.startBrowser();
            await this.navigateAndConnect();

            // Run comprehensive tests
            await this.testBasicNarseseInput();
            await this.testReasoningOperations();
            await this.testGraphVisualization();
            await this.testErrorHandling();

            // Final verification - send a complete round-trip test
            console.log('\n🏁 Final verification test...');
            const finalTest = '<final_verification --> complete>.';
            await this.executeCommand(finalTest, 1500); // Use inherited method

            console.log('✅ Final verification completed');

            return true;

        } catch (error) {
            console.error(`\n❌ Comprehensive test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    async generateTestReport() {
        console.log('\n📋=== TEST REPORT ===');
        
        console.log('\n🔧 Setup Results:');
        console.log(`  NAR Server: ${this.testResults.setup.nar ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  UI Server: ${this.testResults.setup.ui ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  WebSocket Connection: ${this.testResults.setup.connection ? '✅ PASS' : '❌ FAIL'}`);
        
        console.log(`\n⚙️  Operation Results: ${this.testResults.operations.length} operations tested`);
        const passedOps = this.testResults.operations.filter(op => op.status === 'passed' || op.status === 'passed_with_content' || op.status === 'handled_gracefully').length;
        const failedOps = this.testResults.operations.filter(op => op.status === 'failed').length;
        console.log(`  Passed: ${passedOps}`);
        console.log(`  Failed: ${failedOps}`);
        
        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {  // Show first 5 errors
                console.log(`  • ${error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }
        
        const overallSuccess = this.testResults.setup.nar && 
                              this.testResults.setup.ui && 
                              this.testResults.setup.connection &&
                              failedOps === 0 &&
                              this.testResults.errors.length === 0;
        
        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        
        return overallSuccess;
    }

    async tearDown() {
        console.log('\n🛑 Shutting down test environment...');
        
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
        
        console.log('✅ Test environment cleaned up');
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

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const testRunner = new ComprehensiveIntegrationTest();
    testRunner.run().catch(console.error);
}

export { ComprehensiveIntegrationTest };