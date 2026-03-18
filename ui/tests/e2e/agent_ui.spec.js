
import { test, expect } from '@playwright/test';

test.describe('Agent UI Structure', () => {
    test.beforeEach(async ({ page }) => {
        // Go to the agent page
        await page.goto('/agent.html');

        // Wait for the page to load (loading overlay might be present)
        await page.waitForLoadState('domcontentloaded');
    });

    test('should have the agent container and no legacy header', async ({ page }) => {
        // The header class .agent-header should not exist
        const header = page.locator('.agent-header');
        await expect(header).toHaveCount(0);

        // Check for specific text that was in the header to ensure it's gone
        const titleText = page.getByText('SeNARS Agent REPL', { exact: true });
        await expect(titleText).toHaveCount(0);

        // Verify container exists
        const container = page.locator('#agent-container');
        await expect(container).toBeVisible();
    });

    test('should have status bar', async ({ page }) => {
        const statusBar = page.locator('#status-bar-root');
        await expect(statusBar).toBeVisible();
    });
});
