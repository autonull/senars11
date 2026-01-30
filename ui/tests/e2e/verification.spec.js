import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('SeNARS Verification', () => {
    test('Verify core SeNARS functionality and UI', async ({ page }) => {
        // 1. Navigate to IDE (Force Remote Mode)
        console.log('Navigating to IDE...');
        await page.goto('/ide.html?mode=remote');
        await expect(page).toHaveTitle(/SeNARS/);

        // Configure server URL correctly for mock backend
        await page.evaluate(() => {
            window.SeNARSIDE.settingsManager.setServerUrl('ws://localhost:8081');
            window.SeNARSIDE.switchMode('remote');
        });

        // 2. Ensure connection (mock backend)
        const status = page.locator('#connection-status');
        await expect(status).toContainText('connected', { timeout: 10000, ignoreCase: true });

        // 3. Locate Notebook Input
        const notebookInput = page.locator('#command-input');
        await expect(notebookInput).toBeVisible();

        // 4. Send a Narsese command
        const command = '<bird --> flyer>.';
        await notebookInput.click();
        await notebookInput.fill(command);

        // Execute command (via button to be safe)
        const sendButton = page.locator('button', { hasText: 'Execute' });
        await sendButton.click();

        // 5. Verify log output
        // The log entry should be in a code cell (preview mode)
        await expect(page.locator('.code-preview').first()).toBeVisible({ timeout: 5000 });

        // 6. Verify result/processing (Mock backend echoes subject/predicate)
        // From mock-backend.js: echoes subject 'bird' and predicate 'flyer'
        await expect(page.locator('.result-cell', { hasText: 'bird' }).first()).toBeVisible();
        await expect(page.locator('.result-cell', { hasText: 'flyer' }).first()).toBeVisible();

        // 7. Verify Timeline Widget Creation
        // Click the 'Widget' button in the toolbar
        const widgetButton = page.locator('button', { hasText: 'Widget' });
        await widgetButton.click();

        // Wait for context menu
        const timelineItem = page.locator('.context-menu-item', { hasText: 'Timeline' });
        await expect(timelineItem).toBeVisible();
        await timelineItem.click();

        // Verify Timeline Widget appears in notebook
        await expect(page.locator('.timeline-widget')).toBeVisible();

        // 8. Take Screenshot
        const screenshotPath = path.resolve('verification-screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);
    });
});
