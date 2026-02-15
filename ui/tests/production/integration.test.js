/**
 * @file integration.test.js
 * @description Essential integration tests using shared utilities
 * Tests core functionality that must work with real backend services
 */

import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Essential Integration Tests', () => {
    let testRunner = null;

    beforeAll(async () => {
        // Tests assume backend is running via: node scripts/ui/launcher.js --port 8220 --ws-port 8221
    });

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8220, wsPort: 8221 });
        await testRunner.setup();
    }, 40000); // Increase timeout for setup

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('System connects to real backend and processes commands', async () => {
        // Verify connection
        const connected = await testRunner.isConnected();
        expect(connected).toBe(true);

        // Verify command processing
        await testRunner.executeCommand('<{integration_test} --> concept>.');
        await testRunner.waitForResponse('integration_test');
        const logs = await testRunner.getLogs();

        expect(logs).toContain('> <{integration_test} --> concept>.');
        expect(logs).toContain('integration_test');
    }, 35000); // Increase test timeout

    test('UI controls function with real backend', async () => {
        // Test refresh functionality
        await testRunner.page.click('#refresh-graph');
        await testRunner.waitForResponse('Graph refresh requested');

        const logs = await testRunner.getLogs();
        expect(logs).toContain('Graph refresh requested');

        // Test live toggle functionality
        const initialText = await testRunner.page.$eval('#toggle-live', el => el.textContent);

        await testRunner.page.click('#toggle-live');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increase delay

        const updatedText = await testRunner.page.$eval('#toggle-live', el => el.textContent);
        expect(updatedText).not.toBe(initialText);
    }, 30000); // Increase test timeout

    test('Debug and help commands work with real state', async () => {
        await testRunner.testDebugCommands();

        // Test help command
        await testRunner.executeCommand('/help');
        await testRunner.waitForResponse('Available debug commands');
        const logs = await testRunner.getLogs();

        expect(logs).toContain('Available debug commands');
        expect(logs).toContain('/help');
        expect(logs).toContain('/state');
    }, 30000); // Increase test timeout

    test('Quick commands and history work', async () => {
        // Test quick command functionality
        await testRunner.testQuickCommands();

        // Test command history
        await testRunner.executeCommand('<{history_test} --> test>.');
        await testRunner.page.click('#show-history');
        await testRunner.waitForResponse('Command History');

        const logs = await testRunner.getLogs();
        expect(logs).toContain('Command History');
        expect(logs).toContain('history_test');
    }, 35000); // Increase test timeout
});