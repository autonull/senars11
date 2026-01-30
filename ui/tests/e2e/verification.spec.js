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

        // 8. Verify Settings Panel & Theme Switcher
        // Since GoldenLayout tabs might be dynamic, we look for the Settings tab or component
        // Assuming Settings is loaded in the layout by default or accessible
        // Let's try to verify the Settings component structure if it's visible, or check the DOM

        // Check if SettingsPanel component exists in DOM (GoldenLayout might hide it in tabs)
        // If not visible, we won't force it open to avoid layout complexity in test,
        // but we can check if the class for settings exists if it's rendered.

        // Alternatively, check if we can switch theme via command/shortcut (less visual)
        // Let's verify the theme switcher logic by calling it directly to ensure ergonomics
        await page.evaluate(() => {
            window.SeNARSIDE.themeManager.setTheme('light');
        });
        await expect(page.locator('body')).toHaveClass(/theme-light/);

        // 9. Take Screenshot
        const screenshotPath = path.resolve('verification-screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);
    });

    test('Verify ZUI Demo Load', async ({ page }) => {
        // Navigate to ZUI directory index
        // server.js logic: path.join(__dirname, '..', filePath) for modules
        // zui is in src/zui. So /src/zui/index.html

        await page.goto('/src/zui/index.html');
        await expect(page).toHaveTitle(/SeNARS ZUI/);
        await expect(page.locator('#graph-container')).toBeVisible();
        // Check for specific panel or count
        await expect(page.locator('.hud-panel').first()).toBeVisible();
    });
});
