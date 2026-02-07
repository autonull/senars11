import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer Verification Screenshots', () => {
    test.beforeEach(async ({ page }) => {
        // Set viewport size for consistent screenshots
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto('/explorer.html');
        // Wait for graph to be ready
        await expect(page.locator('#graph-container canvas').first()).toBeVisible({ timeout: 10000 });
        // Wait for app initialization
        await page.waitForFunction(() => window.Explorer && window.Explorer.graph && window.Explorer.graph.cy);
    });

    test('capture explorer state', async ({ page }) => {
        // 1. Initial State
        await page.waitForTimeout(1000); // Allow layout to settle
        await page.screenshot({ path: 'screenshots/explorer-initial.png' });

        // 2. Add and Select Node (Inspector + Target Panel)
        await page.evaluate(() => {
            // Add a node with full data for Inspector
            const nodeData = {
                id: 'ScreenshotNode',
                term: 'ScreenshotNode',
                type: 'concept',
                budget: { priority: 0.95, durability: 0.9, quality: 0.8 },
                truth: { frequency: 0.9, confidence: 0.8 },
                tasks: [{ term: 'ScreenshotNode', type: 'judgment', truth: {frequency: 0.9, confidence: 0.8} }]
            };
            window.Explorer.graph.addNode(nodeData, true);

            // Select it after a brief delay to allow adding
            setTimeout(() => {
                const node = window.Explorer.graph.cy.getElementById('ScreenshotNode');
                if (node.nonempty()) {
                    window.Explorer.graph.flyTo('ScreenshotNode');
                    // Force emit event just in case (though flyTo should trigger selection)
                    // window.Explorer.graph.cy.emit('tap', { target: node });
                }
            }, 500);
        });

        // Wait for selection animation and UI update
        await page.waitForTimeout(2000);

        // Verify Inspector is visible
        await expect(page.locator('#inspector-panel')).toBeVisible();

        // Target Panel should NOT be visible (removed)
        await expect(page.locator('.target-panel')).not.toBeVisible();

        // Take screenshot of selected state
        await page.screenshot({ path: 'screenshots/explorer-selected.png' });
    });
});
