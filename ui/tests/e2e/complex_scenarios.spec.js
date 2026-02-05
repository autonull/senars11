import { test, expect } from '@playwright/test';

test.describe('Complex Usage Scenarios', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/explorer.html');
        await page.waitForSelector('.status-bar');
    });

    test('Scenario: Scripted Reasoning Chain', async ({ page }) => {
        // 1. Select the "Complex Interaction" demo
        const select = page.locator('#demo-select');
        await expect(select.locator('option[value="Complex Interaction"]')).toBeAttached();
        await select.selectOption('Complex Interaction');

        // 2. Wait for script execution
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'ui/tests/e2e/screenshots/scenario_script_mid.png' });

        // Wait for final state (tiger node)
        await expect(page.locator('.log-entry', { hasText: 'tiger' }).first()).toBeVisible({ timeout: 15000 });

        await page.screenshot({ path: 'ui/tests/e2e/screenshots/scenario_script_final.png' });
    });

    test('Scenario: Demo Library Modal Integration', async ({ page }) => {
        // Just trigger it via API since UI shortcuts are flaky in headless CI
        await page.evaluate(() => window.Explorer.showDemoLibrary());

        // Check for Modal
        const modal = page.locator('.modal-container');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.modal-title')).toHaveText('📚 Demo Library');

        // Check for new demo entry
        const demoItem = page.locator('.demo-item', { hasText: 'Complex Interaction' });
        await expect(demoItem).toBeVisible();

        // Select it (should load demo)
        await demoItem.click();

        // Modal should close
        await expect(modal).not.toBeVisible();

        // Loading should start (check log or toast)
        const logEntry = page.locator('.log-entry', { hasText: 'Loading demo: Complex Interaction' }).first();
        await expect(logEntry).toBeVisible();
    });
});

test('Scenario: Manual Construction', async ({ page }) => {
    let conceptCounter = 0;
    const concepts = ['Vehicle', 'Car'];

    page.on('dialog', async dialog => {
        if (dialog.message().includes('concept name')) {
            await dialog.accept(concepts[conceptCounter++]);
        } else if (dialog.message().includes('Link')) {
             await dialog.accept('inheritance');
        }
    });

    await page.goto('/explorer.html');
    await page.waitForSelector('.status-bar');

    // Add Vehicle
    // Use .status-menu-item.active .status-menu-dropdown to target the visible one
    await page.click('button.status-menu-btn:has-text("Edit")');
    await expect(page.locator('.status-menu-item.active .status-menu-dropdown')).toBeVisible();
    await page.click('button[data-action="add-concept"]');
    await expect(page.locator('.log-entry', { hasText: 'Vehicle' }).first()).toBeVisible();

    // Add Car
    await page.click('button.status-menu-btn:has-text("Edit")');
    await expect(page.locator('.status-menu-item.active .status-menu-dropdown')).toBeVisible();
    await page.click('button[data-action="add-concept"]');
    await expect(page.locator('.log-entry', { hasText: 'Car' }).first()).toBeVisible();

    // Link them
    await page.evaluate(() => {
        window.Explorer.graph.cy.$id('Vehicle').select();
        window.Explorer.graph.cy.$id('Car').select();
    });

    await page.click('button.status-menu-btn:has-text("Edit")');
    await expect(page.locator('.status-menu-item.active .status-menu-dropdown')).toBeVisible();
    await page.click('button[data-action="add-link"]');

    await expect(page.locator('.log-entry', { hasText: 'Linked Vehicle -> Car' }).first()).toBeVisible();

    await page.screenshot({ path: 'ui/tests/e2e/screenshots/scenario_manual_construction.png' });
});
