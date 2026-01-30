import { test, expect } from '@playwright/test';

test.describe('ZUI Integration', () => {
    test('ZUI Panel Loads and Syncs', async ({ page }) => {
        // Listen to console logs
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));

        // 1. Load IDE with ZUI layout
        await page.goto('/ide.html?layout=zui');

        // 2. Verify ZUI Panel exists
        await expect(page.locator('.zui-panel')).toBeVisible();

        const container = page.locator('#zui-graph-container');
        await expect(container).toBeVisible();

        // 3. Verify Cytoscape initialized
        // Use evaluate to check if canvas is really there and cy is initialized
        const cyInit = await page.evaluate(() => {
             const app = window.SeNARSIDE;
             const zuiComp = app.components.get('zui');
             return !!(zuiComp && zuiComp.graph && zuiComponent.graph.viewport.cy);
        }).catch(() => false);

        if (!cyInit) {
            console.log("Cytoscape instance missing on first check.");
        }

        // Wait a bit
        await page.waitForTimeout(2000);

        // 4. Deep Inspection: Access internal Cytoscape state
        const graphState = await page.evaluate(() => {
            const app = window.SeNARSIDE;
            const zuiComponent = app.components.get('zui');

            if (!zuiComponent) return { error: 'ZUI Component not found' };
            if (!zuiComponent.graph) return { error: 'ActivityGraph not found in component' };
            if (!zuiComponent.graph.viewport) return { error: 'Viewport not found' };
            if (!zuiComponent.graph.viewport.cy) {
                 // Try to return info about container
                 const container = zuiComponent.graph.viewport.container;
                 return {
                     error: 'Cytoscape instance not found',
                     containerType: typeof container,
                     containerIsElement: container instanceof HTMLElement,
                     containerConnected: container instanceof HTMLElement ? container.isConnected : false
                 };
            }

            const cy = zuiComponent.graph.viewport.cy;

            return {
                nodes: cy.nodes().length,
                edges: cy.edges().length,
                width: cy.width(),
                height: cy.height(),
                zoom: cy.zoom(),
                pan: cy.pan(),
                extent: cy.extent()
            };
        });

        console.log('Graph State:', JSON.stringify(graphState, null, 2));

        if (graphState.error) {
             throw new Error(graphState.error);
        }

        expect(graphState.nodes).toBeGreaterThan(0);
        expect(graphState.edges).toBeGreaterThan(0);

        await page.screenshot({ path: 'zui-verification.png' });
    });
});
