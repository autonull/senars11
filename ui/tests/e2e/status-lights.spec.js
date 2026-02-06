import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Explorer Status Lights Verification', () => {
    test('Should verify status lights exist and have tooltips', async ({ page }) => {
        // 1. Navigate to Explorer
        await page.goto('/explorer.html');

        // 2. Check Light Container
        const container = page.locator('.capability-lights');
        await expect(container).toBeVisible();

        // 3. Check Reasoner Light
        const reasonerLight = page.locator('#cap-reasoner');
        await expect(reasonerLight).toBeVisible();
        // Initial state offline
        await expect(reasonerLight).toHaveClass(/status-offline/);

        // 4. Check LLM Light
        const llmLight = page.locator('#cap-llm');
        await expect(llmLight).toBeVisible();
        await expect(llmLight).toHaveClass(/status-offline/);

        // 5. Mock status update via evaluate (since backend mock is limited)
        await page.evaluate(() => {
            window.Explorer.statusBar.setCapability('reasoner', 'online', 'Reasoner: Online (Test)');
            window.Explorer.statusBar.setCapability('llm', 'warning', 'LLM: Config Required (Test)');
        });

        // 6. Verify Updates
        await expect(reasonerLight).toHaveClass(/status-online/);
        await expect(reasonerLight).toHaveAttribute('title', 'Reasoner: Online (Test)');

        await expect(llmLight).toHaveClass(/status-warning/);
        await expect(llmLight).toHaveAttribute('title', 'LLM: Config Required (Test)');

        // 7. Screenshot
        const screenshotPath = path.resolve('ui/status-lights-verification.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
    });
});
