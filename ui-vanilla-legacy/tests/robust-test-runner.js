/**
 * @file robust-test-runner.js
 * @description Robust test runner with enhanced cleanup and resource management
 * 
 * This runner ensures tests are completely self-contained with proper cleanup
 * of all resources, including child processes, browser instances, and preventing
 * hanging processes.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class RobustTestRunner {
    constructor() {
        this.activeProcesses = new Set();
        this.activeBrowsers = new Set();
        this.cleanupHandlersRegistered = false;
    }

    /**
     * Register cleanup handlers to ensure resources are cleaned up even on unexpected exits
     */
    registerCleanupHandlers() {
        if (this.cleanupHandlersRegistered) return;
        
        const cleanup = () => {
            console.log('\n🔄 Running forced cleanup...');
            
            // Kill all active processes
            for (const proc of this.activeProcesses) {
                try {
                    if (proc && proc.pid && !proc.killed) {
                        // Try graceful shutdown first
                        process.kill(proc.pid, 'SIGTERM');
                        
                        // Wait a bit, then force kill if needed
                        setTimeout(() => {
                            try {
                                process.kill(proc.pid, 'SIGKILL');
                            } catch (e) {
                                // Process already dead, ignore
                            }
                        }, 1000);
                    }
                } catch (e) {
                    // Process already dead, ignore
                }
            }
            
            // Close all active browsers
            for (const browser of this.activeBrowsers) {
                try {
                    if (browser && typeof browser.close === 'function') {
                        browser.close().catch(() => {});
                    }
                } catch (e) {
                    // Browser already closed, ignore
                }
            }
            
            console.log('✅ Cleanup completed');
        };

        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(0); });
        process.on('SIGTERM', () => { cleanup(); process.exit(0); });
        process.on('SIGUSR1', () => { cleanup(); process.exit(0); });
        process.on('SIGUSR2', () => { cleanup(); process.exit(0); });
        
        this.cleanupHandlersRegistered = true;
    }

    /**
     * Start a process and track it for cleanup
     */
    spawnWithTracking(command, args, options) {
        const proc = spawn(command, args, options);
        this.activeProcesses.add(proc);
        
        // Remove from tracking when process exits
        proc.on('exit', () => {
            this.activeProcesses.delete(proc);
        });
        
        return proc;
    }

    /**
     * Add a browser instance for cleanup tracking
     */
    trackBrowser(browser) {
        this.activeBrowsers.add(browser);
        
        // Remove from tracking when browser closes
        browser.on('disconnected', () => {
            this.activeBrowsers.delete(browser);
        });
    }

    /**
     * Wait for process to be ready by checking its output
     */
    async waitForProcessReady(proc, readyPattern, timeout = 15000) {
        return new Promise((resolve, reject) => {
            let output = '';
            const startTime = Date.now();
            
            const checkReady = () => {
                if (output.includes(readyPattern)) {
                    resolve(true);
                    return true;
                }
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Process did not become ready within ${timeout}ms. Output: ${output.substring(0, 500)}`));
                    return true;
                }
                return false;
            };
            
            proc.stdout.on('data', (data) => {
                const str = data.toString();
                output += str;
                
                if (checkReady()) return;
                
                // Log important events
                if (str.includes('ERROR') || str.includes('FATAL')) {
                    console.error(`[PROCESS-ERROR] ${str.trim()}`);
                }
            });
            
            proc.stderr.on('data', (data) => {
                const str = data.toString();
                output += str;
                console.error(`[PROCESS-STDERR] ${str.trim()}`);
                
                if (str.includes('ERROR') || str.includes('FATAL')) {
                    reject(new Error(`Process error: ${str}`));
                }
            });
            
            // Initial check
            setTimeout(checkReady, 100);
            
            // Set up periodic check
            const interval = setInterval(checkReady, 100);
            
            // Clear interval when resolved
            const clearInterval = () => clearInterval(interval);
            resolve.then(clearInterval).catch(clearInterval);
        });
    }

    /**
     * Enhanced NAR server starter with better resource management
     */
    async startNARServer(config) {
        console.log(`🚀 Starting NAR server on port ${config.port} with resource tracking...`);

        const proc = this.spawnWithTracking('node', ['-e', `
            import {NAR} from '../src/nar/NAR.js';
            import {WebSocketMonitor} from '../src/server/WebSocketMonitor.js';

            async function startServer() {
                console.log('=== ROBUST NAR BACKEND INITIALIZATION ===');

                try {
                    // Create NAR with the provided configuration
                    const nar = new NAR(${JSON.stringify(config.narOptions)});

                    await nar.initialize();
                    console.log('✅ NAR initialized successfully');

                    // Create and start WebSocket monitor
                    const monitor = new WebSocketMonitor({
                        port: ${config.port},
                        host: 'localhost',
                        path: '/ws',
                        maxConnections: 10
                    });

                    await monitor.start();
                    console.log('✅ WebSocket monitor started');

                    // Connect NAR to monitor
                    nar.connectToWebSocketMonitor(monitor);
                    console.log('✅ NAR connected to WebSocket monitor');

                    console.log('=== ROBUST NAR BACKEND READY ===');
                    console.log('Listening on ws://localhost:${config.port}/ws');

                    // Handle graceful shutdown
                    process.on('SIGTERM', async () => {
                        console.log('NAR server received SIGTERM, shutting down...');
                        try {
                            await monitor.stop();
                            process.exit(0);
                        } catch (e) {
                            console.error('Error during NAR shutdown:', e);
                            process.exit(1);
                        }
                    });

                    process.on('SIGINT', async () => {
                        console.log('NAR server received SIGINT, shutting down...');
                        try {
                            await monitor.stop();
                            process.exit(0);
                        } catch (e) {
                            console.error('Error during NAR shutdown:', e);
                            process.exit(1);
                        }
                    });

                } catch (error) {
                    console.error('❌ NAR initialization error:', error);
                    process.exit(1);
                }
            }

            startServer().catch(err => {
                console.error('❌ Critical error in NAR server:', err);
                process.exit(1);
            });
        `], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        });

        // Wait for server to be ready
        await this.waitForProcessReady(proc, 'ROBUST NAR BACKEND READY');
        
        console.log('✅ Robust NAR server started and tracked for cleanup');
        return proc;
    }

    /**
     * Enhanced UI server starter with better resource management
     */
    async startUIServer(config) {
        console.log(`🚀 Starting UI server on port ${config.uiPort} with resource tracking...`);

        const proc = this.spawnWithTracking('npx', ['vite', 'dev', '--port', config.uiPort.toString(), '--host'], {
            cwd: dirname(__dirname) + '/ui',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: config.port.toString(),
                VITE_WS_PATH: '/ws'
            }
        });

        // Wait for server to be ready
        await this.waitForProcessReady(proc, `http://localhost:${config.uiPort}`);

        console.log('✅ Robust UI server started and tracked for cleanup');
        return proc;
    }

    /**
     * Run a test with guaranteed cleanup
     */
    async runTestWithCleanup(testFunction, configName, config) {
        console.log(`\n🧪 Running ${configName} test with guaranteed cleanup...`);
        
        // Register cleanup handlers to ensure resources are cleaned up
        this.registerCleanupHandlers();
        
        try {
            // Run the test function with the provided configuration
            const result = await testFunction(config);
            console.log(`✅ ${configName} test completed: ${result ? 'SUCCESS' : 'FAILURE'}`);
            return result;
        } catch (error) {
            console.error(`❌ ${configName} test failed:`, error.message);
            throw error;
        } finally {
            // Force cleanup of any remaining resources
            console.log(`\n🧹 Forcing cleanup after ${configName} test...`);
            await this.forceCleanup();
        }
    }

    /**
     * Force cleanup of all tracked resources
     */
    async forceCleanup() {
        console.log('🔄 Force cleaning up all tracked resources...');
        
        // Kill all active processes
        const processPromises = [];
        for (const proc of this.activeProcesses) {
            if (proc && proc.pid && !proc.killed) {
                try {
                    // Try graceful shutdown first
                    process.kill(proc.pid, 'SIGTERM');
                    
                    // Wait briefly, then force kill if needed
                    const killPromise = new Promise(resolve => {
                        setTimeout(() => {
                            try {
                                process.kill(proc.pid, 'SIGKILL');
                            } catch (e) {
                                // Process already dead, ignore
                            }
                            resolve();
                        }, 500);
                    });
                    processPromises.push(killPromise);
                } catch (e) {
                    // Process already dead, ignore
                }
            }
        }
        
        // Wait for all kill operations to complete
        await Promise.all(processPromises);
        
        // Close all active browsers
        const browserPromises = [];
        for (const browser of this.activeBrowsers) {
            try {
                if (browser && browser.isConnected && browser.isConnected()) {
                    const closePromise = browser.close().catch(() => {});
                    browserPromises.push(closePromise);
                }
            } catch (e) {
                // Browser already closed, ignore
            }
        }
        
        await Promise.all(browserPromises);
        
        // Clear the sets
        this.activeProcesses.clear();
        this.activeBrowsers.clear();
        
        console.log('✅ All resources cleaned up');
        
        // Wait a bit to ensure processes are fully terminated
        await setTimeout(1000);
    }

    /**
     * Verify no hanging processes remain after test completion
     */
    async verifyNoHangingProcesses() {
        console.log('\n🔍 Verifying no hanging processes...');
        
        if (this.activeProcesses.size === 0 && this.activeBrowsers.size === 0) {
            console.log('✅ No tracked processes remaining - all cleaned up properly');
            return true;
        } else {
            console.log(`⚠️  Still have ${this.activeProcesses.size} processes and ${this.activeBrowsers.size} browsers tracked`);
            
            // Force cleanup any remaining processes
            await this.forceCleanup();
            return false;
        }
    }
}

// Export the robust test runner
export { RobustTestRunner };

// Example usage of the robust test runner
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🧪 This is the Robust Test Runner utility module.');
    console.log('It provides enhanced resource management for SeNARS tests.');
    console.log('Import and use this in your test files for guaranteed cleanup.');
}