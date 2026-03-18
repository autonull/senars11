import { test, expect } from '@playwright/test';

test.describe('SeNARS Complex Interaction & HUD Verification', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto('/explorer.html');
        // Wait for graph
        await expect(page.locator('#graph-container canvas').first()).toBeVisible({ timeout: 10000 });
        await page.waitForFunction(() => window.Explorer && window.Explorer.graph);
    });

    test('should handle reasoning chain and maintain HUD visibility', async ({ page }) => {
        // 1. Inject Reasoning Chain
        await page.evaluate(() => {
            const app = window.Explorer;
            // A --> B
            app.handleReplCommand('<Cat --> Animal>.');
            // B --> C
            app.handleReplCommand('<Animal --> Living>.');

            // Simulate derivation (normally comes from backend, we inject manually for UI test)
            // Derived: Cat --> Living
            const derivedTask = {
                term: '<Cat --> Living>',
                type: 'belief',
                budget: { priority: 0.8, durability: 0.8, quality: 0.8 },
                truth: { frequency: 1.0, confidence: 0.81 },
                derivation: {
                    rule: 'Deduction',
                    sources: ['<Cat --> Animal>', '<Animal --> Living>'],
                    input: { term: '<Cat --> Animal>' },
                    knowledge: { term: '<Animal --> Living>' }
                }
            };

            // Trigger derivation event
            app._onDerivation({
                task: { term: '<Cat --> Animal>' },
                belief: { term: '<Animal --> Living>' },
                derivedTask: derivedTask,
                inferenceRule: 'Deduction'
            });
        });

        // 2. Verify Graph Nodes
        await page.waitForTimeout(1000); // Allow layout
        const nodeCount = await page.evaluate(() => window.Explorer.graph.cy.nodes().length);
        console.log(`Graph Node Count: ${nodeCount}`);
        expect(nodeCount).toBeGreaterThanOrEqual(3); // Cat, Animal, Living (maybe compound nodes too)

        // 3. Select Derived Node
        await page.evaluate(() => {
            window.Explorer.graph.flyTo('<Cat --> Living>');
        });
        await page.waitForTimeout(1000);

        // 4. Verify Inspector (Derivation Trace)
        const inspector = page.locator('#inspector-panel');
        await expect(inspector).toBeVisible();
        await expect(inspector.locator('h4:has-text("Derivation Trace")')).toBeVisible();

        // Check that the derivation graph has nodes (we can't easily check canvas text via CSS)
        const ruleNodeExists = await page.evaluate(() => {
            // Find the widget instance or query the DOM
            // Since we can't easily access the widget instance, we check if the canvas exists
            return document.querySelector('#inspector-panel canvas') !== null;
        });
        expect(ruleNodeExists).toBeTruthy();

        // 5. Verify HUD Widgets Persistence
        // Layers/Info Panel
        await expect(page.locator('.info-panel')).toBeVisible();
        // Log Panel
        await expect(page.locator('#log-widget')).toBeVisible();
        // Task Browser
        await expect(page.locator('.task-browser')).toBeVisible();
        // Task Browser Content
        await expect(page.locator('.concept-term:has-text("<Cat --> Living>")')).toBeVisible();

        // 6. Test Layout Freeze (Future Step Verification)
        // Check if we can toggle layout updates (simulating user need)
        // For now, just ensure the UI didn't crash
        await page.screenshot({ path: 'screenshots/complex-reasoning-hud.png' });
    });
});
