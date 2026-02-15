#!/usr/bin/env node

/**
 * Test script to run the NAR server and debug REPL test together
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

async function main() {
    console.log('🚀 Setting up NAR server and running debug REPL test...');
    
    // Start the regular NAR WebSocket server
    console.log('🌐 Starting NAR WebSocket server...');
    const serverProcess = spawn('node', ['scripts/ui/launcher.js', '--host', '0.0.0.0'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    // Wait for both servers to start
    await new Promise((resolve, reject) => {
        let serverReady = false;
        let viteReady = false;
        
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for servers to start'));
        }, 20000);

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(`[SERVER] ${output}`);
            
            if (output.includes('WebSocket monitoring server started') && !serverReady) {
                serverReady = true;
                console.log('✅ WebSocket server ready');
            }
            
            if (output.includes('Local:') && !viteReady) {
                viteReady = true;
                console.log('✅ Vite server ready');
            }
            
            if (serverReady && viteReady) {
                clearTimeout(timeout);
                setTimeout(resolve, 2000); // Extra time for everything to be ready
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('ExperimentalWarning')) {
                process.stderr.write(`[SERVER-ERR] ${output}`);
            }
        });
    });

    try {
        // Run the debug REPL test
        console.log('🧪 Running debug REPL test...');
        
        // Import and run the test
        const { runDebugReplTest } = await import('../tests/debug-repl-test.js');
        const success = await runDebugReplTest();
        
        console.log(`\n🏁 Overall Test Result: ${success ? 'SUCCESS' : 'FAILURE'}`);
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        console.error('❌ Error running test:', error);
        process.exit(1);
    } finally {
        // Cleanup: kill the server process
        console.log('\n🛑 Stopping server...');
        serverProcess.kill();
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}