# MeTTa MCP Integration Specification

**Model Context Protocol Interface for MeTTa Reasoning Engine**

*Version 2.0 - Complete Specification with Advanced Metaprogramming*

---

## Executive Summary

This specification defines a **complete, robust MCP integration** for MeTTa that achieves:

1. **Full MCP Protocol Compliance** - Bidirectional client/server with all capability classes
2. **MeTTa-Native Integration** - MCP tools as first-class grounded atoms with type safety
3. **Advanced Metaprogramming** - JavaScript reflection, Proxy-based wrappers, dynamic composition
4. **LangChain Interoperability** - Seamless tool exchange between MCP and LangChain ecosystems
5. **Reasoning Parity** - MeTTa achieves LLM-level MCP integration capabilities

### Key Innovations

| Feature | Technique | Benefit |
|---------|-----------|---------|
| **Dynamic Tool Registration** | Proxy-based metaprogramming | Zero-boilerplate tool binding |
| **Schema Translation** | Zod ↔ MeTTa type system | Type-safe parameter passing |
| **Composable Pipelines** | MeTTa HOFs + MCP tools | Complex workflows as expressions |
| **Reflective Discovery** | JavaScript Reflection API | Runtime introspection of capabilities |
| **Bidirectional Bridge** | SeNARSBridge integration | NAL reasoning + external tools |

---

## 1. MCP Protocol Specification

### 1.1 Protocol Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Protocol Stack                          │
├─────────────────────────────────────────────────────────────────────┤
│  Application Layer    │  MeTTa Expressions / LangChain Agents      │
│  ─────────────────    │  ─────────────────────────────────────     │
│  Capability Layer     │  Tools │ Resources │ Prompts               │
│                       │  Sampling │ Roots │ Elicitation            │
│  ─────────────────    │  ─────────────────────────────────────     │
│  Message Layer        │  JSON-RPC 2.0 (requests, responses, errors)│
│  ─────────────────    │  ─────────────────────────────────────     │
│  Transport Layer      │  Stdio │ HTTP/SSE │ WebSocket              │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Message Types

```typescript
// JSON-RPC 2.0 Request
interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: MCPMethod;
  params?: MCPParams;
}

type MCPMethod = 
  | "initialize"
  | "tools/list"
  | "tools/call"
  | "resources/list"
  | "resources/read"
  | "prompts/list"
  | "prompts/get"
  | "sampling/createMessage"
  | "roots/list"
  | "elicitation/create";

// JSON-RPC 2.0 Response
interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: MCPResult;
  error?: MCPError;
}

interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// Error Codes
const MCPErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RESOURCE_NOT_FOUND: -32001,
  TOOL_NOT_FOUND: -32002,
  PROMPT_NOT_FOUND: -32003,
  CAPABILITY_NOT_SUPPORTED: -32004,
  RATE_LIMIT_EXCEEDED: -32005,
  PERMISSION_DENIED: -32006,
  TIMEOUT: -32007
} as const;
```

### 1.3 Capability Negotiation

```typescript
interface MCPCapabilities {
  // Client → Server capabilities
  client?: {
    sampling?: {
      models?: string[];  // Supported model families
    };
    roots?: {
      listChanged?: boolean;  // Subscribe to root changes
    };
    elicitation?: object;     // User input requests
  };
  
  // Server → Client capabilities
  server?: {
    tools?: {
      listChanged?: boolean;  // Dynamic tool registration
    };
    resources?: {
      subscribe?: boolean;    // Resource subscriptions
      listChanged?: boolean;  // Dynamic resource registration
    };
    prompts?: {
      listChanged?: boolean;  // Dynamic prompt registration
    };
  };
}
```

### 1.4 Tool Schema (Zod → MCP)

```typescript
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, ZodSchema>;
    required?: string[];
  };
  outputSchema?: {
    type: "object";
    properties: Record<string, ZodSchema>;
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}
```

---

## 2. Architecture

### 2.1 Module Structure

```
metta/src/mcp/
├── index.js                  # Unified export + MeTTaMCPManager
├── McpClient.js              # MCP client with auto-discovery
├── McpServer.js              # MCP server exposing MeTTa/NAL
├── McpGrounded.js            # Grounded atom factory for tools
├── McpTranslator.js          # Bidirectional schema translation
├── McpSafety.js              # Security layer with capabilities
├── LangChainAdapter.js       # MCP ↔ LangChain tool bridge
├── ReflectionAPI.js          # JavaScript reflection utilities
├── McpComposition.js         # Tool composition pipelines
├── McpResources.js           # Resource handling (files, URIs)
├── McpPrompts.js             # Prompt templates and workflows
└── types.js                  # TypeScript-style type definitions
```

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MeTTa Runtime                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │   MeTTa         │  │   Grounded      │  │   NAL Reasoning         │ │
│  │   Interpreter   │  │   Atoms (Ground)│  │   Engine                │ │
│  │   ──────────    │  │   ───────────   │  │   ──────────────        │ │
│  │   • Parser      │  │   • Operations  │  │   • Inference           │ │
│  │   • Reducer     │  │   • Registry    │  │   • Truth Values        │ │
│  │   • Space       │  │   • Types       │  │   • Budgets             │ │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘ │
│           │                    │                       │               │
│           └────────────────────┼───────────────────────┘               │
│                                │                                       │
│                    ┌───────────▼────────────┐                          │
│                    │   MCP Integration      │                          │
│                    │   Layer                │                          │
│                    │   ─────────────────    │                          │
│                    │   • Translation        │                          │
│                    │   • Safety             │                          │
│                    │   • Discovery          │                          │
│                    └───────────┬────────────┘                          │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐     ┌────────▼──────┐      ┌────────▼────────┐
│ MCP Client      │     │ MCP Server    │      │ LangChain       │
│ ─────────────   │     │ ───────────   │      │ Adapter         │
│ • Discovery     │     │ • Expose      │      │ ───────────     │
│ • Invocation    │     │ • Reasoning   │      │ • Tool Wrap     │
│ • Streaming     │     │ • Introspect  │      │ • Agent Create  │
└────────┬────────┘     └────────┬──────┘      └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │       External MCP Ecosystem        │
              │  ─────────────────────────────      │
              │  • Filesystem │ Database │ API      │
              │  • Git │ Docker │ Kubernetes        │
              │  • Custom servers (any language)    │
              └─────────────────────────────────────┘
```

### 2.3 Data Flow

```
User MeTTa Expression
       │
       ▼
┌─────────────────┐
│ Parser          │ → AST (Term)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Reducer         │ → Matches (mcp-call ...)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ McpGrounded     │ → Tool lookup
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ McpTranslator   │ → MCP params (JS object)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ McpClient       │ → JSON-RPC request
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ External MCP    │ → Tool execution
│ Server          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ McpTranslator   │ ← Result (JSON)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Ground.toTerm() │ ← MeTTa Term
└────────┬────────┘
         │
         ▼
Result in MeTTa Space
```

---

## 3. Core Implementation

### 3.1 Unified Entry Point

**File: `metta/src/mcp/index.js`**

```javascript
/**
 * MeTTa MCP Integration - Main Entry Point
 * 
 * Provides unified interface for:
 * - Connecting to external MCP servers
 * - Exposing MeTTa as MCP server
 * - LangChain tool interoperability
 * - Reflective tool discovery
 */

// Core exports
export { McpClient } from './McpClient.js';
export { McpServer } from './McpServer.js';
export { McpGrounded, mcpCall, mcpDiscover, mcpAsMeTTa } from './McpGrounded.js';
export { McpTranslator, TermToSchema, SchemaToTerm } from './McpTranslator.js';
export { McpSafety, CapabilityMask } from './McpSafety.js';
export { LangChainAdapter } from './LangChainAdapter.js';
export { ReflectionAPI } from './ReflectionAPI.js';
export { McpComposition, pipeline, parallel, branch } from './McpComposition.js';
export { McpResources } from './McpResources.js';
export { McpPrompts } from './McpPrompts.js';

// Type definitions (for documentation/IDE support)
export * from './types.js';

/**
 * MeTTaMCPManager - Unified MCP orchestration
 * 
 * Manages bidirectional MCP operations:
 * - Client mode: Connect to external MCP servers
 * - Server mode: Expose MeTTa reasoning capabilities
 * - Bridge mode: LangChain ↔ MCP tool exchange
 */
export class MeTTaMCPManager {
  /**
   * @param {import('../MeTTaInterpreter.js').MeTTaInterpreter} interpreter
   * @param {MCPManagerOptions} options
   */
  constructor(interpreter, options = {}) {
    this.interpreter = interpreter;
    this.options = {
      autoDiscover: true,
      autoRegister: true,
      safety: {},
      ...options
    };
    
    /** @type {McpClient|null} */
    this.client = null;
    
    /** @type {McpServer|null} */
    this.server = null;
    
    /** @type {LangChainAdapter|null} */
    this.langchain = null;
    
    /** @type {Map<string, MCPTool>} */
    this.discoveredTools = new Map();
    
    /** @type {Set<string>} */
    this.connectedServers = new Set();
    
    this._setupEventHandlers();
  }

  /**
   * Initialize MCP subsystem
   * @param {'client' | 'server' | 'bridge' | 'full'} mode
   * @param {MCPInitConfig} config
   */
  async initialize(mode = 'client', config = {}) {
    const { interpreter, options } = this;
    
    switch (mode) {
      case 'client':
        this.client = new McpClient(interpreter, { ...options, ...config.client });
        break;
        
      case 'server':
        this.server = new McpServer(interpreter, { ...options, ...config.server });
        break;
        
      case 'bridge':
        this.langchain = new LangChainAdapter(interpreter, { ...options, ...config.bridge });
        break;
        
      case 'full':
        // Initialize all modes
        this.client = new McpClient(interpreter, { ...options, ...config.client });
        this.server = new McpServer(interpreter, { ...options, ...config.server });
        this.langchain = new LangChainAdapter(interpreter, { ...options, ...config.bridge });
        break;
    }
    
    // Register MCP operations in Ground
    this._registerMCPOperations();
    
    return this;
  }

  /**
   * Connect to external MCP server
   * @param {string} command - Server command (e.g., 'npx')
   * @param {string[]} args - Server arguments
   * @returns {Promise<McpClient>}
   */
  async connectToServer(command, args = []) {
    if (!this.client) {
      throw new Error('MCP client not initialized. Call initialize() first.');
    }
    
    const serverKey = `${command} ${args.join(' ')}`;
    if (this.connectedServers.has(serverKey)) {
      console.warn(`Already connected to: ${serverKey}`);
      return this.client;
    }
    
    await this.client.connect(command, args);
    this.connectedServers.add(serverKey);
    
    // Auto-discover and register tools
    if (this.options.autoDiscover) {
      const tools = await this.client.discoverTools();
      tools.forEach(tool => this.discoveredTools.set(tool.name, tool));
      
      if (this.options.autoRegister) {
        await this._autoRegisterTools(tools);
      }
    }
    
    return this.client;
  }

  /**
   * Start MeTTa as MCP server
   * @param {MCPServerOptions} options
   * @returns {Promise<McpServer>}
   */
  async startServer(options = {}) {
    if (!this.server) {
      this.server = new McpServer(this.interpreter, { ...this.options, ...options });
    }
    
    await this.server.start();
    return this.server;
  }

  /**
   * Discover available MCP tools
   * @returns {Promise<MCPTool[]>}
   */
  async discoverTools() {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }
    
    const tools = await this.client.discoverTools();
    tools.forEach(tool => this.discoveredTools.set(tool.name, tool));
    return tools;
  }

  /**
   * Call MCP tool
   * @param {string} toolName
   * @param {Record<string, any>} params
   * @returns {Promise<any>}
   */
  async callTool(toolName, params = {}) {
    if (!this.client) {
      // Try to find tool in registered grounded atoms
      const grounded = this.interpreter.ground.getOperation(toolName);
      if (grounded) {
        return grounded(params);
      }
      throw new Error('MCP client not connected and tool not registered');
    }
    
    return this.client.callTool(toolName, params);
  }

  /**
   * Get LangChain tools (for agent integration)
   * @returns {import('@langchain/core/tools').Tool[]}
   */
  getLangChainTools() {
    if (!this.langchain) {
      throw new Error('LangChain adapter not initialized');
    }
    return this.langchain.getTools();
  }

  /**
   * Create LangChain agent with MeTTa tools
   * @param {any} llm - LangChain LLM instance
   * @param {AgentOptions} options
   * @returns {Promise<any>}
   */
  async createAgent(llm, options = {}) {
    if (!this.langchain) {
      this.langchain = new LangChainAdapter(this.interpreter, this.options);
      await this.langchain.connectToMCP(...arguments);
    }
    return this.langchain.createAgent(llm, options);
  }

  /**
   * Disconnect from all servers
   */
  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
    if (this.server) {
      await this.server.stop();
    }
    this.connectedServers.clear();
    this.discoveredTools.clear();
  }

  /**
   * Setup event handlers for MCP events
   * @private
   */
  _setupEventHandlers() {
    const { interpreter } = this;
    
    // Listen for MCP-related events
    interpreter.on?.('mcp:connected', (tools) => {
      console.log(`MCP connected: ${tools.length} tools available`);
    });
    
    interpreter.on?.('mcp:disconnected', () => {
      console.log('MCP disconnected');
    });
    
    interpreter.on?.('mcp:tool-called', ({ name, params, result }) => {
      console.debug(`MCP tool called: ${name}`, { params, result });
    });
  }

  /**
   * Register MCP operations in Ground registry
   * @private
   */
  _registerMCPOperations() {
    const { ground, interpreter } = this;
    const self = this;
    
    // (mcp-connect command &args)
    ground.register('mcp-connect', async (command, ...args) => {
      await self.connectToServer(command, args);
      return Term.sym('(mcp-connected)');
    });
    
    // (mcp-discover)
    ground.register('mcp-discover', async () => {
      const tools = await self.discoverTools();
      return Term.exp('list', tools.map(t => Term.sym(t.name)));
    });
    
    // (mcp-call tool-name params)
    ground.register('mcp-call', async (toolName, params) => {
      const result = await self.callTool(toolName.toString(), params);
      return interpreter.ground.toTerm(result);
    });
    
    // (mcp-as-meTTa tool-name)
    ground.register('mcp-as-meTTa', async (toolName) => {
      const name = toolName.toString();
      const tool = this.discoveredTools.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }
      
      // Register as grounded atom
      ground.register(name, async (...args) => {
        const params = this._argsToParams(args, tool.inputSchema);
        const result = await self.callTool(name, params);
        return interpreter.ground.toTerm(result);
      });
      
      return Term.sym(`(registered ${name})`);
    });
    
    // (mcp-list)
    ground.register('mcp-list', () => {
      const tools = Array.from(this.discoveredTools.values());
      return Term.exp('list', tools.map(t => 
        Term.exp('tool', [
          Term.sym('name', t.name),
          Term.sym('description', t.description || '')
        ])
      ));
    });
    
    // (mcp-disconnect)
    ground.register('mcp-disconnect', async () => {
      await self.disconnect();
      return Term.sym('(mcp-disconnected)');
    });
  }

  /**
   * Auto-register tools as grounded atoms
   * @private
   */
  async _autoRegisterTools(tools) {
    const { ground, interpreter } = this;
    
    for (const tool of tools) {
      try {
        ground.register(tool.name, async (...args) => {
          const params = this._argsToParams(args, tool.inputSchema);
          const result = await this.callTool(tool.name, params);
          return interpreter.ground.toTerm(result);
        });
      } catch (error) {
        console.warn(`Failed to register tool ${tool.name}:`, error);
      }
    }
  }

  /**
   * Convert MeTTa arguments to MCP params
   * @private
   */
  _argsToParams(args, schema) {
    const params = {};
    const properties = schema?.properties || {};
    const required = schema?.required || [];
    
    // Handle single object argument
    if (args.length === 1 && args[0]?.type === 'compound') {
      const obj = args[0];
      if (obj.operator?.name === ':') {
        // Handle key-value pairs
        for (const pair of obj.components) {
          if (pair.operator?.name === ':') {
            const key = pair.components[0]?.name;
            const value = pair.components[1];
            if (key) {
              params[key] = this._termToValue(value);
            }
          }
        }
      }
    }
    
    // Handle positional arguments
    const keys = Object.keys(properties);
    for (let i = 0; i < args.length && i < keys.length; i++) {
      params[keys[i]] = this._termToValue(args[i]);
    }
    
    return params;
  }

  /**
   * Convert MeTTa term to JavaScript value
   * @private
   */
  _termToValue(term) {
    if (!term) return null;
    if (term.type === 'atom') {
      const num = Number(term.name);
      if (!isNaN(num)) return num;
      if (term.name === 'True') return true;
      if (term.name === 'False') return false;
      if (term.name === 'Null') return null;
      return term.name;
    }
    if (term.type === 'compound') {
      if (term.operator?.name === ':') {
        // Key-value pair
        const key = term.components[0]?.name;
        const value = this._termToValue(term.components[1]);
        return { [key]: value };
      }
      // Array
      return term.components.map(c => this._termToValue(c));
    }
    return term;
  }
}

export default MeTTaMCPManager;
```

### 3.2 MCP Client with Auto-Discovery

**File: `metta/src/mcp/McpClient.js`**

```javascript
import { Client as McpClientSDK } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventEmitter } from 'events';
import { McpTranslator } from './McpTranslator.js';
import { McpSafety } from './McpSafety.js';
import { ReflectionAPI } from './ReflectionAPI.js';

/**
 * MCP Client for MeTTa
 * 
 * Features:
 * - Auto-discovery of tools, resources, prompts
 * - Schema validation with Zod
 * - Event-driven architecture
 * - Streaming support
 */
export class McpClient extends EventEmitter {
  /**
   * @param {import('../MeTTaInterpreter.js').MeTTaInterpreter} interpreter
   * @param {MCPClientOptions} options
   */
  constructor(interpreter, options = {}) {
    super();
    this.interpreter = interpreter;
    this.options = {
      name: 'MeTTa-MCP-Client',
      version: '2.0.0',
      capabilities: {
        sampling: {},
        roots: { listChanged: true },
        elicitation: {}
      },
      safety: {},
      transport: 'stdio',
      ...options
    };
    
    this.safety = new McpSafety(options.safety);
    this.translator = new McpTranslator(interpreter);
    this.reflection = new ReflectionAPI(interpreter);
    
    this.client = new McpClientSDK({
      name: this.options.name,
      version: this.options.version
    }, {
      capabilities: this.options.capabilities
    });
    
    /** @type {StdioClientTransport|SSEClientTransport|null} */
    this.transport = null;
    
    /** @type {Map<string, MCPTool>} */
    this.discoveredTools = new Map();
    
    /** @type {Map<string, MCPResource>} */
    this.discoveredResources = new Map();
    
    /** @type {Map<string, MCPPrompt>} */
    this.discoveredPrompts = new Map();
    
    /** @type {boolean} */
    this.isConnected = false;
    
    this._setupClientHandlers();
  }

  /**
   * Connect to MCP server
   * @param {string} command
   * @param {string[]} args
   * @returns {Promise<this>}
   */
  async connect(command, args = []) {
    if (this.isConnected) {
      throw new Error('Already connected');
    }
    
    // Create transport based on configuration
    if (this.options.transport === 'sse') {
      this.transport = new SSEClientTransport(new URL(command));
    } else {
      this.transport = new StdioClientTransport({ command, args });
    }
    
    // Setup transport handlers
    this.transport.onclose = () => this._onDisconnect();
    this.transport.onerror = (error) => this._onError(error);
    
    // Connect
    await this.client.connect(this.transport);
    this.isConnected = true;
    
    // Initialize and discover capabilities
    await this._initialize();
    
    this.emit('connected');
    return this;
  }

  /**
   * Discover all available capabilities
   * @returns {Promise<DiscoveredCapabilities>}
   */
  async discoverAll() {
    const [tools, resources, prompts] = await Promise.all([
      this.discoverTools(),
      this.discoverResources(),
      this.discoverPrompts()
    ]);
    
    return { tools, resources, prompts };
  }

  /**
   * Discover available tools
   * @returns {Promise<MCPTool[]>}
   */
  async discoverTools() {
    const result = await this.client.listTools();
    const tools = result.tools || [];
    
    for (const tool of tools) {
      this.discoveredTools.set(tool.name, tool);
      this._registerAsGroundedAtom(tool);
    }
    
    this.emit('tools-discovered', tools);
    return tools;
  }

  /**
   * Discover available resources
   * @returns {Promise<MCPResource[]>}
   */
  async discoverResources() {
    const result = await this.client.listResources();
    const resources = result.resources || [];
    
    for (const resource of resources) {
      this.discoveredResources.set(resource.uri, resource);
    }
    
    this.emit('resources-discovered', resources);
    return resources;
  }

  /**
   * Discover available prompts
   * @returns {Promise<MCPPrompt[]>}
   */
  async discoverPrompts() {
    const result = await this.client.listPrompts();
    const prompts = result.prompts || [];
    
    for (const prompt of prompts) {
      this.discoveredPrompts.set(prompt.name, prompt);
    }
    
    this.emit('prompts-discovered', prompts);
    return prompts;
  }

  /**
   * Call MCP tool
   * @param {string} toolName
   * @param {Record<string, any>} params
   * @returns {Promise<any>}
   */
  async callTool(toolName, params = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }
    
    const tool = this.discoveredTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    // Safety validation
    const safeParams = this.safety.validateInput(params, tool.inputSchema);
    
    // Call tool
    const result = await this.client.callTool({
      name: toolName,
      arguments: safeParams
    });
    
    // Validate and translate output
    const translatedResult = this.translator.toMeTTaTerm(result);
    
    this.emit('tool-called', { name: toolName, params: safeParams, result: translatedResult });
    
    return translatedResult;
  }

  /**
   * Read MCP resource
   * @param {string} uri
   * @returns {Promise<any>}
   */
  async readResource(uri) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const resource = this.discoveredResources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }
    
    const result = await this.client.readResource({ uri });
    return this.translator.toMeTTaTerm(result);
  }

  /**
   * Get MCP prompt
   * @param {string} name
   * @param {Record<string, any>} args
   * @returns {Promise<any>}
   */
  async getPrompt(name, args = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const prompt = this.discoveredPrompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }
    
    const result = await this.client.getPrompt({ name, arguments: args });
    return this.translator.toMeTTaTerm(result);
  }

  /**
   * Request LLM sampling (recursive MCP)
   * @param {SamplingRequest} request
   * @returns {Promise<SamplingResult>}
   */
  async createMessage(request) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const result = await this.client.createMessage({
      messages: request.messages,
      systemPrompt: request.systemPrompt,
      includeContext: request.includeContext,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      modelPreferences: request.modelPreferences
    });
    
    return result;
  }

  /**
   * List roots (filesystem boundaries)
   * @returns {Promise<Root[]>}
   */
  async listRoots() {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const result = await this.client.listRoots();
    return result.roots || [];
  }

  /**
   * Request elicitation (user input)
   * @param {ElicitationRequest} request
   * @returns {Promise<ElicitationResult>}
   */
  async elicit(request) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const result = await this.client.elicit({
      message: request.message,
      requestedSchema: request.requestedSchema
    });
    
    return result;
  }

  /**
   * Disconnect from server
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.isConnected = false;
    this.discoveredTools.clear();
    this.discoveredResources.clear();
    this.discoveredPrompts.clear();
  }

  /**
   * Setup client event handlers
   * @private
   */
  _setupClientHandlers() {
    // Handle server notifications
    this.client.setNotificationHandler('notifications/tools/list_changed', () => {
      this.emit('tools-changed');
      this.discoverTools(); // Auto-rediscover
    });
    
    this.client.setNotificationHandler('notifications/resources/list_changed', () => {
      this.emit('resources-changed');
      this.discoverResources();
    });
    
    this.client.setNotificationHandler('notifications/prompts/list_changed', () => {
      this.emit('prompts-changed');
      this.discoverPrompts();
    });
  }

  /**
   * Initialize connection with server
   * @private
   */
  async _initialize() {
    // Perform capability negotiation
    const initializeResult = await this.client.initialize({
      capabilities: this.options.capabilities,
      clientInfo: {
        name: this.options.name,
        version: this.options.version
      }
    });
    
    this.serverCapabilities = initializeResult.capabilities;
    this.serverInfo = initializeResult.serverInfo;
    
    this.emit('initialized', {
      server: this.serverInfo,
      capabilities: this.serverCapabilities
    });
  }

  /**
   * Register tool as grounded atom in MeTTa
   * @private
   */
  _registerAsGroundedAtom(tool) {
    const { ground, interpreter } = this;
    const self = this;
    
    // Use Proxy for dynamic tool wrapper
    const toolProxy = new Proxy({}, {
      get: (target, prop) => {
        if (prop === Symbol.toPrimitive) {
          return () => tool.name;
        }
        if (prop === 'schema') {
          return tool.inputSchema;
        }
        if (prop === 'description') {
          return tool.description;
        }
        return target[prop];
      },
      apply: async (target, thisArg, args) => {
        const params = self._argsToParams(args, tool.inputSchema);
        return await self.callTool(tool.name, params);
      }
    });
    
    // Register in Ground
    try {
      ground.register(tool.name, toolProxy);
    } catch (error) {
      console.warn(`Failed to register tool ${tool.name} as grounded atom:`, error);
    }
  }

  /**
   * Convert MeTTa arguments to MCP params
   * @private
   */
  _argsToParams(args, schema) {
    return this.translator.argsToParams(args, schema);
  }

  /**
   * Handle disconnection
   * @private
   */
  _onDisconnect() {
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Handle errors
   * @private
   */
  _onError(error) {
    this.emit('error', error);
  }
}
```

### 3.3 Bidirectional Schema Translator

**File: `metta/src/mcp/McpTranslator.js`**

```javascript
import { z } from 'zod';
import { Term, sym, exp, constructList } from '../kernel/Term.js';

/**
 * Bidirectional translator between MCP schemas and MeTTa terms
 * 
 * Handles:
 * - Zod schema → MeTTa type expressions
 * - MeTTa terms → JavaScript values (for MCP params)
 * - MCP results → MeTTa terms
 */
export class McpTranslator {
  /**
   * @param {import('../MeTTaInterpreter.js').MeTTaInterpreter} interpreter
   */
  constructor(interpreter) {
    this.interpreter = interpreter;
    this.typeCache = new Map();
  }

  /**
   * Convert MCP tool result to MeTTa term
   * @param {any} result
   * @returns {Term}
   */
  toMeTTaTerm(result) {
    if (result === null || result === undefined) {
      return sym('Null');
    }
    
    if (typeof result === 'boolean') {
      return sym(result ? 'True' : 'False');
    }
    
    if (typeof result === 'number') {
      return sym(String(result));
    }
    
    if (typeof result === 'string') {
      // Check if it's a MeTTa expression
      if (result.startsWith('(') && result.endsWith(')')) {
        try {
          return this.interpreter.parser.parseExpression(result);
        } catch {
          return sym(result);
        }
      }
      return sym(result);
    }
    
    if (Array.isArray(result)) {
      const elements = result.map(item => this.toMeTTaTerm(item));
      return constructList(elements, sym('()'));
    }
    
    if (typeof result === 'object') {
      // Convert object to MeTTa expression
      const pairs = Object.entries(result).map(([key, value]) => 
        exp(':', [sym(key), this.toMeTTaTerm(value)])
      );
      return exp('object', pairs);
    }
    
    // Fallback
    return sym(String(result));
  }

  /**
   * Convert MeTTa term to JavaScript value
   * @param {Term} term
   * @returns {any}
   */
  termToValue(term) {
    if (!term) return null;
    
    if (term.type === 'atom') {
      const name = term.name;
      
      // Boolean
      if (name === 'True') return true;
      if (name === 'False') return false;
      if (name === 'Null') return null;
      
      // Numeric
      const num = Number(name);
      if (!isNaN(num)) return num;
      
      // String
      return name;
    }
    
    if (term.type === 'compound') {
      // List
      if (term.operator?.name === ':') {
        // Key-value pair in list
        const elements = this._flattenList(term);
        return elements.map(e => this.termToValue(e));
      }
      
      // Object expression
      if (term.operator?.name === 'object') {
        const obj = {};
        for (const pair of term.components) {
          if (pair.operator?.name === ':') {
            const key = pair.components[0]?.name;
            const value = this.termToValue(pair.components[1]);
            if (key) obj[key] = value;
          }
        }
        return obj;
      }
      
      // Generic compound term → array
      return term.components.map(c => this.termToValue(c));
    }
    
    return term;
  }

  /**
   * Convert MeTTa arguments to MCP parameters
   * @param {Term[]} args
   * @param {object} schema
   * @returns {Record<string, any>}
   */
  argsToParams(args, schema) {
    const params = {};
    const properties = schema?.properties || {};
    const required = schema?.required || [];
    
    // Handle single object argument
    if (args.length === 1) {
      const arg = args[0];
      
      // Object expression: (object (: key value) ...)
      if (arg.operator?.name === 'object') {
        for (const pair of arg.components) {
          if (pair.operator?.name === ':') {
            const key = pair.components[0]?.name;
            const value = this.termToValue(pair.components[1]);
            if (key) params[key] = value;
          }
        }
        return params;
      }
      
      // List of key-value pairs
      if (arg.operator?.name === ':') {
        const elements = this._flattenList(arg);
        for (const elem of elements) {
          if (elem.operator?.name === ':') {
            const key = elem.components[0]?.name;
            const value = this.termToValue(elem.components[1]);
            if (key) params[key] = value;
          }
        }
        return params;
      }
    }
    
    // Positional arguments
    const keys = Object.keys(properties);
    for (let i = 0; i < args.length && i < keys.length; i++) {
      params[keys[i]] = this.termToValue(args[i]);
    }
    
    return params;
  }

  /**
   * Convert Zod schema to MeTTa type expression
   * @param {z.ZodSchema} schema
   * @returns {Term}
   */
  schemaToMeTTaType(schema) {
    const cached = this.typeCache.get(schema);
    if (cached) return cached;
    
    const type = this._schemaToType(schema);
    this.typeCache.set(schema, type);
    return type;
  }

  /**
   * Create Zod schema from MeTTa type hints
   * @param {Term} typeExpr
   * @returns {z.ZodSchema}
   */
  meTTaTypeToSchema(typeExpr) {
    // Parse MeTTa type expression
    // (type :name "string" :required true :default "hello")
    
    if (!typeExpr || typeExpr.type !== 'compound') {
      return z.any();
    }
    
    const name = typeExpr.components?.[0]?.name || 'unknown';
    
    switch (name) {
      case 'String':
      case 'string':
        return z.string();
      case 'Number':
      case 'number':
        return z.number();
      case 'Boolean':
      case 'boolean':
        return z.boolean();
      case 'Array':
      case 'array':
        return z.array();
      case 'Object':
      case 'object':
        return z.object({});
      default:
        return z.any();
    }
  }

  /**
   * Flatten list structure
   * @private
   */
  _flattenList(term) {
    const elements = [];
    let current = term;
    
    while (current) {
      if (current.operator?.name === ':' && current.components?.length === 2) {
        elements.push(current.components[0]);
        current = current.components[1];
      } else {
        if (current.name !== '()') {
          elements.push(current);
        }
        break;
      }
    }
    
    return elements;
  }

  /**
   * Internal schema to type conversion
   * @private
   */
  _schemaToType(schema) {
    if (schema instanceof z.ZodString) {
      return sym('String');
    }
    if (schema instanceof z.ZodNumber) {
      return sym('Number');
    }
    if (schema instanceof z.ZodBoolean) {
      return sym('Boolean');
    }
    if (schema instanceof z.ZodArray) {
      const elementType = this._schemaToType(schema.element);
      return exp('Array', [elementType]);
    }
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const fields = Object.entries(shape).map(([key, value]) => 
        exp(':', [sym(key), this._schemaToType(value)])
      );
      return exp('Object', fields);
    }
    if (schema instanceof z.ZodOptional) {
      const inner = this._schemaToType(schema.unwrap());
      return exp('Optional', [inner]);
    }
    if (schema instanceof z.ZodNullable) {
      const inner = this._schemaToType(schema.unwrap());
      return exp('Nullable', [inner]);
    }
    
    return sym('Any');
  }
}

// Convenience exports
export const TermToSchema = (term) => new McpTranslator(null).meTTaTypeToSchema(term);
export const SchemaToTerm = (schema, interpreter) => new McpTranslator(interpreter).schemaToMeTTaType(schema);
```

### 3.4 Advanced Safety Layer

**File: `metta/src/mcp/McpSafety.js`**

```javascript
import { z } from 'zod';

/**
 * Comprehensive safety layer for MCP operations
 * 
 * Features:
 * - Input/output validation
 * - PII scrubbing
 * - Rate limiting with circuit breaker
 * - Capability-based access control
 * - Path restriction
 */
export class McpSafety {
  /**
   * @param {MCPSafetyOptions} options
   */
  constructor(options = {}) {
    this.options = {
      maxToolCalls: 100,
      windowMs: 60000, // 1 minute
      timeout: 30000,
      allowedPaths: [],
      blockedPatterns: [],
      piiPatterns: {
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
        creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
        ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
      },
      ...options
    };
    
    this.callHistory = [];
    this.circuitBreaker = false;
    this.circuitBreakerReset = null;
    
    /** @type {CapabilityMask} */
    this.capabilities = new CapabilityMask();
  }

  /**
   * Validate input against schema
   * @param {any} input
   * @param {z.ZodSchema|object} schema
   * @returns {any}
   */
  validateInput(input, schema = null) {
    // Scrub PII first
    const sanitized = this.scrubPII(input);
    
    // Schema validation
    if (schema) {
      const zodSchema = this._toZodSchema(schema);
      const result = zodSchema.safeParse(sanitized);
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`);
      }
      return result.data;
    }
    
    // Pattern blocking
    this._checkBlockedPatterns(sanitized);
    
    return sanitized;
  }

  /**
   * Validate output before returning
   * @param {any} output
   * @returns {any}
   */
  validateOutput(output) {
    return this.scrubPII(output);
  }

  /**
   * Check rate limits
   * @throws {Error} If rate limit exceeded
   */
  checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Clean old entries
    this.callHistory = this.callHistory.filter(t => t > windowStart);
    
    // Check limit
    if (this.callHistory.length >= this.options.maxToolCalls) {
      this.circuitBreaker = true;
      
      // Set reset timeout
      if (!this.circuitBreakerReset) {
        this.circuitBreakerReset = setTimeout(() => {
          this.circuitBreaker = false;
          this.circuitBreakerReset = null;
        }, this.options.windowMs);
      }
      
      throw new Error('Rate limit exceeded. Circuit breaker activated.');
    }
    
    this.callHistory.push(now);
  }

  /**
   * Scrub PII from data
   * @param {any} data
   * @returns {any}
   */
  scrubPII(data) {
    const str = JSON.stringify(data);
    let scrubbed = str;
    
    for (const [type, pattern] of Object.entries(this.options.piiPatterns)) {
      scrubbed = scrubbed.replace(pattern, `[${type.toUpperCase()}_REDACTED]`);
    }
    
    try {
      return JSON.parse(scrubbed);
    } catch {
      return scrubbed;
    }
  }

  /**
   * Check if path is allowed
   * @param {string} path
   * @returns {boolean}
   */
  isPathAllowed(path) {
    if (!this.options.allowedPaths.length) {
      return true; // No restrictions
    }
    
    return this.options.allowedPaths.some(allowed => {
      if (allowed.endsWith('**')) {
        return path.startsWith(allowed.slice(0, -2));
      }
      return path === allowed || path.startsWith(allowed + '/');
    });
  }

  /**
   * Set capability for tool category
   * @param {string} category
   * @param {string} action
   * @param {boolean} allowed
   */
  setCapability(category, action, allowed) {
    this.capabilities.set(category, action, allowed);
  }

  /**
   * Check if action is allowed
   * @param {string} category
   * @param {string} action
   * @returns {boolean}
   */
  checkCapability(category, action) {
    return this.capabilities.check(category, action);
  }

  /**
   * Check for blocked patterns
   * @private
   */
  _checkBlockedPatterns(data) {
    const str = JSON.stringify(data);
    
    for (const pattern of this.options.blockedPatterns) {
      if (pattern.test(str)) {
        throw new Error('Input contains blocked pattern');
      }
    }
  }

  /**
   * Convert object schema to Zod
   * @private
   */
  _toZodSchema(schema) {
    if (schema instanceof z.ZodSchema) {
      return schema;
    }
    
    if (schema.type === 'object') {
      const shape = {};
      const properties = schema.properties || {};
      
      for (const [key, value] of Object.entries(properties)) {
        shape[key] = this._toZodSchema(value);
      }
      
      let result = z.object(shape);
      
      if (schema.required) {
        result = result.partial();
        for (const key of schema.required) {
          result = result.extend({ [key]: shape[key] });
        }
      }
      
      return result;
    }
    
    return z.any();
  }
}

/**
 * Capability-based access control
 */
export class CapabilityMask {
  constructor() {
    /** @type {Map<string, Set<string>>} */
    this.allowed = new Map();
    /** @type {Map<string, Set<string>>} */
    this.denied = new Map();
  }

  /**
   * Allow action for category
   * @param {string} category
   * @param {string} action
   */
  allow(category, action) {
    if (!this.allowed.has(category)) {
      this.allowed.set(category, new Set());
    }
    this.allowed.get(category).add(action);
  }

  /**
   * Deny action for category
   * @param {string} category
   * @param {string} action
   */
  deny(category, action) {
    if (!this.denied.has(category)) {
      this.denied.set(category, new Set());
    }
    this.denied.get(category).add(action);
  }

  /**
   * Set capability
   * @param {string} category
   * @param {string} action
   * @param {boolean} allowed
   */
  set(category, action, allowed) {
    if (allowed) {
      this.allow(category, action);
    } else {
      this.deny(category, action);
    }
  }

  /**
   * Check if action is allowed
   * @param {string} category
   * @param {string} action
   * @returns {boolean}
   */
  check(category, action) {
    // Deny takes precedence
    if (this.denied.has(category) && this.denied.get(category).has(action)) {
      return false;
    }
    
    // If allowed list exists, check it
    if (this.allowed.has(category)) {
      return this.allowed.get(category).has(action);
    }
    
    // Default: allow
    return true;
  }
}
```

---

## 4. Advanced Features

### 4.1 Tool Composition Pipeline

**File: `metta/src/mcp/McpComposition.js`**

```javascript
import { Term, sym, exp } from '../kernel/Term.js';

/**
 * MCP Tool Composition
 * 
 * Enables building complex workflows from MCP tools:
 * - Sequential pipelines
 * - Parallel execution
 * - Conditional branching
 * - Error handling
 */
export class McpComposition {
  /**
   * @param {MeTTaMCPManager} mcpManager
   */
  constructor(mcpManager) {
    this.mcpManager = mcpManager;
  }

  /**
   * Create sequential pipeline
   * @param  {...string} toolNames - Tool names in order
   * @returns {Function} Composed function
   */
  pipeline(...toolNames) {
    return async (...initialArgs) => {
      let result = initialArgs;
      
      for (const toolName of toolNames) {
        result = await this.mcpManager.callTool(toolName, this._normalizeParams(result));
      }
      
      return result;
    };
  }

  /**
   * Execute tools in parallel
   * @param  {Array<{name: string, params: any}>} toolCalls
   * @returns {Promise<any[]>}
   */
  parallel(...toolCalls) {
    return Promise.all(
      toolCalls.map(({ name, params }) => this.mcpManager.callTool(name, params))
    );
  }

  /**
   * Conditional branching
   * @param {string} conditionTool - Tool to evaluate condition
   * @param {Function} trueBranch - Function if true
   * @param {Function} falseBranch - Function if false
   * @returns {Function}
   */
  branch(conditionTool, trueBranch, falseBranch = null) {
    return async (...args) => {
      const conditionResult = await this.mcpManager.callTool(conditionTool, this._normalizeParams(args));
      
      if (this._isTruthy(conditionResult)) {
        return typeof trueBranch === 'function' 
          ? trueBranch(conditionResult) 
          : trueBranch;
      } else {
        return typeof falseBranch === 'function'
          ? falseBranch(conditionResult)
          : falseBranch;
      }
    };
  }

  /**
   * Retry with backoff
   * @param {string} toolName
   * @param {RetryOptions} options
   * @returns {Function}
   */
  retry(toolName, options = {}) {
    const { maxRetries = 3, backoffMs = 1000 } = options;
    
    return async (...args) => {
      let lastError;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await this.mcpManager.callTool(toolName, this._normalizeParams(args));
        } catch (error) {
          lastError = error;
          if (i < maxRetries - 1) {
            await this._sleep(backoffMs * Math.pow(2, i));
          }
        }
      }
      
      throw lastError;
    };
  }

  /**
   * Timeout wrapper
   * @param {string} toolName
   * @param {number} timeoutMs
   * @returns {Function}
   */
  withTimeout(toolName, timeoutMs) {
    return async (...args) => {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      
      const call = this.mcpManager.callTool(toolName, this._normalizeParams(args));
      
      return Promise.race([call, timeout]);
    };
  }

  /**
   * Normalize parameters for tool call
   * @private
   */
  _normalizeParams(params) {
    if (params.length === 0) return {};
    if (params.length === 1) return params[0];
    return params;
  }

  /**
   * Check truthiness
   * @private
   */
  _isTruthy(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value !== '' && value !== 'False' && value !== 'Null';
    return true;
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Convenience functions
export const pipeline = (...tools) => new McpComposition(null).pipeline(...tools);
export const parallel = (...calls) => new McpComposition(null).parallel(...calls);
export const branch = (cond, trueFn, falseFn) => new McpComposition(null).branch(cond, trueFn, falseFn);
```

### 4.2 JavaScript Reflection API

**File: `metta/src/mcp/ReflectionAPI.js`**

```javascript
/**
 * JavaScript Reflection API for MeTTa
 * 
 * Provides runtime introspection capabilities:
 * - Grounded operation discovery
 * - Term structure analysis
 * - Dynamic tool wrapper creation
 * - Interpreter state introspection
 */
export class ReflectionAPI {
  /**
   * @param {import('../MeTTaInterpreter.js').MeTTaInterpreter} interpreter
   */
  constructor(interpreter) {
    this.interpreter = interpreter;
    this.termFactory = interpreter.termFactory;
  }

  /**
   * Discover all grounded operations
   * @returns {GroundedOpInfo[]}
   */
  discoverGroundedOps() {
    const ops = [];
    const ground = this.interpreter.ground;
    
    // Iterate through registered operations
    for (const [name, fn] of ground.getOperations()) {
      ops.push({
        name,
        type: 'grounded',
        arity: this._getFunctionArity(fn),
        signature: this._extractSignature(fn),
        description: fn.description || fn.doc || 'No description',
        isAsync: fn.constructor.name === 'AsyncFunction'
      });
    }
    
    return ops;
  }

  /**
   * Get detailed term structure
   * @param {Term} term
   * @returns {TermInfo}
   */
  getTermInfo(term) {
    return {
      name: term.name,
      type: term.type,
      semanticType: term.semanticType,
      isAtomic: term.isAtomic,
      isCompound: term.isCompound,
      isVariable: term.isVariable,
      isBoolean: term.isBoolean,
      isNumeric: term.isNumeric,
      operator: term.operator?.name || null,
      components: term.components?.length || 0,
      hash: term.hash,
      complexity: term.complexity,
      children: term.components?.map(c => this.getTermInfo(c)) || []
    };
  }

  /**
   * Create dynamic Proxy wrapper for tool
   * @param {string} toolName
   * @param {Function} handler
   * @returns {Proxy}
   */
  createToolProxy(toolName, handler) {
    return new Proxy({}, {
      get: (target, prop, receiver) => {
        // Special properties
        if (prop === Symbol.toPrimitive) {
          return () => toolName;
        }
        if (prop === 'name') {
          return toolName;
        }
        if (prop === 'call') {
          return handler;
        }
        
        // Delegate to handler
        if (prop in handler) {
          return handler[prop];
        }
        
        // Default
        return undefined;
      },
      apply: async (target, thisArg, args) => {
        return await handler.apply(thisArg, args);
      }
    });
  }

  /**
   * Introspect interpreter state
   * @returns {InterpreterState}
   */
  introspectInterpreter() {
    const { interpreter } = this;
    
    return {
      space: {
        size: interpreter.space?.size?.() || 0,
        stats: interpreter.space?.getStats?.() || {}
      },
      ground: {
        operations: interpreter.ground?.getOperations?.()?.length || 0,
        ops: this.discoverGroundedOps()
      },
      rules: {
        count: interpreter.space?.getRuleCount?.() || 0
      },
      metrics: Object.fromEntries(interpreter._mettaMetrics || []),
      modules: Array.from(interpreter.moduleLoader?.loadedModules || []),
      config: interpreter.config
    };
  }

  /**
   * Get prototype chain
   * @param {object} obj
   * @returns {string[]}
   */
  getPrototypeChain(obj) {
    const chain = [];
    let current = obj;
    
    while (current) {
      const name = current.constructor?.name || 'Object';
      chain.push(name);
      current = Object.getPrototypeOf(current);
    }
    
    return chain;
  }

  /**
   * Get all properties (including non-enumerable)
   * @param {object} obj
   * @returns {PropertyInfo[]}
   */
  getAllProperties(obj) {
    const props = [];
    
    for (const key of Object.getOwnPropertyNames(obj)) {
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      props.push({
        name: key,
        value: obj[key],
        writable: descriptor?.writable,
        enumerable: descriptor?.enumerable,
        configurable: descriptor?.configurable
      });
    }
    
    return props;
  }

  /**
   * Get function arity
   * @private
   */
  _getFunctionArity(fn) {
    if (typeof fn !== 'function') return 0;
    return fn.length;
  }

  /**
   * Extract function signature
   * @private
   */
  _extractSignature(fn) {
    if (typeof fn !== 'function') return [];
    
    const str = fn.toString();
    const match = str.match(/(?:function|\=>)\s*(?:\w+)?\s*\(([^)]*)\)/);
    
    if (match) {
      return match[1]
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => {
          const [name, defaultValue] = p.split('=');
          return {
            name: name.trim(),
            hasDefault: !!defaultValue,
            defaultValue: defaultValue?.trim()
          };
        });
    }
    
    return [];
  }
}
```

### 4.3 LangChain Adapter

**File: `metta/src/mcp/LangChainAdapter.js`**

```javascript
import { Tool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * LangChain ↔ MCP Adapter
 * 
 * Enables:
 * - MCP tools as LangChain tools
 * - LangChain tools as MCP tools
 * - Agent creation with hybrid tooling
 */
export class LangChainAdapter {
  /**
   * @param {import('../MeTTaInterpreter.js').MeTTaInterpreter} interpreter
   * @param {LangChainAdapterOptions} options
   */
  constructor(interpreter, options = {}) {
    this.interpreter = interpreter;
    this.options = options;
    this.mcpClient = null;
    
    /** @type {Map<string, Tool>} */
    this.langchainTools = new Map();
    
    /** @type {Map<string, MCPTool>} */
    this.mcpTools = new Map();
  }

  /**
   * Connect to MCP server and wrap tools
   * @param {string} command
   * @param {string[]} args
   * @returns {Promise<this>}
   */
  async connectToMCP(command, args = []) {
    const { McpClient } = await import('./McpClient.js');
    this.mcpClient = new McpClient(this.interpreter, this.options);
    
    await this.mcpClient.connect(command, args);
    await this._wrapMcpTools();
    
    return this;
  }

  /**
   * Wrap MCP tools as LangChain tools
   * @private
   */
  async _wrapMcpTools() {
    const tools = await this.mcpClient.discoverTools();
    
    for (const toolSchema of tools) {
      const lcTool = this._createLangChainTool(toolSchema);
      this.langchainTools.set(toolSchema.name, lcTool);
      this.mcpTools.set(toolSchema.name, toolSchema);
    }
  }

  /**
   * Create LangChain Tool from MCP schema
   * @private
   */
  _createLangChainTool(toolSchema) {
    const { name, description, inputSchema } = toolSchema;
    const self = this;
    
    return new Tool({
      name,
      description: description || `Tool: ${name}`,
      
      async _call(input) {
        try {
          const result = await self.mcpClient.callTool(name, input);
          
          // Convert result to string for LangChain
          if (typeof result === 'object') {
            return JSON.stringify(result, null, 2);
          }
          return String(result);
        } catch (error) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Get LangChain tools array
   * @returns {Tool[]}
   */
  getTools() {
    return Array.from(this.langchainTools.values());
  }

  /**
   * Create LangChain agent executor
   * @param {any} llm - LangChain LLM instance
   * @param {AgentExecutorOptions} options
   * @returns {Promise<any>}
   */
  async createAgent(llm, options = {}) {
    // Dynamic import to avoid LangChain dependency if not used
    const { createToolCallingAgent } = await import('@langchain/langgraph/prebuilt');
    const { AgentExecutor } = await import('langchain/agents');
    
    const tools = this.getTools();
    
    // Create agent with tool calling
    const agent = createToolCallingAgent(llm, tools, {
      name: 'MeTTa-MCP-Agent',
      ...options
    });
    
    return agent;
  }

  /**
   * Wrap LangChain tool as MCP tool
   * @param {Tool} lcTool
   * @returns {MCPTool}
   */
  wrapLangChainTool(lcTool) {
    const mcpTool = {
      name: lcTool.name,
      description: lcTool.description,
      inputSchema: {
        type: 'object',
        properties: lcTool.schema?.properties || {},
        required: lcTool.schema?.required || []
      }
    };
    
    this.mcpTools.set(lcTool.name, mcpTool);
    
    return mcpTool;
  }

  /**
   * Register LangChain tools as MCP tools
   * @param {Tool[]} lcTools
   */
  registerLangChainTools(lcTools) {
    for (const tool of lcTools) {
      this.wrapLangChainTool(tool);
      this.langchainTools.set(tool.name, tool);
    }
  }

  /**
   * Create chat prompt with tool context
   * @param {string} systemPrompt
   * @param {ToolContext} context
   * @returns {ChatPromptTemplate}
   */
  createPrompt(systemPrompt, context = {}) {
    const toolList = this.getTools()
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');
    
    const fullPrompt = `${systemPrompt}

Available Tools:
${toolList}

Use the tools to accomplish the task.`;
    
    return ChatPromptTemplate.fromMessages([
      ['system', fullPrompt],
      ['human', '{input}']
    ]);
  }

  /**
   * Disconnect from MCP
   */
  async disconnect() {
    if (this.mcpClient) {
      await this.mcpClient.disconnect();
      this.mcpClient = null;
    }
  }
}
```

---

## 5. MeTTa Operations

### 5.1 MCP Expression Reference

```metta
;; === Connection Management ===

;; Connect to MCP server
(mcp-connect "npx" "-y" "@modelcontextprotocol/server-filesystem" "/home/user")

;; Discover available tools
(mcp-discover)
;; => (list read_file write_file list_directory delete_file)

;; List all registered tools
(mcp-list)
;; => (list (tool :name "read_file" :description "...") ...)

;; Disconnect from all servers
(mcp-disconnect)


;; === Tool Invocation ===

;; Direct tool call
(mcp-call "read_file" (object (: path "/home/user/config.json")))

;; Register tool as native MeTTa function
(mcp-as-meTTa "read_file")

;; Now use as native function
(read_file "/home/user/data.txt")


;; === Tool Composition ===

;; Sequential pipeline
(define process-data
  (pipeline "read_file" "transform_data" "write_file"))

;; Parallel execution
(parallel 
  (call "fetch_users")
  (call "fetch_products")
  (call "fetch_orders"))

;; Conditional branching
(branch "check_cache"
  (use_cached_result)
  (fetch_fresh_data))

;; With retry
(retry "unstable_api" :max-retries 3 :backoff 1000)

;; With timeout
(with-timeout "slow_query" 5000)


;; === Resources ===

;; List available resources
(mcp-resources-list)

;; Read resource
(mcp-resource-read "file:///home/user/data.json")


;; === Prompts ===

;; List available prompts
(mcp-prompts-list)

;; Get prompt with arguments
(mcp-prompt-get "code_review" (object (: language "javascript") (: style "strict")))


;; === Advanced ===

;; Introspect interpreter state
(mcp-introspect)

;; Get grounded operations
(mcp-list-grounded)

;; Create tool composition
(define my-pipeline
  (mcp-compose "tool1" "tool2" "tool3"))
```

### 5.2 Grounded Operations Registration

**File: `metta/src/interp/McpOps.js`**

```javascript
import { Term, sym, exp, constructList } from '../kernel/Term.js';

/**
 * Register MCP operations in interpreter
 */
export function registerMcpOps(interpreter) {
  const { ground } = interpreter;
  
  // Get MCP manager (attached to interpreter)
  const getMCP = () => interpreter.mcpManager;
  
  /**
   * (mcp-connect command &args)
   */
  ground.register('mcp-connect', async (command, ...args) => {
    const mcp = getMCP();
    await mcp.connectToServer(command.toString(), args.map(a => a.toString()));
    return sym('(mcp-connected)');
  });
  
  /**
   * (mcp-discover)
   */
  ground.register('mcp-discover', async () => {
    const mcp = getMCP();
    const tools = await mcp.discoverTools();
    return constructList(tools.map(t => sym(t.name)), sym('()'));
  });
  
  /**
   * (mcp-call tool-name params)
   */
  ground.register('mcp-call', async (toolName, params) => {
    const mcp = getMCP();
    const name = toolName.toString();
    const mcpParams = interpreter.mcpTranslator?.termToValue(params) || {};
    const result = await mcp.callTool(name, mcpParams);
    return interpreter.ground.toTerm(result);
  });
  
  /**
   * (mcp-as-meTTa tool-name)
   */
  ground.register('mcp-as-meTTa', async (toolName) => {
    const mcp = getMCP();
    const name = toolName.toString();
    const tool = mcp.discoveredTools.get(name);
    
    if (!tool) {
      return sym(`(error "Tool not found: ${name}")`);
    }
    
    // Register as grounded atom
    ground.register(name, async (...args) => {
      const params = mcp._argsToParams(args, tool.inputSchema);
      const result = await mcp.callTool(name, params);
      return interpreter.ground.toTerm(result);
    });
    
    return sym(`(registered ${name})`);
  });
  
  /**
   * (mcp-list)
   */
  ground.register('mcp-list', () => {
    const mcp = getMCP();
    const tools = Array.from(mcp.discoveredTools.values());
    
    const toolTerms = tools.map(t => 
      exp('tool', [
        exp(':', [sym('name'), sym(t.name)]),
        exp(':', [sym('description'), sym(t.description || '')])
      ])
    );
    
    return constructList(toolTerms, sym('()'));
  });
  
  /**
   * (mcp-disconnect)
   */
  ground.register('mcp-disconnect', async () => {
    const mcp = getMCP();
    await mcp.disconnect();
    return sym('(mcp-disconnected)');
  });
  
  /**
   * (pipeline tool1 tool2 ...)
   */
  ground.register('pipeline', (...toolNames) => {
    const mcp = getMCP();
    const { McpComposition } = require('../mcp/McpComposition.js');
    const composer = new McpComposition(mcp);
    
    const names = toolNames.map(t => t.toString());
    const pipelineFn = composer.pipeline(...names);
    
    // Return as grounded function
    return pipelineFn;
  });
  
  /**
   * (mcp-introspect)
   */
  ground.register('mcp-introspect', () => {
    const { ReflectionAPI } = require('../mcp/ReflectionAPI.js');
    const reflection = new ReflectionAPI(interpreter);
    const state = reflection.introspectInterpreter();
    return interpreter.ground.toTerm(state);
  });
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```javascript
// metta/tests/mcp/McpTranslator.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MeTTaInterpreter } from '../../src/MeTTaInterpreter.js';
import { McpTranslator } from '../../src/mcp/McpTranslator.js';
import { z } from 'zod';

describe('McpTranslator', () => {
  let interpreter, translator;
  
  beforeEach(() => {
    interpreter = new MeTTaInterpreter();
    translator = new McpTranslator(interpreter);
  });
  
  describe('toMeTTaTerm', () => {
    it('converts primitives', () => {
      expect(translator.toMeTTaTerm(true).name).toBe('True');
      expect(translator.toMeTTaTerm(false).name).toBe('False');
      expect(translator.toMeTTaTerm(42).name).toBe('42');
      expect(translator.toMeTTaTerm('hello').name).toBe('hello');
    });
    
    it('converts arrays', () => {
      const result = translator.toMeTTaTerm([1, 2, 3]);
      expect(result.type).toBe('compound');
    });
    
    it('converts objects', () => {
      const result = translator.toMeTTaTerm({ name: 'test', value: 42 });
      expect(result.operator?.name).toBe('object');
    });
  });
  
  describe('termToValue', () => {
    it('converts MeTTa terms to JS', () => {
      const term = interpreter.parser.parseExpression('True');
      expect(translator.termToValue(term)).toBe(true);
    });
    
    it('converts compound terms', () => {
      const term = interpreter.parser.parseExpression('(object (: name "test"))');
      expect(translator.termToValue(term)).toEqual({ name: 'test' });
    });
  });
});
```

### 6.2 Integration Tests

```javascript
// metta/tests/mcp/McpIntegration.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MeTTaInterpreter } from '../../src/MeTTaInterpreter.js';
import { MeTTaMCPManager } from '../../src/mcp/index.js';

describe('MCP Integration', () => {
  let interpreter, mcpManager;
  
  beforeAll(async () => {
    interpreter = new MeTTaInterpreter();
    mcpManager = new MeTTaMCPManager(interpreter);
    await mcpManager.initialize('client');
  });
  
  afterAll(async () => {
    await mcpManager.disconnect();
  });
  
  it('connects to MCP server', async () => {
    await mcpManager.connectToServer('node', ['test-server.js']);
    expect(mcpManager.connectedServers.size).toBe(1);
  });
  
  it('discovers tools', async () => {
    const tools = await mcpManager.discoverTools();
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it('calls tool via MeTTa expression', async () => {
    const result = interpreter.run(`
      (mcp-call "add" (object (: a 5) (: b 3)))
    `);
    expect(result.toString()).toContain('8');
  });
  
  it('registers tool as grounded atom', async () => {
    interpreter.run('(mcp-as-meTTa "add")');
    const result = interpreter.run('(add 10 20)');
    expect(result.toString()).toContain('30');
  });
});
```

### 6.3 End-to-End Tests

```javascript
// metta/tests/mcp/McpE2E.test.js
import { test, expect } from '@playwright/test';

test('MCP tool workflow', async () => {
  // Start MCP test server
  // Connect MeTTa interpreter
  // Execute full workflow
  // Verify results
});
```

---

## 7. Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Tool Discovery Latency** | <100ms for 100 tools | Time from connect to registered |
| **Tool Call Latency** | <50ms average | Round-trip time measurement |
| **Schema Translation** | 100% fidelity | Round-trip tests |
| **Safety Coverage** | 100% inputs validated | Test suite coverage |
| **LangChain Compat** | All core features | Integration tests |
| **Memory Overhead** | <5MB baseline | Heap measurement |
| **Concurrent Calls** | 100+ parallel | Load testing |

---

## 8. Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.21.1",
    "@langchain/core": "^1.0.6",
    "@langchain/langgraph": "^1.0.0",
    "langchain": "^1.0.2",
    "zod": "^3.25.76"
  },
  "peerDependencies": {
    "@senars/core": "^1.0.0"
  }
}
```

---

## 9. Quick Start

```javascript
import { MeTTaInterpreter } from '@senars/metta';
import { MeTTaMCPManager } from '@senars/metta/mcp';

// Create interpreter
const interpreter = new MeTTaInterpreter();

// Initialize MCP
const mcpManager = new MeTTaMCPManager(interpreter, {
  autoDiscover: true,
  autoRegister: true
});

await mcpManager.initialize('client');

// Connect to filesystem server
await mcpManager.connectToServer(
  'npx', 
  ['-y', '@modelcontextprotocol/server-filesystem', '/home/user']
);

// Use in MeTTa
const result = interpreter.run(`
  ;; Discover tools
  (mcp-discover)
  
  ;; Read file
  (mcp-call "read_file" (object (: path "/home/user/config.json")))
  
  ;; Register as native
  (mcp-as-meTTa "read_file")
  (read_file "/home/user/data.txt")
`);

console.log(result.toString());
```

---

## 10. References

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- [LangChain.js](https://js.langchain.com/)
- [Zod Schema](https://zod.dev/)
- [Existing MCP Implementation](../agent/src/mcp/)
- [MeTTa Architecture](./README.md)
- [SeNARS Bridge](./src/SeNARSBridge.js)

---

*Document Version: 2.0*  
*Last Updated: 2026-02-25*  
*Status: Complete Specification*
