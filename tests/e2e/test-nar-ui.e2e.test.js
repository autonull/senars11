/**
 * @file tests/e2e/test-nar-ui.e2e.test.js
 * @description E2E tests for NAR UI using Playwright with real objects
 */

// Third-party imports
import { expect, test } from '@playwright/test';

// Local imports
// (none in this file)

// Test helper imports
// (none in this file)

test.describe('NAR UI E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the NAR UI
        await page.goto('http://localhost:8080');
    });

    test('should load the NAR UI and display main components', async ({ page }) => {
        // Wait for the UI to load
        await expect(page).toHaveTitle(/SeNARS/);
        
        // Check for main UI elements
        await expect(page.locator('#input')).toBeVisible();
        await expect(page.locator('#output')).toBeVisible();
        await expect(page.locator('#memory')).toBeVisible();
        
        // Verify that the main NAR connection is established
        await expect(page.locator('.status-indicator')).toContainText('connected');
    });

    test('should accept and process Narsese input', async ({ page }) => {
        // Input a simple Narsese statement
        await page.locator('#input').fill('(cat --> animal).');
        await page.locator('#submit-btn').click();
        
        // Wait for the response
        await page.waitForTimeout(1000);
        
        // Verify that the input was processed
        const output = await page.locator('#output').textContent();
        expect(output).toContain('cat');
    });

    test('should handle complex reasoning patterns', async ({ page }) => {
        // Input multiple statements for complex reasoning
        await page.locator('#input').fill('(bird --> flyer). %0.9;0.8%');
        await page.locator('#submit-btn').click();
        
        await page.waitForTimeout(500);
        
        await page.locator('#input').fill('(bird --> animal). %0.95;0.85%');
        await page.locator('#submit-btn').click();
        
        await page.waitForTimeout(1000);
        
        // Check that both statements are processed
        const memoryContent = await page.locator('#memory').textContent();
        expect(memoryContent).toContain('bird');
        expect(memoryContent).toContain('flyer');
        expect(memoryContent).toContain('animal');
    });
});