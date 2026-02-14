import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Explorer CSV Import & Verification', () => {
    test('Should verify Explorer UI and Import CSV', async ({ page }) => {
        // 1. Navigate to Explorer
        console.log('Navigating to Explorer UI...');
        await page.goto('/explorer.html');
        await expect(page).toHaveTitle(/SeNARS Explorer/);

        // 2. Verify Graph Container
        await expect(page.locator('#graph-container')).toBeVisible();

        // 3. Verify Status Bar
        const statusBar = page.locator('.status-bar');
        await expect(statusBar).toBeVisible();

        // 4. Verify "Import Graph (CSV)..." button exists in menu
        const fileBtn = page.locator('.status-menu-btn', { hasText: 'File' });
        await fileBtn.click();
        const importBtn = page.locator('button[data-action="import-csv"]');
        await expect(importBtn).toBeVisible();

        // 5. Test Import Functionality (Mock File Upload)
        // We need to set up the event listener before clicking or triggering
        const fileContent = "source,target,type\nConceptA,ConceptB,implication\nConceptB,ConceptC,similarity";

        // Handle file chooser
        const fileChooserPromise = page.waitForEvent('filechooser');
        await importBtn.click();
        const fileChooser = await fileChooserPromise;

        await fileChooser.setFiles({
            name: 'test-graph.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(fileContent)
        });

        // Close menu if open (clicking import closed it)
        // Wait for processing
        await page.waitForTimeout(1000);

        // 6. Verify Nodes Added
        // Use evaluate to check Cytoscape
        const result = await page.evaluate(() => {
            const cy = window.Explorer.graph.cy;
            return {
                nodes: cy.nodes().length,
                edges: cy.edges().length,
                nodeA: cy.$id('ConceptA').nonempty(),
                nodeB: cy.$id('ConceptB').nonempty(),
                nodeC: cy.$id('ConceptC').nonempty()
            };
        });

        console.log('Import Result:', result);
        expect(result.nodes).toBeGreaterThanOrEqual(3);
        expect(result.edges).toBeGreaterThanOrEqual(2);
        expect(result.nodeA).toBeTruthy();

        // 7. Verify Log Entry
        await expect(page.locator('.log-entry', { hasText: 'Imported' })).toBeVisible();

        // 8. Take Verification Screenshot
        const screenshotPath = path.resolve('ui/explorer-verification.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);
    });
});
