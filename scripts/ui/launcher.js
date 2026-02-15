#!/usr/bin/env node

/**
 * Consolidated Web UI Launcher
 * Provides a parameterized foundation for launching any data-driven UI with WebSocket connectivity
 */

import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {parseArgs as parseCliArgs, showUsageAndExit} from '../utils/script-utils.js';
import {WebSocketMonitor} from '../../src/server/WebSocketMonitor.js';
import {NAR} from '../../src/nar/NAR.js';
import {DemoWrapper} from '../../src/demo/DemoWrapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const {args: cliArgs, helpRequested} = parseCliArgs(process.argv.slice(2));

const USAGE_MESSAGE = `
Usage: node scripts/ui/launcher.js [options]

Options:
  --help, -h        Show this help message
  --dev             Start development mode with hot reloading (default)
  --prod            Start production mode
  --port <port>     Specify port for the UI server (default: 5173)
  --ws-port <port>  Specify WebSocket port (default: 8080)
  --host <host>     Specify host (default: localhost)
  --graph-ui        Launch with Graph UI layout
  --layout <name>   Specify layout (default, self-analysis, graph)

Examples:
  node scripts/ui/launcher.js --dev
  node scripts/ui/launcher.js --prod --port 3000
  node scripts/ui/launcher.js --dev --port 8081 --ws-port 8082
  node scripts/ui/launcher.js --graph-ui
`;

// Parse arguments to support flexible server configuration
const args = cliArgs;

const DEFAULT_CONFIG = Object.freeze({
    nar: {
        lm: {enabled: false},
        reasoningAboutReasoning: {enabled: true}
    },
    persistence: {
        defaultPath: './agent.json'
    },
    webSocket: {
        port: parseInt(process.env.WS_PORT) || 8080,
        host: process.env.WS_HOST || '0.0.0.0',
        maxConnections: 20
    },
    ui: {
        port: parseInt(process.env.PORT) || 5173
    }
});

/**
 * Parse command line arguments to support flexible configuration
 */
function parseArgs(args) {
    let config = {...DEFAULT_CONFIG};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ws-port' && args[i + 1]) {
            config = {
                ...config,
                webSocket: {
                    ...config.webSocket,
                    port: parseInt(args[i + 1])
                }
            };
            i++; // Skip next argument since it's the value
        } else if (args[i] === '--port' && args[i + 1]) {
            config = {
                ...config,
                ui: {
                    ...config.ui,
                    port: parseInt(args[i + 1])
                }
            };
            i++; // Skip next argument since it's the value
        } else if (args[i] === '--host' && args[i + 1]) {
            config = {
                ...config,
                webSocket: {
                    ...config.webSocket,
                    host: args[i + 1]
                }
            };
            i++; // Skip next argument since it's the value
        } else if (args[i] === '--graph-ui') {
            config = {
                ...config,
                ui: {
                    ...config.ui,
                    layout: 'graph'
                }
            };
        } else if (args[i] === '--layout' && args[i + 1]) {
            config = {
                ...config,
                ui: {
                    ...config.ui,
                    layout: args[i + 1]
                }
            };
            i++; // Skip next argument since it's the value
        }
    }

    return config;
}

if (helpRequested) {
    showUsageAndExit(USAGE_MESSAGE);
}

/**
 * Initialize and start the WebSocket server
 */
async function startWebSocketServer(config = DEFAULT_CONFIG) {
    console.log(`Starting WebSocket server on ${config.webSocket.host}:${config.webSocket.port}...`);

    const {ReplEngine} = await import('../../src/repl/ReplEngine.js');

    // Create a ReplEngine which manages its own NAR instance
    const replEngine = new ReplEngine(config);
    await replEngine.initialize();

    const monitor = new WebSocketMonitor(config.webSocket);
    await monitor.start();
    replEngine.nar.connectToWebSocketMonitor(monitor);

    // Import and initialize WebRepl for handling all UIs with comprehensive message support
    const {WebRepl} = await import('../../src/repl/WebRepl.js');
    const webRepl = new WebRepl(replEngine, monitor);

    // Register WebRepl with the WebSocket server to provide comprehensive message support
    webRepl.registerWithWebSocketServer();

    // Register a handler for NAR instance requests from the UI
    monitor.registerClientMessageHandler('requestNAR', async (message, client, monitorInstance) => {
        // For security reasons, we only send information that's safe for the UI, not the full NAR instance
        const narInfo = {
            cycleCount: replEngine.nar.cycleCount,
            isRunning: replEngine.nar.isRunning,
            config: replEngine.nar.config.toJSON(),
            stats: webRepl.getStats ? webRepl.getStats() : replEngine.getStats(),
            reasoningState: replEngine.nar.getReasoningState ? replEngine.nar.getReasoningState() : null
        };

        monitorInstance._sendToClient(client, {
            type: 'narInstance',
            payload: narInfo
        });
    });

    // Initialize DemoWrapper to provide remote control and introspection
    const demoWrapper = new DemoWrapper();
    await demoWrapper.initialize(replEngine.nar, monitor);

    // Send list of available demos to connected UIs
    await demoWrapper.sendDemoList();

    // Start periodic metrics updates
    demoWrapper.runPeriodicMetricsUpdate();

    // Start the NAR reasoning cycle
    replEngine.nar.start();

    console.log('WebSocket server started successfully');

    return {nar: replEngine.nar, replEngine, monitor, demoWrapper};
}

/**
 * Start the UI server as a child process
 */
function startUIServer(config = DEFAULT_CONFIG) {
    console.log(`Starting UI server on port ${config.ui.port}...`);

    // Set up environment variables for the UI server
    const env = {
        ...process.env,
        HTTP_PORT: config.ui.port.toString(),
        WS_PORT: config.webSocket.port.toString()
    };

    // Run the UI server as a child process
    const serverProcess = spawn('node', ['server.js'], {
        cwd: join(__dirname, '../../ui'),
        stdio: 'inherit', // This allows the UI server to control the terminal properly
        env: env
    });

    serverProcess.on('error', (err) => {
        console.error('Error starting UI server:', err.message);
        process.exit(1);
    });

    serverProcess.on('close', (code) => {
        console.log(`UI server exited with code ${code}`);
        console.log('UI server closed. Press Ctrl+C to shut down the WebSocket server as well.');
    });

    return serverProcess;
}

/**
 * Save the NAR state to file
 */
async function saveNarState(nar, replEngine = null) {
    const fs = await import('fs');
    const state = nar.serialize();
    await fs.promises.writeFile(DEFAULT_CONFIG.persistence.defaultPath, JSON.stringify(state, null, 2));
    console.log('Current state saved to agent.json');

    // Also save ReplEngine state if available
    if (replEngine) {
        await replEngine.save();
    }
}

/**
 * Shutdown sequence for all services
 */
async function shutdownServices(webSocketServer) {
    // Save NAR state
    try {
        await saveNarState(webSocketServer.nar, webSocketServer.replEngine);
    } catch (saveError) {
        console.error('Error saving state on shutdown:', saveError.message);
    }

    // Shutdown ReplEngine if available
    if (webSocketServer.replEngine) {
        await webSocketServer.replEngine.shutdown();
    }

    // Stop WebSocket server
    if (webSocketServer.monitor) {
        await webSocketServer.monitor.stop();
    }

    if (webSocketServer.nar) {
        webSocketServer.nar.stop();
    }
}

/**
 * Setup graceful shutdown handlers
 */
async function setupGracefulShutdown(webSocketServer) {
    const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        await shutdownServices(webSocketServer);
        console.log('Servers stopped successfully');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error.message);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });
}

async function main() {
    let webSocketServer;

    try {
        // Parse command line arguments for flexible configuration
        const config = parseArgs(args);

        // Start WebSocket server with the parsed config
        webSocketServer = await startWebSocketServer(config);

        // Set up graceful shutdown
        await setupGracefulShutdown({
            nar: webSocketServer.nar,
            replEngine: webSocketServer.replEngine,
            monitor: webSocketServer.monitor
        });

        // Start UI server
        const uiServer = startUIServer(config);

        // Store the websocket server info for shutdown
        webSocketServer.uiServer = uiServer;

        console.log('Both servers are running. Press Ctrl+C to stop.');
    } catch (error) {
        console.error('Failed to start servers:', error.message);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unexpected error:', error.message);
    process.exit(1);
});
