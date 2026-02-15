/**
 * @file graph-controls.test.js
 * @description Test graph controls and UI interactions (Puppeteer implementation)
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Graph Controls and UI Interactions', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8270, wsPort: 8271 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Graph refresh functionality', async () => {
        // Test the refresh graph button
        const initialCount = await testRunner.page.$eval('#message-count', el => parseInt(el.textContent));
        
        await testRunner.page.click('#refresh-graph');
        await setTimeout(1000);
        
        // Check for refresh confirmation in logs
        const logsAfterRefresh = await testRunner.getLogs();
        expect(logsAfterRefresh).toContain('Graph refresh requested');
        
        // Message count should have increased
        const finalCount = await testRunner.page.$eval('#message-count', el => parseInt(el.textContent));
        expect(finalCount).toBeGreaterThan(initialCount);
    });

    test('Live toggle functionality', async () => {
        // Check initial state (should be "Pause Live")
        const initialState = await testRunner.page.$eval('#toggle-live', el => el.textContent);
        expect(initialState).toBe('Pause Live');
        
        // Toggle to pause
        await testRunner.page.click('#toggle-live');
        await setTimeout(500);
        
        // Should now show "Resume Live"
        const pausedState = await testRunner.page.$eval('#toggle-live', el => el.textContent);
        expect(pausedState).toBe('Resume Live');
        
        // Toggle back to live
        await testRunner.page.click('#toggle-live');
        await setTimeout(500);
        
        // Should show "Pause Live" again
        const resumedState = await testRunner.page.$eval('#toggle-live', el => el.textContent);
        expect(resumedState).toBe('Pause Live');
    });

    test('Graph details panel interaction', async () => {
        // Create a concept to show in the graph
        await testRunner.executeCommand('<{detail_test} --> concept>.');
        await testRunner.waitForResponse('detail_test');
        await setTimeout(1000);
        
        // The details panel initially shows instructions
        const initialDetails = await testRunner.page.$eval('#graph-details', el => el.textContent);
        expect(initialDetails).toContain('Click on nodes or edges');
        
        // After creating concepts, the graph should update
        // Though we can't simulate real clicks on Cytoscape nodes with Puppeteer,
        // we can verify the details panel structure exists
        const detailsElement = await testRunner.page.$('#graph-details');
        expect(detailsElement).toBeTruthy();
    });

    test('Demo functionality execution', async () => {
        // Select and run the inheritance demo
        await testRunner.page.select('#demo-select', 'inheritance');
        await testRunner.page.click('#run-demo');
        
        // Check that demo started
        await testRunner.waitForResponse('Running inheritance demo');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('Running inheritance demo');
        expect(logs).toContain('cat'); // First command in inheritance demo
        expect(logs).toContain('animal'); // Second command in inheritance demo
    });

    test('Command input and submission', async () => {
        // Test command input functionality
        const command = '<{input_test} --> value>.';
        
        // Type command in the input field
        await testRunner.page.type('#command-input', command);
        
        // Get the current value to verify
        const inputValue = await testRunner.page.$eval('#command-input', el => el.value);
        expect(inputValue).toBe(command);
        
        // Submit the command
        await testRunner.page.click('#send-button');
        await testRunner.waitForResponse('input_test');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain(`> ${command}`);
        expect(logs).toContain('input_test');
    });

    test('Quick command dropdown functionality', async () => {
        // Test that quick commands dropdown works
        await testRunner.page.select('#quick-commands', '<bird --> flyer> . %1.0;0.9%');
        
        const selectedValue = await testRunner.page.$eval('#quick-commands', el => el.value);
        expect(selectedValue).toContain('bird');
        
        // Execute the selected quick command
        await testRunner.page.click('#exec-quick');
        await testRunner.waitForResponse('flyer');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('bird');
        expect(logs).toContain('flyer');
    });

    test('UI controls visibility and accessibility', async () => {
        // Test that all major UI controls are accessible
        const controls = [
            '#refresh-graph',
            '#toggle-live', 
            '#clear-logs',
            '#show-history',
            '#command-input',
            '#send-button',
            '#quick-commands',
            '#exec-quick',
            '#demo-select',
            '#run-demo'
        ];
        
        for (const control of controls) {
            const element = await testRunner.page.$(control);
            expect(element).toBeTruthy(`Control ${control} should exist`);
        }
        
        // Check that the graph container exists
        const graphContainer = await testRunner.page.$('#graph-container');
        expect(graphContainer).toBeTruthy();
    });

    test('History and clear functionality integration', async () => {
        // Execute commands to build history
        await testRunner.executeCommand('<{history1} --> test>.');
        await setTimeout(500);
        await testRunner.executeCommand('<{history2} --> test>.');
        await setTimeout(500);
        
        // Show history
        await testRunner.page.click('#show-history');
        await testRunner.waitForResponse('Command History');
        
        const historyLogs = await testRunner.getLogs();
        expect(historyLogs).toContain('Command History');
        
        // Clear logs
        await testRunner.executeCommand('/clear'); // Using debug command as implemented
        await testRunner.waitForResponse('Cleared logs');
        
        const clearedLogs = await testRunner.getLogs();
        expect(clearedLogs).toContain('Cleared logs');
    });
});