import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer REPL & Edges', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/explorer.html');
    });

    test('should show REPL input and echo commands', async ({ page }) => {
        await expect(page.locator('#repl-input')).toBeVisible();

        // Type a command
        await page.fill('#repl-input', '/help');
        await page.press('#repl-input', 'Enter');

        // Check log for echo and system response
        const logContent = page.locator('#log-content');
        await expect(logContent).toContainText('> /help');
        await expect(logContent).toContainText('Available commands: /clear, /help');
    });

    test('should render edges with specific visual properties', async ({ page }) => {
        // Wait for graph
        await expect(page.locator('#graph-container canvas').first()).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(2000); // Wait for layout

        // We can't easily check canvas pixels for edge styles in a generic way without visual regression tools
        // But we can check if the underlying Cytoscape instance has the edges

        const edgeCount = await page.evaluate(() => {
            const cy = window.Explorer.graph.viewport.cy;
            return cy.edges().length;
        });

        // We added 4 explicit edges
        expect(edgeCount).toBeGreaterThanOrEqual(4);

        // Check for specific edge types in data
        const hasInheritance = await page.evaluate(() => {
            const cy = window.Explorer.graph.viewport.cy;
            const edges = cy.edges('[label="inheritance"]');
            return edges.nonempty();
        });
        expect(hasInheritance).toBeTruthy();
    });
});
