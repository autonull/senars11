/**
 * Automated test for the debug REPL I/O functionality
 * Tests the complete I/O loop from UI to NAR and back
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

async function startNARServer() {
    // Get the current working directory to create absolute imports
    const currentDir = process.cwd();
    const serverScript = `
import {NAR} from '${currentDir}/src/nar/NAR.js';
import {WebSocketMonitor} from '${currentDir}/src/server/WebSocketMonitor.js';

async function startServer() {
    const nar = new NAR();
    await nar.initialize();

    const monitor = new WebSocketMonitor({port: 8080});
    await monitor.start();
    monitor.listenToNAR(nar);

    console.log('NAR WebSocket server started on ws://localhost:8080/ws');
}

startServer().catch(console.error);
    `;

    // Write server script to temp file
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = os.tmpdir();
    const tempScriptPath = path.join(tempDir, `nar-server-${Date.now()}.js`);
    await fs.promises.writeFile(tempScriptPath, serverScript);

    // Start the server process from project root
    const serverProcess = spawn('node', [tempScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(), // Run from project root
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => {
            reject(new Error('Server start timeout'));
        }, 10000);

        serverProcess.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            console.log('[SERVER] ' + str.trim());
            
            if (str.includes('WebSocket server started')) {
                clearTimeout(timeout);
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error('[SERVER-ERR] ' + data.toString().trim());
        });
    });

    return { serverProcess, tempScriptPath };
}

async function runDebugReplTest() {
    console.log('🧪 Starting Debug REPL I/O Test...');
    
    let serverProcess, tempScriptPath;
    let browser = null;
    
    try {
        // Start NAR server
        console.log('🚀 Starting NAR server...');
        const serverInfo = await startNARServer();
        serverProcess = serverInfo.serverProcess;
        tempScriptPath = serverInfo.tempScriptPath;

        // Start browser
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: true, // Set to true for headless execution
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Navigate to debug REPL
        const debugUrl = 'http://localhost:5173/index2.html'; // or appropriate port
        console.log(`🔄 Loading debug REPL at ${debugUrl}...`);
        
        // Set up console message handler to capture logs
        page.on('console', msg => {
            console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
        });
        
        // Navigate to the page
        await page.goto(debugUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        
        // Wait for connection status element
        await page.waitForSelector('#status-bar', { timeout: 5000 });
        
        // Wait a bit for connection to establish
        await sleep(3000);
        
        // Check connection status
        const connStatus = await page.$eval('#status-bar', el => el.textContent);
        console.log(`📡 Connection status: ${connStatus}`);
        
        if (!connStatus.includes('Connected')) {
            console.log('❌ Failed to connect to server');
            return false;
        }
        
        // Test basic I/O
        console.log('🧪 Testing basic I/O...');
        
        const testInputs = [
            '<debug_test --> concept>.',
            '<debug_test --> concept>?', 
            '<(debug & test) --> property>. %1.0;0.9%'
        ];
        
        for (const input of testInputs) {
            console.log(`📝 Sending input: ${input}`);
            
            // Type the input
            await page.type('#repl-input', input);
            await page.keyboard.press('Enter');
            
            // Wait for response
            await sleep(1000);
        }
        
        // Run the automated I/O test
        console.log('🤖 Running automated I/O test...');
        await page.click('#test-io-btn');
        await sleep(5000); // Wait for tests to complete
        
        // Check test results
        const testResults = await page.$eval('#test-results', el => el.innerHTML);
        console.log('📋 Test Results:', testResults);
        
        console.log('✅ Debug REPL I/O test completed');
        return true;
        
    } catch (error) {
        console.error('❌ Debug REPL test failed:', error);
        return false;
    } finally {
        // Cleanup
        if (browser) {
            await browser.close();
        }
        
        if (serverProcess) {
            serverProcess.kill();
        }
        
        // Remove temp script
        if (tempScriptPath) {
            try {
                const fs = await import('fs');
                await fs.promises.unlink(tempScriptPath);
            } catch (e) {
                console.warn('Warning cleaning up temp script:', e.message);
            }
        }
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    runDebugReplTest()
        .then(success => {
            console.log(`\n🏁 Test ${success ? 'PASSED' : 'FAILED'}`);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test error:', error);
            process.exit(1);
        });
}

export { runDebugReplTest };