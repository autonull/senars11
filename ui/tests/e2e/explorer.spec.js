import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/explorer.html');
    });

    test('should load the explorer page', async ({ page }) => {
        await expect(page).toHaveTitle(/SeNARS Explorer/);
    });

    test('should show mode buttons', async ({ page }) => {
        // Updated labels: VISUAL, DATA, EDIT
        const modes = ['VISUAL', 'DATA', 'EDIT'];
        for (const mode of modes) {
            await expect(page.locator(`.mode-btn:has-text("${mode}")`)).toBeVisible();
        }
    });

    test('should switch modes', async ({ page }) => {
        await page.click('.mode-btn[data-mode="representation"]');
        await expect(page.locator('.mode-btn[data-mode="representation"]')).toHaveClass(/active/);
        await expect(page.locator('.mode-btn[data-mode="visualization"]')).not.toHaveClass(/active/);
    });

    test('should open LLM config dialog', async ({ page }) => {
        await page.click('#status-config');
        await expect(page.locator('#lm-config-overlay')).toBeVisible();
        await expect(page.locator('.modal-dialog h2')).toHaveText('Language Model Configuration');

        // Close it
        await page.click('button:has-text("Cancel")');
        await expect(page.locator('#lm-config-overlay')).not.toBeVisible();
    });

    test('should render graph nodes and respect bag limit', async ({ page }) => {
        // Wait for graph to initialize
        await expect(page.locator('#graph-container canvas').first()).toBeVisible({ timeout: 10000 });

        // Wait a bit for async init
        await page.waitForTimeout(2000);

        // Add some nodes to test rendering
        await page.evaluate(() => {
            if (window.Explorer && window.Explorer.graph) {
                for (let i = 0; i < 10; i++) {
                    window.Explorer.graph.addNode({ id: `TestNode${i}`, term: `TestNode${i}` }, false);
                }
                window.Explorer.graph.scheduleLayout();
            }
        });

        // Wait for nodes to be added
        await page.waitForTimeout(500);

        // Check if Explorer app is exposed and count nodes
        const nodeCount = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.cy ? window.Explorer.graph.cy.nodes().length : 0;
        });

        console.log('Node count:', nodeCount);
        expect(nodeCount).toBeGreaterThan(0);

        // Check Bag limit (we set default to 50 in ExplorerGraph)
        expect(nodeCount).toBeLessThanOrEqual(50);
    });
});
