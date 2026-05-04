# SeNARS Bot 2.0 — Design Specification

## Principle

**MeTTa is the control plane. JS is the I/O library.** All agent control flow, state management, and tool orchestration live in MeTTa. JavaScript provides side-effect grounded ops only. The codebase is fully converted — no backwards compatibility, no dual loops. Irrelevant code goes to `bot/archive/`.

---

## Architecture

```
bot/
├── run.js                    — CLI entry point
├── loop.metta                — MeTTa agent loop (~50 lines)
├── bot.config.json
├── package.json
├── src/
│   ├── config.js             — kept (config loading, merging, validation)
│   └── EmbeddedIRCServer.js  — kept (in-process IRC server)
└── tests/
    ├── support/
    │   ├── FakeIRCUser.js    — shared raw TCP IRC client
    │   └── BotHarness.js     — child process harness
    ├── unit/
    │   ├── config.test.js
    │   ├── embedded-irc.test.js
    │   ├── metta-ops.test.js
    │   └── metta-loop.test.js
    └── e2e/
        ├── single-bot.test.js
        ├── multi-bot.test.js
        ├── persistence.test.js
        └── multi-mode.test.js

bot/archive/
├── BotStatusCommand.js
├── index.js                  — old Bot class
└── tests/                    — old test suite (12 files)

metta/                        — additions only
└── src/
    ├── kernel/ops/
    │   ├── IOParser.js       — new: &sread, &balance-parens
    │   ├── IOOps.js          — extended: &fs-*, &shell
    │   └── TimeOps.js        — new: &time, &time-str
    └── stdlib/
        ├── io.metta          — new: I/O wrappers
        └── memory.metta      — new: memory wrappers

agent/                        — one change
└── src/metta/
    └── MeTTaLoopBuilder.js   — replace #buildLoop with MeTTa-driven loop
    └── AgentLoop.metta       — documentation only (not loaded)
```

---

## Phase 0: Archive

Move to `bot/archive/`:
- `bot/src/index.js` (old Bot class)
- `bot/src/BotStatusCommand.js`
- `bot/tests/` (all 12 files)

After: `bot/src/` contains only `config.js` and `EmbeddedIRCServer.js`.

---

## Phase 1: Fill metta/ Gaps

### New Grounded Ops (~125 lines)

**`metta/src/kernel/ops/IOParser.js`** (new):
```js
import { Parser } from '../Parser.js';
import { sym } from '../Term.js';

export function register(registry) {
    registry.register('&sread', (str) => {
        const parsed = Parser.parseProgram(String(str));
        return parsed.length ? parsed[0] : sym('False');
    });
    registry.register('&balance-parens', (str) => {
        let s = String(str), depth = 0;
        for (const ch of s) { if (ch === '(') depth++; else if (ch === ')') depth--; }
        while (depth > 0) { s += ')'; depth--; }
        return sym(s);
    });
}
```

**`metta/src/kernel/ops/IOOps.js`** (extend existing):
```js
import { readFile, writeFile, appendFile } from 'fs/promises';
import { execFile } from 'child_process';

registry.register('&fs-read', async (path) => sym(await readFile(String(path), 'utf8')), { async: true });
registry.register('&fs-write', async (path, content) => { await writeFile(String(path), String(content)); return sym('ok'); }, { async: true });
registry.register('&fs-append', async (path, content) => { await appendFile(String(path), String(content)); return sym('ok'); }, { async: true });
registry.register('&fs-read-last', async (path, maxChars) => {
    const c = await readFile(String(path), 'utf8');
    return sym(c.slice(-Number(maxChars) || 30000));
}, { async: true });
registry.register('&shell', async (cmd) =>
    new Promise(r => execFile('sh', ['-c', String(cmd)], { timeout: 10000 }, (_, o) => r(sym(o?.trim() ?? '')))),
    { async: true });
```

**`metta/src/kernel/ops/TimeOps.js`** (new):
```js
export function register(registry) {
    registry.register('&time', () => sym(String(Date.now())));
    registry.register('&time-str', () => sym(new Date().toISOString()));
}
```

**`metta/src/kernel/ops/CoreRegistry.js`** (modify): Import and register the new op modules.

### New MeTTa Stdlib (~45 lines)

**`metta/src/stdlib/io.metta`**:
```metta
(= (read-file $path) (&fs-read $path))
(= (write-file $path $content) (&fs-write $path $content))
(= (append-file $path $content) (&fs-append $path $content))
(= (shell $cmd) (&shell $cmd ()))
(= (get-time) (&time))
(= (get-time-str) (&time-str))
(= (parse-sexpr $str) (&sread (&balance-parens $str)))
```

**`metta/src/stdlib/memory.metta`**:
```metta
(= (remember $str) (^ &remember $str))
(= (query $str) (^ &recall $str))
(= (get-history $max-chars) (^ &fs-read-last "memory/history.metta" $max-chars))
```

### Existing Grounded Ops (no changes needed)

The MeTTa loop's core control flow uses **only existing ops** already registered by `MeTTaOpRegistrar`:

| Loop Need | Existing Op | Location |
|---|---|---|
| Get message | `check-embodiment-bus` | `MeTTaOpRegistrar.registerBasicOps` |
| Check new | `new-message?` | `MeTTaOpRegistrar.registerBasicOps` |
| Build prompt | `build-context` | `MeTTaOpRegistrar.registerContextOps` |
| Invoke LLM | `llm-invoke` | `MeTTaOpRegistrar.registerLLMOps` |
| Parse response | `parse-response` | `MeTTaOpRegistrar.registerCommandOps` |
| Execute cmds | `execute-commands` | `MeTTaOpRegistrar.registerCommandOps` |
| Sleep | `sleep-cycle` | `MeTTaOpRegistrar.registerBasicOps` |
| Capability | `cap?` | `MeTTaOpRegistrar.registerBasicOps` |
| Budget | `reset-budget` | `MeTTaOpRegistrar.registerBasicOps` |
| Cycle count | `inc-cycle-count!` | `MeTTaOpRegistrar.registerBasicOps` |
| History | `append-history` | `MeTTaOpRegistrar.registerCommandOps` |
| Persistence | `nar-serialize`, `nar-deserialize` | `NarsExtension` |

---

## Phase 2: MeTTa Agent Loop

### Critical Execution Model Analysis

`reduceNDAsync` yields to the JS event loop every 100 steps, NOT between cycles. A single `runAsync('(bot-loop 50)')` call runs all 50 cycles before returning. The JS wrapper's `while(this.#running)` loop waits for the entire recursion, then runs once more to check `autonomousLoop` and break or loop again.

This means:
- **Event emission**: `cycle-end` fires once after all 50 cycles, not per-cycle
- **Graceful shutdown**: `this.#running` is checked between budgets, not mid-budget
- **LLM warmup**: Checked once before first budget, not per-cycle
- **Error recovery**: If a cycle errors, the entire budget's remaining cycles are lost

These are acceptable trade-offs for keeping cognitive logic in MeTTa. The alternative (single-cycle MeTTa + JS loop) fragments the cognitive logic across the JS/MeTTa boundary.

### The Problem: Idle Cycles Call Expensive Ops

The plan's `let*` with `when` guard doesn't prevent `build-context` and `llm-invoke` from being evaluated — `let*` bindings are always evaluated. The original JS loop avoids this: idle cycles only tick WM and sleep. Active cycles do the full cognitive pipeline.

**The Fix**: Split into two MeTTa functions — `bot-process` for the cognitive pipeline, `bot-idle` for just sleep-and-recurse. The JS wrapper checks the queue first and calls the appropriate one.

### `bot/loop.metta` (~50 lines)

```metta
;; loop.metta — SeNARS Bot 2.0 Agent Loop
;;
;; Cognitive cycle in MeTTa. JS wrapper manages budget loop,
;; event emission, error recovery, and LLM warmup.
;;
;; Two paths: bot-process (message → full cognitive pipeline)
;;            bot-idle (no message → sleep + recurse)

;; ── Combinator (not in stdlib) ────────────────────────────────────
(= (when True  $expr) $expr)
(= (when False $_) ())

;; ── Initialization ────────────────────────────────────────────────
(= (bot-init)
   (seq
     (when (cap? persistentHistory) (nar-deserialize))
     (when (cap? goalPursuit)
       (let $goals (nar-goals :active)
            (when (not (== $goals ()))
              (attend (to-string $goals) 0.85))))))

;; ── Active cycle: full cognitive pipeline ────────────────────────
(= (bot-process)
   (let* (($msg   (check-embodiment-bus))
          ($ctx   (build-context $msg))
          ($resp  (llm-invoke $ctx))
          ($cmds  (parse-response $resp))
          ($_     (execute-commands $cmds))
          ($_     (when (cap? persistentHistory)
                    (append-history $msg $resp $cmds)))
          ($_     (inc-cycle-count!))
          ($_     (sleep-cycle)))
     ()))

;; ── Idle cycle: sleep only ───────────────────────────────────────
(= (bot-idle)
   (seq
     (inc-cycle-count!)
     (sleep-cycle)))

;; ── Halt ──────────────────────────────────────────────────────────
(= (bot-halt) agent-halted)
```

### JS Wrapper in MeTTaLoopBuilder (~40 lines)

Replace `#buildLoop()` (120+ lines) with a JS-driven budget loop that calls MeTTa per-cycle:

```js
// In MeTTaLoopBuilder.build():
const loopCode = await readFile(this.#resolveMettaFile('loop.metta'), 'utf8');
interp.run(loopCode);
const budget = this.#agentCfg.loop?.budget ?? 50;

return async () => {
    this.#running = true;
    this.#emit('start', { profile: this.agentCfg.profile ?? 'parity' });
    try {
        await interp.runAsync('(bot-init)');
        while (this.#running) {
            if (budget.current <= 0) {
                if (!this.#cap('autonomousLoop')) {
                    await sessionManager.save(this._loopState);
                    this.#emit('budget-exhausted', { cycleCount: this._loopState.cycleCount });
                    break;
                }
                budget.current = this.#budget;
            }

            if (!this._llmReady) {
                Logger.info('[MeTTa] Waiting for LLM warmup...');
                await this._llmReadyPromise;
            }

            this.#emit('cycle-start', { cycle: this._loopState.cycleCount, budget: budget.current });
            try {
                const hasMsg = this._loopState.lastmsg !== null;
                await interp.runAsync(hasMsg ? '(bot-process)' : '(bot-idle)');
                budget.current--;
            } catch (err) {
                Logger.error(`[MeTTa cycle ${this._loopState.cycleCount}]`, err.message);
                this._loopState.error = err.message;
            }
            this.#emit('cycle-end', {
                cycle: this._loopState.cycleCount, budget: budget.current, error: this._loopState.error
            });
        }
    } finally {
        this.#running = false;
        await sessionManager.save(this._loopState);
        this.#emit('halt', { cycleCount: this._loopState.cycleCount });
    }
};
```

**Why this works**: The JS wrapper peeks at `lastmsg` to decide which MeTTa function to call. `check-embodiment-bus` is called inside `bot-process`, not by JS. No double-dequeue. Idle cycles skip the expensive cognitive pipeline entirely. The JS wrapper retains budget management, event emission, error recovery, and LLM warmup.

---

## Phase 3: Thin Bot Launcher

### `run.js` (~15 lines)
```js
#!/usr/bin/env node
import { loadConfig } from './src/config.js';
import { Logger } from '@senars/core';
import { createBot } from './src/index.js';

(async () => {
    const config = await loadConfig();
    if (config.debug) Logger.setLevel('DEBUG');
    const bot = await createBot(config);
    await bot.start();
    process.on('SIGINT', async () => { await bot.shutdown(); process.exit(0); });
    process.on('SIGTERM', async () => { await bot.shutdown(); process.exit(0); });
})();
```

### `bot/src/index.js` (~35 lines)
```js
import { Agent } from '@senars/agent';
import { EmbeddedIRCServer } from './EmbeddedIRCServer.js';
import { IRCChannel, CLIEmbodiment, DemoEmbodiment } from '@senars/agent/io/index.js';

export async function createBot(config) {
    const agent = new Agent(config);
    await agent.initialize();

    const ircCfg = config.embodiments?.irc;
    if (ircCfg?.enabled && !ircCfg.host) {
        const server = new EmbeddedIRCServer(ircCfg.port, ircCfg.tls);
        await server.start();
        ircCfg.host = '127.0.0.1';
        ircCfg.port = server.port;
    }

    for (const [type, embCfg] of Object.entries(config.embodiments ?? {})) {
        if (!embCfg.enabled) continue;
        const emb = await createEmbodiment(type, embCfg, agent);
        if (emb) await agent.embodimentBus.register(emb);
    }

    return {
        agent,
        start: async () => agent.startMeTTaLoop(),
        shutdown: async () => agent.shutdown(),
        get status() { return agent.status; },
    };
}

async function createEmbodiment(type, cfg, agent) {
    switch (type) {
        case 'irc': return new IRCChannel(cfg, agent);
        case 'cli': return new CLIEmbodiment(cfg, agent);
        case 'demo': return new DemoEmbodiment(cfg, agent);
        default: return null;
    }
}
```

### Config: Add `minimal` Profile

Add to `config.js`:
```js
export const PROFILES = {
    minimal: {
        profile: 'minimal', nick: 'SeNARchy',
        embodiments: { irc: { enabled: false }, cli: { enabled: true }, demo: { enabled: false } },
        lm: { provider: 'transformers', modelName: 'HuggingFaceTB/SmolLM2-360M-Instruct', temperature: 0.7, maxTokens: 128 },
        loop: { budget: 10, sleepMs: 1000 },
        capabilities: { contextBudgets: false, semanticMemory: false, auditLog: false,
                        persistentHistory: false, goalPursuit: false },
    },
};
```

Update `mergeConfig()` to apply profile defaults before file/CLI overrides.

---

## Phase 4: Testing Strategy

**Philosophy**: E2E uses real LLM, real IRC, real processes. No mocks. Unit tests use no LLM. Pipeline tests use real components but stub the LLM with canned JSON.

### Test Structure
```
bot/tests/
├── support/
│   ├── FakeIRCUser.js     # Shared raw TCP IRC client (deduplicated from 4 copies)
│   └── BotHarness.js      # Child process spawn/wait/kill
├── unit/
│   ├── config.test.js       # ~25: merge, parse, validate, profiles
│   ├── embedded-irc.test.js # ~12: IRC protocol (copied from old, unchanged)
│   ├── metta-ops.test.js    # ~20: new grounded ops via MeTTaInterpreter
│   └── metta-loop.test.js   # ~10: loop.metta loads and runs
└── e2e/
    ├── single-bot.test.js   # ~8: one bot, embedded IRC, real LLM
    ├── multi-bot.test.js    # ~10: two bots, shared IRC, real LLM
    ├── persistence.test.js  # ~4: memory survives restart
    └── multi-mode.test.js   # ~5: CLI + IRC + multi modes
```

### What Is NOT Tested in bot/

Pipeline-level tests for `EmbodimentBus`, `MessageEnvelope`, `AgentMessageQueue`, `ContextBuilder`, `ActionDispatcher` live in `agent/tests/`. The bot/ test suite tests the **integration boundary** — does `createBot()` wire everything correctly, and does the full stack respond to real IRC messages?

### Unit Tests

**`metta-ops.test.js`** — Tests new grounded ops via MeTTaInterpreter:
- `&sread`: parses valid, returns False for empty/unparseable
- `&balance-parens`: adds missing parens, leaves balanced alone
- `&fs-read`/`&fs-write`/`&fs-append`: round-trip, append, missing file error
- `&fs-read-last`: reads last N chars, full file if N > size
- `&shell`: executes simple command, respects 10s timeout
- `&time`/`&time-str`: returns numeric timestamp, returns ISO string

**`metta-loop.test.js`** — Tests loop.metta:
- Parses without errors
- `(when True ok)` → `ok`, `(when False ok)` → `()`
- `(bot-init)` runs without error
- `(bot-idle)` sleeps and recurses (mock sleep)
- `(bot-process)` with mock ops calls full pipeline
- Budget decrements on idle cycles

### E2E Tests

All e2e tests use real Transformers.js LLM (`SmolLM2-360M-Instruct`). First run downloads model (~5 min), subsequent runs cached.

**`single-bot.test.js`** — Spawns `node run.js`, connects FakeIRCUser via raw TCP:
1. Channel question → bot responds
2. `!help` command → bot responds
3. URL with nick → bot correctly ignores
4. Greeting with nick → bot responds
5. Multi-turn: follow-up question, context preserved
6. SIGTERM shutdown → clean exit, resources released
7. Empty message → no crash, no response
8. Port discovery from stdout works

**`multi-bot.test.js`** — Two Bot instances in-process, shared IRC:
1. Both respond when addressed by nick (Alpha → Alpha, Beta → Beta)
2. Alpha mentions Beta → Beta replies
3. Multi-turn: alternate between Alpha and Beta
4. URL with nick → correctly ignored by target bot
5. Group address → at least one responds
6. Substantive answer quality (length > 10 chars)
7. Race condition: simultaneous messages to both bots
8. Memory isolation: Alpha's memories not visible to Beta
9. Server health: clientCount >= 1 after all scenarios
10. Both shut down cleanly

**`persistence.test.js`** — Memory survives restart:
1. `(remember 'the secret is 42')` → bot confirms
2. SIGTERM shutdown
3. Restart bot
4. `(query 'secret')` → response contains "42"
5. History file survives restart

**`multi-mode.test.js`** — Different operating modes:
1. `--mode cli`: stdin → response on stdout
2. `--mode irc`: embedded IRC starts, responds to IRC
3. `--mode multi`: CLI + IRC both connected and functional
4. External IRC server: `--host` skips embedded server
5. Concurrent messages: rapid-fire, no drops

### Shared Test Infrastructure

**`FakeIRCUser.js`** — Deduplicated raw TCP IRC client with `connect()`, `say()`, `waitForReply()`, `disconnect()`.

**`BotHarness.js`** — Child process management with `spawn()`, `waitFor(pattern)`, `kill()`, `discoverPort()`.

### Test Matrix

| Suite | Count | LLM? | IRC? | Time | CI Gate |
|---|---|---|---|---|---|
| Unit (4 files) | ~67 | No | No | <4s | Required |
| E2E (4 files) | ~27 | Real | Real | 10-20min | Required |
| **Total** | **~94** | | | | |

### Mapping from Old Tests

| Old Test | New | Action |
|---|---|---|
| `smoke.js` | Dropped | ActionDispatcher tested in agent/ |
| `pipeline.test.js` | Dropped | EmbodimentBus tested in agent/ |
| `architecture-verify.test.js` | Dropped | Absorbed into unit tests |
| `e2e-bot.test.js` | `e2e/single-bot.test.js` | Rewrite (new launcher) |
| `e2e-integration.test.js` | `e2e/multi-mode.test.js` | Adapt (new CLI flags) |
| `e2e-multi-bot.test.js` | `e2e/multi-bot.test.js` | Rewrite (createBot API) |
| `e2e-trace.test.js` | Dropped | Pipeline stages verified by response |
| `e2e-demo-regression.test.js` | Dropped | Demo tested via multi-mode |
| `unit/config.test.js` | `unit/config.test.js` | Keep + add minimal profile tests |
| `unit/bot-lifecycle.test.js` | Dropped | Old Bot class archived |
| `unit/bot-status-command.test.js` | Dropped | BotStatusCommand archived |
| `unit/embedded-irc.test.js` | `unit/embedded-irc.test.js` | Keep (unchanged) |

---

## Phase 5: Future — MeTTa Skills Migration

With the loop running in MeTTa, migrate skill implementations:

1. **Skill definitions as pure MeTTa**: `remember`, `query`, `shell`, `read-file`, `write-file` become MeTTa functions calling grounded ops directly, bypassing ActionDispatcher's JSON parsing
2. **Response parsing in MeTTa**: Replace `parse-response` JS-side op with `(parse-sexpr $resp)` → `(superpose $cmds)` → `(eval $cmd)`, matching MeTTaClaw's approach
3. **LLM output as s-expressions**: Instruct LLM to output `((respond "text") (remember "note"))` instead of JSON `{"actions": [...]}`
4. **Context assembly in MeTTa**: Replace `build-context` JS-side op with MeTTa-level context builder using `&fs-read`, `get-history`, etc.

Each step reduces JS surface area and increases MeTTa expressiveness.

---

## Ordering & Dependencies

```
Phase 0 (Archive)     →  immediate, no deps
Phase 1 (metta/ ops)  →  no deps, testable independently
Phase 2 (loop.metta)  →  needs Phase 1 ops + existing MeTTaOpRegistrar ops
Phase 3 (Launcher)    →  needs Phase 2 (MeTTa-driven loop works)
Phase 4 (Tests)       →  needs Phases 0-3
Phase 5 (MeTTa skills)→  optional, long-term migration
```

---

## Code Impact

| Area | Added | Removed | Net |
|---|---|---|---|
| `metta/` ops + stdlib | ~140 | 0 | +140 |
| `bot/loop.metta` | ~50 | 0 | +50 |
| `MeTTaLoopBuilder` | ~40 | ~120 | -80 |
| `bot/src/index.js` | ~35 | ~200 (old) | -165 |
| `bot/run.js` | ~15 | ~10 | +5 |
| `bot/tests/` | ~600 | ~1,100 (old) | -500 |
| `config.js` | ~20 | 0 | +20 |
| **Total** | **~900** | **~1,430** | **-530** |

---

## Success Criteria

### Phase 0
- [ ] `bot/archive/` contains old Bot class, BotStatusCommand, old tests
- [ ] `bot/src/` contains only `config.js` and `EmbeddedIRCServer.js`

### Phase 1
- [ ] `(^ &sread "(+ 1 2)")` → `(^ &+ 1 2)`
- [ ] `(^ &balance-parens "(+ 1 2")` → `"(+ 1 2)"`
- [ ] `(^ &fs-read path)` returns file content
- [ ] `(^ &shell "echo hello" ())` → `"hello"`
- [ ] All 9 new ops covered by `unit/metta-ops.test.js`

### Phase 2
- [ ] `bot/loop.metta` loads without errors
- [ ] `(when True ok)` → `ok`, `(when False ok)` → `()`
- [ ] `(bot-init)` runs without throwing
- [ ] `(bot-idle)` sleeps and recurses (mock sleep)
- [ ] `(bot-process)` with mocked ops calls full pipeline
- [ ] Idle cycles skip `build-context` and `llm-invoke` (verified by mock tracking)
- [ ] JS wrapper emits `cycle-start` and `cycle-end` per-cycle

### Phase 3
- [ ] `node run.js --mode cli` responds to stdin
- [ ] `node run.js --mode irc` starts IRC, responds
- [ ] `minimal` profile runs with reduced capabilities
- [ ] SIGINT/SIGTERM → clean shutdown

### Phase 4
- [ ] ~67 unit tests pass (<4s)
- [ ] `e2e/single-bot.test.js`: 8/8 scenarios pass
- [ ] `e2e/multi-bot.test.js`: 10/10 scenarios pass
- [ ] `e2e/persistence.test.js`: memory survives restart
- [ ] `e2e/multi-mode.test.js`: all modes functional

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Async grounded ops not awaited in `let*` chain | Medium | Existing `AgentLoop.metta` uses the same pattern; verify `reduceNDAsync` handles it. If not, use explicit `seq` chaining |
| E2E tests too slow for CI | High | Split: unit+pipeline on every PR; e2e nightly. Use `--skip` for fast local iteration |
| Multi-bot test flaky (LLM nondeterminism) | Medium | Lenient assertions: "response exists, length > 10" not exact text. Retry on timeout |
| `check-embodiment-bus` double-dequeue | Low | JS wrapper peeks `lastmsg`, doesn't call dequeue. Only MeTTa's `bot-process` calls it |
| Idle cycles call expensive ops | Medium | Split `bot-process`/`bot-idle`. JS wrapper checks queue and calls appropriate function |
| `Agent.status` doesn't exist | High | Build status manually from `agent.embodimentBus`, `agent._mettaLoopBuilder`, `agent.nar` |
| Grounded op naming conflicts with agent/ | Low | New ops use `&` prefix (`&fs-read`, `&sread`); agent/ ops don't use this prefix for the same concepts |
