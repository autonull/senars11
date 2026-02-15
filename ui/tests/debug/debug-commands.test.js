/**
 * @file test-debug-commands.js
 * @description Tests for all debug commands in ui
 */

import { test, expect } from '../base-test';

// Tests for debug commands functionality
test.describe('ui Debug Commands Tests', () => {
    test.beforeEach(async ({ uiPage }) => {
        // The uiPage fixture handles navigation and connection
    });

    test('/help command shows available commands', async ({ page }) => {
        await page.type('#command-input', '/help');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Available debug commands:');
        }, { timeout: 5000 });

        // Check for specific commands
        const logsContent = await page.textContent('#logs-container');
        expect(logsContent).toContain('/help');
        expect(logsContent).toContain('/state');
        expect(logsContent).toContain('/nodes');
        expect(logsContent).toContain('/tasks');
        expect(logsContent).toContain('/concepts');
        expect(logsContent).toContain('/refresh');
        expect(logsContent).toContain('/clear');
    });

    test('/state command shows status information', async ({ page }) => {
        await page.type('#command-input', '/state');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Connection:');
        }, { timeout: 5000 });

        const logsContent = await page.textContent('#logs-container');
        expect(logsContent).toContain('Connection:');
        expect(logsContent).toContain('Message Count:');
        expect(logsContent).toContain('Command History:');
    });

    test('/nodes command shows graph nodes', async ({ page }) => {
        await page.type('#command-input', '/nodes');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && (logs.textContent.includes('Graph has') ||
                           logs.textContent.includes('Graph not initialized'));
        }, { timeout: 5000 });
    });

    test('/tasks command shows task nodes', async ({ page }) => {
        await page.type('#command-input', '/tasks');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && (logs.textContent.includes('task nodes') ||
                           logs.textContent.includes('Graph not initialized'));
        }, { timeout: 5000 });
    });

    test('/concepts command shows concept nodes', async ({ page }) => {
        await page.type('#command-input', '/concepts');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && (logs.textContent.includes('concept nodes') ||
                           logs.textContent.includes('Graph not initialized'));
        }, { timeout: 5000 });
    });

    test('/refresh command requests graph refresh', async ({ page }) => {
        await page.type('#command-input', '/refresh');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Graph refresh requested');
        }, { timeout: 5000 });
    });

    test('/clear command clears logs', async ({ page }) => {
        // First add some content to logs
        await page.type('#command-input', '<test --> command>.');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('<test --> command>.');
        }, { timeout: 5000 });

        // Now clear the logs
        await page.type('#command-input', '/clear');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Cleared logs');
        }, { timeout: 5000 });
    });

    test('Unknown debug command shows error', async ({ page }) => {
        await page.type('#command-input', '/invalidcommand');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Unknown debug command:');
        }, { timeout: 5000 });
    });

    test('Case insensitive command handling', async ({ page }) => {
        await page.type('#command-input', '/HELP');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Available debug commands:');
        }, { timeout: 5000 });

        await page.type('#command-input', '/State');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Connection:');
        }, { timeout: 5000 });
    });

    test('Command history includes debug commands', async ({ page }) => {
        await page.type('#command-input', '/help');
        await page.click('#send-button');

        await page.type('#command-input', '/state');
        await page.click('#send-button');

        // Check history
        await page.click('#show-history');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('/help') && logs.textContent.includes('/state');
        }, { timeout: 5000 });
    });
});
});