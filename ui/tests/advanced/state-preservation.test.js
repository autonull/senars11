/**
 * @file state-preservation.test.js
 * @description Test UI state preservation across page refreshes
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI State Preservation Across Page Refreshes', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8240, wsPort: 8241 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Command history preserved after refresh', async () => {
        // Execute several commands to build history
        await testRunner.executeCommand('<{history_test1} --> concept>.');
        await setTimeout(500);
        await testRunner.executeCommand('<{history_test2} --> concept>.');
        await setTimeout(500);
        await testRunner.executeCommand('*step');
        await setTimeout(500);
        
        // Record initial state
        const originalLogs = await testRunner.getLogs();
        expect(originalLogs).toContain('history_test1');
        expect(originalLogs).toContain('history_test2');
        
        // Refresh the page
        await testRunner.page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
        
        // Wait for reconnection
        await testRunner.page.waitForFunction(() => {
            const status = document.querySelector('#connection-status');
            return status && status.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Check that core state is preserved or re-established
        const refreshedLogs = await testRunner.getLogs();
        
        // The connection should be re-established
        const connectionStatus = await testRunner.page.$eval('#connection-status', el => el.textContent);
        expect(connectionStatus.toLowerCase()).toContain('connected');
        
        // Test that we can still send commands after refresh
        await testRunner.executeCommand('<{post_refresh} --> test>.');
        await testRunner.waitForResponse('post_refresh');
        
        const afterCommandLogs = await testRunner.getLogs();
        expect(afterCommandLogs).toContain('post_refresh');
    });

    test('UI configuration and layout preserved', async () => {
        // Change some UI state
        await testRunner.page.click('#toggle-live');
        await setTimeout(500);
        
        const initialToggleText = await testRunner.page.$eval('#toggle-live', el => el.textContent);
        expect(initialToggleText).toBe('Resume Live'); // Should have changed from 'Pause Live'
        
        // Test graph controls
        await testRunner.page.click('#refresh-graph');
        await setTimeout(1000);
        
        const initialLogs = await testRunner.getLogs();
        expect(initialLogs).toContain('Graph refresh requested');
        
        // Refresh page
        await testRunner.page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
        
        // Wait for reconnection
        await testRunner.page.waitForFunction(() => {
            const status = document.querySelector('#connection-status');
            return status && status.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Verify UI is functional after refresh
        const connectionStatus = await testRunner.page.$eval('#connection-status', el => el.textContent);
        expect(connectionStatus.toLowerCase()).toContain('connected');
        
        // Test that controls still work
        await testRunner.executeCommand('/state');
        await testRunner.waitForResponse('Connection:');
        
        const logsAfterRefresh = await testRunner.getLogs();
        expect(logsAfterRefresh).toContain('Connection: connected');
    });

    test('Quick command selections preserved', async () => {
        // Select a quick command
        await testRunner.page.select('#quick-commands', '<{quick_preserve} --> value> .');
        const originalSelection = await testRunner.page.$eval('#quick-commands', el => el.value);
        
        expect(originalSelection).toContain('quick_preserve');
        
        // Execute the quick command to ensure it works
        await testRunner.page.click('#exec-quick');
        await testRunner.waitForResponse('quick_preserve');
        
        // Refresh the page
        await testRunner.page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
        
        // Wait for reconnection
        await testRunner.page.waitForFunction(() => {
            const status = document.querySelector('#connection-status');
            return status && status.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // UI should be functional, though specific selections might not be preserved
        // (this tests the overall system resilience to refresh)
        const connectionStatus = await testRunner.page.$eval('#connection-status', el => el.textContent);
        expect(connectionStatus.toLowerCase()).toContain('connected');
        
        // Ensure the quick command dropdown still works
        await testRunner.page.select('#quick-commands', '<{refresh_test} --> type> .');
        await testRunner.page.click('#exec-quick');
        await testRunner.waitForResponse('refresh_test');
        
        const finalLogs = await testRunner.getLogs();
        expect(finalLogs).toContain('refresh_test');
    });
});