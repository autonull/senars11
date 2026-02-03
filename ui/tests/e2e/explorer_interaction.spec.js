import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer Advanced Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/explorer.html');
        await page.click('.mode-btn[data-mode="control"]');
    });

    test('should support drag and drop indicators', async ({ page }) => {
        // We can't easily simulate native drag/drop in Playwright effectively for file content without complex hacks,
        // but we can verify the event listeners toggle the class 'dragging-over' if we trigger events manually.

        await page.evaluate(() => {
            const dragOverEvent = new Event('dragover', { bubbles: true });
            document.body.dispatchEvent(dragOverEvent);
        });

        await expect(page.locator('body')).toHaveClass(/dragging-over/);

        await page.evaluate(() => {
            const dragLeaveEvent = new Event('dragleave', { bubbles: true });
            document.body.dispatchEvent(dragLeaveEvent);
        });

        await expect(page.locator('body')).not.toHaveClass(/dragging-over/);
    });

    test('should allow editing complex properties in inspector', async ({ page }) => {
        // Add a node with complex data
        await page.evaluate(() => {
            window.Explorer.graph.addNode({
                id: 'ComplexNode',
                term: 'ComplexNode',
                budget: { priority: 0.8, durability: 0.5, quality: 0.9 },
                truth: { frequency: 1.0, confidence: 0.9 }
            }, true);
        });

        // Click the node to inspect
        // Note: graph click in Playwright on canvas is hard, so we simulate the event handler logic directly
        await page.evaluate(() => {
             const node = window.Explorer.graph.cy.$id('ComplexNode');
             const data = node.data();
             // Simulate the logic in ExplorerApp which spreads fullData
             window.Explorer.showInspector({
                 id: 'ComplexNode',
                 ...data,
                 ...(data.fullData || {})
             });
        });

        const inspector = page.locator('#inspector-panel');
        await expect(inspector).toBeVisible();

        // Check if nested fields are rendered
        await expect(inspector.locator('input[data-path="budget.priority"]')).toHaveValue('0.8');
        await expect(inspector.locator('input[data-path="truth.confidence"]')).toHaveValue('0.9');

        // Edit a value
        await inspector.locator('input[data-path="budget.priority"]').fill('0.95');
        await page.click('#btn-inspector-save');

        // Verify update in graph data
        const newPriority = await page.evaluate(() => {
            const node = window.Explorer.graph.cy.$id('ComplexNode');
            return node.data('fullData')?.budget?.priority;
        });

        expect(newPriority).toBe(0.95);
    });
});
