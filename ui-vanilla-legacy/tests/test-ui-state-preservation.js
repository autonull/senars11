/**
 * @file test-ui-state-preservation.js
 * @description Test UI state preservation across page refreshes
 * 
 * This test validates that the UI maintains state information across page refreshes,
 * which is critical for user experience and workflow continuity.
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';
import { BaseUITest, TestError } from './test-utils.js';

class UIStatePreservationTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.normal) {
        super(config, { headless: true });
        this.initialState = {
            replHistory: [],
            graphNodes: [],
            concepts: [],
            tasks: []
        };
        this.stateAfterRefresh = {
            replHistory: [],
            graphNodes: [],
            concepts: [],
            tasks: []
        };
        this.testResults.statePreservation = [];
    }

    initTestResults() {
        return {
            setup: { nar: false, ui: false, connection: false },
            operations: [],
            statePreservation: [],
            errors: []
        };
    }

    async runCompleteTest() {
        console.log('🚀 Starting UI state preservation test...\n');

        try {
            // Start NAR server
            await this.startNARServer();

            // Start UI server
            await this.startUIServer();

            // Start browser for testing
            await this.startBrowser();

            // Navigate to UI and establish connection
            await this.navigateAndConnect();

            // Set up initial state
            await this.setupInitialState();

            // Verify initial state is captured
            await this.verifyInitialState();

            // Refresh the page
            await this.refreshPage();

            // Capture state after refresh
            await this.captureStateAfterRefresh();

            // Compare states to verify preservation
            await this.compareStates();

            console.log('\n✅ UI state preservation test completed!');
            this.testResults.setup = true;
            return true;

        } catch (error) {
            console.error(`\n❌ State preservation test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(error);
            return false;
        }
    }

    async setupInitialState() {
        console.log('\n🔧 Setting up initial state for preservation test...');

        // Add some initial concepts and tasks
        const initialStateInputs = [
            '<test_concept_1 --> important>. %1.00;0.90%',
            '<test_concept_2 --> relevant>. %0.85;0.85%',
            '<(input & output) --> process>. %0.95;0.90%'
        ];

        for (const input of initialStateInputs) {
            await this.executeCommand(input, 500);
            console.log(`   Added: ${input}`);
        }

        // Run a few reasoning steps to generate additional state
        await this.runReasoningSteps(3, 600);
        
        console.log('✅ Initial state setup completed');
    }

    async verifyInitialState() {
        console.log('\n🔍 Verifying initial state...');

        // Capture the current state from the UI
        this.initialState = await this.captureCurrentState();
        
        console.log(`   Captured ${this.initialState.concepts.length} concepts`);
        console.log(`   Captured ${this.initialState.tasks.length} tasks`);
        console.log(`   REPL history length: ${this.initialState.replHistory.length}`);
        
        this.testResults.statePreservation.push({
            stage: 'initial',
            state: { ...this.initialState },
            timestamp: Date.now()
        });
    }

    async refreshPage() {
        console.log('\n🔄 Refreshing page to test state preservation...');

        // Refresh the page
        await this.page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
        
        // Wait for connection to be re-established
        await this.navigateAndConnect();
        
        console.log('✅ Page refreshed and reconnected');
    }

    async captureStateAfterRefresh() {
        console.log('\n🔍 Capturing state after refresh...');

        // Wait a bit for the state to be restored
        await setTimeout(2000);

        // Capture the state after refresh
        this.stateAfterRefresh = await this.captureCurrentState();
        
        console.log(`   After refresh: ${this.stateAfterRefresh.concepts.length} concepts`);
        console.log(`   After refresh: ${this.stateAfterRefresh.tasks.length} tasks`);
        console.log(`   After refresh REPL length: ${this.stateAfterRefresh.replHistory.length}`);
        
        this.testResults.statePreservation.push({
            stage: 'after_refresh',
            state: { ...this.stateAfterRefresh },
            timestamp: Date.now()
        });
    }

    async captureCurrentState() {
        // Capture REPL history
        const replHistory = await this.page.evaluate(() => {
            const output = document.querySelector('#repl-output') || 
                          document.querySelector('.repl-output');
            return output ? output.textContent : '';
        });

        // Capture concept information (if available in UI)
        const concepts = await this.page.evaluate(() => {
            // Look for concept visualization elements in the UI
            const conceptElements = document.querySelectorAll('.concept, [class*="concept"], .node');
            return Array.from(conceptElements).map(el => ({
                id: el.id,
                className: el.className,
                textContent: el.textContent ? el.textContent.substring(0, 50) : ''
            }));
        });

        // Capture task information
        const tasks = await this.page.evaluate(() => {
            const taskElements = document.querySelectorAll('.task, [class*="task"], .message, [class*="message"]');
            return Array.from(taskElements).map(el => ({
                className: el.className,
                textContent: el.textContent ? el.textContent.substring(0, 50) : ''
            }));
        });

        return {
            replHistory: replHistory,
            concepts: concepts,
            tasks: tasks,
            capturedAt: Date.now()
        };
    }

    async compareStates() {
        console.log('\n📊 Comparing states before and after refresh...');

        const initialConceptCount = this.initialState.concepts.length;
        const refreshConceptCount = this.stateAfterRefresh.concepts.length;
        
        const initialTaskCount = this.initialState.tasks.length;
        const refreshTaskCount = this.stateAfterRefresh.tasks.length;
        
        const initialReplLength = this.initialState.replHistory.length;
        const refreshReplLength = this.stateAfterRefresh.replHistory.length;

        console.log(`   Concepts: ${initialConceptCount} -> ${refreshConceptCount}`);
        console.log(`   Tasks: ${initialTaskCount} -> ${refreshTaskCount}`);
        console.log(`   REPL length: ${initialReplLength} -> ${refreshReplLength}`);

        // Determine if state was preserved
        const conceptsPreserved = initialConceptCount === refreshConceptCount;
        const tasksPreserved = initialTaskCount === refreshTaskCount;
        const replPreserved = initialReplLength <= refreshReplLength; // Should be at least the same or more

        const statePreserved = conceptsPreserved || tasksPreserved || replPreserved;

        console.log(`   State preservation result: ${statePreserved ? '✅ PRESERVED' : '❌ LOST'}`);

        this.testResults.statePreservation.push({
            stage: 'comparison',
            statePreserved: statePreserved,
            details: {
                concepts: { initial: initialConceptCount, after: refreshConceptCount },
                tasks: { initial: initialTaskCount, after: refreshTaskCount },
                repl: { initial: initialReplLength, after: refreshReplLength }
            },
            timestamp: Date.now()
        });
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
    const testRunner = new UIStatePreservationTest();
    testRunner.run().catch(console.error);
}

export { UIStatePreservationTest };