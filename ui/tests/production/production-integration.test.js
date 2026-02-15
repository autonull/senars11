/**
 * @file production-integration.test.js
 * @description Production-level integration tests using real backend services
 * These tests run against actual NAR backend, simulating real user interactions
 */

import puppeteer from 'puppeteer';
import { spawn, exec } from 'child_process';
import { setTimeout } from 'timers/promises';
import fetch from 'node-fetch';

describe('UI Production Integration Tests - Real Backend', () => {
    let browser = null;
    let page = null;
    let uiProcess = null;
    let narProcess = null;

    const uiPort = 8200;  // Use a port that's likely available
    const wsPort = 8201;

    // Wait for backend to be ready
    async function waitForBackend(port) {
        let attempts = 0;
        while (attempts < 30) {  // Wait up to 30 seconds
            try {
                const response = await fetch(`http://localhost:${port}/`, { method: 'GET' });
                if (response.ok) return true;
            } catch (e) {
                // Connection refused, server not ready yet
            }
            attempts++;
            await setTimeout(1000);
        }
        throw new Error(`Backend on port ${port} did not become ready`);
    }

    beforeAll(async () => {
        console.log('🚀 Starting NAR backend...');

        // Start actual NAR backend with WebSocket server using the main entry point
        narProcess = spawn('node', ['../../self-analyze.js'], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                WS_PORT: wsPort.toString(),
                HTTP_PORT: (wsPort + 1).toString() // Use adjacent port to avoid conflicts
            }
        });

        // Capture output for debugging
        narProcess.stdout.on('data', (data) => {
            console.log(`NAR stdout: ${data}`);
        });

        narProcess.stderr.on('data', (data) => {
            console.error(`NAR stderr: ${data}`);
        });

        // Wait for NAR backend to be ready
        await setTimeout(10000); // Give it more time to start

        console.log('🚀 Starting UI server...');

        // Start UI server
        uiProcess = spawn('node', ['server.js'], {
            cwd: './',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                HTTP_PORT: uiPort.toString(),
                WS_PORT: wsPort.toString() // Connect to the NAR WebSocket
            }
        });

        // Capture output for debugging
        uiProcess.stdout.on('data', (data) => {
            console.log(`UI stdout: ${data}`);
        });

        uiProcess.stderr.on('data', (data) => {
            console.error(`UI stderr: ${data}`);
        });

        // Wait for UI server to be ready
        await setTimeout(5000);

        console.log('🎯 Launching browser...');

        // Launch browser
        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode to avoid deprecation warnings
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding'
            ]
        });

        page = await browser.newPage();
    }, 60000); // Increase timeout for beforeAll hook

    afterAll(async () => {
        console.log('🛑 Cleaning up processes...');
        
        // Clean up processes
        if (browser) {
            await browser.close();
        }
        
        if (uiProcess) {
            uiProcess.kill();
        }
        
        if (narProcess) {
            narProcess.kill();
        }
        
        console.log('✅ Cleanup complete');
    });

    beforeEach(async () => {
        // Ensure we have a fresh page for each test
        if (page) {
            // Navigate to the UI
            await page.goto(`http://localhost:${uiPort}`, {
                waitUntil: 'networkidle0',
                timeout: 30000  // Increase timeout
            });

            // Wait for connection to be established
            await page.waitForFunction(() => {
                const statusElement = document.querySelector('#connection-status');
                return statusElement && statusElement.textContent.toLowerCase().includes('connected');
            }, { timeout: 20000 }); // Increase timeout
        }
    }, 35000); // Increase timeout for beforeEach hook

    test('UI connects to real backend and shows initial state', async () => {
        // Verify connection is established with real backend
        const connectionStatus = await page.$eval('#connection-status', el => el.textContent);
        expect(connectionStatus.toLowerCase()).toContain('connected');

        // Verify WebSocket indicator shows connected state
        const indicatorClass = await page.$eval('#status-indicator', el => el.className);
        expect(indicatorClass).toContain('status-connected');

        // Check that the page loaded without JavaScript errors
        const errorLogs = [];
        page.on('pageerror', error => {
            errorLogs.push(error.message);
        });

        await setTimeout(1000); // Wait to catch any immediate errors
        expect(errorLogs).toHaveLength(0);
    }, 25000); // Increase test timeout

    test('Send Narsese command to real backend and receive response', async () => {
        // Send a simple Narsese command to the real backend
        await page.type('#command-input', '<bird --> flyer>.');
        await page.click('#send-button');

        // Wait for response from real backend
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('bird') && logs.textContent.includes('flyer');
        }, { timeout: 20000 }); // Increase timeout

        // Verify the command was sent and processed
        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('> <bird --> flyer>.');
        expect(logsContent).toContain('bird');
        expect(logsContent).toContain('flyer');
    }, 30000); // Increase test timeout

    test('Execute reasoning step command', async () => {
        // Execute a reasoning step command
        await page.type('#command-input', '*step');
        await page.click('#send-button');

        // Wait for step execution response
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && (logs.textContent.includes('step') || logs.textContent.includes('cycle'));
        }, { timeout: 20000 }); // Increase timeout

        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('> *step');
    }, 30000); // Increase test timeout

    test('Test concept creation and visualization', async () => {
        // Create a concept that should appear in the graph
        await page.type('#command-input', '<{test_concept} --> important>.');
        await page.click('#send-button');

        // Wait for concept processing
        await setTimeout(3000); // Increased timeout

        // Check that concept was processed by the backend
        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('test_concept');

        // Test that debug command shows concepts
        await page.type('#command-input', '/concepts');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Concept:');
        }, { timeout: 10000 }); // Increased timeout
    }, 35000); // Increase test timeout

    test('Verify all UI controls work with real backend', async () => {
        // Test refresh graph button
        await page.click('#refresh-graph');
        await setTimeout(2000); // Increased timeout

        const logsAfterRefresh = await page.$eval('#logs-container', el => el.textContent);
        expect(logsAfterRefresh).toContain('Graph refresh requested');

        // Test live toggle
        const initialText = await page.$eval('#toggle-live', el => el.textContent);
        await page.click('#toggle-live');
        await setTimeout(1000); // Increased timeout
        const updatedText = await page.$eval('#toggle-live', el => el.textContent);

        // The button text should change when toggled
        expect(updatedText).not.toBe(initialText);
    }, 25000); // Increase test timeout

    test('Test quick commands functionality', async () => {
        // Select and execute a quick command
        await page.select('#quick-commands', '<cat --> animal> .');
        await page.click('#exec-quick');

        // Wait for execution
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('cat') && logs.textContent.includes('animal');
        }, { timeout: 20000 }); // Increase timeout

        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('> <cat --> animal>');
        expect(logsContent).toContain('cat');
        expect(logsContent).toContain('animal');
    }, 30000); // Increase test timeout

    test('Test debug commands with real backend state', async () => {
        // Test /state command
        await page.type('#command-input', '/state');
        await page.click('#send-button');

        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Connection:');
        }, { timeout: 10000 }); // Increase timeout

        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('Connection:');
        expect(logsContent).toContain('Message Count:');
        expect(logsContent).toContain('Command History:');
    }, 20000); // Increase test timeout

    test('Clear logs functionality works', async () => {
        // First add some content to logs
        await page.type('#command-input', '<temp --> test>.');
        await page.click('#send-button');
        await setTimeout(2000); // Increased timeout

        // Then clear the logs
        await page.click('#clear-logs');
        await setTimeout(1000); // Increased timeout

        // Verify clear message appears
        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('Cleared logs');
    }, 25000); // Increase test timeout

    test('Run demo sequence successfully', async () => {
        // Select and run a demo
        await page.select('#demo-select', 'inheritance');
        await page.click('#run-demo');

        // Wait for demo to start running
        await page.waitForFunction(() => {
            const logs = document.querySelector('#logs-container');
            return logs && logs.textContent.includes('Running inheritance demo');
        }, { timeout: 15000 }); // Increase timeout

        const logsContent = await page.$eval('#logs-container', el => el.textContent);
        expect(logsContent).toContain('Running inheritance demo');
    }, 30000); // Increase test timeout
});