import { test, expect } from '@playwright/test';

test.describe('Notebook Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });
        // Wait for initialization messages
        await page.waitForTimeout(2000);
    });

    test('should create, execute, duplicate and delete cells', async ({ page }) => {
        // 1. Initial State
        const initialResults = await page.locator('.repl-cell.result-cell').count();
        const initialCodes = await page.locator('.repl-cell.code-cell').count();
        console.log(`Initial - Results: ${initialResults}, Codes: ${initialCodes}`);

        // 2. Input Code via Bottom Input
        const uniqueCode = '! 5';
        const inputArea = page.locator('.notebook-input-area textarea');
        await inputArea.fill(uniqueCode);

        const executeBtn = page.locator('.notebook-input-area button', { hasText: 'Execute' });
        await executeBtn.click();

        // Wait for execution
        await page.waitForTimeout(1000);

        // 3. Verify Code Cell Creation
        const codeCells = page.locator('.repl-cell.code-cell');
        await expect(codeCells).toHaveCount(initialCodes + 1);
        const newCodeCell = codeCells.last();
        await expect(newCodeCell).toContainText(uniqueCode);

        // 4. Verify Result Cell Creation
        const resultCells = page.locator('.repl-cell.result-cell');
        await expect(resultCells).toHaveCount(initialResults + 1);

        // 5. Verify Duplicate Feature
        const duplicateBtn = newCodeCell.locator('button[title="Duplicate Cell"]');
        await expect(duplicateBtn).toBeVisible();
        await duplicateBtn.click();

        // Wait for duplication
        await page.waitForTimeout(500);
        await expect(codeCells).toHaveCount(initialCodes + 2);

        // 6. Verify Result Placement (Execute duplicated cell)
        const dupCell = codeCells.nth(initialCodes + 1); // The duplicate
        const runBtn = dupCell.locator('button[title*="Run"]');
        await runBtn.click();

        await page.waitForTimeout(1000);

        // Should have another result
        await expect(resultCells).toHaveCount(initialResults + 2);

        // 7. Verify Delete
        const deleteBtn = dupCell.locator('button[title="Delete Cell"]');
        await deleteBtn.click();

        // Handle Modal
        const modalOk = page.locator('.modal-window button', { hasText: 'OK' });
        await modalOk.click();

        await page.waitForTimeout(500);
        await expect(codeCells).toHaveCount(initialCodes + 1);
    });
});
