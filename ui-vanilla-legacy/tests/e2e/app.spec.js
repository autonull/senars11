import { test, expect } from '@playwright/test';

test('demo feature', async ({ page }) => {
  await page.goto('/');

  // Check for main components
  await expect(page.locator('#status-bar')).toBeVisible();
  await expect(page.locator('#repl-container')).toBeVisible();
  await expect(page.locator('#cy-container')).toBeVisible();
  await expect(page.locator('#demo-select')).toBeVisible();
  await expect(page.locator('#run-demo-btn')).toBeVisible();

  // Explicitly wait for the dropdown to be populated
  await expect(page.locator('#demo-select option')).toHaveCount(2, { timeout: 15000 });

  // Run the "Simple Inheritance" demo
  await page.selectOption('#demo-select', 'Simple Inheritance');
  await page.click('#run-demo-btn');

  // Wait for the graph to have the correct number of nodes
  await page.waitForFunction(() => {
    const cy = window.cy;
    return cy.nodes().length >= 4;
  }, { timeout: 10000 });

  // Check if graph has the correct nodes
  const nodes = await page.evaluate(() => {
    const cy = window.cy;
    return cy.nodes().map(node => node.data());
  });

  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes.some(node => node.label === 'cat')).toBe(true);
  expect(nodes.some(node => node.label === 'animal')).toBe(true);
  expect(nodes.some(node => node.label === 'lion')).toBe(true);
  expect(nodes.some(node => node.label === 'tiger')).toBe(true);
});
