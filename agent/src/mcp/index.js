/**
 * SeNARS MCP System - Main Entry Point
 */
import {Client} from './Client.js';
import {Server} from './Server.js';

export {Client, Server};

/**
 * Connect as an MCP client using Stdio
 */
export async function connectMCPClient(command, args, options = {}) {
    const client = new Client({command, args, ...options});
    await client.connect();
    return client;
}

/**
 * Setup an MCP server (Stdio)
 */
export async function setupMCPServer(options = {}) {
    const server = new Server(options);
    await server.start();
    return server;
}

/**
 * Main SeNARS MCP system class
 */
export class MCPManager {
    constructor(options = {}) {
        this.options = options;
        this.client = null;
        this.server = null;
    }

    async initialize(mode = 'client', options = {}) {
        this.options = {...this.options, ...options};
        // Initialization logic if needed (e.g. create internal NAR if server mode)
        return this;
    }

    async connectAsClient(command, args = []) {
        this.client = new Client({command, args});
        await this.client.connect();
        return this.client;
    }

    async setupAsServer(options = {}) {
        this.server = new Server(options);
        // Note: server.start() hijacks stdio, so typically not called in same process unless dedicated
        return this.server;
    }

    async callTool(toolName, input) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        return await this.client.callTool(toolName, input);
    }
}

export default MCPManager;
