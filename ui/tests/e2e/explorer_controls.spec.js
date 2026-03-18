import { test, expect } from '@playwright/test';

test.describe('Explorer Controls & Features', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err));

    // Navigate to Explorer
    await page.goto('/explorer.html');

    // Wait for graph initialization (canvas)
    await page.waitForSelector('#graph-container canvas', { timeout: 10000 });
    // Wait for Status Bar
    await page.waitForSelector('.status-bar');
  });

  test('should display stats', async ({ page }) => {
    const stats = page.locator('#status-nodes');
    await expect(stats).toBeVisible();
    await expect(stats).toHaveText(/Nodes: \d+\/\d+/);
  });

  test('should have demo controls', async ({ page }) => {
    const select = page.locator('#demo-select');
    await expect(select).toBeVisible();

    // Check for Solar System option
    const content = await select.textContent();
    expect(content).toContain('Solar System');
  });

  test('should search for a node', async ({ page }) => {
    // 1. Ensure 'Sun' exists (Solar System demo is default)
    // 2. Type 'Sun' in search
    await page.fill('#search-input', 'Sun');
    await page.press('#search-input', 'Enter');

    // 3. Check Log for "Found: Sun"
    const logEntry = page.locator('.log-entry', { hasText: 'Found: Sun' }).first();
    await expect(logEntry).toBeVisible();

    // 4. Search for non-existent
    await page.fill('#search-input', 'NonExistentXYZ');
    await page.press('#search-input', 'Enter');
    const logEntry2 = page.locator('.log-entry', { hasText: 'Not found: NonExistentXYZ' }).first();
    await expect(logEntry2).toBeVisible();
  });

  test('should clear graph', async ({ page }) => {
    // Click Clear
    await page.click('#btn-clear');

    // Verify Log
    const logEntry = page.locator('.log-entry', { hasText: 'Workspace cleared' }).first();
    await expect(logEntry).toBeVisible();
  });

  test('should inspect node on click', async ({ page }) => {
    // We can't easily click canvas coordinates reliably without knowing layout.
    // So we use the exposed API to simulate inspection, verifying the UI response.
    await page.evaluate(() => {
        window.Explorer.showInspector({ id: 'TestNode', priority: 0.99, type: 'concept' });
    });

    const inspector = page.locator('#inspector-panel');
    // Ensure inspector is visible
    if (await inspector.isHidden()) {
        await page.click('#toggle-inspector');
    }

    await expect(inspector).not.toHaveClass(/hidden/);
    await expect(page.locator('#inspector-content')).toContainText('TestNode');
  });

  test('should allow gardening (Add Concept)', async ({ page }) => {
      // 1. Open Edit Menu
      await page.click('button.status-menu-btn:has-text("Edit")');

      // 2. Add Concept
      // Mock prompt
      page.on('dialog', async dialog => {
          if (dialog.message().includes('concept name')) {
              await dialog.accept('GardenedNode');
          } else if (dialog.message().includes('Delete')) {
              await dialog.accept();
          }
      });

      await page.click('button[data-action="add-concept"]');

      // Check if node added
      const logEntry = page.locator('.log-entry', { hasText: 'Created concept: GardenedNode' }).first();
      await expect(logEntry).toBeVisible();
  });

  test('should edit node properties in inspector', async ({ page }) => {
      // 1. Add node programmatically to be safe
      await page.evaluate(() => {
          window.Explorer.graph.addNode({ id: 'EditMeNode', term: 'EditMeNode', budget: { priority: 0.5 } }, true);
      });

      // 2. Switch to Control Mode
      await page.click('.mode-btn[data-mode="control"]');

      // 3. Inspect
      await page.evaluate(() => {
          window.Explorer.showInspector({ id: 'EditMeNode', budget: { priority: 0.5 }, type: 'concept' });
      });
      // Open inspector
      const inspector = page.locator('#inspector-panel');
      if (await inspector.isHidden()) {
          await page.click('#toggle-inspector');
      }

      // 4. Verify Inputs exist
      // Using data-path as ID is not present
      const priorityInput = page.locator('input[data-path="budget.priority"]');
      await expect(priorityInput).toBeVisible();

      // 5. Change Value
      await priorityInput.fill('0.88');

      // 6. Save
      await page.click('#btn-inspector-save');
      const logEntry = page.locator('.log-entry', { hasText: 'Updated node EditMeNode' }).first();
      await expect(logEntry).toBeVisible();

      // 7. Verify internal data update
      const storedPriority = await page.evaluate(() => {
          // Check graph bag or cy data
          const node = window.Explorer.graph.cy.$id('EditMeNode');
          if (node.empty()) return 'NODE_NOT_FOUND';
          const data = node.data();
          if (data.budget) return data.budget.priority;
          if (data.fullData && data.fullData.budget) return data.fullData.budget.priority;
          return 'BUDGET_MISSING';
      });
      expect(storedPriority).toBe(0.88);
  });

  // --- New Tests ---

  test('Verify Theme Persistence', async ({ page }) => {
      // Default (dark)
      await expect(page.locator('body')).not.toHaveClass(/light-theme/);

      // Toggle Programmatically
      await page.evaluate(() => window.Explorer._toggleTheme());
      await expect(page.locator('body')).toHaveClass(/light-theme/);

      // Reload
      await page.reload();
      await page.waitForSelector('.status-bar');

      // Should still be light
      await expect(page.locator('body')).toHaveClass(/light-theme/);

      // Toggle back
      await page.evaluate(() => window.Explorer._toggleTheme());
      await expect(page.locator('body')).not.toHaveClass(/light-theme/);
  });

  test('Verify Export PNG Functionality', async ({ page }) => {
      // Add a node so we have something to export
      await page.evaluate(() => {
          if (window.Explorer && window.Explorer.graph) {
              window.Explorer.graph.addNode({ id: 'ExportNode', term: 'ExportNode' }, true);
          }
      });
      await page.waitForTimeout(500);

      // Trigger export programmatically to verify logic
      await page.evaluate(() => window.Explorer.handleExportImage('png'));

      // Check for success log/toast
      const successMsg = page.locator('.log-entry.log-success', { hasText: 'Graph exported as PNG' });
      await expect(successMsg).toBeVisible({ timeout: 5000 });
  });

  test('Verify Fullscreen Toggle', async ({ page }) => {
      // Open View Menu
      await page.click('button.status-menu-btn:has-text("View")');

      const fsBtn = page.locator('button[data-action="fullscreen"]');
      await expect(fsBtn).toBeVisible();

      await fsBtn.click();
      // Just ensure no crash
      await page.waitForTimeout(500);
  });
});
