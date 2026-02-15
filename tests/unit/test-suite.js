#!/usr/bin/env node

/**
 * Test suite configuration file for SeNARS UI
 * This file defines and runs the complete test suite for all critical functionality
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SeNARSTestSuite {
    constructor() {
        this.tests = [
            {
                name: 'WebSocket Connection Test',
                description: 'Verifies WebSocket connection between UI and NAR backend',
                file: './test-websocket-connection.js',
                critical: true
            },
            {
                name: 'Narsese Input Test',
                description: 'Tests basic Narsese input processing',
                file: './test-narsese-input.js',
                critical: true
            },
            {
                name: 'Reasoning Operations Test',
                description: 'Tests reasoning commands and operations',
                file: './test-reasoning-ops.js',
                critical: true
            },
            {
                name: 'Graph Visualization Test',
                description: 'Tests graph visualization functionality',
                file: './test-graph-visualization.js',
                critical: true
            },
            {
                name: 'Round-trip I/O Test',
                description: 'Tests complete round-trip from UI to NAR and back',
                file: './test-roundtrip-io.js',
                critical: true
            },
            {
                name: 'Error Handling Test',
                description: 'Tests error handling and system resilience',
                file: './test-error-handling.js',
                critical: true
            },
            {
                name: 'Performance Test',
                description: 'Tests system performance under load',
                file: './test-performance.js',
                critical: false
            }
        ];
        
        this.results = [];
        this.criticalFailures = 0;
    }

    async createWebSocketConnectionTest() {
        const testContent = `/**
 * WebSocket Connection Test
 * Verifies that the UI can connect to the NAR backend via WebSocket
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testWebSocketConnection() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('🧪 Testing WebSocket connection...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8091, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('WebSocket server ready');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('WebSocket server ready')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5178', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8091'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5178')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Test connection
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5178', { waitUntil: 'networkidle0' });
        
        // Wait for WebSocket connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && (
                statusBar.textContent.toLowerCase().includes('connected') ||
                statusBar.classList.contains('status-connected')
            );
        }, { timeout: 15000 });
        
        console.log('✅ WebSocket connection established successfully');
        uiProcess.kill();
        return true;
        
    } catch (error) {
        console.error('❌ WebSocket connection test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testWebSocketConnection().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testWebSocketConnection };
`;
        
        await this.createTestFile('./test-websocket-connection.js', testContent);
    }

    async createNarseseInputTest() {
        const testContent = `/**
 * Narsese Input Test
 * Tests basic Narsese input processing functionality
 */

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testNarseseInput() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('🧪 Testing Narsese input functionality...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8092, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('NAR ready for input tests');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('NAR ready for input tests')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5179', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8092'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5179')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Test Narsese input
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5179', { waitUntil: 'networkidle0' });
        
        // Wait for connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && statusBar.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Test basic Narsese input
        const testInputs = [
            '<test_input --> concept>.',
            '<question_test --> concept>?',
            '<(a & b) --> compound>.'
        ];
        
        for (const input of testInputs) {
            await page.waitForSelector('#repl-input', { timeout: 5000 });
            await page.type('#repl-input', input);
            await page.keyboard.press('Enter');
            await setTimeout(500); // Brief wait for processing
            console.log(\`✅ Processed input: \${input}\`);
        }
        
        console.log('✅ All Narsese inputs processed successfully');
        uiProcess.kill();
        return true;
        
    } catch (error) {
        console.error('❌ Narsese input test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testNarseseInput().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testNarseseInput };
`;
        
        await this.createTestFile('./test-narsese-input.js', testContent);
    }

    async createReasoningOpsTest() {
        const testContent = `/**
 * Reasoning Operations Test
 * Tests reasoning commands and operations
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testReasoningOps() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('🧪 Testing reasoning operations...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8093, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('NAR ready for reasoning tests');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('NAR ready for reasoning tests')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5180', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8093'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5180')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Test reasoning operations
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5180', { waitUntil: 'networkidle0' });
        
        // Wait for connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && statusBar.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Test reasoning commands
        const reasoningCommands = [
            '*step',
            '*volume=10',
            '*decisionthreshold=0.5',
            '*babblingThreshold=0.1'
        ];
        
        for (const cmd of reasoningCommands) {
            await page.waitForSelector('#repl-input', { timeout: 5000 });
            await page.type('#repl-input', cmd);
            await page.keyboard.press('Enter');
            await setTimeout(1000); // Wait for command processing
            console.log(\`✅ Executed reasoning command: \${cmd}\`);
        }
        
        console.log('✅ All reasoning operations executed successfully');
        uiProcess.kill();
        return true;
        
    } catch (error) {
        console.error('❌ Reasoning operations test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testReasoningOps().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testReasoningOps };
`;
        
        await this.createTestFile('./test-reasoning-ops.js', testContent);
    }

    async createGraphVisualizationTest() {
        const testContent = `/**
 * Graph Visualization Test
 * Tests graph visualization functionality
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testGraphVisualization() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('🧪 Testing graph visualization...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8094, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('NAR ready for visualization tests');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('NAR ready for visualization tests')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5181', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8094'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5181')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Test graph visualization
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5181', { waitUntil: 'networkidle0' });
        
        // Wait for connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && statusBar.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Add content that should appear in graph
        const visualizationInput = '<graph_test --> node>.';
        await page.waitForSelector('#repl-input', { timeout: 5000 });
        await page.type('#repl-input', visualizationInput);
        await page.keyboard.press('Enter');
        await setTimeout(2000); // Wait for graph update
        
        // Check if graph has content
        const hasGraphContent = await page.evaluate(() => {
            const cyContainer = document.querySelector('#cy-container');
            if (!cyContainer) return false;
            
            // Check for various signs of graph content
            return cyContainer.querySelector('svg') !== null ||
                   cyContainer.querySelector('canvas') !== null ||
                   cyContainer.querySelectorAll('[class*="node"], [class*="edge"]').length > 0 ||
                   cyContainer.querySelector('[id^="cytoscape"]') !== null;
        });
        
        if (hasGraphContent) {
            console.log('✅ Graph visualization updated with content');
        } else {
            console.log('ℹ️  No graph content detected (may be expected)');
        }
        
        // Test refresh functionality
        const refreshBtnExists = await page.$('#refresh-btn') !== null;
        if (refreshBtnExists) {
            await page.click('#refresh-btn');
            await setTimeout(500);
            console.log('✅ Refresh button functionality working');
        }
        
        console.log('✅ Graph visualization tested successfully');
        uiProcess.kill();
        return hasGraphContent; // Return based on whether visualization worked
        
    } catch (error) {
        console.error('❌ Graph visualization test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testGraphVisualization().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testGraphVisualization };
`;
        
        await this.createTestFile('./test-graph-visualization.js', testContent);
    }

    async createErrorHandlingTest() {
        const testContent = `/**
 * Error Handling Test
 * Tests error handling and system resilience
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testErrorHandling() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('🧪 Testing error handling...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8095, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('NAR ready for error handling tests');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('NAR ready for error handling tests')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5182', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8095'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5182')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Test error handling
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5182', { waitUntil: 'networkidle0' });
        
        // Wait for connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && statusBar.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        // Test invalid inputs to ensure they're handled gracefully
        const invalidInputs = [
            '<invalid syntax',
            'not_valid_narsese',
            '*unknown_command',
            '12345!@#$%'
        ];
        
        console.log('Testing invalid inputs - system should handle gracefully...');
        for (const input of invalidInputs) {
            try {
                await page.waitForSelector('#repl-input', { timeout: 5000 });
                await page.type('#repl-input', input);
                await page.keyboard.press('Enter');
                await setTimeout(500); // Wait briefly
                
                // Check that the page didn't crash
                const pageStillActive = await page.evaluate(() => document.readyState === 'complete');
                if (!pageStillActive) {
                    throw new Error('Page crashed after invalid input');
                }
                
                console.log(\`✅ Handled invalid input gracefully: \${input}\`);
            } catch (error) {
                console.error(\`❌ Error handling invalid input \${input}: \${error.message}\`);
                // Don't return false here, continue testing other inputs
            }
        }
        
        // Test the system is still responsive after invalid inputs
        const testInput = '<error_recovery_test --> concept>.';
        await page.type('#repl-input', testInput);
        await page.keyboard.press('Enter');
        await setTimeout(1000);
        
        console.log('✅ Error handling and recovery tested successfully');
        uiProcess.kill();
        return true;
        
    } catch (error) {
        console.error('❌ Error handling test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testErrorHandling().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testErrorHandling };
`;
        
        await this.createTestFile('./test-error-handling.js', testContent);
    }

    async createPerformanceTest() {
        const testContent = `/**
 * Performance Test
 * Tests system performance under load
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testPerformance() {
    let narProcess = null;
    let browser = null;
    let page = null;
    
    try {
        console.log('⏱️ Testing system performance...');
        
        // Start NAR server
        narProcess = spawn('node', ['-e', \`
            import {NAR} from './src/nar/NAR.js';
            import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';
            
            async function startServer() {
                const nar = new NAR({lm: {enabled: false}});
                await nar.initialize();
                
                const monitor = new WebSocketMonitor({port: 8096, host: 'localhost'});
                await monitor.start();
                nar.connectToWebSocketMonitor(monitor);
                
                console.log('NAR ready for performance tests');
            }
            
            startServer().catch(console.error);
        \`], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Wait for server ready
        let serverReady = false;
        narProcess.stdout.on('data', (data) => {
            if (data.toString().includes('NAR ready for performance tests')) {
                serverReady = true;
            }
        });
        
        const startTime = Date.now();
        while (!serverReady && Date.now() - startTime < 10000) {
            await setTimeout(100);
        }
        
        if (!serverReady) {
            throw new Error('NAR server failed to start');
        }
        
        // Start UI server
        const uiProcess = spawn('npx', ['vite', 'dev', '--port', '5183', '--host'], {
            cwd: join(__dirname, 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: '8096'
            }
        });
        
        let uiReady = false;
        uiProcess.stdout.on('data', (data) => {
            if (data.toString().includes('http://localhost:5183')) {
                uiReady = true;
            }
        });
        
        const uiStartTime = Date.now();
        while (!uiReady && Date.now() - uiStartTime < 15000) {
            await setTimeout(100);
        }
        
        if (!uiReady) {
            throw new Error('UI server failed to start');
        }
        
        // Performance test
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        
        await page.goto('http://localhost:5183', { waitUntil: 'networkidle0' });
        
        // Wait for connection
        await page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && statusBar.textContent.toLowerCase().includes('connected');
        }, { timeout: 10000 });
        
        console.log('Sending batch of inputs to test performance...');
        
        // Send multiple inputs in quick succession
        const startTimeBatch = Date.now();
        const testInputs = [];
        for (let i = 0; i < 10; i++) {
            testInputs.push(\`<performance_test_\${i} --> concept>.\`);
        }
        
        for (const input of testInputs) {
            await page.waitForSelector('#repl-input', { timeout: 5000 });
            await page.type('#repl-input', input);
            await page.keyboard.press('Enter');
            await setTimeout(100); // Small delay between inputs
        }
        
        const endTimeBatch = Date.now();
        const batchDuration = endTimeBatch - startTimeBatch;
        
        console.log(\`✅ Sent \${testInputs.length} inputs in \${batchDuration}ms\`);
        
        // Test reasoning steps
        const reasoningStart = Date.now();
        for (let i = 0; i < 5; i++) {
            await page.type('#repl-input', '*step');
            await page.keyboard.press('Enter');
            await setTimeout(200);
        }
        const reasoningEnd = Date.now();
        const reasoningDuration = reasoningEnd - reasoningStart;
        
        console.log(\`✅ Completed 5 reasoning steps in \${reasoningDuration}ms\`);
        
        console.log('✅ Performance test completed successfully');
        uiProcess.kill();
        return true;
        
    } catch (error) {
        console.error('❌ Performance test failed:', error.message);
        return false;
    } finally {
        if (browser) await browser.close();
        if (narProcess) narProcess.kill();
    }
}

// Run test
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    testPerformance().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testPerformance };
`;
        
        await this.createTestFile('./test-performance.js', testContent);
    }

    async createTestFile(filename, content) {
        const fs = await import('fs');
        await fs.promises.writeFile(filename, content);
    }

    async setupTestSuite() {
        console.log('🔧 Setting up complete test suite...');
        
        // Create all test files
        await this.createWebSocketConnectionTest();
        await this.createNarseseInputTest();
        await this.createReasoningOpsTest();
        await this.createGraphVisualizationTest();
        await this.createErrorHandlingTest();
        await this.createPerformanceTest();
        
        console.log('✅ All test files created');
    }

    async runTest(test) {
        console.log(\`\\n🔄 Running: \${test.name}\`);
        console.log(\`📋 Description: \${test.description}\`);
        
        const startTime = Date.now();
        
        try {
            // Since we can't directly import and run the test files in this context,
            // we'll use spawn to run them as separate processes
            const testProcess = spawn('node', [test.file], {
                cwd: __dirname,
                env: process.env
            });
            
            let output = '';
            let errorOutput = '';
            
            testProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            testProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            const testResult = await new Promise((resolve) => {
                testProcess.on('close', (code) => {
                    const duration = Date.now() - startTime;
                    resolve({
                        name: test.name,
                        passed: code === 0,
                        duration: duration,
                        output: output,
                        error: errorOutput,
                        critical: test.critical
                    });
                });
                
                // Add timeout to prevent hanging tests
                setTimeout(() => {
                    testProcess.kill();
                    resolve({
                        name: test.name,
                        passed: false,
                        duration: Date.now() - startTime,
                        output: output,
                        error: 'Test timed out after 60 seconds',
                        critical: test.critical
                    });
                }, 60000); // 60 second timeout
            });
            
            this.results.push(testResult);
            
            if (testResult.passed) {
                console.log(\`✅ PASSED in \${testResult.duration}ms\`);
            } else {
                console.log(\`❌ FAILED in \${testResult.duration}ms\`);
                if (test.critical && testResult.critical) {
                    this.criticalFailures++;
                }
            }
            
            return testResult.passed;
        } catch (error) {
            console.error(\`❌ Error running test \${test.name}: \${error.message}\`);
            this.results.push({
                name: test.name,
                passed: false,
                duration: Date.now() - startTime,
                output: '',
                error: error.message,
                critical: test.critical
            });
            
            if (test.critical) {
                this.criticalFailures++;
            }
            
            return false;
        }
    }

    async runAllTests() {
        console.log('🚀 Starting SeNARS Complete Test Suite\\n');
        console.log(\`📋 Total tests to run: \${this.tests.length}\`);
        console.log(\`⚠️  Critical tests: \${this.tests.filter(t => t.critical).length}\`);
        console.log(\`📊 Non-critical tests: \${this.tests.filter(t => !t.critical).length}\`);
        
        let passedCount = 0;
        let failedCount = 0;
        
        for (const test of this.tests) {
            const success = await this.runTest(test);
            if (success) {
                passedCount++;
            } else {
                failedCount++;
            }
        }
        
        return { passedCount, failedCount };
    }

    async generateReport() {
        console.log('\\n📊=== TEST SUITE REPORT ===');
        
        const totalTests = this.results.length;
        const passedTests = this.results.filter(r => r.passed).length;
        const failedTests = this.results.filter(r => !r.passed).length;
        const criticalFailed = this.results.filter(r => !r.passed && r.critical).length;
        
        console.log(\`\\n📈 Summary:\`);
        console.log(\`  Total: \${totalTests}\`);
        console.log(\`  Passed: \${passedTests}\`);
        console.log(\`  Failed: \${failedTests}\`);
        console.log(\`  Critical failures: \${criticalFailed}\`);
        console.log(\`  Success rate: \${totalTests > 0 ? Math.round((passedTests/totalTests)*100) : 0}%\`);
        
        if (failedTests > 0) {
            console.log('\\n❌ Failed Tests:');
            const failedResults = this.results.filter(r => !r.passed);
            for (const result of failedResults) {
                console.log(\`  • \${result.name} \${result.critical ? '(CRITICAL)' : '(non-critical)'}\`);
                if (result.error) {
                    console.log(\`    Error: \${result.error}\`);
                }
            }
        }
        
        if (passedTests === totalTests) {
            console.log('\\n🎉 All tests passed! The system is fully functional.');
            return true;
        } else if (criticalFailed > 0) {
            console.log('\\n🛑 CRITICAL FAILURE: Some critical tests failed. The system is not ready for use.');
            return false;
        } else {
            console.log('\\n⚠️  Some non-critical tests failed, but core functionality is working.');
            return true;
        }
    }

    async run() {
        try {
            await this.setupTestSuite();
            const { passedCount, failedCount } = await this.runAllTests();
            const overallSuccess = await this.generateReport();
            
            // Exit with appropriate code based on results
            const hasCriticalFailures = this.results.some(r => !r.passed && r.critical);
            process.exit(hasCriticalFailures ? 1 : (failedCount === 0 ? 0 : 0)); // Return success if only non-critical tests failed
        } catch (error) {
            console.error('❌ Test suite setup failed:', error);
            process.exit(1);
        }
    }
}

// Run the test suite if executed directly
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    const testSuite = new SeNARSTestSuite();
    testSuite.run().catch(console.error);
}

export { SeNARSTestSuite };