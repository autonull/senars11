import { test, expect } from '@playwright/test';

test.describe('Explorer Controls & Features', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err));

    // Navigate to Explorer
    await page.goto('/explorer.html');

    // Wait for graph initialization (canvas)
    await page.waitForSelector('#graph-container canvas', { timeout: 10000 });
  });

  test('should display bag stats', async ({ page }) => {
    const stats = page.locator('#bag-stats');
    await expect(stats).toBeVisible();
    await expect(stats).toHaveText(/Bag: \d+ \/ 50/);
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
    const log = page.locator('#log-content');
    await expect(log).toContainText('Found: Sun');

    // 4. Search for non-existent
    await page.fill('#search-input', 'NonExistentXYZ');
    await page.press('#search-input', 'Enter');
    await expect(log).toContainText('Not found: NonExistentXYZ');
  });

  test('should clear graph', async ({ page }) => {
    // Initial state: Bag should have items
    await expect(page.locator('#bag-stats')).not.toHaveText('Bag: 0 / 50');

    // Click Clear
    await page.click('#btn-clear');

    // Verify Bag is empty
    await expect(page.locator('#bag-stats')).toHaveText('Bag: 0 / 50');

    // Verify Log
    const log = page.locator('#log-content');
    await expect(log).toContainText('Cleared workspace');
  });

  test('should inspect node on click', async ({ page }) => {
    // We can't easily click canvas coordinates reliably without knowing layout.
    // So we use the exposed API to simulate inspection, verifying the UI response.
    await page.evaluate(() => {
        window.Explorer.showInspector({ id: 'TestNode', priority: 0.99, type: 'concept' });
    });

    const inspector = page.locator('#inspector-panel');
    await expect(inspector).not.toHaveClass(/hidden/);
    await expect(page.locator('#inspector-content')).toContainText('TestNode');

    // Close it
    await page.click('#btn-close-inspector');
    await expect(inspector).toHaveClass(/hidden/);
  });

  test('should allow gardening in control mode', async ({ page }) => {
      // 1. Switch to Control Mode
      await page.click('.mode-btn[data-mode="control"]');
      const toolbar = page.locator('#control-toolbar');
      await expect(toolbar).not.toHaveClass(/hidden/);

      // 2. Add Concept
      // Mock prompt
      page.on('dialog', async dialog => {
          if (dialog.message().includes('concept name')) {
              await dialog.accept('GardenedNode');
          } else if (dialog.message().includes('Delete')) {
              await dialog.accept();
          }
      });

      await page.click('#btn-add-concept');

      // Check if node added
      const log = page.locator('#log-content');
      await expect(log).toContainText('Created concept: GardenedNode');

      // 3. Verify it's searchable
      await page.fill('#search-input', 'GardenedNode');
      await page.press('#search-input', 'Enter');
      await expect(log).toContainText('Found: GardenedNode');
  });

  test('should edit node properties in inspector', async ({ page }) => {
      // 1. Switch to Control Mode
      await page.click('.mode-btn[data-mode="control"]');

      // 2. Mock adding a node to inspect
      page.on('dialog', async dialog => {
          if (dialog.message().includes('concept name')) {
              await dialog.accept('EditMeNode');
          }
      });
      await page.click('#btn-add-concept');

      // 3. Select/Inspect the node via search
      await page.fill('#search-input', 'EditMeNode');
      await page.press('#search-input', 'Enter');

      // 4. Verify Inputs exist
      const priorityInput = page.locator('#insp-input-priority');
      await expect(priorityInput).toBeVisible();

      // 5. Change Value
      await priorityInput.fill('0.888');

      // 6. Save
      await page.click('#btn-inspector-save');
      const log = page.locator('#log-content');
      await expect(log).toContainText('Updated node EditMeNode');

      // 7. Verify internal data update
      const storedPriority = await page.evaluate(() => {
          return window.Explorer.graph.bag.items.get('EditMeNode').priority;
      });
      expect(storedPriority).toBe(0.888);
  });
});
