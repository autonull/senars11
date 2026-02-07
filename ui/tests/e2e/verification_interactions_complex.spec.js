import { test, expect } from '@playwright/test';

test.describe('Explorer Complex Graph Interactions Verification', () => {
    test('Load Fractal Knowledge Demo and perform interactions', async ({ page }) => {
        // 1. Go to Explorer
        await page.goto('/explorer.html');
        await expect(page).toHaveTitle(/SeNARS Explorer/);

        // 2. Select Fractal Knowledge Demo
        const demoSelect = page.locator('#demo-select');
        await demoSelect.waitFor({ state: 'visible' });
        await demoSelect.selectOption({ label: 'Fractal Knowledge' });

        // Wait for generation toast
        await expect(page.locator('.toast-success')).toContainText('Generated: Fractal Knowledge', { timeout: 10000 });

        // Wait for graph layout to settle
        await page.waitForTimeout(3000);

        // Screenshot 1: Initial State
        await page.screenshot({ path: 'ui/screenshots/fractal_initial.png', fullPage: true });

        // 3. Zoom In Interaction (Simulated via button)
        // Targeting GraphPanel toolbar button by title="In"
        const zoomInBtn = page.locator('button[title="In"]');
        // Force click because sometimes status bar or other overlays might intercept in headless mode
        await zoomInBtn.click({ force: true });
        await page.waitForTimeout(500);
        await zoomInBtn.click({ force: true });
        await page.waitForTimeout(1000); // Wait for zoom animation

        // Screenshot 2: Zoomed In
        await page.screenshot({ path: 'ui/screenshots/fractal_zoomed.png', fullPage: true });

        // 4. Filter by Priority
        // Open View Settings details if not open
        const viewSettingsSummary = page.locator('summary', { hasText: 'VIEW SETTINGS' });
        await viewSettingsSummary.click();

        const prioritySlider = page.locator('#filter-priority');
        // Drag slider or set value. Setting value is easier.
        // The slider range is 0 to 1. Let's filter out low priority nodes.
        await prioritySlider.fill('0.5');
        // Trigger input event
        await prioritySlider.dispatchEvent('input');

        await page.waitForTimeout(1000); // Wait for filter to apply

        // Screenshot 3: Filtered
        await page.screenshot({ path: 'ui/screenshots/fractal_filtered.png', fullPage: true });

        // Reset Filter
        await prioritySlider.fill('0');
        await prioritySlider.dispatchEvent('input');
        await page.waitForTimeout(1000);

        // 5. Select a Node (Click 'Root')
        // We need to find the node. Since it's canvas, we can't click element directly.
        // But we can use the search feature to find and select it!
        const searchInput = page.locator('#search-input');
        await searchInput.fill('Root');
        await searchInput.press('Enter');

        await page.waitForTimeout(2000); // Wait for animation and selection

        // Verify Inspector is visible
        const inspector = page.locator('#inspector-panel');
        await expect(inspector).toBeVisible();
        await expect(inspector).toContainText('Root');

        // Screenshot 4: Node Selected
        await page.screenshot({ path: 'ui/screenshots/fractal_selected.png', fullPage: true });

        // 6. Change Layout to Grid
        const layoutSelect = page.locator('#layout-select');
        await layoutSelect.selectOption({ value: 'grid' });

        await page.waitForTimeout(3000); // Wait for layout animation

        // Screenshot 5: Grid Layout
        await page.screenshot({ path: 'ui/screenshots/fractal_grid.png', fullPage: true });
    });
});
