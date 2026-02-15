/**
 * @file e2e.test.js
 * @description End-to-end tests for UI features using Playwright
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

// End-to-end tests for UI
// Note: These tests are configured in playwright.config.js and run with `npx playwright test`

test.describe('UI End-to-End Tests', () => {
    let serverProcess = null;
    let mockBackendProcess = null;

    const uiPort = 8094;
    const wsPort = 8095;

    test.beforeAll(async () => {
        // Start a mock backend server to simulate the NARS backend
        mockBackendProcess = spawn('node', ['-e', `
            import { WebSocketServer } from 'ws';

            const wss = new WebSocketServer({ port: ${wsPort} });

            console.log('Mock backend server listening on ws://localhost:${wsPort}');

            wss.on('connection', (ws) => {
                console.log('Mock backend: client connected');

                ws.on('message', (message) => {
                    console.log('Mock backend: received:', message.toString());
                    const parsed = JSON.parse(message.toString());

                    // Respond to different message types like a real backend would
                    let response;
                    switch (parsed.type) {
                        case 'narseseInput':
                            response = {
                                type: 'narsese.result',
                                payload: { result: '✅ Processed: ' + parsed.payload.input }
                            };
                            break;
                        case 'requestNAR':
                            response = {
                                type: 'narInstance',
                                payload: { cycleCount: 100, isRunning: true }
                            };
                            break;
                        default:
                            response = {
                                type: 'info',
                                payload: { message: 'Received: ' + parsed.type }
                            };
                    }

                    ws.send(JSON.stringify(response));
                });

                // Send periodic updates like a real backend might
                const interval = setInterval(() => {
                    ws.send(JSON.stringify({
                        type: 'info',
                        payload: { message: 'Periodic update ' + Date.now() }
                    }));
                }, 5000);

                ws.on('close', () => {
                    clearInterval(interval);
                    console.log('Mock backend: client disconnected');
                });
            });
        `], {
            stdio: 'pipe',
            shell: true
        });

        // Wait for mock backend to start
        await setTimeout(2000);

        // Start the UI server
        serverProcess = spawn('node', ['server.js'], {
            cwd: './',
            stdio: 'pipe',
            env: {
                ...process.env,
                HTTP_PORT: uiPort.toString(),
                WS_PORT: wsPort.toString()
            }
        });

        // Wait for UI server to start
        await setTimeout(2000);
    });

    test.afterAll(async () => {
        // Clean up processes
        if (mockBackendProcess) {
            mockBackendProcess.kill();
        }
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    test('UI loads and connects to WebSocket', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for WebSocket connection to be established
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Verify the UI loaded properly
        await expect(page).toHaveTitle('SeNARS UI');

        // Verify connection status shows as connected
        const connectionStatus = await page.locator('#connection-status').textContent();
        expect(connectionStatus.toLowerCase()).toContain('connected');

        // Verify status indicator has the correct class
        await expect(page.locator('#status-indicator')).toHaveClass(/status-connected/);
    });

    test('Command input functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Test entering and sending a command
        await page.fill('#command-input', '<bird --> flyer>.');
        await page.click('#send-button');

        // Check that the command appears in the logs
        await expect(page.locator('#logs-container')).toContainText('> <bird --> flyer>.');
    });

    test('Quick commands functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Select a quick command from the dropdown and execute
        await page.locator('#quick-commands').selectOption('<cat --> animal> .');
        await page.click('#exec-quick');

        // Verify the quick command was executed
        await expect(page.locator('#logs-container')).toContainText('<cat --> animal>');
    });

    test('Debug commands work', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Test the /help command
        await page.fill('#command-input', '/help');
        await page.click('#send-button');

        // Verify help text appears in logs
        await expect(page.locator('#logs-container')).toContainText('Available debug commands:');

        // Test /state command
        await page.fill('#command-input', '/state');
        await page.click('#send-button');

        await expect(page.locator('#logs-container')).toContainText('Connection:');
    });

    test('Graph controls functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Test refresh graph button
        await page.click('#refresh-graph');

        // Check that a message was sent
        await expect(page.locator('#logs-container')).toContainText('Graph refresh requested');
    });

    test('Demo functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Select and run a demo
        await page.locator('#demo-select').selectOption('inheritance');
        await page.click('#run-demo');

        // Check that demo commands start appearing in logs
        await expect(page.locator('#logs-container')).toContainText('Running inheritance demo');
    });

    test('Clear logs functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Add some content to logs first
        await page.fill('#command-input', '<test --> command>.');
        await page.click('#send-button');

        // Wait for the log to appear
        await expect(page.locator('#logs-container')).toContainText('> <test --> command>.');

        // Then clear the logs
        await page.click('#clear-logs');

        // Check for the clear message
        await expect(page.locator('#logs-container')).toContainText('Cleared logs');
    });

    test('History functionality', async ({ page }) => {
        // Navigate to the UI
        await page.goto(`http://localhost:${uiPort}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        // Wait for connection
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('#connection-status');
            return statusElement && statusElement.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });

        // Execute a few commands first
        await page.fill('#command-input', '<first --> command>.');
        await page.click('#send-button');
        await setTimeout(500);

        await page.fill('#command-input', '<second --> command>.');
        await page.click('#send-button');
        await setTimeout(500);

        // Click history button
        await page.click('#show-history');

        // Verify history appears in logs
        await expect(page.locator('#logs-container')).toContainText('Command History');
    });
});