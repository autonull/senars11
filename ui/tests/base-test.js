import { test as base, expect } from '@playwright/test';

// Extend the base test with custom functionality
const test = base.extend({
  // Custom fixture to handle UI-specific setup
  uiPage: async ({ page }, use) => {
    // Navigate to the UI
    await page.goto('/');

    // Wait for connection to be established
    await page.waitForFunction(() => {
      const statusElement = document.querySelector('#connection-status');
      return statusElement?.textContent.toLowerCase().includes('connected') ?? false;
    }, { timeout: 15000 });

    await use(page);
  }
});

export { test, expect };