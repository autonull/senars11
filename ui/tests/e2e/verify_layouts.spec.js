import { test, expect } from '@playwright/test';

test.describe('Layout Verification', () => {

    test('should load SPLIT layout', async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));

        await page.goto('http://localhost:5173/ide.html?mode=local&layout=split');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });

        // Split has Editor (Source) and Notebook (Output)
        const editor = page.locator('.code-editor-panel');
        await expect(editor).toBeVisible();

        const notebook = page.locator('.notebook-container');
        await expect(notebook).toBeVisible();

        // Notebook input should be hidden
        await expect(page.locator('.notebook-input-area')).toBeHidden();
    });

    test('should load CANVAS layout', async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local&layout=canvas');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });

        // Canvas has Graph (top) and Notebook (bottom) in a stack
        const graph = page.locator('.graph-container');
        await expect(graph).toBeVisible();

        const notebook = page.locator('.notebook-container');
        await expect(notebook).toBeVisible();
    });

    test('should load REPL layout', async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local&layout=repl');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });

        // REPL has just notebook stack
        const notebook = page.locator('.notebook-container');
        await expect(notebook).toBeVisible();

        // Input should be visible
        await expect(page.locator('.notebook-input-area')).toBeVisible();
    });
});
