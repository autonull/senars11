#!/usr/bin/env node

import {WebSocketMonitor} from './server/WebSocketMonitor.js';
import {App} from './app/App.js';
import {ReplMessageHandler} from './repl/ReplMessageHandler.js';

const DEFAULT_CONFIG = Object.freeze({
    nar: {
        lm: {enabled: false},
        reasoningAboutReasoning: {enabled: true},
        reasoning: {}
    },
    persistence: {defaultPath: './agent.json'},
    webSocket: {
        port: process.env.WS_PORT || 8080,
        host: process.env.WS_HOST || 'localhost',
        maxConnections: 20
    }
});

async function main() {
    console.log('SeNARS starting...');

    let config = {...DEFAULT_CONFIG};
    if (process.env.NODE_ENV === 'test') {
        // Use optimized config for tests
        config = {
            ...config,
            subsystems: {
                metrics: false,
                tools: false,
                lm: false,
                embeddingLayer: false
            },
            nar: {
                ...config.nar,
                performance: {
                    useOptimizedCycle: true,
                    cycle: {
                        maxTaskCacheSize: 1000,
                        maxInferenceCacheSize: 500,
                        batchProcessingEnabled: false
                    }
                },
                reasoning: {
                    ...config.nar.reasoning,
                    useStreamReasoner: true,
                    cpuThrottleInterval: 0,
                    maxCombinations: 25,
                    maxRuleApplications: 50,
                    maxTasksPerBatch: 5,
                    maxDerivationDepth: 5
                },
                cycle: {
                    delay: 1
                }
            }
        };
    }

    const app = new App(config);
    // Create and start the agent (which extends NAR)
    const agent = await app.start({startAgent: true, setupSignals: false});

    const monitor = new WebSocketMonitor(DEFAULT_CONFIG.webSocket);
    await monitor.start();

    const messageHandler = new ReplMessageHandler(agent);
    monitor.attachReplMessageHandler(messageHandler);

    // Connect monitor to the agent (which is a NAR)
    agent.connectToWebSocketMonitor(monitor);

    setupGracefulShutdown(app, monitor);

    // The Agent doesn't have a start() method that blocks like the TUI
    // It's primarily an API-driven engine.
    // If this entry point is meant to be a server/daemon, we just keep running.
    console.log('Server running. Press Ctrl+C to stop.');

    // Keep process alive
    return new Promise(() => {
    });
}

const setupGracefulShutdown = (app, monitor) => {
    const handleShutdown = async (signal) => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        try {
            await app.shutdown();
        } catch (saveError) {
            console.error('Error saving state on shutdown:', saveError?.message || saveError);
        }
        if (monitor) await monitor.stop();
        process.exit(0);
    };

    const handleException = (error, type) => {
        console.error(`${type}:`, error?.message || error);
        process.exit(1);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => handleException(error, 'Uncaught exception'));
    process.on('unhandledRejection', (reason) => handleException(reason, 'Unhandled rejection'));
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Failed to start SeNARS:', error);
        process.exit(1);
    });
}

export {main as startServer};
export * from './module.js';
