# Bot Architecture Overhaul — Proposal

## Diagnosis: What Exists Today

### Current State
| Component | Status |
|---|---|
| `bot/run.js` | Working entry point. Supports `irc`, `cli`, `demo`, `test` modes. Has embedded IRC server for local testing. Solid but monolithic. |
| `bot2/run.js` | Near-identical copy of `bot/run.js` with minor differences (`--provider` flag, no `--personality`, no `test` mode). **Not a real architectural improvement — just drift.** |
| `Agent` | Full cognitive agent with MeTTaLoop, NARS, embodiment bus. Works but heavy to instantiate for simple bot deployments. |
| Embodiments | `IRCChannel`, `CLIEmbodiment`, `DemoEmbodiment`, `NostrChannel`, `MatrixChannel`. All implement the same `Embodiment` interface. Good abstraction. |
| `EmbodimentBus` | Pub/sub message router with optional attention salience. Single pipeline — correct design. |
| Tests | `bot/` has 4 test files (smoke, pipeline, e2e, trace). `bot2/` has 2 E2E tests. Shared `MockIRCServer.js`. |

### Problems Identified

1. **`bot/` and `bot2/` are duplicates**, not iterations. `bot2` has no meaningful architectural advantage over `bot`. They should be unified.
2. **No multi-embodiment support at runtime**. The bot picks ONE mode (irc, cli, or demo) at startup. You cannot run IRC + CLI simultaneously. The `EmbodimentBus` supports multiple embodiments, but `run.js` never registers more than one.
3. **Configuration is fragmented**. `bot.config.json` has nested structures (`bot:`, `lm:`, `irc:`, `capabilities:`, `loop:`, `rateLimit:`) with unclear precedence. `bot2` expects a different default config file (`run.config.json`).
4. **No bot abstraction layer** — `run.js` is both a CLI tool AND the bot factory. You can't programmatically create a bot without parsing `process.argv`.
5. **Test infrastructure is duplicated**. Both `bot/` and `bot2/` have their own E2E test runners. `MockIRCServer.js` exists in two places (or is imported via relative paths).
6. **No health check / observability**. No `/health` endpoint, no structured metrics, no graceful shutdown signal handling (SIGINT/SIGTERM).
7. **Error recovery is fragile**. If the LLM fails during warmup, the bot continues running but will silently fail on every message.
8. **No session persistence**. Bot loses all memory, working memory, and conversation history on restart.

---

## Proposed Architecture

### Core Principle: Bot = Configured Agent + Embodiment Set

The bot is not a separate system — it's a **convenient way to configure and run an Agent with one or more embodiments**. There should be exactly ONE bot package, ONE entry point, and ONE configuration schema.

### Directory Layout (After)

```
bot/                          — Single unified bot package
  src/
    index.js                  — Public API: createBot(), Bot class
    cli.js                    — CLI argument parsing + main()
    config.js                 — Config loading, merging, validation
    embodiments/
      irc.js                  — IRC embodiment factory
      cli.js                  — CLI embodiment factory
      demo.js                 — Demo embodiment factory
      index.js                — Re-exports all embodiment factories
  tests/
    unit/
      config.test.js
      embodiments.test.js
      pipeline.test.js        — Bus + queue + dispatch (no LLM needed)
    e2e/
      irc.test.js             — E2E with embedded IRC server
      cli.test.js             — E2E CLI interaction
      multi-embodiment.test.js — E2E with IRC + CLI simultaneously
    integration/
      irc/MockIRCServer.js    — Shared mock server (single copy)
  package.json
  config.example.json         — Documented template
  README.md
```

### Key Design Changes

#### 1. Multi-Embodiment Runtime

The bot can run multiple embodiments simultaneously. Messages from any embodiment flow through the same cognitive pipeline.

```javascript
// config.json
{
  "embodiments": {
    "irc": {
      "enabled": true,
      "host": "irc.quakenet.org",
      "port": 6667,
      "channels": ["##metta"],
      "nick": "SeNARchy"
    },
    "cli": {
      "enabled": true
    },
    "nostr": {
      "enabled": false
    }
  }
}
```

All enabled embodiments are registered on the same `EmbodimentBus`. A message from IRC and a message from CLI are processed identically — the only difference is the `embodimentId` metadata field used for reply routing.

#### 2. Clean `Bot` Class

Separate the bot lifecycle from CLI argument parsing:

```javascript
// src/index.js
export class Bot {
  constructor(config) { ... }
  async initialize() { ... }   // Agent + embodiments
  async start() { ... }        // Begin MeTTaLoop
  async shutdown() { ... }     // Graceful teardown
  get status() { ... }         // Health/status snapshot
}

export async function createBot(config) {
  const bot = new Bot(config);
  await bot.initialize();
  return bot;
}
```

```javascript
// src/cli.js — thin CLI wrapper
import { createBot } from './index.js';
import { parseArgs, loadConfig } from './config.js';

const cliArgs = parseArgs();
const config = await loadConfig(cliArgs);
const bot = await createBot(config);
await bot.start();
```

This means:
- **Programmatic use**: `import { createBot } from '@senars/bot'` — no CLI parsing involved
- **CLI use**: `node bot/src/cli.js --mode irc` — thin wrapper over the same API
- **Testing**: instantiate `new Bot(testConfig)` directly

#### 3. Unified Configuration Schema

Flatten and normalize the config. No more nested `bot:`, `lm:`, `irc:` confusion:

```json
{
  "profile": "parity",
  "nick": "SeNARchy",
  "workspace": "./workspace",

  "lm": {
    "provider": "transformers",
    "modelName": "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    "temperature": 0.7,
    "maxTokens": 256
  },

  "embodiments": {
    "irc": { "enabled": true, "host": null, "port": 6667, "channels": ["##metta"] },
    "cli": { "enabled": false },
    "demo": { "enabled": false }
  },

  "loop": { "budget": 50, "sleepMs": 2000 },
  "capabilities": { "auditLog": true, "shellSkill": false },
  "rateLimit": { "perChannelMax": 3, "perChannelInterval": 8000 }
}
```

CLI flags override file config. File config overrides defaults. Three layers, clear precedence.

#### 4. Health & Observability

```javascript
bot.status // => {
  mode: ['irc', 'cli'],
  loop: { running: true, cycleCount: 42, budget: 48 },
  embodiments: {
    irc: { status: 'connected', channel: '##metta' },
    cli: { status: 'connected' }
  },
  llm: { ready: true, model: 'SmolLM2-1.7B-Instruct' },
  uptime: 3600000
}
```

Handle SIGINT/SIGTERM for graceful shutdown. Log all state transitions.

#### 5. Test Strategy

| Test Type | What It Tests | LLM Needed? |
|---|---|---|
| **Unit** | Config merging, embodiment factories, message routing, ActionDispatcher | No |
| **Integration** | Bus → Queue → Dispatcher pipeline with mock LLM | No |
| **E2E (IRC)** | Full bot spawn + embedded IRC server + TCP client | Optional (dummy LLM) |
| **E2E (CLI)** | Full bot spawn + stdin/stdout interaction | Optional (dummy LLM) |
| **E2E (Multi)** | IRC + CLI simultaneously, cross-embodiment reply routing | Optional |

Single `MockIRCServer.js` shared by all test suites. No duplication.

---

## Migration Plan

### Phase 1: Unify `bot/` and `bot2/` (Low Risk)
1. Keep `bot/` as the canonical directory (it has more tests and features)
2. Merge `bot2`'s useful additions into `bot/`:
   - `--provider` CLI flag
   - Cleaner `warmupLLM()` (no config param)
3. Delete `bot2/` entirely
4. Move `bot2/tests/integration/irc/MockIRCServer.js` to `bot/tests/integration/irc/MockIRCServer.js` (if not already shared)

### Phase 2: Extract `Bot` Class (Medium Risk)
1. Create `bot/src/index.js` with `Bot` class and `createBot()` factory
2. Refactor `bot/run.js` to import from `src/index.js` and delegate to CLI
3. Move config loading/merging to `bot/src/config.js`
4. All existing tests should pass unchanged (they test behavior, not internals)

### Phase 3: Multi-Embodiment Support (Medium Risk)
1. Update config schema to support `embodiments: { irc, cli, demo }` with `enabled` flags
2. Update embodiment factories to support multiple simultaneous registrations
3. Add `multi-embodiment.test.js` E2E test
4. Backward-compatible: `--mode irc` is shorthand for `embodiments.irc.enabled: true`, others false

### Phase 4: Observability & Resilience (Low Risk)
1. Add `bot.status` getter
2. Handle SIGINT/SIGTERM
3. LLM warmup failure detection and retry logic
4. Session persistence (save/restore working memory + history buffer)

---

## What NOT to Change

- **Do not rewrite the Agent**. The `Agent` class, `EmbodimentBus`, and `MeTTaLoopBuilder` are correct. The bot is a thin layer on top.
- **Do not change the message pipeline**. Single pipeline, one of everything — this is the right design.
- **Do not duplicate test infrastructure**. One `MockIRCServer`, one test suite per concern.
- **Do not add new embodiments** (Nostr, Matrix, Discord) until the IRC + CLI + multi-embodiment foundation is solid. The channel classes exist but are not production-ready.

---

## Immediate Next Steps (Actionable)

1. **Delete `bot2/`** — it's dead weight. Merge its 3 unique features into `bot/`.
2. **Create `bot/src/index.js`** with the `Bot` class.
3. **Create `bot/src/config.js`** with `loadConfig()`, `mergeConfig()`, `parseArgs()`.
4. **Refactor `bot/run.js`** to be a thin CLI wrapper (50 lines max).
5. **Consolidate tests** — merge `bot/` and `bot2/` tests, remove duplicates.
6. **Add `--multi` flag** — enables all embodiments in `bot.config.json` that have `enabled: true`.
7. **Add `bot.status`** — single source of truth for health checks.
8. **All tests pass** — zero regressions at each step.
