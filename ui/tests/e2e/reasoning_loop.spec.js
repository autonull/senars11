import { test, expect } from '@playwright/test';

test.describe('Reasoning Loop Integration', () => {
    test('should process input and display reasoning results', async ({ page }) => {
        // 1. Load IDE
        await page.goto('http://localhost:5173/ide.html');

        // Wait for initialization
        await page.waitForSelector('.repl-input-area');

        // 2. Switch to Local Mode (if not default, but assuming default or auto-connect)
        // Check connection indicator
        const indicator = await page.locator('#mode-indicator');
        await expect(indicator).toContainText('Local Mode');

        // 3. Clear REPL to start fresh
        await page.click('text=🗑️ Clear');

        // 4. Input Narsese fact
        const input = '<bird --> animal>.';
        await page.fill('#repl-input', input);
        await page.keyboard.press('Control+Enter');

        // 5. Verify Input Echo (User Input)
        const codeCells = page.locator('.code-cell textarea');
        await expect(codeCells.last()).toHaveValue(input);

        // 6. Verify System Response (Reasoning Result)
        // Wait for a result cell
        await page.waitForSelector('.result-cell', { timeout: 10000 });

        const resultCells = page.locator('.result-cell');
        const count = await resultCells.count();
        expect(count).toBeGreaterThan(0);

        // 7. Verify Graph Update
        await expect(page.locator('text=KNOWLEDGE GRAPH')).toBeVisible();
    });
});
