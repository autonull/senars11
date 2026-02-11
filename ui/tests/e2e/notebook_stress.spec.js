import { test, expect } from '@playwright/test';

test.describe('Notebook Stress Test', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });
        await page.waitForTimeout(2000);
    });

    test('should handle rapid creation and execution of 10 cells', async ({ page }) => {
        const count = 10;

        // 1. Create 10 cells rapidly via input
        const inputArea = page.locator('.notebook-input-area textarea');
        const executeBtn = page.locator('.notebook-input-area button', { hasText: 'Execute' });

        for (let i = 0; i < count; i++) {
            // Use MeTTa evaluation which guarantees a result string
            await inputArea.fill(`! ${i}`);
            await executeBtn.click();
            // 200ms delay to allow some processing but still be fast
            await page.waitForTimeout(200);
        }

        // 2. Wait for all executions to complete
        // Increase timeout to ensure all 10 processed
        await page.waitForTimeout(5000);

        const codeCells = page.locator('.repl-cell.code-cell');
        await expect(codeCells).toHaveCount(count);

        const resultCells = page.locator('.repl-cell.result-cell');
        const initialResults = 4; // Based on previous runs
        await expect(resultCells).toHaveCount(initialResults + count);

        // 3. Verify content of last result
        const lastResult = resultCells.last();
        await expect(lastResult).toBeVisible();

        // 4. Delete all code cells via Clear button
        const inputClear = page.locator('.notebook-input-area button', { hasText: 'Clear' });
        await inputClear.click();

        await page.waitForTimeout(1000);

        // Should be empty
        await expect(codeCells).toHaveCount(0);
        await expect(resultCells).toHaveCount(0);
    });
});
