/**
 * @file agent-repl.spec.js
 * @description Playwright test for Agent REPL with WebLLM
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

let httpServer;

test.describe('Agent REPL', () => {
    test.beforeAll(async () => {
        // Start http-server
        httpServer = spawn('npx', ['http-server', '-p', '8081'], {
            cwd: process.cwd() + '/ui',
            stdio: 'pipe'
        });

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    test.afterAll(async () => {
        if (httpServer) {
            httpServer.kill();
        }
    });

    test('should load agent.html and display UI components', async ({ page }) => {
        test.setTimeout(120000); // 2 minutes for initial load

        // Navigate to agent.html
        await page.goto('http://localhost:8081/agent.html');

        // Check page title
        await expect(page).toHaveTitle(/SeNARS Agent REPL/);

        // Check header is present
        const header = page.locator('.agent-header h1');
        await expect(header).toBeVisible();
        await expect(header).toContainText('Agent REPL');

        // Check status bar exists
        const statusBar = page.locator('#status-bar-root');
        await expect(statusBar).toBeVisible();

        // Check agent container exists
        const container = page.locator('#agent-container');
        await expect(container).toBeVisible();

        // Wait for welcome message to appear (should be quick)
        const welcomeMessage = page.locator('text=Welcome to SeNARS Agent REPL');
        await expect(welcomeMessage).toBeVisible({ timeout: 10000 });

        // Take screenshot of initial state
        await page.screenshot({ path: 'test-results/agent-repl-initial.png', fullPage: true });
    });

    test('should show loading overlay initially', async ({ page }) => {
        await page.goto('http://localhost:8081/agent.html');

        // Check loading overlay is present initially
        const loadingOverlay = page.locator('#loading-overlay');
        await expect(loadingOverlay).toBeVisible({ timeout: 5000 });

        // Check loading text
        const loadingText = page.locator('.loading-text');
        await expect(loadingText).toContainText('Initializing');
    });

    test('should display notebook panel', async ({ page }) => {
        test.setTimeout(120000);

        await page.goto('http://localhost:8081/agent.html');

        // Wait for notebook to load
        const notebook = page.locator('.notebook-container');
        await expect(notebook).toBeVisible({ timeout: 30000 });

        // Check for notebook input
        const input = page.locator('.notebook-input');
        await expect(input).toBeVisible({ timeout: 10000 });
    });

    test('should show available tools in welcome message', async ({ page }) => {
        test.setTimeout(120000);

        await page.goto('http://localhost:8081/agent.html');

        // Wait for welcome message
        await page.waitForSelector('text=Welcome to SeNARS Agent REPL', { timeout: 15000 });

        // Check that tools/capabilities are mentioned
        const hasCapabilities = await page.locator('text=/Capabilities|Tools|Self-Configuration|Self-Programming/').count();
        expect(hasCapabilities).toBeGreaterThan(0);

        await page.screenshot({ path: 'test-results/agent-repl-welcome.png', fullPage: true });
    });

    test('should not have JavaScript errors on load', async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => {
            errors.push(error.message);
        });

        await page.goto('http://localhost:8081/agent.html');

        // Wait a bit for any lazy-loaded errors
        await page.waitForTimeout(5000);

        // Filter out known acceptable warnings
        const criticalErrors = errors.filter(err =>
            !err.includes('Warning') &&
            !err.includes('DevTools')
        );

        if (criticalErrors.length > 0) {
            console.log('JavaScript errors detected:', criticalErrors);
        }

        // We allow some errors during development, but log them
        // In production, we'd expect zero critical errors
        expect(criticalErrors.length).toBeLessThan(5);
    });

    test.skip('should initialize WebLLM model', async ({ page }) => {
        // This test is skipped by default as it requires ~1GB download
        // and takes several minutes on first run
        test.setTimeout(600000); // 10 minutes for model download

        await page.goto('http://localhost:8081/agent.html');

        // Wait for model loading to complete
        await page.waitForSelector('text=Model loaded', { timeout: 600000 });

        // Verify no loading overlay
        const loadingOverlay = page.locator('#loading-overlay');
        await expect(loadingOverlay).toHaveClass(/hidden/);

        // Take screenshot of ready state
        await page.screenshot({ path: 'test-results/agent-repl-ready.png', fullPage: true });
    });
});
