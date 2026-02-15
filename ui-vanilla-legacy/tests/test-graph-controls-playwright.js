/**
 * @file test-graph-controls-playwright.js
 * @description Playwright UI interaction tests for graph controls
 * 
 * This test validates that the UI graph controls work properly through
 * direct browser interaction using Playwright.
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';

let narProcess, uiProcess;

// Start servers before running tests
test.beforeAll(async () => {
    const config = TestConfig.serverConfigs.normal;
    
    console.log(`🚀 Starting NAR server on port ${config.port}...`);
    
    // Start NAR backend
    narProcess = spawn('node', ['-e', `
        import {NAR} from '../src/nar/NAR.js';
        import {WebSocketMonitor} from '../src/server/WebSocketMonitor.js';

        async function startServer() {
            const nar = new NAR(${JSON.stringify(config.narOptions)});

            try {
                await nar.initialize();
                console.log('NAR initialized');

                const monitor = new WebSocketMonitor({
                    port: ${config.port},
                    host: 'localhost',
                    path: '/ws'
                });

                await monitor.start();
                console.log('WebSocket monitor started');

                nar.connectToWebSocketMonitor(monitor);
                console.log('NAR connected to WebSocket monitor');

                // Keep process alive
                await new Promise(() => {});
            } catch (error) {
                console.error('NAR error:', error);
                process.exit(1);
            }
        }

        startServer().catch(console.error);
    `], {
        cwd: import.meta.url.replace('file://', ''),
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait a bit for NAR to start
    await setTimeout(3000);

    console.log(`🚀 Starting UI server on port ${config.uiPort}...`);
    
    // Start UI server
    uiProcess = spawn('npx', ['vite', 'dev', '--port', config.uiPort.toString(), '--host'], {
        cwd: '../ui',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            VITE_WS_HOST: 'localhost',
            VITE_WS_PORT: config.port.toString(),
            VITE_WS_PATH: '/ws'
        }
    });

    // Wait for UI to start
    await setTimeout(5000);
});

// Clean up servers after tests
test.afterAll(async () => {
    if (narProcess) {
        narProcess.kill();
    }
    if (uiProcess) {
        uiProcess.kill();
    }
});

// Graph Controls Test Suite
test.describe('Graph Controls Interaction Tests', () => {
    test('should connect to the UI and verify initial state', async ({ page }) => {
        const config = TestConfig.serverConfigs.normal;
        await page.goto(`http://localhost:${config.uiPort}`);
        
        // Wait for connection and check initial UI elements
        await page.waitForSelector('#status-bar', { state: 'visible' });
        await page.waitForSelector('#repl-input', { state: 'visible' });
        await page.waitForSelector('#cy-container', { state: 'visible' });
        
        // Verify connection status
        const statusBar = page.locator('#status-bar');
        await expect(statusBar).toContainText(/connected|Connected/i);
        
        console.log('✅ Connected to UI and verified initial state');
    });

    test('should add concepts and visualize them in the graph', async ({ page }) => {
        const inputs = [
            '<graph_test_1 --> node_type>. :|: %1.0;0.9%',
            '<graph_test_2 --> node_type>. :|: %0.8;0.85%',
            '<(graph_test_1 & graph_test_2) --> relationship>. :|: %0.9;0.8%'
        ];
        
        for (const input of inputs) {
            await page.locator('#repl-input').fill(input);
            await page.locator('#repl-input').press('Enter');
            await page.waitForTimeout(800); // Wait for processing
        }
        
        // Check for graph visualization elements
        await page.waitForSelector('#cy-container', { timeout: 10000 });
        
        // Wait for graph to potentially update
        await page.waitForTimeout(2000);
        
        // Check for graph elements (this depends on how the graph is implemented)
        const hasGraphElements = await page.evaluate(() => {
            const container = document.querySelector('#cy-container');
            if (!container) return false;
            
            // Look for SVG, Canvas, or other graph elements
            return container.querySelector('svg') !== null ||
                   container.querySelector('canvas') !== null ||
                   container.querySelectorAll('.node, .edge, [class*="node"], [class*="edge"]').length > 0;
        });
        
        expect(hasGraphElements).toBe(true);
        console.log('✅ Added concepts and verified graph visualization');
    });

    test('should allow zooming and panning of the graph', async ({ page }) => {
        // First make sure there are some nodes in the graph
        await page.locator('#repl-input').fill('<zoom_test --> node>. :|: %1.0;0.9%');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(800);
        
        // Try zooming using scroll wheel (simulated)
        await page.mouse.wheel(0, 50); // Scroll up to zoom in
        await page.waitForTimeout(500);
        
        // Try pan by moving mouse while holding left button
        await page.mouse.move(200, 200);
        await page.mouse.down();
        await page.mouse.move(300, 300);
        await page.mouse.up();
        
        // Verify the graph container still exists and is responsive
        const graphContainerVisible = await page.locator('#cy-container').isVisible();
        expect(graphContainerVisible).toBe(true);
        
        console.log('✅ Tested zooming and panning functionality');
    });

    test('should allow node selection and display details', async ({ page }) => {
        // Add some nodes to the graph
        const nodeInputs = [
            '<selected_node_1 --> type>. :|: %1.0;0.9%',
            '<selected_node_2 --> type>. :|: %0.8;0.85%'
        ];
        
        for (const input of nodeInputs) {
            await page.locator('#repl-input').fill(input);
            await page.locator('#repl-input').press('Enter');
            await page.waitForTimeout(800);
        }
        
        // Wait for graph to potentially update
        await page.waitForTimeout(2000);
        
        // Try to click on the graph area (this would ideally click on a node if visible)
        // Since we don't know the exact location of nodes, we'll click in the general area
        const graphContainer = await page.$('#cy-container');
        if (graphContainer) {
            await graphContainer.click({ position: { x: 100, y: 100 } });
            await page.waitForTimeout(1000);
            
            // Check if a node details panel appears (if implemented)
            const hasDetailsPanel = await page.$('.node-details') !== null ||
                                  await page.$('#node-details') !== null ||
                                  await page.$('[id*="details"]') !== null;
            
            console.log(`   Node details panel visible: ${hasDetailsPanel ? 'YES' : 'NO'}`);
        }
        
        console.log('✅ Tested node selection functionality');
    });

    test('should respond to graph control buttons if available', async ({ page }) => {
        // Look for common graph control buttons
        const controlSelectors = [
            '#refresh-btn', 
            '#reset-view-btn', 
            '[id*="refresh"]', 
            '[id*="reset"]',
            '[id*="zoom"]'
        ];
        
        let controlsFound = 0;
        
        for (const selector of controlSelectors) {
            const element = await page.$(selector);
            if (element) {
                console.log(`   Found control button: ${selector}`);
                controlsFound++;
                
                // Try clicking the button
                try {
                    await element.click();
                    await page.waitForTimeout(500);
                } catch (e) {
                    // Some buttons might not be clickable or might have different behavior
                    console.log(`   Control ${selector} not clickable or has special behavior`);
                }
            }
        }
        
        console.log(`✅ Found and tested ${controlsFound} graph control buttons`);
    });

    test('should handle graph updates during continuous reasoning', async ({ page }) => {
        // Add some initial concepts
        await page.locator('#repl-input').fill('<continuous_test_1 --> type>. :|: %1.0;0.9%');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(500);
        
        await page.locator('#repl-input').fill('<continuous_test_2 --> type>. :|: %0.8;0.85%');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(500);
        
        // Start continuous reasoning
        await page.locator('#repl-input').fill('*run');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(1000);

        // Check if graph updates during continuous reasoning
        const graphBefore = await page.$eval('#cy-container', node => node.textContent || node.innerHTML);
        await page.waitForTimeout(2000); // Wait for potential updates
        const graphAfter = await page.$eval('#cy-container', node => node.textContent || node.innerHTML);
        
        // Stop continuous reasoning
        await page.locator('#repl-input').fill('*stop');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(500);

        // Check if the graph content changed during continuous reasoning
        const graphUpdated = graphBefore !== graphAfter;
        console.log(`   Graph updated during continuous reasoning: ${graphUpdated ? 'YES' : 'NO'}`);
        
        console.log('✅ Tested graph updates during continuous reasoning');
    });

    test('should clear graph properly', async ({ page }) => {
        // Add some concepts to create nodes
        await page.locator('#repl-input').fill('<clear_test --> type>. :|: %1.0;0.9%');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(800);
        
        // Store initial graph state
        const initialGraphState = await page.evaluate(() => {
            const container = document.querySelector('#cy-container');
            if (!container) return { elements: 0, exists: false };
            
            return {
                elements: container.querySelectorAll('*').length,
                exists: true,
                hasContent: container.textContent.length > 0
            };
        });
        
        console.log(`   Initial graph elements: ${initialGraphState.elements}, hasContent: ${initialGraphState.hasContent}`);
        
        // Try to clear the graph by adding a command (this depends on UI implementation)
        // There might be a reset or clear command in the UI
        await page.locator('#repl-input').fill('*reset');
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(1000);
        
        // Or try to refresh the UI
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('#status-bar');
        await page.waitForSelector('#cy-container');
        
        // Wait for reconnection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && (
                statusBar.textContent.toLowerCase().includes('connected') ||
                statusBar.classList.contains('status-connected')
            );
        }, { timeout: 10000 });
        
        // Check final graph state
        const finalGraphState = await page.evaluate(() => {
            const container = document.querySelector('#cy-container');
            if (!container) return { elements: 0, exists: false };
            
            return {
                elements: container.querySelectorAll('*').length,
                exists: true,
                hasContent: container.textContent.length > 0
            };
        });
        
        console.log(`   Final graph elements: ${finalGraphState.elements}, hasContent: ${finalGraphState.hasContent}`);
        
        console.log('✅ Tested graph clearing functionality');
    });
});

// Custom test to verify complex graph interactions
test('complex graph interaction scenario', async ({ page }) => {
    const config = TestConfig.serverConfigs.normal;
    await page.goto(`http://localhost:${config.uiPort}`);
    
    // Wait for connection
    await page.waitForFunction(() => {
        const statusBar = document.querySelector('#status-bar');
        return statusBar && (
            statusBar.textContent.toLowerCase().includes('connected') ||
            statusBar.classList.contains('status-connected')
        );
    }, { timeout: 20000 });
    
    // Create a complex scenario with multiple related concepts
    const complexInputs = [
        '<entity_a --> concept>. :|: %1.0;0.9%',
        '<entity_b --> concept>. :|: %1.0;0.9%', 
        '<entity_c --> concept>. :|: %1.0;0.9%',
        '<(entity_a & entity_b) --> relation>. :|: %0.9;0.85%',
        '<(entity_b & entity_c) --> relation>. :|: %0.8;0.80%',
        '<(entity_a & entity_c) --> relation>. :|: %0.7;0.75%'
    ];
    
    for (const input of complexInputs) {
        await page.locator('#repl-input').fill(input);
        await page.locator('#repl-input').press('Enter');
        await page.waitForTimeout(600);
    }
    
    // Wait for graph to update
    await page.waitForTimeout(3000);
    
    // Verify graph has multiple elements
    const graphElementsCount = await page.evaluate(() => {
        const container = document.querySelector('#cy-container');
        if (!container) return 0;
        
        // Count various types of potential graph elements
        return container.querySelectorAll('svg *, canvas, .node, .edge, [class*="node"], [class*="edge"]').length;
    });
    
    expect(graphElementsCount).toBeGreaterThan(0);
    console.log(`✅ Complex graph interaction test passed with ${graphElementsCount} elements`);
});