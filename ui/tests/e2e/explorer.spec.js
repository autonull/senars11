import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/explorer.html');
    });

    test('should load the explorer page', async ({ page }) => {
        await expect(page).toHaveTitle(/SeNARS Explorer/);
        await expect(page.locator('h1')).toHaveText('SeNARS Explorer');
    });

    test('should show mode buttons', async ({ page }) => {
        const modes = ['Visualization', 'Representation', 'Control'];
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
        await page.click('#btn-llm-config');
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

        // Check if Explorer app is exposed and count nodes
        const nodeCount = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.viewport.cy ? window.Explorer.graph.viewport.cy.nodes().length : 0;
        });

        console.log('Node count:', nodeCount);
        expect(nodeCount).toBeGreaterThan(0);

        // Check Bag limit (we set default to 50 in ExplorerGraph, and added 60+4 items in ExplorerApp)
        expect(nodeCount).toBeLessThanOrEqual(50);
    });
});
