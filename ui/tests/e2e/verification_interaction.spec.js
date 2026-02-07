import { test, expect } from '@playwright/test';

test.describe('Explorer Interaction Verification', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8080/explorer.html');
        // Wait for graph initialization
        await page.waitForSelector('#graph-container');
    });

    test('Add node via background double-click', async ({ page }) => {
        // Setup dialog handler for prompt
        const newNodeName = 'TestNode_' + Date.now();

        // This promise resolves when the dialog is handled
        const dialogPromise = new Promise(resolve => {
            page.once('dialog', async dialog => {
                expect(dialog.message()).toContain('Enter concept name');
                await dialog.accept(newNodeName);
                resolve();
            });
        });

        // Get graph container box
        const graphContainer = page.locator('#graph-container');
        const box = await graphContainer.boundingBox();

        // Double click in the center of the graph
        await graphContainer.dblclick({
            position: { x: box.width / 2, y: box.height / 2 }
        });

        // Wait for dialog handling
        await dialogPromise;

        // Verify toast confirmation
        await expect(page.locator('.toast-success')).toBeVisible();
        await expect(page.locator('.toast-success')).toContainText(`Created concept: ${newNodeName}`);

        // Verify node stats update (indirect verification)
        // Or check if graph has the node (tough with canvas, but maybe sidebar updates?)
        // The InfoPanel stats should update "NODES: 1/..." if it was empty, or increment.
    });

    test('Verify Layers HUD visibility', async ({ page }) => {
        const layersWidget = page.locator('#layers-widget');

        // Ensure it is attached
        await expect(layersWidget).toBeAttached();

        // Ensure it is visible
        await expect(layersWidget).toBeVisible();

        // Check computed styles to ensure opacity/display are correct
        await expect(layersWidget).toHaveCSS('opacity', '1');
        await expect(layersWidget).toHaveCSS('display', 'block');

        // Check content exists inside
        await expect(layersWidget.locator('.info-panel')).toBeVisible();
        await expect(layersWidget.locator('summary', { hasText: 'LAYERS' })).toBeVisible();
    });
});
