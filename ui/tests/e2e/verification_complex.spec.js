import { test, expect } from '@playwright/test';

test.describe('Explorer Complex Graph Verification', () => {
    test('Load Complex Graph Demo and capture screenshot', async ({ page }) => {
        // Go to Explorer
        await page.goto('http://localhost:8080/explorer.html');

        // Verify title
        await expect(page).toHaveTitle(/SeNARS Explorer/);

        // Wait for graph container
        await page.waitForSelector('#graph-container');

        // Select Complex Graph Demo
        // The demo select is populated dynamically, so we wait for it
        const demoSelect = page.locator('#demo-select');
        await demoSelect.waitFor({ state: 'visible' });

        // Wait for options to be populated (check if option value="Complex Graph" exists)
        // Or just try selecting it, Playwright retries
        await demoSelect.selectOption({ label: 'Complex Graph' });

        // Wait for graph to populate
        // We expect many nodes. Let's wait for at least 50 nodes.
        // SeNARSGraph uses Cytoscape, nodes are likely <div class="cy-node">? No, Cytoscape renders on Canvas.
        // However, we can check for toast message "Generated: Complex Graph"

        await expect(page.locator('.toast-success')).toContainText('Generated: Complex Graph', { timeout: 10000 });

        // Wait a bit for layout to settle
        await page.waitForTimeout(3000);

        // Verify status bar is at the top
        const statusBarBox = await page.locator('#status-bar-container').boundingBox();
        expect(statusBarBox.y).toBe(0);
        expect(statusBarBox.height).toBeGreaterThan(0);

        // Verify Layers HUD widget is visible
        const layersWidget = page.locator('#layers-widget');
        await expect(layersWidget).toBeVisible();

        // Check if it's positioned below status bar
        const layersBox = await layersWidget.boundingBox();
        expect(layersBox.y).toBeGreaterThan(statusBarBox.height);

        // Take screenshot
        await page.screenshot({ path: 'ui/screenshots/complex_graph_verification.png', fullPage: true });
    });
});
