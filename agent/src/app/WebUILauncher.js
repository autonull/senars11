#!/usr/bin/env node

/**
 * General-purpose Web UI Launcher
 * Provides a parameterized foundation for launching any data-driven UI with WebSocket connectivity
 */

import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {WebSocketMonitor} from '../server/WebSocketMonitor.js';
import {NAR} from '../../core/src/nar/NAR.js';
import {DemoWrapper} from '../demo/DemoWrapper.js';
import {Logger} from '../../core/src/util/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration
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
        host: process.env.WS_HOST || 'localhost',
        maxConnections: 20
    },
    ui: {
        port: parseInt(process.env.PORT) || 5173
    }
});

// Parse command line arguments
const parseArgs = (args = process.argv.slice(2)) => {
    let config = {...DEFAULT_CONFIG};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ws-port' && args[i + 1]) {
            config = {...config, webSocket: {...config.webSocket, port: parseInt(args[i + 1])}};
            i++;
        } else if (args[i] === '--port' && args[i + 1]) {
            config = {...config, ui: {...config.ui, port: parseInt(args[i + 1])}};
            i++;
        } else if (args[i] === '--host' && args[i + 1]) {
            config = {...config, webSocket: {...config.webSocket, host: args[i + 1]}};
            i++;
        }
    }
    return config;
};

// Initialize WebSocket server
const startWebSocketServer = async (config = DEFAULT_CONFIG) => {
    Logger.info(`Starting WebSocket server on ${config.webSocket.host}:${config.webSocket.port}...`);

    const nar = new NAR(config.nar);
    await nar.initialize();

    const monitor = new WebSocketMonitor(config.webSocket);
    await monitor.start();
    nar.connectToWebSocketMonitor(monitor);

    // Standard NAR info handler
    monitor.registerClientMessageHandler('requestNAR', async (message, client, monitorInstance) => {
        const narInfo = {
            cycleCount: nar.cycleCount,
            isRunning: nar.isRunning,
            config: nar.config.toJSON(),
            stats: nar.getStats(),
            reasoningState: nar.getReasoningState ? nar.getReasoningState() : null
        };
        monitorInstance._sendToClient(client, {type: 'narInstance', payload: narInfo});
    });

    // Initialize DemoWrapper
    const demoWrapper = new DemoWrapper();
    await demoWrapper.initialize(nar, monitor);
    await demoWrapper.sendDemoList();
    demoWrapper.runPeriodicMetricsUpdate();
    nar.start();

    Logger.info('WebSocket server started successfully');
    return {nar, monitor, demoWrapper};
};

// Start Vite dev server
const startViteDevServer = (config = DEFAULT_CONFIG) => {
    Logger.info(`Starting Vite dev server on port ${config.ui.port}...`);

    // Check if we're in the right directory structure for the ui folder
    // __dirname is src/ui, so ui directory is at the project root level
    const uiDir = join(__dirname, '../../ui'); // Go up two levels to project root, then into ui

    const viteProcess = spawn('npx', ['vite', 'dev', '--port', config.ui.port.toString()], {
        cwd: uiDir,
        stdio: 'inherit',
        env: {
            ...process.env,
            VITE_WS_HOST: config.webSocket.host,
            VITE_WS_PORT: config.webSocket.port.toString(),
            VITE_WS_PATH: DEFAULT_CONFIG.webSocket.path || undefined,
            PORT: config.ui.port.toString()
        }
    });

    viteProcess.on('error', err => {
        Logger.error('Error starting Vite server:', err.message);
        if (err.code === 'ENOENT') {
            Logger.error('npx command not found. Make sure Node.js and npm are installed and in your PATH.');
            Logger.error('You may need to run `npm install` in the ui directory first.');
            Logger.error('Current working directory:', process.cwd());
            Logger.error('UI directory path checked:', uiDir);
        }
        process.exit(1);
    });

    viteProcess.on('close', code => {
        Logger.info(`Vite server exited with code ${code}`);
        Logger.info('Vite server closed. Press Ctrl+C to shut down the WebSocket server as well.');
    });

    return viteProcess;
};

// Save NAR state
const saveNarState = async (nar) => {
    const fs = await import('fs');
    const state = nar.serialize();
    await fs.promises.writeFile(DEFAULT_CONFIG.persistence.defaultPath, JSON.stringify(state, null, 2));
    Logger.info('Current state saved to agent.json');
};

// Shutdown services
const shutdownServices = async (webSocketServer) => {
    try {
        await saveNarState(webSocketServer.nar);
    } catch (saveError) {
        Logger.error('Error saving state on shutdown:', saveError.message);
    }

    if (webSocketServer.monitor) await webSocketServer.monitor.stop();
    if (webSocketServer.nar) webSocketServer.nar.stop();
};

// Set up graceful shutdown
const setupGracefulShutdown = async (webSocketServer) => {
    const shutdown = async () => {
        Logger.info('\nShutting down gracefully...');
        await shutdownServices(webSocketServer);
        Logger.info('Servers stopped successfully');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', error => {
        Logger.error('Uncaught exception:', error.message);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
        Logger.error('Unhandled rejection at:', {promise, reason});
        process.exit(1);
    });
};

// Main launch function - abstracted for any data processor
export const launchDataDrivenUI = async (dataProcessorFn, cliArgs = process.argv.slice(2)) => {
    // Import and use the consolidated launcher
    const {execFileSync} = await import('child_process');
    const {fileURLToPath} = await import('url');
    const {dirname, join} = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Path to the consolidated launcher
    const launcherPath = join(__dirname, '../../scripts/ui/launcher.js');

    try {
        // Execute the consolidated launcher with the provided arguments
        execFileSync('node', [launcherPath, ...cliArgs], {stdio: 'inherit'});
    } catch (error) {
        Logger.error('Failed to start UI launcher:', error.message);
        process.exit(1);
    }
};

// For backwards compatibility when called directly, delegate to the consolidated launcher
if (import.meta.url === `file://${process.argv[1]}`) {
    // Import and use the consolidated launcher
    const {execFileSync} = await import('child_process');
    const {fileURLToPath} = await import('url');
    const {dirname, join} = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Path to the consolidated launcher
    const launcherPath = join(__dirname, '../../scripts/ui/launcher.js');

    try {
        // Execute the consolidated launcher with all arguments except the script name
        execFileSync('node', [launcherPath, ...process.argv.slice(2)], {stdio: 'inherit'});
    } catch (error) {
        Logger.error('Failed to start UI launcher:', error.message);
        process.exit(1);
    }
}