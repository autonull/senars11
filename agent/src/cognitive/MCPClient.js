/**
 * MCPClient.js - Model Context Protocol Client
 *
 * Provides tool integration for the cognitive architecture.
 * Connects to MCP servers for extended capabilities.
 */
import {Logger} from '@senars/core';
import {EventEmitter} from 'events';

export class MCPClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            servers: config.servers || [],
            autoConnect: config.autoConnect ?? true,
            timeout: config.timeout ?? 5000
        };

        this.connections = new Map();
        this.availableTools = new Map();
        this.connected = false;

        Logger.info('[MCPClient] Initialized');
    }

    /**
     * Connect to MCP servers
     */
    async connect() {
        for (const serverConfig of this.config.servers) {
            try {
                await this._connectToServer(serverConfig);
            } catch (error) {
                Logger.error(`[MCPClient] Failed to connect to ${serverConfig.name}:`, error);
            }
        }

        this.connected = this.connections.size > 0;
        Logger.info(`[MCPClient] Connected to ${this.connections.size} server(s)`);
    }

    /**
     * Connect to a single MCP server
     */
    async _connectToServer(config) {
        // For now, register built-in tools
        // In production, this would use actual MCP protocol
        this._registerBuiltInTools(config.name);

        this.connections.set(config.name, {
            name: config.name,
            status: 'connected',
            tools: this._getToolsForServer(config.name)
        });

        this.emit('connected', {server: config.name});
    }

    /**
     * Register built-in tools
     */
    _registerBuiltInTools(serverName) {
        // Web search tool
        this.availableTools.set('web_search', {
            name: 'web_search',
            description: 'Search the web for information',
            server: serverName,
            schema: {
                query: {type: 'string', required: true}
            },
            handler: async (args) => await this._webSearch(args.query)
        });

        // File operations
        this.availableTools.set('read_file', {
            name: 'read_file',
            description: 'Read contents of a file',
            server: serverName,
            schema: {
                path: {type: 'string', required: true}
            },
            handler: async (args) => await this._readFile(args.path)
        });

        // Calculator
        this.availableTools.set('calculate', {
            name: 'calculate',
            description: 'Perform mathematical calculations',
            server: serverName,
            schema: {
                expression: {type: 'string', required: true}
            },
            handler: async (args) => this._calculate(args.expression)
        });

        // Memory operations
        this.availableTools.set('remember', {
            name: 'remember',
            description: 'Store information in long-term memory',
            server: serverName,
            schema: {
                fact: {type: 'string', required: true},
                category: {type: 'string', required: false}
            },
            handler: async (args) => this._remember(args.fact, args.category)
        });
    }

    /**
     * Get tools for a server
     */
    _getToolsForServer(serverName) {
        const tools = [];
        for (const [name, tool] of this.availableTools.entries()) {
            if (tool.server === serverName) {
                tools.push(name);
            }
        }
        return tools;
    }

    /**
     * Call a tool by name
     */
    async callTool(toolName, args = {}) {
        const tool = this.availableTools.get(toolName);

        if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
        }

        try {
            Logger.info(`[MCPClient] Calling tool: ${toolName}`, args);
            const result = await tool.handler(args);

            this.emit('tool_call', {
                tool: toolName,
                args,
                result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            Logger.error(`[MCPClient] Tool ${toolName} failed:`, error);
            throw error;
        }
    }

    /**
     * List available tools
     */
    listTools() {
        return Array.from(this.availableTools.values()).map(t => ({
            name: t.name,
            description: t.description,
            schema: t.schema
        }));
    }

    // === Built-in Tool Implementations ===

    /**
     * Web search (mock for now)
     */
    async _webSearch(query) {
        Logger.info('[MCPClient] Web search:', query);

        // In production, integrate with actual search API
        return {
            results: [
                {
                    title: `Search results for: ${query}`,
                    snippet: 'This is a placeholder. Configure actual search API.',
                    url: '#'
                }
            ],
            query,
            timestamp: Date.now()
        };
    }

    /**
     * Read file
     */
    async _readFile(path) {
        try {
            const fs = await import('fs/promises');
            const content = await fs.readFile(path, 'utf-8');
            return {content, path};
        } catch (error) {
            return {error: error.message, path};
        }
    }

    /**
     * Calculate expression
     */
    _calculate(expression) {
        try {
            // Safe evaluation of math expressions
            const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
            const result = Function(`"use strict"; return (${sanitized})`)();
            return {expression, result};
        } catch (error) {
            return {error: 'Invalid expression', expression};
        }
    }

    /**
     * Remember fact (emits event for cognitive architecture to handle)
     */
    _remember(fact, category = 'general') {
        this.emit('remember', {fact, category, timestamp: Date.now()});
        return {success: true, fact, category};
    }

    /**
     * Disconnect from all servers
     */
    async disconnect() {
        for (const [name, connection] of this.connections.entries()) {
            connection.status = 'disconnected';
            this.emit('disconnected', {server: name});
        }
        this.connections.clear();
        this.connected = false;
        Logger.info('[MCPClient] Disconnected');
    }

    /**
     * Get client state
     */
    getState() {
        return {
            connected: this.connected,
            serverCount: this.connections.size,
            toolCount: this.availableTools.size,
            servers: Array.from(this.connections.values())
        };
    }
}
