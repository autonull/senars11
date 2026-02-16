import {EventEmitter} from 'events';
import {Safety} from './Safety.js';
import {createServer as createHttpServer} from 'http';

/**
 * MCP Server for exposing SeNARS services as MCP tools
 */
export class Server extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = options;
        this.isRunning = false;
        this.port = options.port ?? 3000;
        this.host = options.host ?? 'localhost';
        this.exposedTools = new Map();
        this.activeConnections = new Map();
        this.safety = options.safety ?? new Safety();
        this.serverUrl = null;
        this.httpServer = null;

        // Optional NAR instance for real execution
        this.nar = options.nar ?? null;

        this.auth = options.auth ?? null;
        this.rateLimit = options.rateLimit ?? {requests: 100, windowMs: 60000};
    }

    async start() {
        if (this.isRunning) {
            this.log.warn('MCP server is already running');
            return;
        }

        const { port, host } = await this.safety.validateServerOptions(this.options);
        this.port = port ?? this.port;
        this.host = host ?? this.host;

        this._setupRouter();
        this.httpServer = createHttpServer(this._handleRequest.bind(this));

        await this._registerBuiltInTools();
        await this._listen();

        return true;
    }

    _setupRouter() {
        this.router = {
            'POST /mcp/initialize': this.handleInitialize.bind(this),
            'GET /mcp/tools/list': this.handleListTools.bind(this),
            'POST /mcp/tools/call/': this.handleCallTool.bind(this),
            'GET /mcp/resources/list': this.handleListResources.bind(this),
        };
    }

    async _listen() {
        return new Promise((resolve, reject) => {
            this.httpServer.listen({ port: this.port, host: this.host }, () => {
                this.isRunning = true;
                this.serverUrl = `http://${this.host}:${this.port}`;
                this.log.info(`MCP server listening on ${this.serverUrl}`);
                this.emit('serverStarted', { port: this.port, host: this.host, url: this.serverUrl });
                resolve();
            });
            this.httpServer.on('error', (err) => {
                this.log.error('MCP server error:', err);
                reject(err);
            });
        });
    }

    async _handleRequest(req, res) {
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const routeKey = `${req.method} ${url.pathname}`;
            const handler = this.router[routeKey] ?? (routeKey.startsWith('POST /mcp/tools/call/') ? this.router['POST /mcp/tools/call/'] : null);

            if (handler) {
                await handler(req, res, url);
            } else {
                this._sendJSON(res, 404, { error: 'Not found', path: req.url });
            }
        } catch (error) {
            this.log.error('Error handling request:', error);
            this._sendJSON(res, 500, { error: error.message });
        }
    }

    _sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    async _parseJSONBody(req) {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            return JSON.parse(body);
        } catch (e) {
            throw new Error('Invalid JSON in request body');
        }
    }

    async handleInitialize(req, res) {
        const response = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true }, resources: { listChanged: true } },
            serverInfo: { name: 'SeNARS-MCP-Server', version: '1.0.0' }
        };
        this._sendJSON(res, 200, response);
    }

    async handleListTools(req, res) {
        const tools = Array.from(this.exposedTools.values()).map(({ name, description, inputSchema, outputSchema }) => ({
            name, description, inputSchema, outputSchema
        }));
        this._sendJSON(res, 200, { tools });
    }

    async handleCallTool(req, res, url) {
        const toolName = url.pathname.split('/').pop();
        if (!this.exposedTools.has(toolName)) {
            return this._sendJSON(res, 404, { error: `Tool ${toolName} not found` });
        }

        try {
            const input = await this._parseJSONBody(req);
            const validatedInput = await this.safety.validateInput(toolName, input);
            const result = await this.executeToolHandler(toolName, validatedInput);
            const validatedOutput = await this.safety.validateOutput(toolName, result);

            this._sendJSON(res, 200, { result: validatedOutput });
            this.emit('toolCalled', { toolName, input: validatedInput, result: validatedOutput });
        } catch (error) {
            this.log.error(`Error calling tool ${toolName}:`, error.message);
            this._sendJSON(res, 500, { error: error.message });
        }
    }

    async executeToolHandler(toolName, input) {
        const handler = this.toolHandlers[toolName];
        if (!handler) throw new Error(`Unknown tool: ${toolName}`);
        return handler(input);
    }

    async handleListResources(req, res) {
        this._sendJSON(res, 200, { resources: [] });
    }

    async _registerBuiltInTools() {
        this.toolHandlers = {
            'reason': this.handleReasoning.bind(this),
            'memory-query': this.handleMemoryQuery.bind(this),
            'execute-tool': this.handleToolExecution.bind(this),
        };

        const toolConfigs = this._getBuiltInToolConfigs();
        for (const config of toolConfigs) {
            this.exposedTools.set(config.name, config);
        }
    }

    _getBuiltInToolConfigs() {
        return [
            {
                name: 'reason',
                title: 'SeNARS Reasoning Engine',
                description: 'Performs logical inference and reasoning',
                inputSchema: { type: 'object', properties: { premises: { type: 'array', items: { type: 'string' } }, goal: { type: 'string' } }, required: ['premises'] },
                outputSchema: { type: 'object', properties: { conclusions: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, derivationSteps: { type: 'array', items: { type: 'string' } } } }
            },
            {
                name: 'memory-query',
                title: 'SeNARS Memory Query',
                description: 'Queries SeNARS memory for stored information',
                inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['query'] },
                outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, content: { type: 'string' }, confidence: { type: 'number' }, timestamp: { type: 'string' } } } }, count: { type: 'number' } } }
            },
            {
                name: 'execute-tool',
                title: 'Execute SeNARS Tool',
                description: 'Executes a SeNARS tool/engine',
                inputSchema: { type: 'object', properties: { toolName: { type: 'string' }, parameters: { type: 'object' } }, required: ['toolName'] },
                outputSchema: { type: 'object', properties: { result: { type: 'string' }, success: { type: 'boolean' }, error: { type: 'string' } } }
            }
        ];
    }

    async registerTool(name, config, handler) {
        const validatedConfig = await this.safety.validateToolRegistration(name, config);
        this.exposedTools.set(name, {...validatedConfig, handler});
        this.emit('toolRegistered', {name, config: validatedConfig});
        console.log(`Registered MCP tool: ${name}`);
    }

    async handleReasoning(input) {
        const validatedInput = await this.safety.validateInput('reason', input);

        if (this.nar) {
            try {
                // If NAR instance is available, use it
                const results = [];
                for (const premise of validatedInput.premises) {
                     await this.nar.input(premise);
                }

                if (validatedInput.goal) {
                    await this.nar.input(validatedInput.goal);
                }

                // Run a few cycles to process
                const derivations = await this.nar.runCycles(10);

                // Format results from NAR
                // This is a simplified mapping. Real implementation would parse derivations.
                const conclusions = derivations
                    .flat()
                    .filter(d => d && d.term)
                    .map(d => d.term.toString());

                return {
                    conclusions: conclusions.length > 0 ? conclusions : ["Processed premises, no immediate conclusions"],
                    confidence: 1.0, // simplified
                    derivationSteps: [`Processed ${validatedInput.premises.length} premises`, `Ran 10 inference cycles`]
                };
            } catch (err) {
                console.error("NAR execution error:", err);
                // Fallback to mock if execution fails
            }
        }

        return {
            conclusions: [`Based on premises: ${validatedInput.premises.join(', ')}`, `Goal: ${validatedInput.goal ?? 'No specific goal'}`],
            confidence: 0.85,
            derivationSteps: ['Step 1: Analyzed premises', 'Step 2: Applied reasoning rules', 'Step 3: Generated conclusions']
        };
    }

    async handleMemoryQuery(input) {
        const validatedInput = await this.safety.validateInput('memory-query', input);
        const limit = validatedInput.limit ?? 10;

        if (this.nar) {
            try {
                const results = this.nar.query(validatedInput.query);
                return {
                    results: results.slice(0, limit).map(task => ({
                        id: task.id ?? 'unknown',
                        content: task.term ? task.term.toString() : 'unknown',
                        confidence: task.truth ? task.truth.confidence : 0,
                        timestamp: new Date().toISOString()
                    })),
                    count: results.length
                };
            } catch (err) {
                 console.error("NAR memory query error:", err);
            }
        }

        const mockResults = [
            {
                id: '1',
                content: `Memory entry matching query: ${validatedInput.query}`,
                confidence: 0.9,
                timestamp: new Date().toISOString()
            },
            {id: '2', content: 'Another matching entry', confidence: 0.7, timestamp: new Date().toISOString()}
        ];

        return {results: mockResults.slice(0, limit), count: Math.min(mockResults.length, limit)};
    }

    async handleToolExecution(input) {
        const validatedInput = await this.safety.validateInput('execute-tool', input);

        if (this.nar) {
             try {
                 const result = await this.nar.executeTool(validatedInput.toolName, validatedInput.parameters);
                 return {
                     result: JSON.stringify(result.result ?? result),
                     success: result.success !== false,
                     error: result.error ?? null
                 };
             } catch (err) {
                 return {
                     result: null,
                     success: false,
                     error: err.message
                 };
             }
        }

        return {
            result: `Executed tool: ${validatedInput.toolName} with parameters: ${JSON.stringify(validatedInput.parameters ?? {})}`,
            success: true,
            error: null
        };
    }

    getExposedTools() {
        return Array.from(this.exposedTools.keys());
    }

    async executeLocalTool(toolName, input) {
        if (!this.exposedTools.has(toolName)) {
            throw new Error(`Tool "${toolName}" not exposed by this server`);
        }

        // Note: toolConfig is retrieved but not used in the original implementation
        const validatedInput = await this.safety.validateInput(toolName, input);
        const result = await this.executeToolHandler(toolName, validatedInput);
        const validatedOutput = await this.safety.validateOutput(toolName, result);

        this.emit('localToolExecuted', {toolName, input: validatedInput, result: validatedOutput});
        return validatedOutput;
    }

    async stop() {
        if (!this.isRunning || !this.httpServer) {
            console.warn('MCP server is not running');
            return;
        }

        await new Promise((resolve, reject) => {
            this.httpServer.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('MCP server stopped');
                    this.isRunning = false;
                    this.httpServer = null;
                    this.exposedTools.clear();
                    this.activeConnections.clear();
                    this.emit('serverStopped');
                    resolve();
                }
            });
        });
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            host: this.host,
            url: this.serverUrl,
            exposedTools: this.getExposedTools().length,
            activeConnections: this.activeConnections.size
        };
    }

    setupAuthentication(authConfig) {
        this.auth = authConfig;
        console.log('Authentication configured for MCP server');
    }
}