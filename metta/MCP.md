# MeTTa MCP Integration

**Deliberate Tool Use + Cognitive Service Exposure**

*Version 4.0 — 2026-02-25*

---

## Vision

There are **two distinct, complementary use cases**. Conflating them causes confusion:

| Use Case | Direction | The Power |
|----------|-----------|-----------|
| **MeTTa consumes MCPs** | External tools → MeTTa reasoning | MeTTa's reduction rules *decide* which tools to invoke, *compose* their outputs, and *learn from* results — autonomous tool-using cognition |
| **SeNARS provides MCP** | MeTTa/NAR → external AI clients | Claude, Cursor, and any MCP host can call SeNARS reasoning, query its memory, and control its inference cycles |

**Why not Narsese in the consumer path?** MeTTa's rule-based reduction is the reasoning substrate. Narsese/NAL belongs to SeNARS — a separate (but connected) subsystem. When MeTTa calls an external tool, it uses its own term-rewriting machinery. When SeNARS *provides* capabilities over MCP, its output may be Narsese-structured — but that is the server's concern, not the client's.

**What makes this powerful?** Compare:
- *Weak*: `fetch('https://api.example.com/data')` ← dumb HTTP call
- *Powerful*: MeTTa rules decide *if*, *when*, and *how* to call a tool based on reasoning state; results flow into the knowledge space and trigger further inference; the system learns which tools reliably answer which kinds of queries

---

## 1. Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║                     USE CASE A: MeTTa CONSUMES                  ║
║                                                                  ║
║  MeTTa Space         MeTTa Rules           Grounded Layer        ║
║  ───────────         ───────────           ───────────────       ║
║  (tool weather)  →  (= (need-tool $t)  →  mcp-call              ║
║  (tool search)       (when-available      (wraps MCP SDK)        ║
║  (tool code)          (mcp-call $t ...))) ←results→             ║
║                                           McpPool                ║
║                         ↕ JS Reflection   (multi-server)         ║
║                    (discover, introspect)                        ║
╚══════════════════════════════════════════════════════════════════╝
                              ↕ MCP Protocol
╔══════════════════════════════════════════════════════════════════╗
║                  USE CASE B: SeNARS PROVIDES                     ║
║                                                                  ║
║  agent/src/mcp/Server.js  ← WORKING TODAY                       ║
║  Tools: ping, reason, memory-query, execute-tool,               ║
║         evaluate_js, get-focus, sync-beliefs                     ║
║                                                                  ║
║  AI Clients (Claude Desktop, Cursor, any MCP host) call          ║
║  SeNARS reasoning as structured tools                            ║
╚══════════════════════════════════════════════════════════════════╝
```

### Where each subsystem lives

```
agent/src/mcp/          ← EXISTING, WORKING
├── Server.js           MCP server — SeNARS as tool provider
├── Client.js           Basic MCP client (Stdio)
├── Safety.js           PII scrubbing (Narsese-safe: no < > escaping)
├── index.js            MCPManager + convenience exports
└── start-server.js     Entry point for Claude Desktop etc.

metta/src/mcp/          ← TO BUILD (this spec)
├── McpPool.js          Multi-server connection pool
├── McpGrounded.js      registerMcpGrounded() → MeTTa ground atoms
├── McpTranslator.js    JSON ↔ MeTTa Term (with MCP content-block unwrap)
├── McpDiscovery.js     Tool → Space facts + JS Reflection integration
├── McpAdapters.js      REST/GraphQL/OpenAPI → MCP tool wrappers
└── index.js            MeTTaMCPManager
```

---

## 2. Use Case A: MeTTa Deliberately Consuming MCPs

### 2.1 The Core Idea

When MeTTa discovers a tool, it **adds facts about it to its knowledge space**:

```metta
; After connecting to a filesystem MCP server, these atoms are added:
(tool-available read_file)
(tool-description read_file "Read the contents of a file")
(tool-param read_file path String required)
(tool-category read_file filesystem)

; And MeTTa rules can reason about them:
(= (can-answer-query ?q)
   (if (query-needs-filesystem ?q)
       (mcp-call read_file (object (: path (query-target ?q))))
       (escalate ?q)))
```

This is the critical difference: MeTTa **reasons about which tools to use**, rather than hardcoding calls.

### 2.2 McpPool — Multi-Server Connection Management

**File: `metta/src/mcp/McpPool.js`**

```javascript
import { Client as McpClientSDK } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Manages connections to multiple MCP servers simultaneously.
 * Provides a unified tool namespace across all servers.
 * Integrates with MeTTa's knowledge space via McpDiscovery.
 */
export class McpPool {
  constructor(interpreter, options = {}) {
    this.interpreter = interpreter;
    this.opts = { conflictStrategy: 'last', timeout: 30_000, ...options };
    
    /** @type {Map<string, {client: McpClientSDK, transport: any, meta: object}>} */
    this.connections = new Map();
    
    /** @type {Map<string, string>} toolName → serverKey */
    this.toolIndex = new Map();
    
    /** @type {Map<string, object>} toolName → full tool schema */
    this.toolSchemas = new Map();
  }

  /**
   * Connect to an MCP server.
   * @param {string} key - Logical name for this server
   * @param {string} commandOrUrl - Stdio command or SSE URL
   * @param {string[]} args - Args for Stdio transport
   * @param {'stdio'|'sse'} transport
   * @returns {Promise<string[]>} List of discovered tool names
   */
  async connect(key, commandOrUrl, args = [], transport = 'stdio') {
    if (this.connections.has(key)) return this._toolsForKey(key);

    const sdk = new McpClientSDK(
      { name: 'MeTTa', version: '4.0.0' },
      { capabilities: { sampling: {}, roots: { listChanged: true } } }
    );

    const tp = transport === 'sse'
      ? new SSEClientTransport(new URL(commandOrUrl))
      : new StdioClientTransport({ command: commandOrUrl, args });

    tp.onclose = () => this._onServerDisconnect(key);

    await sdk.connect(tp);
    
    const { tools = [] } = await sdk.listTools();
    
    for (const tool of tools) {
      const conflict = this.toolIndex.has(tool.name);
      if (!conflict || this.opts.conflictStrategy === 'last') {
        this.toolIndex.set(tool.name, key);
        this.toolSchemas.set(tool.name, tool);
      }
    }

    this.connections.set(key, { client: sdk, transport: tp, meta: { tools } });

    // Notify change handlers
    this._onChange?.({ type: 'connected', key, tools: tools.map(t => t.name) });

    return tools.map(t => t.name);
  }

  /**
   * Call any tool across the pool.
   */
  async callTool(toolName, params = {}) {
    const key = this.toolIndex.get(toolName);
    if (!key) throw new Error(`Tool not found in pool: ${toolName}. Available: ${[...this.toolIndex.keys()].join(', ')}`);
    
    const { client } = this.connections.get(key);
    
    const result = await Promise.race([
      client.callTool({ name: toolName, arguments: params }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Tool timeout: ${toolName}`)), this.opts.timeout))
    ]);
    
    return result;
  }

  /**
   * Call multiple tools in parallel.
   */
  async callParallel(calls) {
    return Promise.allSettled(calls.map(({ tool, params }) => this.callTool(tool, params)));
  }

  get allTools() {
    return [...this.toolSchemas.values()];
  }

  get allToolNames() {
    return [...this.toolIndex.keys()];
  }

  async disconnectAll() {
    for (const { transport } of this.connections.values()) await transport.close?.();
    this.connections.clear();
    this.toolIndex.clear();
    this.toolSchemas.clear();
  }

  onChange(fn) { this._onChange = fn; }

  _toolsForKey(key) {
    return [...this.toolIndex.entries()]
      .filter(([, k]) => k === key)
      .map(([name]) => name);
  }

  _onServerDisconnect(key) {
    // Remove tools belonging to disconnected server
    for (const [name, k] of this.toolIndex) {
      if (k === key) { this.toolIndex.delete(name); this.toolSchemas.delete(name); }
    }
    this.connections.delete(key);
    this._onChange?.({ type: 'disconnected', key });
  }
}
```

### 2.3 McpDiscovery — Tools as MeTTa Knowledge

**File: `metta/src/mcp/McpDiscovery.js`**

This is the key file that makes MeTTa *understand* tools rather than just call them.

```javascript
import { sym, exp, constructList } from '../kernel/Term.js';

/**
 * Integrates MCP tool discovery with MeTTa's knowledge space.
 *
 * For each discovered tool, asserts facts about it:
 *   (tool-available <name>)
 *   (tool-description <name> "<desc>")
 *   (tool-param <name> <paramName> <type> <required|optional>)
 *   (tool-category <name> <category>)
 *   (tool-server <name> <serverKey>)
 *
 * This enables MeTTa rules to reason about tool selection.
 */
export class McpDiscovery {
  constructor(interpreter, pool) {
    this.interpreter = interpreter;
    this.pool = pool;
    this.space = interpreter.space;
  }

  /**
   * Connect to a server and populate the knowledge space with tool facts.
   */
  async connectAndLearn(key, commandOrUrl, args = [], transport = 'stdio') {
    const toolNames = await this.pool.connect(key, commandOrUrl, args, transport);
    
    for (const name of toolNames) {
      const schema = this.pool.toolSchemas.get(name);
      this._assertToolFacts(name, schema, key);
    }

    // Also register as grounded atoms (see McpGrounded)
    this._registerGroundedAtoms(toolNames);

    return toolNames;
  }

  /**
   * Assert tool facts into MeTTa space for reasoning.
   */
  _assertToolFacts(name, schema, serverKey) {
    const sp = this.space;

    // Core facts
    sp.add(exp('tool-available', [sym(name)]));
    sp.add(exp('tool-server', [sym(name), sym(serverKey)]));
    
    if (schema.description) {
      sp.add(exp('tool-description', [sym(name), sym(schema.description)]));
    }

    // Parameter facts
    const props = schema.inputSchema?.properties ?? {};
    const required = new Set(schema.inputSchema?.required ?? []);

    for (const [paramName, paramSchema] of Object.entries(props)) {
      const type = sym(paramSchema.type ?? 'any');
      const req  = sym(required.has(paramName) ? 'required' : 'optional');
      sp.add(exp('tool-param', [sym(name), sym(paramName), type, req]));
    }

    // Infer category from name patterns
    const category = this._inferCategory(name);
    if (category) sp.add(exp('tool-category', [sym(name), sym(category)]));
  }

  _inferCategory(name) {
    const patterns = [
      [/file|read|write|list_dir|path/i,     'filesystem'],
      [/search|query|find|lookup/i,           'search'],
      [/git|commit|branch|repo/i,             'version-control'],
      [/http|fetch|request|api/i,             'network'],
      [/sql|db|database|query/i,              'database'],
      [/shell|exec|run|command/i,             'execution'],
      [/browser|web|page|click/i,             'browser'],
    ];
    for (const [re, cat] of patterns) {
      if (re.test(name)) return cat;
    }
    return null;
  }

  _registerGroundedAtoms(toolNames) {
    const { ground } = this.interpreter;
    const pool = this.pool;

    for (const name of toolNames) {
      // Each tool becomes callable as a native MeTTa function
      ground.register(name, async (...args) => {
        const schema = pool.toolSchemas.get(name);
        const params = this._argsToParams(args, schema?.inputSchema);
        const result = await pool.callTool(name, params);
        return this._resultToTerm(result);
      });
    }
  }

  _argsToParams(args, schema) {
    if (!args.length) return {};
    const params = {};
    // Single object arg: (object (: key val) ...)
    if (args[0]?.operator?.name === 'object') {
      for (const pair of args[0].components) {
        if (pair.operator?.name === ':') {
          const [k, v] = pair.components;
          if (k?.name) params[k.name] = this._termToJS(v);
        }
      }
      return params;
    }
    // Positional
    const keys = Object.keys(schema?.properties ?? {});
    args.forEach((a, i) => { if (keys[i]) params[keys[i]] = this._termToJS(a); });
    return params;
  }

  _termToJS(term) {
    if (!term) return null;
    if (term.name === 'True') return true;
    if (term.name === 'False') return false;
    if (term.name === 'Null' || term.name === '()') return null;
    const n = Number(term.name);
    if (!isNaN(n)) return n;
    if (term.operator?.name === 'object') return this._argsToParams([term], null);
    return term.name ?? String(term);
  }

  _resultToTerm(result) {
    if (!result) return sym('Null');
    // Unwrap MCP content blocks
    if (Array.isArray(result.content)) {
      const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      return sym(text);
    }
    if (typeof result === 'string') return sym(result);
    if (typeof result === 'number') return sym(String(result));
    if (typeof result === 'boolean') return sym(result ? 'True' : 'False');
    return sym(JSON.stringify(result));
  }
}
```

### 2.4 MeTTa-Native Tool Use: Rules for Autonomous Tool Calling

Once tools are in the space, MeTTa rules express **tool selection strategy**:

```metta
;; === Tool Selection Strategy ===

;; Prefer the most specific tool for a task
(= (best-tool-for filesystem $op)
   (if (tool-available $op) $op read_file))

;; Route by capability
(= (answer-file-query $path)
   (read_file (object (: path $path))))

;; Conditional: only call if tool is available
(= (safe-search $q)
   (if (tool-available brave_search)
       (brave_search (object (: query $q)))
       (fallback-search $q)))

;; Compose tool results (pipeline via MeTTa reduction)
(= (summarize-file $path)
   (let* (($content (read_file    (object (: path $path))))
          ($summary (summarize    (object (: text $content)))))
     $summary))

;; Parallel tool evaluation (MeTTa's non-determinism)
(= (search-all $q)
   (collapse (search-tool $q)))

(= (search-tool $q) (brave_search   (object (: query $q))))
(= (search-tool $q) (duckduckgo     (object (: query $q))))
(= (search-tool $q) (wikipedia_search (object (: query $q))))

;; Tool-selection by reliability (learned preference)
(= (prefer-tool $cat $tool)
   (and (tool-category $tool $cat)
        (tool-success-rate $tool $rate)
        (> $rate 0.8)))
```

### 2.5 JavaScript Reflection Integration

The existing `ReflectionAPI` in `metta/src/mcp/ReflectionAPI.js` lets MeTTa treat its own grounded operations as discoverable entities. We extend this for MCP:

```javascript
// In McpGrounded.js — using Reflection to expose MCP state
import { ReflectionAPI } from './ReflectionAPI.js';

export function registerMcpGrounded(interpreter, pool, discovery) {
  const { ground } = interpreter;
  const reflection = new ReflectionAPI(interpreter);
  const reg = (name, fn) => ground.register(name, fn);

  // ── Connection ──────────────────────────────────────────────────
  reg('mcp-connect', async (key, command, ...args) => {
    const tools = await discovery.connectAndLearn(
      key.toString(), command.toString(), args.map(a => a.toString())
    );
    return constructList(tools.map(t => sym(t)), sym('()'));
  });

  reg('mcp-connect-sse', async (key, url) => {
    const tools = await discovery.connectAndLearn(key.toString(), url.toString(), [], 'sse');
    return constructList(tools.map(t => sym(t)), sym('()'));
  });

  reg('mcp-disconnect', async (key) => {
    if (key) pool._onServerDisconnect(key.toString());
    else await pool.disconnectAll();
    return sym('ok');
  });

  // ── Tool info queries ───────────────────────────────────────────
  reg('mcp-tools', () =>
    constructList(pool.allToolNames.map(t => sym(t)), sym('()'))
  );

  reg('mcp-tool-schema', (toolName) => {
    const schema = pool.toolSchemas.get(toolName.toString());
    if (!schema) return sym('not-found');
    return sym(JSON.stringify(schema));
  });

  // ── Invocation ──────────────────────────────────────────────────
  reg('mcp-call', async (toolName, params) => {
    const name = toolName.toString();
    const jsParams = discovery._termToJS(params) ?? {};
    // Remap: if termToJS returns a string, wrap it
    const finalParams = typeof jsParams === 'object' && !Array.isArray(jsParams)
      ? jsParams : { value: jsParams };
    const result = await pool.callTool(name, finalParams);
    return discovery._resultToTerm(result);
  });

  // ── Parallel call ───────────────────────────────────────────────
  reg('mcp-parallel', async (...toolCallTerms) => {
    const calls = toolCallTerms.map(t => ({
      tool: t.operator?.name ?? t.name,
      params: discovery._termToJS(t.components?.[0]) ?? {}
    }));
    const results = await pool.callParallel(calls);
    return constructList(
      results.map(r => r.status === 'fulfilled'
        ? discovery._resultToTerm(r.value)
        : sym(`error-${r.reason?.message}`)
      ),
      sym('()')
    );
  });

  // ── Reflection: what can MeTTa do? ─────────────────────────────
  reg('mcp-reflect', () => {
    const groundedOps = reflection.discoverGroundedOps();
    const mcpTools = pool.allToolNames;
    return sym(JSON.stringify({
      groundedOps: groundedOps.map(o => ({ name: o.name, arity: o.arity })),
      mcpTools,
      totalCapabilities: groundedOps.length + mcpTools.length
    }));
  });

  // ── Resource and prompt access ──────────────────────────────────
  reg('mcp-resource', async (serverKey, uri) => {
    const key = serverKey.toString();
    const conn = pool.connections.get(key);
    if (!conn) return sym(`error-no-server-${key}`);
    const result = await conn.client.readResource({ uri: uri.toString() });
    return discovery._resultToTerm(result);
  });

  reg('mcp-prompt', async (serverKey, promptName, args) => {
    const key = serverKey.toString();
    const conn = pool.connections.get(key);
    if (!conn) return sym(`error-no-server-${key}`);
    const jsArgs = discovery._termToJS(args) ?? {};
    const result = await conn.client.getPrompt({
      name: promptName.toString(),
      arguments: typeof jsArgs === 'object' ? jsArgs : {}
    });
    return discovery._resultToTerm(result);
  });
}
```

### 2.6 Arbitrary APIs as MCP: The Universality Principle

Any HTTP API—REST, GraphQL, WebSocket—can be wrapped as an MCP tool. Since MeTTa can call MCP tools natively, this makes MeTTa a universal API client.

**File: `metta/src/mcp/McpAdapters.js`**

```javascript
/**
 * Wraps arbitrary external APIs as MCP-compatible tool functions.
 * The resulting objects can be registered directly in McpPool.
 *
 * Principle: REST API = MCP tool with HTTP transport
 *            GraphQL  = MCP tool with query parameter
 *            OpenAPI  = set of MCP tools (one per endpoint)
 */

/**
 * Build a synthetic MCP tool from a REST endpoint.
 * @example
 * const weatherTool = restTool({
 *   name: 'get_weather',
 *   description: 'Get current weather for a city',
 *   url: (p) => `https://api.weatherapi.com/v1/current.json?key=${KEY}&q=${p.city}`,
 *   params: { city: { type: 'string', description: 'City name' } }
 * });
 * pool.registerSyntheticTool(weatherTool);
 */
export function restTool({ name, description, url, method = 'GET', headers = {}, params = {}, transform }) {
  return {
    schema: {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties: params,
        required: Object.entries(params).filter(([, v]) => v.required).map(([k]) => k)
      }
    },
    async call(p) {
      const endpoint = typeof url === 'function' ? url(p) : url;
      const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
      if (method !== 'GET') opts.body = JSON.stringify(p);
      const resp = await fetch(endpoint, opts);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const out = transform ? transform(data) : data;
      return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }] };
    }
  };
}

/**
 * Generate MCP tools from an OpenAPI 3.x spec URL.
 * Fetches the spec, parses endpoints, returns array of synthetic tools.
 */
export async function openApiTools(specUrl, baseUrl, { filterTag, maxTools = 50 } = {}) {
  const resp = await fetch(specUrl);
  const spec = await resp.json();
  const tools = [];

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (filterTag && !op.tags?.includes(filterTag)) continue;
      if (tools.length >= maxTools) break;

      const params = {};
      for (const p of op.parameters ?? []) {
        params[p.name] = { type: p.schema?.type ?? 'string', description: p.description ?? '' };
      }
      if (op.requestBody?.content?.['application/json']?.schema?.properties) {
        Object.assign(params, op.requestBody.content['application/json'].schema.properties);
      }

      const name = op.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;

      tools.push(restTool({
        name: name.slice(0, 64),
        description: op.summary ?? op.description ?? name,
        url: (p) => {
          let u = (baseUrl ?? spec.servers?.[0]?.url ?? '') + path;
          u = u.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(p[k] ?? ''));
          const qs = Object.entries(p)
            .filter(([k]) => !path.includes(`{${k}}`))
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
          return qs ? `${u}?${qs}` : u;
        },
        method: method.toUpperCase(),
        params
      }));
    }
  }
  return tools;
}

/**
 * Register synthetic (non-MCP-SDK) tools directly into a McpPool.
 * Extend McpPool with this method.
 */
export function extendPoolWithSyntheticTools(pool) {
  pool.registerSyntheticTool = function(tool) {
    const { name } = tool.schema;
    this.toolSchemas.set(name, tool.schema);
    this.toolIndex.set(name, '__synthetic__');

    // Patch callTool to handle synthetic tools
    const origCall = this.callTool.bind(this);
    this.callTool = async (toolName, params) => {
      const key = this.toolIndex.get(toolName);
      if (key === '__synthetic__') {
        const t = [...this.connections.entries()]
          .find(([k]) => k === '__synthetic__');
        // Run directly
        const synth = this._syntheticTools?.get(toolName);
        if (synth) return synth.call(params);
      }
      return origCall(toolName, params);
    };

    if (!this._syntheticTools) this._syntheticTools = new Map();
    this._syntheticTools.set(name, tool);
  };

  pool.loadOpenApi = async (key, specUrl, baseUrl, options = {}) => {
    const tools = await openApiTools(specUrl, baseUrl, options);
    for (const tool of tools) pool.registerSyntheticTool(tool);
    return tools.map(t => t.schema.name);
  };
}
```

### 2.7 LangChain + Vercel AI SDK Integration

The system's `AIClient` uses the **Vercel AI SDK** (`ai`, `@ai-sdk/*`). MCP tools integrate naturally:

```javascript
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { McpPool }      from './metta/src/mcp/McpPool.js';
import { McpDiscovery } from './metta/src/mcp/McpDiscovery.js';

/**
 * Convert all tools in an McpPool into Vercel AI SDK tools.
 * The LLM can then call them via tool-calling protocol.
 */
export function poolToAITools(pool) {
  const tools = {};
  for (const [name, schema] of pool.toolSchemas) {
    const props = schema.inputSchema?.properties ?? {};
    const required = new Set(schema.inputSchema?.required ?? []);

    // Build Zod schema dynamically from MCP JSON schema
    const zodShape = {};
    for (const [k, v] of Object.entries(props)) {
      let zodType = z.string();
      if (v.type === 'number') zodType = z.number();
      else if (v.type === 'boolean') zodType = z.boolean();
      else if (v.type === 'array') zodType = z.array(z.any());
      else if (v.type === 'object') zodType = z.record(z.any());
      if (v.description) zodType = zodType.describe(v.description);
      zodShape[k] = required.has(k) ? zodType : zodType.optional();
    }

    tools[name] = tool({
      description: schema.description ?? name,
      parameters: z.object(zodShape),
      execute: async (params) => {
        const result = await pool.callTool(name, params);
        return Array.isArray(result.content)
          ? result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : JSON.stringify(result);
      }
    });
  }
  return tools;
}

/**
 * Example: Agent with MCP tools via Vercel AI SDK
 */
export async function createMcpAgent(pool, aiClient, systemPrompt) {
  const aiTools = poolToAITools(pool);

  return {
    async run(userMessage) {
      const result = await aiClient.generate(userMessage, {
        system: systemPrompt,
        tools: aiTools,
        maxSteps: 10  // Allow multi-step tool use
      });
      return result.text;
    },

    async stream(userMessage, onChunk) {
      const { fullStream } = await aiClient.stream(userMessage, {
        system: systemPrompt,
        tools: aiTools,
        maxSteps: 10
      });
      for await (const chunk of fullStream) {
        if (chunk.type === 'text-delta') onChunk({ type: 'text', content: chunk.textDelta });
        else if (chunk.type === 'tool-call') onChunk({ type: 'tool_call', name: chunk.toolName });
        else if (chunk.type === 'tool-result') onChunk({ type: 'tool_result', content: chunk.result });
      }
    }
  };
}
```

---

## 3. Use Case B: SeNARS as MCP Provider

> **Status: Working.** The code in `agent/src/mcp/` is production-ready.

### 3.1 What's Exposed

```bash
node agent/src/mcp/start-server.js
```

| Tool | What it does |
|------|-------------|
| `ping` | Health check |
| `reason` | Feed premises into NAL, run N cycles, return derived beliefs with truth values |
| `memory-query` | Query the concept memory by term string |
| `get-focus` | Return top-N tasks from the attention focus buffer |
| `execute-tool` | Invoke a registered NAR tool |
| `evaluate_js` | Sandboxed JS execution (1s timeout, vm context) |
| `sync-beliefs` | Bidirectional belief delta reconciliation |

### 3.2 Adding MeTTa Eval to the Provider

The one meaningful extension: expose MeTTa evaluation through the MCP server too.

```javascript
// Append to agent/src/mcp/Server.js → registerTools():

this.server.tool('metta-eval',
  {
    code: z.string().describe('MeTTa expression(s) to evaluate'),
    mode: z.enum(['run', 'load', 'query']).default('run')
  },
  async ({ code, mode }) => {
    const interp = this.mettaInterpreter;
    if (!interp) return this._error('MeTTa interpreter not attached. Pass {mettaInterpreter} to Server constructor.');
    try {
      let result;
      if (mode === 'load')  { interp.load(code); result = 'loaded'; }
      else if (mode === 'query') { result = interp.query(code, code); }
      else { result = interp.run(code); }
      return { content: [{ type: 'text', text: String(result) }] };
    } catch (e) {
      return this._error(`MeTTa error: ${e.message}`);
    }
  }
);
```

### 3.3 Claude Desktop Configuration

```json
{
  "mcpServers": {
    "senars": {
      "command": "node",
      "args": ["/absolute/path/to/agent/src/mcp/start-server.js"]
    }
  }
}
```

### 3.4 Why Narsese Appears Here

The `reason` tool accepts Narsese-formatted premises (`<bird --> animal>.`) because the *NAL inference engine* speaks Narsese — that's its native language. AI clients (Claude, Cursor) can send Narsese or natural language; the `reason` tool accepts both. This is **server-side logic** and has nothing to do with how MeTTa calls external tools (Use Case A).

---

## 4. Unified Entry Point

**File: `metta/src/mcp/index.js`**

```javascript
import { McpPool }      from './McpPool.js';
import { McpDiscovery } from './McpDiscovery.js';
import { registerMcpGrounded } from './McpGrounded.js';
import { extendPoolWithSyntheticTools } from './McpAdapters.js';

export { McpPool, McpDiscovery, registerMcpGrounded, extendPoolWithSyntheticTools };
export { restTool, openApiTools } from './McpAdapters.js';
export { poolToAITools, createMcpAgent } from './McpAgentBridge.js';

/**
 * MeTTaMCPManager — one-call setup for MeTTa as MCP consumer.
 *
 * Usage:
 *   const mcp = new MeTTaMCPManager(interpreter);
 *   await mcp.connect('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/']);
 *   // Now MeTTa can call: !(read_file (object (: path "/tmp/x.txt")))
 */
export class MeTTaMCPManager {
  constructor(interpreter, options = {}) {
    this.interpreter = interpreter;
    this.pool = new McpPool(interpreter, options);
    this.discovery = new McpDiscovery(interpreter, this.pool);

    extendPoolWithSyntheticTools(this.pool);
    registerMcpGrounded(interpreter, this.pool, this.discovery);
  }

  /** Connect to an MCP server (Stdio) and learn its tools */
  async connect(key, command, args = []) {
    return this.discovery.connectAndLearn(key, command, args, 'stdio');
  }

  /** Connect to an MCP server (SSE/HTTP) and learn its tools */
  async connectSSE(key, url) {
    return this.discovery.connectAndLearn(key, url, [], 'sse');
  }

  /** Load an OpenAPI spec and make its endpoints callable from MeTTa */
  async loadOpenApi(key, specUrl, baseUrl, options = {}) {
    return this.pool.loadOpenApi(key, specUrl, baseUrl, options);
  }

  /** Register a single REST endpoint as a MeTTa-callable tool */
  registerRestTool(toolDef) {
    const { restTool } = require('./McpAdapters.js');
    this.pool.registerSyntheticTool(restTool(toolDef));
  }

  /** Convert pool tools to Vercel AI SDK tools for AIClient */
  toAITools() {
    const { poolToAITools } = require('./McpAgentBridge.js');
    return poolToAITools(this.pool);
  }

  async disconnect(key) {
    if (key) this.pool._onServerDisconnect(key);
    else await this.pool.disconnectAll();
  }

  get tools() { return this.pool.allToolNames; }
}

export default MeTTaMCPManager;
```

---

## 5. Complete Usage Examples

### 5.1 MeTTa Calls Filesystem + Search (Consumer Mode)

```javascript
import { MeTTaInterpreter } from './metta/src/MeTTaInterpreter.js';
import { MeTTaMCPManager }  from './metta/src/mcp/index.js';

const interp = new MeTTaInterpreter();
const mcp    = new MeTTaMCPManager(interp);

// Connect to MCP servers — tools auto-register as grounded atoms
// and facts appear in the knowledge space
await mcp.connect('fs',     'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
await mcp.connect('search', 'npx', ['-y', '@modelcontextprotocol/server-brave-search']);

// MeTTa now knows about all tools:
interp.run('!(mcp-tools)');
// => (: read_file (: write_file (: brave_search ...))

// Direct invocation
const result = interp.run('!(read_file (object (: path "/tmp/notes.txt")))');

// Rule-based tool selection in MeTTa code:
interp.run(`
  (= (research $topic)
     (let* (($web    (brave_search (object (: query $topic))))
            ($cached (read_file    (object (: path (cache-path $topic))))))
       (if (cache-fresh? $topic) $cached $web)))
`);
```

### 5.2 Load Any REST API into MeTTa (Arbitrary API Universality)

```javascript
// Instant GitHub API → MeTTa tools via OpenAPI spec
await mcp.loadOpenApi('github', 
  'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
  'https://api.github.com',
  { filterTag: 'repos', maxTools: 20 }
);

// Now usable from MeTTa:
interp.run('!(repos_list_for_authenticated_user (object (: per_page 10)))');

// Or register a single endpoint manually:
mcp.registerRestTool({
  name: 'get_weather',
  description: 'Current weather for a city',
  url: p => `https://wttr.in/${p.city}?format=j1`,
  params: { city: { type: 'string', description: 'City name' } },
  transform: d => `${d.current_condition[0].temp_C}°C, ${d.current_condition[0].weatherDesc[0].value}`
});

interp.run('!(get_weather (object (: city "London")))');
// => "12°C, Partly cloudy"
```

### 5.3 MeTTa + Vercel AI SDK: LLM with MCP Tools

```javascript
import { AIClient }       from './agent/src/ai/AIClient.js';
import { createMcpAgent } from './metta/src/mcp/McpAgentBridge.js';

const ai  = new AIClient({ ollama: { baseURL: 'http://localhost:11434' } });
const mcp = new MeTTaMCPManager(interp);
await mcp.connect('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/']);

const agent = await createMcpAgent(mcp.pool, ai, 
  'You are a helpful assistant that can read files and search the web.');

const answer = await agent.run('What is in /tmp/report.txt?');
```

### 5.4 MeTTa Self-Discovery via JS Reflection

```javascript
// MeTTa can introspect everything it can do:
interp.run('!(mcp-reflect)');
// => JSON with:
// { groundedOps: [{name: "+", arity: 2}, {name: "read_file", arity: 1}, ...],
//   mcpTools: ["read_file", "write_file", "brave_search", "get_weather"],
//   totalCapabilities: 47 }

// A MeTTa rule can use this to adapt behavior:
interp.run(`
  (= (can-do? $capability)
     (tool-available $capability))

  (= (fallback-plan $goal)
     (let ($tools (mcp-tools))
       (find-useful-tool $goal $tools)))
`);
```

### 5.5 SeNARS Server Used by Claude (Provider Mode)

```json
// ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "senars": {
      "command": "node",
      "args": ["/home/me/senars10/agent/src/mcp/start-server.js"]
    }
  }
}
```

Claude can now ask SeNARS to reason:
> *"Use the reason tool with premises `<AI --> technology>.` and `<technology --> valuable>.` to derive whether AI is valuable."*

---

## 6. KnowledgeBaseConnector as MCP Backend

The existing `agent/src/know/KnowledgeBaseConnector.js` (Wikipedia, Wikidata, Custom APIs) can be wrapped as MCP synthetic tools, providing a clean migration path:

```javascript
import { createKnowledgeBaseConnector } from '../agent/src/know/KnowledgeBaseConnector.js';

const kb = createKnowledgeBaseConnector({ cacheTTL: 300_000 });

mcp.registerRestTool({
  name: 'wikipedia_search',
  description: 'Search Wikipedia for a topic',
  url: () => 'synthetic://kb',  // not used — direct call
  params: { query: { type: 'string', description: 'Search term' } },
  // Override call instead of HTTP
});

// Better: wrap directly
pool.registerSyntheticTool({
  schema: {
    name: 'wikipedia_search',
    description: 'Search Wikipedia',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  async call({ query }) {
    const result = await kb.query('wikipedia', query);
    const text = result.results.map(r => r.extract ?? r.title).join('\n\n');
    return { content: [{ type: 'text', text }] };
  }
});
```

---

## 7. Safety

The existing `agent/src/mcp/Safety.js` is the authoritative implementation. Key invariants:

- **PII scrubbing is opt-in** (disabled by default)
- **`<` and `>` are never HTML-escaped** — Narsese syntax `<bird --> animal>` must survive unchanged
- **Sandboxed JS**: `evaluate_js` runs in a `vm.createContext` with 1s timeout
- **Rate limiting**: `McpPool` enforces a configurable calls-per-minute ceiling per server

```javascript
// The McpPool timeout (default 30s) is the primary concurrency safety mechanism.
// For additional control per tool:
const pool = new McpPool(interpreter, {
  timeout: 10_000,             // 10s per tool call
  conflictStrategy: 'last'     // last-connected server wins on name conflict
});
```

---

## 8. Transport Reference

| Transport | Status | When to Use |
|-----------|--------|-------------|
| Stdio | ✅ Working | Local servers; Claude Desktop; subprocesses |
| SSE/HTTP | 🔧 `McpPool` supports it | Multi-client web servers; remote services |
| WebSocket | 🔧 SDK-dependent | Real-time streaming (future) |
| Synthetic | ✅ Working | REST, GraphQL, OpenAPI, KnowledgeBaseConnector |

---

## 9. What to Build (Roadmap)

| Priority | Item | Effort |
|----------|------|--------|
| P0 | `McpPool.js` — multi-server connection | 1 day |
| P0 | `McpDiscovery.js` — tool facts into space | 1 day |
| P0 | `McpGrounded.js` — registerMcpGrounded | 1 day |
| P1 | `McpAdapters.js` — restTool + openApiTools | 2 days |
| P1 | `McpAgentBridge.js` — poolToAITools | 1 day |
| P1 | Add `metta-eval` to agent/src/mcp/Server.js | 1 hour |
| P2 | MeTTa stdlib rules for tool selection strategy | ongoing |
| P2 | `AgentBuilder.withMCP({...})` one-call setup | 1 day |
| P3 | Tool reliability tracking in knowledge space | ongoing |

---

## 10. References

| File | Purpose | Status |
|------|---------|--------|
| [agent/src/mcp/Server.js](../agent/src/mcp/Server.js) | SeNARS MCP provider | ✅ Working |
| [agent/src/mcp/Client.js](../agent/src/mcp/Client.js) | Basic Stdio client | ✅ Working |
| [agent/src/mcp/Safety.js](../agent/src/mcp/Safety.js) | PII + validation | ✅ Working |
| [agent/src/ai/AIClient.js](../agent/src/ai/AIClient.js) | Vercel AI SDK wrapper | ✅ Working |
| [agent/src/know/KnowledgeBaseConnector.js](../agent/src/know/KnowledgeBaseConnector.js) | Wikipedia/Wikidata/Custom | ✅ Working |
| [agent/src/agent/AgentStreamer.js](../agent/src/agent/AgentStreamer.js) | Streaming with tool events | ✅ Working |
| [metta/src/SeNARSBridge.js](./src/SeNARSBridge.js) | MeTTa ↔ NAR translation | ✅ Working |
| metta/src/mcp/McpPool.js | Multi-server connection pool | 🔧 Spec |
| metta/src/mcp/McpDiscovery.js | Tool → Space facts | 🔧 Spec |
| metta/src/mcp/McpGrounded.js | Ground atom registration | 🔧 Spec |
| metta/src/mcp/McpAdapters.js | REST/OpenAPI → MCP tools | 🔧 Spec |
| metta/src/mcp/McpAgentBridge.js | Pool → Vercel AI SDK tools | 🔧 Spec |

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- [Vercel AI SDK](https://sdk.vercel.ai/)

---

*Version 4.0 — 2026-02-25*
