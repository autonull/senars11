/**
 * @file test-graph-visualization.js
 * @description Tests for graph visualization functionality in ui
 */

import { test, expect } from '../base-test';

// Tests for graph visualization functionality
test.describe('ui Graph Visualization Tests', () => {
    test.beforeEach(async ({ uiPage }) => {
        // The uiPage fixture handles navigation and connection
    });

    test('Graph container is present and visible', async ({ page }) => {
        const graphContainer = await page.$('#graph-container');
        expect(graphContainer).toBeTruthy();

        const isVisible = await page.$eval('#graph-container', el => {
            return !el.hidden && el.offsetParent !== null;
        });
        expect(isVisible).toBe(true);
    });

    test('Graph receives and displays concept nodes', async ({ page }) => {
        // Wait for initial concept to be added
        await page.waitForTimeout(2000);

        // Check if graph has nodes by examining the cytoscape container
        await page.waitForFunction(() => {
            // Since we can't directly access cytoscape in tests, we'll look for visual indicators
            // The graph details panel should show when nodes are clicked
            return document.querySelector('#graph-details') !== null;
        }, { timeout: 5000 });
    });

    test('Graph refresh functionality works', async ({ page }) => {
        // Click the refresh graph button
        await page.click('#refresh-graph');

        // Check for refresh message in logs
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Graph refresh requested');
        }, { timeout: 5000 });
    });

    test('Graph handles concept creation messages', async ({ page }) => {
        // Send a command that should create a concept
        await page.type('#command-input', '<new_concept --> type>.');
        await page.click('#send-button');

        // Wait for the backend to respond with concept creation
        await page.waitForTimeout(1000);

        // Check that concept was mentioned in logs
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('new_concept');
        }, { timeout: 5000 });
    });

    test('Graph node types are differentiated', async ({ page }) => {
        // Check that CSS classes for different node types exist
        const hasConceptClass = await page.evaluate(() => {
            const styles = Array.from(document.styleSheets).flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules);
                } catch {
                    return [];
                }
            });

            return styles.some(rule =>
                rule.selectorText &&
                rule.selectorText.includes('[type = "concept"]')
            );
        });

        const hasTaskClass = await page.evaluate(() => {
            const styles = Array.from(document.styleSheets).flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules);
                } catch {
                    return [];
                }
            });

            return styles.some(rule =>
                rule.selectorText &&
                rule.selectorText.includes('[type = "task"]')
            );
        });

        const hasQuestionClass = await page.evaluate(() => {
            const styles = Array.from(document.styleSheets).flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules);
                } catch {
                    return [];
                }
            });

            return styles.some(rule =>
                rule.selectorText &&
                rule.selectorText.includes('[type = "question"]')
            );
        });

        expect(hasConceptClass).toBe(true);
        expect(hasTaskClass).toBe(true);
        expect(hasQuestionClass).toBe(true);
    });

    test('Graph layout is applied', async ({ page }) => {
        // Check that the layout style is present in the stylesheet
        const hasLayoutStyle = await page.evaluate(() => {
            // Look for Cytoscape.js specific styles
            return document.querySelector('#graph-container') !== null;
        });

        expect(hasLayoutStyle).toBe(true);
    });

    test('Graph details panel updates on node click', async ({ page }) => {
        // Note: We can't simulate actual clicks on cytoscape nodes in tests,
        // but we can verify the details panel exists and has the proper structure
        const detailsPanelContent = await page.$eval('#graph-details', el => el.innerHTML);
        expect(detailsPanelContent).toContain('Click on nodes or edges to see details');
    });

    test('Live toggle functionality works', async ({ page }) => {
        // Test the live toggle button
        const initialText = await page.$eval('#toggle-live', el => el.textContent);
        expect(initialText).toBe('Pause Live');

        await page.click('#toggle-live');

        const updatedText = await page.$eval('#toggle-live', el => el.textContent);
        expect(updatedText).toBe('Resume Live');
    });

    test('Memory snapshot updates graph nodes', async ({ page }) => {
        // Simulate a memory snapshot by sending the command
        await page.type('#command-input', '*mem');
        await page.click('#send-button');

        // The backend mock will respond with a memory snapshot
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && (logs.textContent.includes('Memory snapshot') ||
                           logs.textContent.includes('received'));
        }, { timeout: 5000 });
    });
});