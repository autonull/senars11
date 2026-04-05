#!/usr/bin/env node

/**
 * Demo runner script for testing the demo wrapper functionality
 */

import {NAR} from '@senars/nar';
import {DemoWrapper} from './DemoWrapper.js';
import {WebSocketMonitor} from '../server/WebSocketMonitor.js';

async function main() {
    console.log('Starting SeNARS Demo Runner...');

    // Initialize NAR
    const nar = new NAR({
        lm: {enabled: false},
        reasoningAboutReasoning: {enabled: true}
    });
    await nar.initialize();

    // Create a WebSocket monitor for local testing (not actually starting the server)
    const monitor = new WebSocketMonitor({
        port: 8081, // Use a different port to avoid conflicts with main app
        host: 'localhost',
        maxConnections: 20
    });

    // Initialize DemoWrapper
    const demoWrapper = new DemoWrapper();
    await demoWrapper.initialize(nar, monitor);

    // Start the WebSocket monitor
    await monitor.start();

    // Send list of available demos
    await demoWrapper.sendDemoList();

    // Start periodic metrics updates
    await demoWrapper.runPeriodicMetricsUpdate();

    // Start the NAR reasoning cycle
    nar.start();

    console.log('Demo runner started. Available demos:');
    console.log(demoWrapper.getAvailableDemos().map(d => `  - ${d.id}: ${d.name}`).join('\n'));

    // Example: Start the basic usage demo after a delay
    setTimeout(async () => {
        console.log('\nStarting basic usage demo...');
        await demoWrapper.startDemo('basicUsage', {stepDelay: 500});
    }, 2000);

    // Keep the process running
    process.on('SIGINT', async () => {
        console.log('\nShutting down demo runner...');
        nar.stop();
        await monitor.stop();
        process.exit(0);
    });
}

main().catch(console.error);