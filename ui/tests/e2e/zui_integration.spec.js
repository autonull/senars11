import { test, expect } from '@playwright/test';

test.describe('ZUI Integration', () => {
    test('ZUI Panel Loads and Syncs', async ({ page }) => {
        // 1. Load IDE with ZUI layout
        await page.goto('/ide.html?layout=zui');

        // 2. Verify ZUI Panel exists
        await expect(page.locator('.zui-panel')).toBeVisible();

        const container = page.locator('#zui-graph-container');
        await expect(container).toBeVisible();

        // 3. Verify Cytoscape initialized
        const canvas = container.locator('canvas');
        await expect(canvas.first()).toBeAttached();

        // Wait a bit for layout to settle and graph to render demo data
        await page.waitForTimeout(1000);

        // Capture screenshot for visual verification
        await page.screenshot({ path: 'zui-verification.png' });
    });
});
