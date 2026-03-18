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

        // Check for new demo entry in Featured Tab
        const demoItem = page.locator('.demo-item', { hasText: 'Complex Interaction' });
        await expect(demoItem).toBeVisible();

        // Switch to System Examples Tab
        await page.click('button:has-text("📂 System Examples")');

        // Wait for ExampleBrowser to load
        await expect(page.locator('.eb-tree-root')).toBeVisible();

        // Find a file (e.g., alien-encounter.nars)
        // It might be nested in examples/scripts
        const scriptFolder = page.locator('.eb-tree-summary', { hasText: 'scripts' });
        if (await scriptFolder.isVisible()) {
             // It might be already open or closed. If open, we see children.
        } else {
             // Root 'examples' might need expansion if not auto-expanded
        }

        // We know structure: examples -> scripts -> alien-encounter.nars
        // Click scripts folder if needed (assuming auto-expand on root)

        // Look for file directly as we flatten or auto-expand?
        // ExampleBrowser renders tree.
        const fileBtn = page.locator('button.eb-file-btn[data-path="examples/scripts/alien-encounter.nars"]');
        // Ensure parent is open. The implementation opens directories by default?
        // "const details = FluentUI.create('details').prop({ open: true })" -> Yes.

        await expect(fileBtn).toBeVisible();
        await fileBtn.click();

        // Modal should close
        await expect(modal).not.toBeVisible();

        // Loading should start (remote file fetch)
        // Log: Fetching remote file: examples/scripts/alien-encounter.nars
        const logEntry = page.locator('.log-entry', { hasText: 'Fetching remote file' }).first();
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
