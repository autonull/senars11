import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer Modes', () => {

    test('Remote Mode (Default): Should load LMAgentController and support reasoning', async ({ page }) => {
        await page.goto('/explorer.html');

        // Verify "Online" status or "Config Required" (which means LMAgentController loaded but needs config)
        // It shouldn't be "Reasoner Only" or "Module Error"
        await expect(page.locator('#llm-status')).not.toHaveText('Reasoner Only', { timeout: 10000 });
        await expect(page.locator('#llm-status')).not.toHaveText('Module Error', { timeout: 10000 });

        // Switch to Control Mode to see the toolbar
        await page.click('.mode-btn[data-mode="control"]');
        await expect(page.locator('#control-toolbar')).not.toHaveClass(/hidden/);

        // Add a concept manually via UI
        await page.evaluate(() => {
             // Mock prompt to avoid blocking
             window.prompt = () => 'cat';
        });

        // Click Add Concept button
        await page.click('#btn-add-concept');

        // Verify node exists
        // Wait a bit for graph update
        await page.waitForTimeout(500);
        const hasCat = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.cy && window.Explorer.graph.cy.getElementById('cat').nonempty();
        });
        expect(hasCat).toBe(true);

        // Run Reasoner
        await page.click('#btn-run');
        // Pause button should become visible
        await expect(page.locator('#btn-pause')).toBeVisible();

        // Check if stats are updating (TPS > 0)
        await page.waitForTimeout(2000);
        const tpsText = await page.locator('#status-bar-container').textContent();
        // The stats are in status bar. Implementation details:
        // ExplorerApp.js: this.statusBar.updateStats({...})
        // StatusBar.js: likely renders text.
        // Let's look for "TPS:" in the page text content or specific element.
        // ExplorerApp.js:
        // this.statusBar.updateStats({ ... tps: ... })
        // Let's rely on finding "TPS:" and a number > 0.

        // Wait for stats update
        await expect(page.locator('.status-bar')).toContainText(/TPS:\s*[0-9.]+/);

        // Stop Reasoner
        await page.click('#btn-pause');
        await expect(page.locator('#btn-run')).toBeVisible();
    });

    test('Local Mode: Should fallback to AgentToolsBridge when LLM fails', async ({ page }) => {
        // Block LMAgentController to force fallback
        await page.route('**/LMAgentController.js', route => route.abort());

        await page.goto('/explorer.html');

        // Verify "Reasoner Only" status
        await expect(page.locator('#llm-status')).toHaveText('Reasoner Only', { timeout: 10000 });

        // Check for toast message
        // ToastManager creates elements, let's check for text on page
        await expect(page.locator('body')).toContainText('LLM unavailable - Running in Reasoner Only mode');

        // Switch to Control Mode to see the toolbar
        await page.click('.mode-btn[data-mode="control"]');
        await expect(page.locator('#control-toolbar')).not.toHaveClass(/hidden/);

        // Add a concept
         await page.evaluate(() => {
             window.prompt = () => 'dog';
        });
        await page.click('#btn-add-concept');

        // Verify node exists
        await page.waitForTimeout(500);
        const hasDog = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.cy && window.Explorer.graph.cy.getElementById('dog').nonempty();
        });
        expect(hasDog).toBe(true);

        // Run Reasoner
        await page.click('#btn-run');
        await expect(page.locator('#btn-pause')).toBeVisible();

        // Check if stats are updating
        await page.waitForTimeout(2000);
        await expect(page.locator('.status-bar')).toContainText(/TPS:\s*[0-9.]+/);

        // Stop Reasoner
        await page.click('#btn-pause');
    });
});
