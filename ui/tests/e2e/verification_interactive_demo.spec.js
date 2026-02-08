import { test, expect } from '@playwright/test';

test.describe('Explorer Interactive Demo Verification', () => {
    test('Load Smart Home Demo and interact with widgets', async ({ page }) => {
        // 1. Go to Explorer
        await page.goto('/explorer.html');
        await expect(page).toHaveTitle(/SeNARS Explorer/);

        // 2. Select Smart Home Control Demo
        const demoSelect = page.locator('#demo-select');
        await demoSelect.waitFor({ state: 'visible' });
        await demoSelect.selectOption({ label: 'Smart Home Control' });

        // Wait for graph
        await expect(page.locator('.toast-success')).toContainText('Demo loaded: Smart Home Control', { timeout: 10000 });

        await page.waitForTimeout(2000);

        // 3. Zoom in to see widgets (LOD 2 trigger is > 1.0 zoom)
        const zoomInBtn = page.locator('button[title="In"]');
        await zoomInBtn.click({ force: true });
        await page.waitForTimeout(500);
        await zoomInBtn.click({ force: true });
        await page.waitForTimeout(1000);

        // Screenshot 1: Overview
        await page.screenshot({ path: 'ui/screenshots/interactive_overview.png', fullPage: true });

        // 4. Verify Widget Rendering
        // Widgets are in .zui-widget elements
        const livingRoomWidget = page.locator('.zui-widget', { hasText: 'Living Room' });
        await expect(livingRoomWidget).toBeVisible();

        // 5. Interact with Slider
        const slider = livingRoomWidget.locator('input[type="range"]');
        await expect(slider).toBeVisible();
        await slider.fill('75');
        await slider.dispatchEvent('input');

        const tempVal = livingRoomWidget.locator('#lr-temp-val');
        await expect(tempVal).toHaveText('75');

        // Screenshot 2: Interaction
        await page.screenshot({ path: 'ui/screenshots/interactive_slider.png', fullPage: true });

        // 6. Verify Security Widget
        const securityWidget = page.locator('.zui-widget', { hasText: 'Security' });
        await expect(securityWidget).toBeVisible();
        await expect(securityWidget).toContainText('ARMED');
    });
});
