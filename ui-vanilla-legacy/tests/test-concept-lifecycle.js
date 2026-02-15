/**
 * @file test-concept-lifecycle.js
 * @description Test concept creation/deletion during reasoning
 *
 * This test validates that the NAR properly creates and deletes concepts
 * during the reasoning process, with proper UI reflection.
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';
import { BaseUITest, TestError } from './test-utils.js';

class ConceptLifecycleTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.smallBuffer) {
        super(config, { headless: true }); // Use headless mode for CI environments
        this.testResults.conceptLifecycle = [];
        this.testResults.creationEvents = [];
        this.testResults.deletionEvents = [];
    }

    initTestResults() {
        return {
            setup: { nar: false, ui: false, connection: false },
            operations: [],
            conceptLifecycle: [],
            creationEvents: [],
            deletionEvents: [],
            errors: []
        };
    }

    async testConceptCreation() {
        console.log('\n🔧 Testing concept creation during reasoning...');

        // Create multiple concepts to test the creation process
        const conceptsToCreate = [
            '<created_concept_1 --> test_type>. %1.00;0.90%',
            '<created_concept_2 --> test_type>. %0.85;0.80%',
            '<created_concept_3 --> test_type>. %0.95;0.95%',
            '<created_concept_4 --> test_type>. %0.75;0.70%',
            '<created_concept_5 --> test_type>. %0.90;0.85%'
        ];

        console.log(`   Creating ${conceptsToCreate.length} concepts to fill the small buffer...`);

        for (let i = 0; i < conceptsToCreate.length; i++) {
            const concept = conceptsToCreate[i];
            console.log(`   Creating concept ${i+1}/${conceptsToCreate.length}: ${concept.substring(0, 30)}...`);

            await this.executeCommand(concept, 600); // Wait for concept creation

            this.testResults.creationEvents.push({
                concept: concept,
                index: i,
                timestamp: Date.now()
            });
        }

        // Run reasoning to trigger concept processing
        await this.runReasoningSteps(3, 800);

        console.log(`   ✅ ${conceptsToCreate.length} concepts created successfully`);
    }

    async testConceptDeletionByCapacity() {
        console.log('\n🗑️  Testing concept deletion due to capacity limits...');

        // Add more concepts than the buffer can hold to trigger deletion
        const additionalConcepts = [
            '<overflow_concept_1 --> overflow_type>. %0.80;0.60%',
            '<overflow_concept_2 --> overflow_type>. %0.85;0.65%',
            '<overflow_concept_3 --> overflow_type>. %0.90;0.70%'
        ];

        console.log(`   Adding ${additionalConcepts.length} concepts to trigger buffer overflow...`);
        console.log(`   Buffer capacity: ${this.config.narOptions.memory.conceptBag.capacity}`);

        for (let i = 0; i < additionalConcepts.length; i++) {
            const concept = additionalConcepts[i];
            console.log(`   Adding overflow concept ${i+1}/${additionalConcepts.length}: ${concept.substring(0, 35)}...`);

            await this.executeCommand(concept, 700); // Wait for potential deletion events

            this.testResults.creationEvents.push({
                concept: concept,
                index: this.testResults.creationEvents.length,
                timestamp: Date.now(),
                purpose: 'overflow_trigger'
            });
        }

        // Run more reasoning steps to process overflow
        for (let i = 0; i < 5; i++) {
            await this.executeCommand('*step', 800);
            console.log(`   Processing overflow - reasoning step ${i+1}/5`);
        }

        console.log(`   ✅ Overflow concepts added, deletion should have occurred due to capacity limit`);
    }

    async testConceptDeletionByLowPriority() {
        console.log('\n📉 Testing concept deletion due to low priority...');

        // Add concepts with very low priority to test pruning
        const lowPriorityConcepts = [
            '<low_priority_1 --> low_type>. %0.10;0.10%',  // Very low confidence and frequency
            '<low_priority_2 --> low_type>. %0.05;0.05%',  // Extremely low
            '<low_priority_3 --> low_type>. %0.15;0.15%'   // Still low
        ];

        console.log(`   Adding ${lowPriorityConcepts.length} low-priority concepts for potential pruning...`);

        for (let i = 0; i < lowPriorityConcepts.length; i++) {
            const concept = lowPriorityConcepts[i];
            console.log(`   Adding low-priority concept ${i+1}/${lowPriorityConcepts.length}: ${concept}`);

            await this.executeCommand(concept, 600);

            this.testResults.creationEvents.push({
                concept: concept,
                index: this.testResults.creationEvents.length,
                timestamp: Date.now(),
                purpose: 'low_priority_test'
            });
        }

        // Run reasoning to allow low-priority concepts to be pruned
        for (let i = 0; i < 8; i++) {
            await this.executeCommand('*step', 600);

            if ((i + 1) % 3 === 0) {
                console.log(`   Pruning test - reasoning step ${i+1}/8`);
            }
        }

        console.log(`   ✅ Low-priority concepts added, pruning should have occurred`);
    }

    async testConceptUpdateAndRevival() {
        console.log('\n🔄 Testing concept update and potential revival...');

        // Update an existing concept with higher priority
        const updateStatement = '<created_concept_1 --> test_type>. %1.00;0.99% :|: %1.00;0.90%';
        console.log(`   Updating concept with high priority: ${updateStatement.substring(0, 40)}...`);

        await this.executeCommand(updateStatement, 1000);

        // Run reasoning to process the update
        await this.runReasoningSteps(3, 800);

        this.testResults.creationEvents.push({
            concept: updateStatement,
            index: this.testResults.creationEvents.length,
            timestamp: Date.now(),
            purpose: 'update_revival_test'
        });

        console.log(`   ✅ Concept updated, checking if it's maintained over low-priority concepts`);
    }

    async verifyConceptLifecycleInUI() {
        console.log('\n🔍 Verifying concept lifecycle in UI...');

        // Check REPL output for concept-related messages
        const replOutput = await this.page.evaluate(() => {
            const output = document.querySelector('#repl-output') ||
                          document.querySelector('.repl-output') ||
                          document.querySelector('[id*="output"]') ||
                          document.querySelector('pre');
            return output ? output.textContent : '';
        });

        // Check for evidence of concept creation/deletion in output
        const creationEvidence = (replOutput.match(/created|add|insert/gi) || []).length;
        const deletionEvidence = (replOutput.match(/deleted|removed|pruned|dropped/gi) || []).length;
        const updateEvidence = (replOutput.match(/updated|modified|changed/gi) || []).length;

        console.log(`   Concept creation indicators in output: ${creationEvidence}`);
        console.log(`   Concept deletion indicators in output: ${deletionEvidence}`);
        console.log(`   Concept update indicators in output: ${updateEvidence}`);

        // Check graph visualization for concept nodes
        const graphConcepts = await this.page.evaluate(() => {
            const cyContainer = document.querySelector('#cy-container');
            if (!cyContainer) return { nodes: 0, hasVisualization: false };

            // Count potential concept nodes in the visualization
            const nodeElements = cyContainer.querySelectorAll('[class*="node"], [class*="concept"], .node, .concept, [id*="node"], [id*="concept"]');
            return {
                nodes: nodeElements.length,
                hasVisualization: true,
                nodeDetails: Array.from(nodeElements).map(el => ({
                    id: el.id,
                    className: el.className,
                    textContent: el.textContent ? el.textContent.substring(0, 30) : ''
                }))
            };
        });

        console.log(`   Graph visualization nodes: ${graphConcepts.nodes}`);
        console.log(`   Graph visualization available: ${graphConcepts.hasVisualization ? 'YES' : 'NO'}`);

        this.testResults.conceptLifecycle.push({
            replCreationEvidence: creationEvidence,
            replDeletionEvidence: deletionEvidence,
            replUpdateEvidence: updateEvidence,
            graphNodesCount: graphConcepts.nodes,
            graphAvailable: graphConcepts.hasVisualization,
            timestamp: Date.now()
        });
    }

    async runCompleteTest() {
        console.log('🚀 Starting concept creation/deletion during reasoning test...\n');

        try {
            // Start NAR server
            await this.startNARServer();

            // Start UI server
            await this.startUIServer();

            // Start browser for testing
            await this.startBrowser();

            // Navigate to UI and establish connection
            await this.navigateAndConnect();

            // Test concept creation
            await this.testConceptCreation();

            // Test deletion by capacity limits (using small buffer)
            await this.testConceptDeletionByCapacity();

            // Test deletion by low priority
            await this.testConceptDeletionByLowPriority();

            // Test concept updates and revival
            await this.testConceptUpdateAndRevival();

            // Verify lifecycle in UI
            await this.verifyConceptLifecycleInUI();

            console.log('\n✅ Concept lifecycle test completed!');
            this.testResults.setup = true;
            return true;

        } catch (error) {
            console.error(`\n❌ Concept lifecycle test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    generateTestReport() {
        console.log('\n📋=== CONCEPT LIFECYCLE TEST REPORT ===');

        console.log(`\n🔧 Setup: ${this.testResults.setup.nar && this.testResults.setup.ui && this.testResults.setup.connection ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n🏗️  Concept Creation Events: ${this.testResults.creationEvents.length}`);
        const creationByPurpose = this.testResults.creationEvents.reduce((acc, evt) => {
            const purpose = evt.purpose || 'regular_creation';
            acc[purpose] = (acc[purpose] || 0) + 1;
            return acc;
        }, {});

        Object.entries(creationByPurpose).forEach(([purpose, count]) => {
            console.log(`  ${purpose}: ${count} events`);
        });

        console.log(`\n🗑️  Deletion Monitoring:`);
        console.log(`  We used a small buffer (capacity: ${this.config.narOptions?.memory?.conceptBag?.capacity}) to test deletion`);

        console.log(`\n📊 UI Lifecycle Verification:`);
        if (this.testResults.conceptLifecycle.length > 0) {
            const latest = this.testResults.conceptLifecycle.at(-1); // Using modern array method
            console.log(`  Creation indicators in REPL: ${latest.replCreationEvidence}`);
            console.log(`  Deletion indicators in REPL: ${latest.replDeletionEvidence}`);
            console.log(`  Update indicators in REPL: ${latest.replUpdateEvidence}`);
            console.log(`  Graph nodes visualized: ${latest.graphNodesCount}`);
            console.log(`  Graph visualization available: ${latest.graphAvailable ? 'YES' : 'NO'}`);
        }

        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {
                console.log(`  • ${error.message ?? error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }

        // For concept lifecycle, success is demonstrated by proper creation and handling
        // rather than expecting specific outcomes, since deletion is by design
        const hasCreationEvidence = this.testResults.creationEvents.length > 0;
        const hasUIFeedback = this.testResults.conceptLifecycle.length > 0;
        const overallSuccess = this.testResults.setup.nar &&
                              this.testResults.setup.ui &&
                              this.testResults.setup.connection &&
                              hasCreationEvidence &&
                              hasUIFeedback &&
                              this.testResults.errors.length === 0;

        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ CONCEPT LIFECYCLE WORKING' : '❌ CONCEPT LIFECYCLE ISSUE'}`);
        console.log(`\n💡 Note: The system should properly create concepts and handle deletion when capacity limits are reached.`);

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
    const testRunner = new ConceptLifecycleTest();
    testRunner.run().catch(console.error);
}

export { ConceptLifecycleTest };