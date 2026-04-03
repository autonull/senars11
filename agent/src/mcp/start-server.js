import {NAR} from '@senars/nar';
import {Server} from './Server.js';

async function main() {
    // Initialize NAR with advanced config
    const narConfig = {
        memory: {
            capacity: 1000
        },
        reasoningAboutReasoning: {
            enabled: true
        },
        tools: {
            enabled: true
        },
        logger: {
            level: 'error' // Reduce logging to avoid polluting stderr too much
        }
    };

    const nar = new NAR(narConfig);
    await nar.initialize();
    await nar.start();

    // Initialize and start MCP Server
    const server = new Server({nar});
    await server.start();

    // Handle cleanup
    process.on('SIGINT', async () => {
        console.error("Stopping server...");
        await server.stop();
        await nar.stop();
        process.exit(0);
    });
}

main().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
