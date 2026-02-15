/**
 * @file real-time-updates.test.js
 * @description Test real-time updates during continuous reasoning
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Real-time Updates During Continuous Reasoning', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8230, wsPort: 8231 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Real-time log updates during continuous reasoning', async () => {
        // Get initial message count
        const initialCount = await testRunner.page.$eval('#message-count', el => parseInt(el.textContent));
        
        // Start continuous reasoning
        await testRunner.executeCommand('*run');
        await setTimeout(3000); // Run for 3 seconds
        
        // Stop reasoning
        await testRunner.executeCommand('*stop');
        
        // Message count should have increased significantly
        const finalCount = await testRunner.page.$eval('#message-count', el => parseInt(el.textContent));
        
        expect(finalCount).toBeGreaterThan(initialCount);
        expect(finalCount - initialCount).toBeGreaterThan(5); // Should have multiple messages
        
        // Check that logs were updated with reasoning output
        const logs = await testRunner.getLogs();
        expect(logs).toContain('run'); // Command was processed
        expect(logs).toContain('stop'); // Stop command was processed
    });

    test('Real-time graph updates during reasoning', async () => {
        // Clear any existing concepts
        await testRunner.executeCommand('*reset');
        await setTimeout(1000);
        
        // Start continuous reasoning - this should generate concepts
        await testRunner.executeCommand('*run');
        await setTimeout(2000);
        
        // Stop reasoning
        await testRunner.executeCommand('*stop');
        
        // Test that graph was updated during reasoning
        await testRunner.executeCommand('/nodes');
        await testRunner.waitForResponse('nodes');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('Graph has'); // Should report number of nodes
    });

    test('Continuous reasoning produces varied outputs', async () => {
        // Start reasoning and monitor for diverse outputs
        await testRunner.executeCommand('*run');
        await setTimeout(2000);
        
        // Capture logs during reasoning
        const initialLogs = await testRunner.getLogs();
        
        await setTimeout(2000); // Let it run more
        
        const updatedLogs = await testRunner.getLogs();
        
        // Stop reasoning
        await testRunner.executeCommand('*stop');
        
        // The logs should have grown and contain different types of messages
        expect(updatedLogs.length).toBeGreaterThan(initialLogs.length);
        
        const hasConcepts = updatedLogs.includes('concept');
        const hasTasks = updatedLogs.includes('task');
        const hasInferences = updatedLogs.includes('reasoning');
        
        // Should have various types of reasoning outputs
        expect(hasConcepts || hasTasks || hasInferences).toBe(true);
    });
});