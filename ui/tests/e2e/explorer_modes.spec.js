import { test, expect } from '@playwright/test';

test.describe('SeNARS Explorer Modes', () => {

    test('Remote Mode (Default): Should load LMAgentController and support reasoning', async ({ page }) => {
        await page.goto('/explorer.html');

        // Verify "Online" status or "Config Required" (which means LMAgentController loaded but needs config)
        // It shouldn't be "Reasoner Only" or "Module Error"
        await expect(page.locator('#llm-status')).not.toHaveText('Reasoner Only', { timeout: 10000 });
        await expect(page.locator('#llm-status')).not.toHaveText('Module Error', { timeout: 10000 });

        // Switch to Control Mode to see the toolbar
        await page.click('.mode-btn[data-mode="control"]');
        await expect(page.locator('#control-toolbar')).not.toHaveClass(/hidden/);

        // Add a concept manually via UI
        await page.evaluate(() => {
             // Mock prompt to avoid blocking
             window.prompt = () => 'cat';
        });

        // Click Add Concept button
        await page.click('#btn-add-concept');

        // Verify node exists
        // Wait a bit for graph update
        await page.waitForTimeout(500);
        const hasCat = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.cy && window.Explorer.graph.cy.getElementById('cat').nonempty();
        });
        expect(hasCat).toBe(true);

        // Run Reasoner
        await page.click('#status-btn-run');
        // Pause button should become visible
        await expect(page.locator('#status-btn-pause')).toBeVisible();

        // Check if stats are updating (TPS > 0)
        await page.waitForTimeout(2000);

        // Wait for stats update
        await expect(page.locator('.status-bar')).toContainText(/TPS:\s*[0-9.]+/);

        // Stop Reasoner - NOTE: button is now in status bar, ID is status-btn-pause
        await page.click('#status-btn-pause');
        await expect(page.locator('#status-btn-run')).toBeVisible();

        // Verify Duplicate Controls are GONE
        // The old controls were in .reasoner-controls within #control-toolbar.
        // We removed .reasoner-controls or the buttons inside.
        const oldRunBtn = page.locator('#control-toolbar #btn-run');
        await expect(oldRunBtn).toHaveCount(0);
    });

    test('Live Reasoning: Direct Narsese Input via REPL', async ({ page }) => {
        await page.goto('/explorer.html');

        // Wait for initialization to complete (either Ready/Online or even Reasoner Only)
        // This ensures the NAR (or bridge) is actually available before we type.
        await expect(page.locator('#llm-status')).toHaveText(/Ready|Online|Reasoner Only/, { timeout: 20000 });

        // Input Narsese command
        const narsese = '<live --> reasoning>.';
        await page.fill('#status-repl-input', narsese);
        await page.press('#status-repl-input', 'Enter');

        // Verify node creation
        await page.waitForTimeout(2000); // Give a bit more time

        const debugInfo = await page.evaluate(() => {
            if (!window.Explorer) return { error: 'No Explorer' };
            const cy = window.Explorer.graph.cy;
            return {
                eventsBound: window.Explorer._narEventsBound,
                nodeIds: cy ? cy.nodes().map(n => n.id()) : [],
                hasLive: cy ? cy.getElementById('live').nonempty() : false,
                hasTerm: cy ? cy.getElementById('<live --> reasoning>').nonempty() : false
            };
        });

        console.log('Debug Info:', debugInfo);

        const logs = await page.locator('#log-content').innerText();
        console.log('DOM LOGS:', logs);

        // Expect events to be bound
        expect(debugInfo.eventsBound).toBe(true);

        // Expect at least one of the nodes to be present (the term or the constituent)
        // Note: Term format might be prefix like (--> ...), so we check if any node contains our content
        const found = debugInfo.nodeIds.some(id => id.includes('live') && id.includes('reasoning'));
        expect(found).toBe(true);

        // Verify reasoning/stats update
        await page.click('#status-btn-run');
        await page.waitForTimeout(1000);
        await expect(page.locator('.status-bar')).toContainText(/TPS:\s*[0-9.]+/);
    });

    test('Local Mode: Should fallback to AgentToolsBridge when LLM fails', async ({ page }) => {
        // Block LMAgentController to force fallback
        await page.route('**/LMAgentController.js', route => route.abort());

        await page.goto('/explorer.html');

        // Verify "Reasoner Only" status
        await expect(page.locator('#llm-status')).toHaveText('Reasoner Only', { timeout: 10000 });

        // Check for toast message
        // ToastManager creates elements, let's check for text on page
        await expect(page.locator('body')).toContainText('LLM unavailable - Running in Reasoner Only mode');

        // Switch to Control Mode to see the toolbar
        await page.click('.mode-btn[data-mode="control"]');
        await expect(page.locator('#control-toolbar')).not.toHaveClass(/hidden/);

        // Add a concept
         await page.evaluate(() => {
             window.prompt = () => 'dog';
        });
        await page.click('#btn-add-concept');

        // Verify node exists
        await page.waitForTimeout(500);
        const hasDog = await page.evaluate(() => {
            return window.Explorer && window.Explorer.graph.cy && window.Explorer.graph.cy.getElementById('dog').nonempty();
        });
        expect(hasDog).toBe(true);

        // Run Reasoner - use Status Bar controls
        await page.click('#status-btn-run');
        await expect(page.locator('#status-btn-pause')).toBeVisible();

        // Check if stats are updating
        await page.waitForTimeout(2000);
        await expect(page.locator('.status-bar')).toContainText(/TPS:\s*[0-9.]+/);

        // Stop Reasoner
        await page.click('#status-btn-pause');
    });
});
