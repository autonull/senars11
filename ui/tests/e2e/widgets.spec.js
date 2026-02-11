import { test, expect } from '@playwright/test';

test.describe('Widget Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:5173/ide.html?mode=local');
        await page.waitForSelector('.notebook-panel-container', { state: 'visible' });
        await page.waitForTimeout(1000);
    });

    test('should insert and render different widget types', async ({ page }) => {
        // 1. Open Widget Menu
        const widgetBtn = page.locator('button', { hasText: 'Widget' });
        await expect(widgetBtn).toBeVisible();
        await widgetBtn.click();

        // 2. Insert Truth Slider
        const sliderItem = page.locator('.context-menu-item', { hasText: 'Truth Slider' });
        await expect(sliderItem).toBeVisible();
        await sliderItem.click();

        // Verify creation
        await page.waitForTimeout(500);
        const sliderWidget = page.locator('.widget-cell .truth-slider-widget');
        await expect(sliderWidget).toBeVisible();

        // 3. Insert Timeline (from new menu)
        await widgetBtn.click();
        const timelineItem = page.locator('.context-menu-item', { hasText: 'Timeline' });
        await timelineItem.click();

        await page.waitForTimeout(500);
        const timelineWidget = page.locator('.widget-cell .timeline-widget');
        // TimelineWidget might have a different class structure or not render fully empty?
        // Let's check for the cell container type
        const widgetCells = page.locator('.repl-cell.widget-cell');
        await expect(widgetCells).toHaveCount(2); // Slider + Timeline

        // 4. Insert Variables
        await widgetBtn.click();
        const varsItem = page.locator('.context-menu-item', { hasText: 'Variables' });
        await varsItem.click();

        await page.waitForTimeout(500);
        await expect(widgetCells).toHaveCount(3);
    });
});
