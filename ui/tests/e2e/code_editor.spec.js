import { test, expect } from '@playwright/test';

test.describe('Code Editor Layout', () => {
    test.beforeEach(async ({ page }) => {
        // Load with code layout
        await page.goto('http://localhost:5173/ide.html?mode=local&layout=code');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });
        await page.waitForTimeout(2000);
    });

    test('should execute code from editor and show log and result in output', async ({ page }) => {
        // 1. Verify Layout
        const editorPanel = page.locator('.code-editor-panel');
        await expect(editorPanel).toBeVisible();

        const notebookInput = page.locator('.notebook-input-area');
        await expect(notebookInput).toBeHidden(); // Should be hidden in this layout

        // 2. Initial State
        const initialResults = await page.locator('.repl-cell.result-cell').count();
        const initialCodes = await page.locator('.repl-cell.code-cell').count();
        console.log(`Initial - Results: ${initialResults}, Codes: ${initialCodes}`);

        // 3. Input Code in Editor
        const uniqueCode = '! 777'; // MeTTa
        const editorTextarea = editorPanel.locator('textarea');
        await editorTextarea.fill(uniqueCode);

        // 4. Run
        const runBtn = editorPanel.locator('button', { hasText: 'Run' });
        await runBtn.click();

        // Wait for execution
        await page.waitForTimeout(1000);

        // 5. Verify Output Log (Code Cell)
        const codeCells = page.locator('.repl-cell.code-cell');
        await expect(codeCells).toHaveCount(initialCodes + 1);
        const newCodeCell = codeCells.last();
        await expect(newCodeCell).toContainText(uniqueCode);

        // 6. Verify Result Cell
        const resultCells = page.locator('.repl-cell.result-cell');
        // Expect result to be added
        await expect(resultCells).toHaveCount(initialResults + 1);

        // Verify Position: Result should be after the new code cell
        // In DOM order: Code -> Result
        // We can check if the element after newCodeCell is a result cell
        // But Playwright logic:

        // Let's get the ID of the new code cell
        const codeId = await newCodeCell.getAttribute('data-cell-id');

        // Find the element immediately following
        // CSS selector: .repl-cell[data-cell-id="..."] + .repl-cell
        const nextCell = page.locator(`.repl-cell[data-cell-id="${codeId}"] + .repl-cell`);
        await expect(nextCell).toHaveClass(/result-cell/);

    });
});
