import { test, expect } from '@playwright/test';

test.describe('Notebook Undo and Recovery', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });
        await page.waitForTimeout(1000);
    });

    test('should delete a cell and then undo the deletion', async ({ page }) => {
        // 1. Create a cell
        const inputArea = page.locator('.notebook-input-area textarea');
        await inputArea.fill('(undo-test-1)');

        const executeBtn = page.locator('.notebook-input-area button', { hasText: 'Execute' });
        await executeBtn.click();
        await page.waitForTimeout(500);

        // Verify it exists
        const cell = page.locator('.repl-cell.code-cell').last();
        await expect(cell).toContainText('(undo-test-1)');

        // 2. Delete it
        const deleteBtn = cell.locator('button[title="Delete Cell"]');
        await deleteBtn.click();

        // Modal
        const modalOk = page.locator('.modal-window button', { hasText: 'OK' });
        await modalOk.click();

        await page.waitForTimeout(500);
        await expect(cell).toBeHidden();

        // 3. Undo
        const undoBtn = page.locator('button[title="Undo Delete"]');
        await undoBtn.click();

        await page.waitForTimeout(500);

        // 4. Verify Restoration
        // Re-locate
        const restoredCell = page.locator('.repl-cell.code-cell').last();
        await expect(restoredCell).toBeVisible();
        await expect(restoredCell).toContainText('(undo-test-1)');
    });
});
