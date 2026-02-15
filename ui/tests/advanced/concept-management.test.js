/**
 * @file concept-management.test.js
 * @description Test concept creation/deletion during reasoning
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Concept Creation/Deletion During Reasoning', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8260, wsPort: 8261 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Concept creation during reasoning', async () => {
        // Start with a clean slate
        await testRunner.executeCommand('*reset');
        await setTimeout(1000);
        
        // Create an initial concept
        await testRunner.executeCommand('<{initial_concept} --> property>.');
        await testRunner.waitForResponse('initial_concept');
        
        // Verify concept was created
        const afterCreation = await testRunner.getLogs();
        expect(afterCreation).toContain('initial_concept');
        
        // Create related concepts
        await testRunner.executeCommand('<{derived_concept} --> type>.');
        await testRunner.waitForResponse('derived_concept');
        
        // Check that both concepts are present
        const logsWithBoth = await testRunner.getLogs();
        expect(logsWithBoth).toContain('initial_concept');
        expect(logsWithBoth).toContain('derived_concept');
        
        // Run reasoning to see if it creates more concepts
        await testRunner.executeCommand('*step');
        await setTimeout(1000);
        
        // Check for new concepts potentially created by reasoning
        const afterStep = await testRunner.getLogs();
        expect(afterStep).toContain('step');
    });

    test('Concept evolution through reasoning', async () => {
        // Create a concept that can evolve
        await testRunner.executeCommand('<{evolving_thing} --> [state1]>.');
        await testRunner.waitForResponse('evolving_thing');
        await setTimeout(500);
        
        // Create a rule that could cause evolution
        await testRunner.executeCommand('<{evolving_thing} --> [state2]>. %0.8;0.9%'); // With truth value
        await testRunner.waitForResponse('state2');
        await setTimeout(500);
        
        // Run multiple reasoning steps
        for (let i = 0; i < 3; i++) {
            await testRunner.executeCommand('*step');
            await setTimeout(500);
        }
        
        const finalLogs = await testRunner.getLogs();
        expect(finalLogs).toContain('evolving_thing');
        expect(finalLogs).toContain('state1');
        expect(finalLogs).toContain('state2');
    });

    test('Concept querying and tracking', async () => {
        // Create several concepts with specific properties
        await testRunner.executeCommand('<{tracked_concept_A} --> {category}>. %1.0;0.9%');
        await testRunner.waitForResponse('tracked_concept_A');
        await setTimeout(500);
        
        await testRunner.executeCommand('<{tracked_concept_B} --> {category}>. %0.8;0.85%');
        await testRunner.waitForResponse('tracked_concept_B');
        await setTimeout(500);
        
        // Query for concepts of the category
        await testRunner.executeCommand('<{tracked_concept_A} --> {category}>?');
        await testRunner.waitForResponse('tracked_concept_A');
        
        const queryLogs = await testRunner.getLogs();
        expect(queryLogs).toContain('tracked_concept_A');
        expect(queryLogs).toContain('category');
        
        // Check concept state information
        await testRunner.executeCommand('/concepts');
        await testRunner.waitForResponse('Concept:');
        
        const conceptsLogs = await testRunner.getLogs();
        expect(conceptsLogs).toContain('tracked_concept_A');
        expect(conceptsLogs).toContain('tracked_concept_B');
    });

    test('Concept lifecycle during continuous reasoning', async () => {
        // Start continuous reasoning
        await testRunner.executeCommand('*run');
        await setTimeout(1000);
        
        // Create concepts while reasoning is ongoing
        await testRunner.executeCommand('<{continuous_concept} --> test>.');
        await setTimeout(500);
        
        // Stop reasoning
        await testRunner.executeCommand('*stop');
        await setTimeout(500);
        
        // Verify concepts were processed during reasoning
        const logs = await testRunner.getLogs();
        expect(logs).toContain('continuous_concept');
        expect(logs).toContain('run');
        expect(logs).toContain('stop');
    });

    test('Graph visualization updates with concept changes', async () => {
        // Clear existing concepts
        await testRunner.executeCommand('*reset');
        await setTimeout(1000);
        
        // Create a concept and verify it appears in graph
        await testRunner.executeCommand('<{graph_concept} --> type>.');
        await testRunner.waitForResponse('graph_concept');
        await setTimeout(1000);
        
        // Request graph refresh to see new concept
        await testRunner.page.click('#refresh-graph');
        await setTimeout(1000);
        
        // Check that concept was handled properly
        const afterRefresh = await testRunner.getLogs();
        expect(afterRefresh).toContain('Graph refresh requested');
        expect(afterRefresh).toContain('graph_concept');
        
        // Create another concept that might relate to the first
        await testRunner.executeCommand('<{related_concept} --> type>.');
        await testRunner.waitForResponse('related_concept');
        
        // Check the graph again
        await testRunner.executeCommand('/nodes');
        await testRunner.waitForResponse('nodes');
        
        const nodesLogs = await testRunner.getLogs();
        expect(nodesLogs).toContain('graph_concept');
        expect(nodesLogs).toContain('related_concept');
    });
});