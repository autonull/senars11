# MeTTa MCP Integration

**Deliberate Tool Use + Cognitive Service Exposure**

*Version 4.1 — 2026-02-25*

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

```text
╔══════════════════════════════════════════════════════════════════╗
║                     USE CASE A: MeTTa CONSUMES                  ║
║                                                                  ║
║  MeTTa Space         MeTTa Rules           Reflection Layer      ║
║  ───────────         ───────────           ───────────────       ║
║  (tool read_file)  → (= (need-tool $t)  →  &js-call callTool     ║
║  (server fs)          (when-available      (McpClientManager)    ║
║  (desc read_file ..)   (mcp-call $t ...))) ←results───────────── ║
║                                                                  ║
║                    ↕ JS Reflection (discover, introspect)        ║
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

```text
agent/src/mcp/          ← EXISTING, WORKING
├── Server.js           MCP server — SeNARS as tool provider
├── Client.js           Basic MCP client (Stdio)
├── Safety.js           PII scrubbing (Narsese-safe: no < > escaping)
├── index.js            MCPManager + convenience exports
└── start-server.js     Entry point for Claude Desktop etc.

metta/src/mcp/          ← TO BUILD (this spec)
├── McpClientManager.js Minimal client lifecycle & connection management
├── mcp-std.metta       MeTTa operations using JS reflection for MCP discovery & calling
└── index.js            MeTTaMCPManager
```

---

## 2. Use Case A: MeTTa Deliberately Consuming MCPs

### 2.1 The Core Idea

Instead of writing thick JavaScript middleware that "welds" MCP SDK features to the MeTTa interpreter via `ground.register()`, we provide a **minimal JS client manager** and rely on MeTTa's built-in **JavaScript Reflection** (`&js-import`, `&js-call`) to interact with MCP tools directly.

"The general-purpose hand provides merely the physics of grasping; the mind surveys the tools and grasps them."

When MeTTa (the mind) discovers a tool via the client manager, it uses its reflection operators to add facts about the tool to its knowledge space:

```metta
; Added by mcp-std.metta dynamically
(tool-available read_file)
(tool-description read_file "Read the contents of a file")
(tool-server read_file "fs_server")

; MeTTa rules reason about tool selection
(= (can-answer-query ?q)
   (if (query-needs-filesystem ?q)
       (mcp-call "fs_server" "read_file" (object (: path (query-target ?q))))
       (escalate ?q)))
```

This is the critical difference: MeTTa **reasons about which tools to use**, rather than hardcoding static JS interfaces.

### 2.2 McpClientManager — Minimal Connection Management

**File: `metta/src/mcp/McpClientManager.js`**

This class simply instantiates and holds active MCP Client SDK connections. No custom routing, no semantic analysis, no MeTTa rewriting.

```javascript
import { Client as McpClientSDK } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Minimal manager for MCP clients. Keeps connection lifecycle in JS.
 * Discoverability and invocation are handled dynamically from MeTTa via JS Reflection.
 */
export class McpClientManager {
  constructor(options = {}) {
    this.opts = { timeout: 30_000, ...options };
    this.clients = new Map(); // key -> McpClientSDK
    this.transports = new Map();
  }

  async connect(key, commandOrUrl, args = [], transport = 'stdio') {
    if (this.clients.has(key)) return this.clients.get(key);

    const sdk = new McpClientSDK(
      { name: 'MeTTa', version: '4.1.0' },
      { capabilities: { sampling: {}, roots: { listChanged: true } } }
    );

    const tp = transport === 'sse'
      ? new SSEClientTransport(new URL(commandOrUrl))
      : new StdioClientTransport({ command: commandOrUrl, args });

    tp.onclose = () => this.disconnect(key);
    await sdk.connect(tp);
    
    this.clients.set(key, sdk);
    this.transports.set(key, tp);
    return sdk;
  }

  async callTool(key, toolName, params = {}) {
    const client = this.clients.get(key);
    if (!client) throw new Error(`MCP Client not found: ${key}`);
    
    return Promise.race([
      client.callTool({ name: toolName, arguments: params }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout: ${toolName}`)), this.opts.timeout))
    ]);
  }

  async listTools(key) {
    const client = this.clients.get(key);
    if (!client) throw new Error(`MCP Client not found: ${key}`);
    return await client.listTools();
  }

  async disconnect(key) {
    const tp = this.transports.get(key);
    if (tp) {
      await tp.close?.();
      this.transports.delete(key);
      this.clients.delete(key);
    }
  }

  async disconnectAll() {
    for (const key of this.transports.keys()) {
      await this.disconnect(key);
    }
  }
}
```

### 2.3 MeTTa-Native Tool Discovery (`mcp-std.metta`)

"Category Inference" and tool registration happen dynamically in MeTTa. We drop hardcoded JS regexes because they are brittle. We let the MeTTa script extract tool facts dynamically, preserving semantic richness.

**File: `metta/src/mcp/mcp-std.metta`**

```metta
;; mcp-std.metta
;; Standard library for MeTTa to use MCP via JS reflection.

;; Bind the JS McpClientManager instance globally
(= (mcp-manager) (&js-global "mcpClientManager"))

;; Connect to an MCP server (returns async handle, must be awaited if within JS, but handled by interpreter)
(= (mcp-connect $server $cmd $args)
   (&js-call (mcp-manager) "connect" $server $cmd $args "stdio"))

;; Retrieve list of tools and assert them into the space
(= (mcp-discover $server)
   (let* (($tools (&js-call (mcp-manager) "listTools" $server))
          ($toolList (&js-get $tools "tools")))
     (populate-tools $server $toolList)))

;; Recursively parse the JS array of tools and assert facts
(= (populate-tools $server $toolsJsArray)
   ;; Conceptually: iterate over JS array, extract name & description
   ;; Assuming helper `&js-array-map` or recursive popping
   (let* (($name (&js-get $toolObj "name"))
          ($desc (&js-get $toolObj "description")))
     (add-atom &self (tool-available $name))
     (add-atom &self (tool-server $name $server))
     (add-atom &self (tool-description $name $desc))))

;; Generic tool invocation using JS reflection
(= (mcp-call $server $toolName $params)
   (let* (($result (&js-call (mcp-manager) "callTool" $server $toolName $params))
          ($content (&js-get $result "content"))
          ($firstContent (&js-get $content 0)))
     (&js-get $firstContent "text")))
```

This drastically reduces JS glue code and pushes cognitive processing where it belongs: the reasoning engine.

### 2.4 Tool Utilization Strategy (MeTTa Reasoning)

MeTTa orchestrates these tools dynamically. Categories and "tool routing" are part of the cognitive layer.

```metta
;; === Tool Selection Strategy ===

;; Semantic matching using descriptions
(= (best-tool-for $task)
   (let (($tool (tool-description $name $desc))
         ($match (semantic-match $task $desc)))  ;; Semantic matching primitive
     (if (> $match 0.8) $name (fallback))))

;; Route by capability (explicit rules)
(= (answer-file-query $path)
   (mcp-call "fs" "read_file" (object (: path $path))))

;; Safe conditional execution
(= (safe-search $q)
   (if (tool-available "brave_search")
       (mcp-call "search" "brave_search" (object (: query $q)))
       (fallback-search $q)))

;; Compose tool results (pipeline via MeTTa reduction)
(= (summarize-file $server $path)
   (let* (($content (mcp-call $server "read_file" (object (: path $path))))
          ($summary (summarize (object (: text $content)))))
     $summary))

;; Tool-selection by reliability (learned preference over time)
(= (prefer-tool $task $tool)
   (and (tool-available $tool)
        (tool-success-rate $tool $rate)
        (> $rate 0.8)))
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
import { McpClientManager } from './McpClientManager.js';
import fs from 'fs';
import path from 'path';

/**
 * MeTTaMCPManager — one-call setup for MeTTa as MCP consumer.
 */
export class MeTTaMCPManager {
  constructor(interpreter, options = {}) {
    this.interpreter = interpreter;
    this.manager = new McpClientManager(options);
    
    // Inject the manager into the global scope
    // so `mcp-std.metta` can find it via `&js-global`.
    globalThis.mcpClientManager = this.manager;

    // Preload the MeTTa MCP stdlib
    const stdPath = path.join(__dirname, 'mcp-std.metta');
    if (fs.existsSync(stdPath)) {
      this.interpreter.load(fs.readFileSync(stdPath, 'utf8'));
    }
  }

  async connect(key, command, args = []) {
    await this.manager.connect(key, command, args, 'stdio');
    // Trigger discovery in MeTTa space
    this.interpreter.run(`!(mcp-discover "${key}")`);
  }
  
  async connectSSE(key, url) {
    await this.manager.connect(key, url, [], 'sse');
    this.interpreter.run(`!(mcp-discover "${key}")`);
  }

  async disconnect(key) {
    if (key) await this.manager.disconnect(key);
    else await this.manager.disconnectAll();
  }
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

// Connecting loads tools and MeTTa dynamically asserts knowledge about them
await mcp.connect('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
await mcp.connect('search', 'npx', ['-y', '@modelcontextprotocol/server-brave-search']);

// MeTTa reasoning uses the generic mcp-call wrapper natively inside the space
interp.run(`
  (= (research $topic)
     (let* (($web    (mcp-call "search" "brave_search" (object (: query $topic))))
            ($cached (mcp-call "fs" "read_file" (object (: path (cache-path $topic))))))
       (if (cache-fresh? $topic) $cached $web)))
`);
```

### 5.2 Arbitrary API Universality via Native Fetch

Because MeTTa uses JS Reflection, you do not need thick JS adapters to call arbitrary APIs. MeTTa can use `&js-call` to invoke standard Node `fetch` directly!

```metta
(= (get-weather $city)
   (let* (($res (&js-global "fetch" (format "https://wttr.in/{}?format=j1" $city)))
          ($json (&js-call $res "json")))
     ;; Manipulate JSON natively in MeTTa using ReflectionOps
     (&js-get (head (&js-get $json "current_condition")) "temp_C")))
```

If you wish to wrap this so it acts like an MCP tool (for unified semantic reasoning), simply assert the facts manually in MeTTa:

```metta
(tool-available "get_weather")
(tool-description "get_weather" "Current weather for a city")
```

Thus, the "general purpose hand" easily grips native MCP servers *and* REST APIs using the same underlying mechanics (`&js-*` operators).

### 5.3 SeNARS Server Used by Claude (Provider Mode)

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

## 6. Safety

The existing `agent/src/mcp/Safety.js` is the authoritative implementation. Key invariants remain untouched in Provider mode:

- **PII scrubbing is opt-in** (disabled by default)
- **`<` and `>` are never HTML-escaped** — Narsese syntax `<bird --> animal>` must survive unchanged
- **Sandboxed JS**: `evaluate_js` runs in a `vm.createContext` with a 1s timeout

For Consumer mode (`McpClientManager`), the primary safety feature is timeout enforcement on external tool requests to prevent unbounded blocking.

---

## 7. Transport Reference

| Transport | Status | When to Use |
|-----------|--------|-------------|
| Stdio | ✅ Working | Local servers; Claude Desktop; subprocesses |
| SSE/HTTP | 🔧 `McpClientManager` | Multi-client web servers; remote services |
| WebSocket | 🔧 SDK-dependent | Real-time streaming (future) |
| Synthetic | ✅ Provided via `fetch` | Arbitrary REST APIs via `&js-global` in MeTTa |

---

## 8. What to Build (Roadmap)

| Priority | Item | Effort |
|----------|------|--------|
| P0 | `McpClientManager.js` — Minimal JS client hook | 0.5 days |
| P0 | `mcp-std.metta` — MeTTa discovery and invocation logic | 1 day |
| P1 | `index.js` — MeTTaMCPManager unified setup | 0.5 days |
| P1 | Add `metta-eval` to `agent/src/mcp/Server.js` | 1 hour |
| P2 | Semantic tool routing in MeTTa using descriptions | ongoing |
| P3 | Tool reliability tracking in knowledge space | ongoing |

---

## 9. References

| File | Purpose | Status |
|------|---------|--------|
| [agent/src/mcp/Server.js](../agent/src/mcp/Server.js) | SeNARS MCP provider | ✅ Working |
| [agent/src/mcp/Client.js](../agent/src/mcp/Client.js) | Basic Stdio client | ✅ Working |
| [agent/src/mcp/Safety.js](../agent/src/mcp/Safety.js) | PII + validation | ✅ Working |
| metta/src/mcp/McpClientManager.js | Clean client instance wrapper | 🔧 Spec |
| metta/src/mcp/mcp-std.metta | Pure MeTTa tool discovery & calling | 🔧 Spec |

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)

---

*Version 4.1 — 2026-02-25*
