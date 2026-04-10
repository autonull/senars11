# METTACLAW.upgrade.how4.md — Working System Plan

> **From coded-but-unproven to demonstrably functional**  
> **Version:** 1.0 (April 2026)  
> **Status:** Ready for implementation

---

## Diagnosis

Phases 1–6 are **coded but unproven**. The test suite crashes. Two critical skills return `"not yet wired"` placeholder strings. No data has ever persisted. The architecture is duplicated across `.metta` specs and `.js` implementations that don't actually execute them.

**Root cause:** The MeTTa files are labeled "authoritative specs" but the JS code mirrors them instead of executing them. Every change must be made in two places, and they've already diverged.

## Principle: One Source of Truth

| Concern | Source of Truth | Why |
|---|---|---|
| Skill declarations | `skills.metta` | Data, not code — declarative, agent-readable, agent-writable |
| Safety rules | `safety.metta` | Already loaded by SafetyLayer; no JS duplication needed |
| Hook rules | `hooks.metta` | Already loaded by HookOrchestrator; no JS duplication needed |
| Context structure | `ContextBuilder.metta` | Declarative slot spec; JS provides grounded op implementations |
| Agent loop control flow | JS `_buildMeTTaLoop()` | Requires async I/O; MeTTa interpreter lacks robust async grounded op support |
| Skill handlers | JS `dispatcher.register()` | Requires filesystem, HTTP, LLM calls — inherently imperative |
| NARS bridging | `NarsExtension.js` | Grounded ops that expose NARS cognition to MeTTa |

**Rule:** `.metta` for declarations and rules (data). `.js` for execution and I/O (behavior). Never both.

---

## Stage 0: Fix the Foundation (prerequisite for everything)

### 0.1 Fix Duplicate Logger Export

**Problem:** `core/src/util/Logger.js` exports `Logger` twice, causing the entire test suite to crash on import.

**Fix:** Audit `core/src/util/Logger.js` and `core/src/index.js` (or wherever the re-export happens). Ensure exactly one export path.

**Verification:** `pnpm test:unit` runs without import errors.

### 0.2 Remove Triple Context Building

**Problem:** Context is assembled three ways:
1. `ContextBuilder.metta` — spec (not executed)
2. `ContextBuilder.js` — full implementation (208 lines)
3. `buildContextFn()` inline in `_buildMeTTaLoop()` — ~80 lines, simpler but incomplete

**Fix:** Delete `buildContextFn()`. Use only `ContextBuilder.js`. Keep `ContextBuilder.metta` as the declarative spec that documents slot structure — the JS `registerGroundedOps()` already implements the grounded ops it references.

**Change in `Agent.js`:**
```js
// BEFORE: two context builders
const ctx = contextBuilder
  ? await contextBuilder.build(msg)
  : await buildContextFn(msg);  // ← delete this

// AFTER: one context builder
const ctx = await contextBuilder.build(msg, loopState.cycleCount);
```

Delete the entire `buildContextFn` closure (~80 lines) from `_buildMeTTaLoop()`.

### 0.3 Unify Skill Registration

**Problem:** Skills are declared in `skills.metta` AND registered via `dispatcher.register()` in `Agent.js`. The `.metta` file is parsed for display to the LLM but the actual handlers are in JS. They can drift out of sync.

**Fix:** `skills.metta` is the single source of truth for skill declarations. `SkillDispatcher` reads from it. Handlers are registered in JS, but the declaration (name, args, capability gate, tier) comes from `.metta`.

**Implementation:**

`SkillDispatcher` gains a `loadSkillsFromFile(path)` method:
```js
loadSkillsFromFile(path) {
  const content = readFileSync(path, 'utf-8');
  const atoms = this._parser.parse(content);
  for (const skill of this._extractSkillDecls(atoms)) {
    this._skillDecls.set(skill.name, skill);
  }
}
```

`getActiveSkillDefs()` reads from `_skillDecls` (loaded from `.metta`) instead of reconstructing from `_handlers`:
```js
getActiveSkillDefs() {
  const lines = [];
  for (const [name, decl] of this._skillDecls) {
    if (isEnabled(this._config, decl.capFlag)) {
      lines.push(`(skill ${name} ${decl.argTypes} ${decl.capFlag} ${decl.tier} "${decl.description}")`);
    }
  }
  return lines.join('\n') || '(no skills available)';
}
```

Handler registration in `Agent.js` still uses `dispatcher.register(name, handler, capFlag, tier)` but the capFlag and tier are now validated against the `.metta` declaration. Mismatch logs a warning.

**Result:** Add a new skill → one line in `skills.metta` + one `dispatcher.register()` call. Remove a skill → delete from `skills.metta`. They can't drift.

### 0.4 Wire "Not Yet Wired" Skills

**Problem:** `Agent.js` lines 726, 731:
```js
dispatcher.register('metta', async (expr) => {
  return '(metta eval not yet wired — Phase 1)';
}, 'mettaControlPlane', ':reflect');

dispatcher.register('cognitive-cycle', async (stimulus) => {
  return '(cognitive-cycle not yet wired — Phase 1)';
}, 'mettaControlPlane', ':reflect');
```

**Fix for `metta`:**
```js
dispatcher.register('metta', async (expr) => {
  const { MeTTaInterpreter } = await import('../../../metta/src/MeTTaInterpreter.js');
  // Use a lightweight interpreter instance for eval
  const interp = new MeTTaInterpreter();
  try {
    const results = interp.evaluate(interp.parse(String(expr)));
    return JSON.stringify(results).slice(0, 500);
  } catch (err) {
    return `(metta-error "${err.message}")`;
  }
}, 'mettaControlPlane', ':reflect');
```

**Fix for `cognitive-cycle`:** Defer. This requires the full `CognitiveArchitecture` which may not exist yet. Replace with a stub that logs and returns acknowledgment:
```js
dispatcher.register('cognitive-cycle', async (stimulus) => {
  Logger.debug('[cognitive-cycle] Stimulus:', stimulus);
  return '(cognitive-cycle: deferred — use attend/think for now)';
}, 'mettaControlPlane', ':reflect');
```

### 0.5 Initialize Memory Files

**Problem:** `memory/atoms.metta` doesn't exist. `memory/audit.metta` is all comments. The agent has never persisted anything.

**Fix:** Ensure each persistence module creates its file on first write:
- `SemanticMemory._persist()` → creates `memory/atoms.metta` if missing
- `AuditSpace._persist()` → creates `memory/audit/events.metta` if missing
- `SessionManager.saveCheckpoint()` → creates `memory/history.metta` if missing

Add `mkdir -p` for parent directories as needed.

### 0.6 Stage 0 Test Plan

| # | Test | Passes When |
|---|---|---|
| 0.6.1 | `pnpm test:unit` runs | No import errors, tests execute |
| 0.6.2 | One full agent cycle | Message → context → LLM → parse → execute `send` → response |
| 0.6.3 | Persistence survives restart | `memory/atoms.metta` exists after first cycle |
| 0.6.4 | `metta` skill works | `(metta (+ 1 2))` → `3` or equivalent |
| 0.6.5 | Skill declarations from .metta | `getActiveSkillDefs()` returns content from `skills.metta` |

---

## Stage 1: Functional Chatbot

**Goal:** A working conversational agent that can remember, search, send messages, and persist state across restarts.

### 1.1 Agent Loop — Simplified and Correct

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

The loop is already structurally sound. Changes:
1. Delete `buildContextFn` inline (done in 0.2)
2. Pass `cycleCount` and `wmEntries` to `ContextBuilder.build()`
3. Wire `metta` skill properly (done in 0.4)
4. Ensure `send` skill actually delivers to embodiments

The loop sequence:
```
budget check → dequeue message → tick WM → build context → LLM invoke
→ parse response → execute commands → append history → emit audit
→ sleep → repeat
```

This is correct. Don't change the sequence. Just make each step actually work.

### 1.2 ContextBuilder — Clean and Complete

**File:** `agent/src/memory/ContextBuilder.js` (modify existing)

Current issues:
- `_getWmEntries()` reads from `config._wmEntries` — a coupling leak
- No mechanism to pass WM entries from the loop

**Fix:** Add `wmEntries` parameter to `build()`:
```js
async build(msg, cycleCount = 0, wmEntries = []) {
  this._currentWmEntries = wmEntries;
  // ... rest unchanged
}

_getWmEntries() {
  const wmEntries = this._currentWmEntries || [];
  // ...
}
```

This eliminates the `config._wmEntries` hack.

### 1.3 SkillDispatcher — Reads from .metta

**File:** `agent/src/skills/SkillDispatcher.js` (modify existing)

Add:
```js
import { readFileSync, existsSync } from 'fs';

constructor(config) {
  this._config = config;
  this._handlers = new Map();
  this._skillDecls = new Map();  // NEW: from skills.metta
  this._parser = new Parser();
  this._safetyLayer = null;
  this._auditSpace = null;
}

loadSkillsFromFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  const atoms = this._parser.parse(content);
  for (const decl of this._extractSkillDecls(atoms)) {
    this._skillDecls.set(decl.name, decl);
  }
}

_extractSkillDecls(atom) {
  const decls = [];
  const process = (a) => {
    if (isExpression(a) && a.operator?.name === 'skill') {
      const c = a.components || [];
      if (c.length >= 5) {
        decls.push({
          name: c[0]?.name ?? c[0]?.value,
          argTypes: this._atomToJS(c[1]),
          capFlag: c[2]?.name ?? c[2]?.value,
          tier: c[3]?.name ?? c[3]?.value,
          description: (c[4]?.name ?? c[4]?.value ?? '').replace(/^"|"$/g, ''),
        });
      }
    }
    for (const comp of a.components || []) process(comp);
  };
  process(atom);
  return decls;
}

getActiveSkillDefs() {
  const lines = [];
  for (const [name, decl] of this._skillDecls) {
    if (isEnabled(this._config, decl.capFlag)) {
      lines.push(`(skill ${name} ${decl.argTypes} ${decl.capFlag} ${decl.tier} "${decl.description}")`);
    }
  }
  return lines.join('\n') || '(no skills available)';
}

// Override register to validate against .metta declarations
register(name, handler, capFlag, tier) {
  const decl = this._skillDecls.get(name);
  if (decl) {
    if (decl.capFlag !== capFlag) {
      Logger.warn(`[SkillDispatcher] Capability mismatch for ${name}: .metta says ${decl.capFlag}, JS says ${capFlag}`);
    }
    if (decl.tier !== tier) {
      Logger.warn(`[SkillDispatcher] Tier mismatch for ${name}: .metta says ${decl.tier}, JS says ${tier}`);
    }
  } else {
    Logger.warn(`[SkillDispatcher] Skill ${name} registered in JS but not declared in skills.metta`);
  }
  this._handlers.set(name, { handler, capFlag, tier });
}
```

### 1.4 SafetyLayer — Already Correct

**File:** `agent/src/safety/SafetyLayer.js` — no changes needed.

It already loads `safety.metta` and evaluates consequences via MeTTa inference. The JS tier gates (`TIER_GATES`) are a separate concern — they're the policy layer (what risk level each tier allows), while `safety.metta` is the rule layer (what consequence each skill produces). This is correct separation.

### 1.5 HookOrchestrator — Already Correct

**File:** `agent/src/skills/HookOrchestrator.js` — no changes needed.

It already loads `hooks.metta`, parses hook declarations, matches patterns, and evaluates hook bodies. The built-in predicates (`contains-forbidden?`, `path-within?`, `capability-enabled?`, `audit-emit`) are the grounded ops for hook evaluation. This is correct.

### 1.6 SemanticMemory — Ensure Persistence Works

**File:** `agent/src/memory/SemanticMemory.js` (modify existing)

Ensure `_persist()` creates the file and directory:
```js
async _persist() {
  const dir = dirname(this._atomPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // ... existing persistence logic
}
```

### 1.7 AuditSpace — Ensure Persistence Works

**File:** `agent/src/memory/AuditSpace.js` (modify existing)

Same pattern:
```js
async _persist() {
  const dir = dirname(this._eventPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // ... existing persistence logic
}
```

### 1.8 Stage 1 Test Plan

| # | Test | Passes When |
|---|---|---|
| 1.8.1 | Send/receive cycle | User message → LLM responds → `send` skill delivers to embodiment |
| 1.8.2 | Remember/query | `(remember "test")` → `(query "test")` returns it |
| 1.8.3 | Working memory | `(attend "important" 0.9)` → appears in WM_REGISTER slot |
| 1.8.4 | History persists | Conversation history survives agent restart |
| 1.8.5 | Skill declarations from .metta | LLM sees correct skill list from `skills.metta` |
| 1.8.6 | Safety blocks correctly | `(shell "rm -rf /")` blocked when not allowlisted |
| 1.8.7 | Hooks fire correctly | `(write-file "outside/memory/" "...")` denied by path-within? hook |

---

## Stage 2: Neuro-Symbolic Bridge

**Goal:** Expose NARS cognition through MeTTa. The agent can query its own goals, beliefs, derivation chains, and focus sets.

### 2.1 NarsExtension

**File:** `metta/src/extensions/NarsExtension.js` (NEW, ~200 lines)

Grounded ops that bridge MeTTa to NARS:

| Op | Purpose | NARS Mechanism |
|---|---|---|
| `nar-goals` | List goals by status | `taskManager.findTasksByType('GOAL')` |
| `nar-goal-add` | Create a goal | `nar.input(parsedGoal)` |
| `nar-goal-complete` | Remove achieved goal | `taskManager.removeTask()` |
| `nar-goal-status` | Query goal state | `taskManager.findTasksByType()` |
| `nar-beliefs` | Query beliefs | `nar.getBeliefs()` |
| `nar-serialize` | Save full state | `nar.serialize()` → JSON file |
| `nar-deserialize` | Restore full state | `nar.deserialize()` from JSON |
| `nar-latest-session` | Find last checkpoint | Scan `memory/sessions/` |
| `nar-snapshot` | Capture belief state | `nar.getBeliefs()` + `nar.getGoals()` → JSON |
| `nar-snapshot-compare` | Diff two snapshots | Compare truth values by term |
| `nar-stamps` | Get derivation chain | `task.stamp` (id, source, depth, derivations) |
| `nar-recent-derivations` | Recent inference events | `streamReasoner.metrics.recentDerivations` |
| `nar-focus-sets` | List attention contexts | `focus.getFocusSets()` |
| `nar-focus-create` | Create focus set | `focus.createFocusSet()` |
| `nar-focus-switch` | Switch active focus | `focus.setCurrentFocus()` |
| `nar-revision` | Input evidence for term | `nar.input()` with truth value |
| `nar-stats` | System statistics | `nar.getStats()`, `taskManager.getTaskStats()` |

**Registration in Agent.js:**
```js
const { NarsExtension } = await import('../../../metta/src/extensions/NarsExtension.js');
const narsExt = new NarsExtension(interp, this);
narsExt.register();
```

### 2.2 ContextBuilder — Surface NARS State

**File:** `agent/src/memory/ContextBuilder.js` (modify existing)

Constructor accepts optional `nar` parameter.

Add to `budgets`:
```js
startupOrientChars: 2000,
tasksChars: 1500,
```

Add to `_concat()` headers (insert at index 3, before `PINNED`):
```js
const headers = ['SYSTEM_PROMPT', 'CAPABILITIES', 'SKILLS', 'STARTUP_ORIENT', 'TASKS', 'PINNED', ...];
```

Add slot methods:

```js
async _getStartupOrient(cycleCount) {
  if (cycleCount !== 0 || !this.nar) return '';
  const parts = [];
  const goals = this.nar.taskManager.findTasksByType('GOAL');
  const active = goals.filter(g => g.budget.priority >= 0.5);
  if (active.length) parts.push(`Active goals: ${active.map(g => g.term.toString()).join('; ')}`);
  const recent = this.nar.taskManager.getTasksNeedingAttention({ minPriority: 0.3, limit: 5 });
  if (recent.length) parts.push(`Needs attention: ${recent.map(t => t.term.toString()).join('; ')}`);
  return this._truncate(parts.join('\n'), this.budgets.startupOrientChars);
}

_getTasks() {
  if (!this.nar) return '';
  const goals = this.nar.taskManager.findTasksByType('GOAL');
  if (!goals.length) return '';
  return this._truncate(
    goals.map(g => `[${g.budget.priority >= 0.5 ? 'active' : 'pending'}] ${g.term.toString()}`).join('\n'),
    this.budgets.tasksChars
  );
}
```

Update `build()` signature:
```js
async build(msg, cycleCount = 0, wmEntries = []) {
  this._currentWmEntries = wmEntries;
  const sections = await Promise.all([
    this._loadHarnessPrompt(),
    this._filterCapabilities('active'),
    this._getActiveSkills(),
    this._getStartupOrient(cycleCount),
    this._getTasks(),
    this._getPinnedMemories(),
    this._getWmEntries(),
    this._generateManifest(),
    this._queryMemories(msg, this.budgets.recallItems),
    this._getHistory(),
    this._getFeedback(),
    this._formatInput(msg)
  ]);
  return this._concat(sections);
}
```

### 2.3 Agent Loop — Session Restore + NARS Wiring

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

**Session restore on startup:**
```js
// Before the main loop, after loop state initialization:
if (isEnabled(agentCfg, 'persistentHistory')) {
  const sessionsDir = resolve(process.cwd(), 'memory/sessions');
  if (existsSync(sessionsDir)) {
    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort();
    if (files.length > 0) {
      const latest = files[files.length - 1];
      const state = JSON.parse(readFileSync(resolve(sessionsDir, latest), 'utf8'));
      this.deserialize(state);
      Logger.info('[MeTTa loop] Restored from session:', latest);
    }
  }
}
```

**Pass WM entries and cycle count to ContextBuilder:**
```js
// In the loop, before build-context:
loopState.wm = (loopState.wm ?? [])
  .map(e => ({ ...e, ttl: e.ttl - 1 }))
  .filter(e => e.ttl > 0);

if (contextBuilder) {
  contextBuilder._wmEntries = loopState.wm;
}

const ctx = contextBuilder
  ? await contextBuilder.build(msg, loopState.cycleCount, loopState.wm)
  : await buildContextFn(msg);  // fallback if ContextBuilder not initialized
```

**Session checkpoint on budget exhaustion:**
```js
// In the budget-exhaustion branch:
if (_budget <= 0) {
  if (isEnabled(agentCfg, 'persistentHistory')) {
    const state = this.serialize();
    const sessionsDir = resolve(process.cwd(), 'memory/sessions');
    if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
    const path = resolve(sessionsDir, `session_${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(state, null, 2));
    Logger.info('[MeTTa loop] Session checkpoint:', path);
  }
  if (!cap('autonomousLoop')) {
    Logger.info('[MeTTa loop] Budget exhausted, halting.');
    break;
  }
  _budget = agentCfg.loop?.budget ?? 50;
}
```

### 2.4 .metta File Updates

**`AgentLoop.metta`** — extend `agent-init` and `agent-loop` to reflect NARS integration:
```metta
;; Extended agent-init (runs once before main loop)
(= (agent-init)
   (do
     ;; 1. Orient: manifest confirms active capabilities
     (when (cap? runtimeIntrospection)
       (let $m (manifest)
            (attend (atom->string $m) 0.9)))

     ;; 2. Restore session checkpoint (uses NARS deserialize)
     (when (cap? persistentHistory)
       (let $session (nar-latest-session)
            (if (not (== $session ()))
              (nar-deserialize (string-append "memory/sessions/" $session))
              ())))

     ;; 3. Orient on active goals (from NARS)
     (let $goals (nar-goals :active)
          (if (not (== $goals ()))
            (attend (format-goals $goals) 0.85)
            ()))

     ;; 4. Surface recent derivation failures
     (when (cap? auditLog)
       (let $derivations (nar-recent-derivations 5)
            (if (not (== $derivations ()))
              (attend (format-derivations $derivations) 0.7)
              ())))

     (emit-cycle-audit :startup :complete)))

;; Extended agent-loop termination (serialize before reset)
(= (agent-loop 0)
   (do
     (when (cap? persistentHistory)
       (nar-serialize))
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))))
```

**`skills.metta`** — add NARS-bridging skills:
```metta
;; ── NARS goal management ──────────────────────────────────────
(skill nar-goal-add       (String Float)   goalPursuit         :meta "Add goal to NARS memory")
(skill nar-goal-complete  (String)         goalPursuit         :meta "Mark goal achieved")
(skill nar-goal-status    (String)         goalPursuit         :meta "Query goal status")
(skill nar-goals          (Sym)            goalPursuit         :meta "List goals: :active | :pending | :all")

;; ── NARS state management ─────────────────────────────────────
(skill nar-serialize      ()               persistentHistory   :meta "Serialize full NARS state")
(skill nar-snapshot       (Sym)            memorySnapshots     :meta "Capture belief snapshot")
(skill nar-snapshot-compare (String String Float) memorySnapshots :meta "Compare two snapshots")

;; ── NARS derivation tracing ───────────────────────────────────
(skill nar-stamps          (String)        actionTrace         :meta "Get derivation stamps for a term")
(skill nar-recent-derivations (Int)        actionTrace         :meta "Get recent derivation events")

;; ── NARS focus management ─────────────────────────────────────
(skill nar-focus-sets     ()               coordinatorMode     :meta "List focus sets")
(skill nar-focus-create   (String)         coordinatorMode     :meta "Create named focus set")
(skill nar-focus-switch   (String)         coordinatorMode     :meta "Switch to focus set")

;; ── NAL revision ──────────────────────────────────────────────
(skill nar-revision       (String SExpr)   separateEvaluator   :meta "Input evidence for truth revision")
```

**`safety.metta`** — add consequence rules for new skills:
```metta
;; NARS state protection
(consequence-of (nar-deserialize $path) (state-restored) :high)
(consequence-of (nar-goal-add $desc $pri) (goal-created) :low)
(consequence-of (nar-goal-complete $term) (goal-removed) :medium)
(consequence-of (nar-revision $term $evidence) (belief-revised) :medium)

;; Metta skill security gap fix
(consequence-of (metta $expr) (arbitrary-evaluation) :high)
```

**`ContextBuilder.metta`** — add STARTUP_ORIENT and TASKS slot specs:
```metta
;; STARTUP_ORIENT — 2,000 chars — active goals + needs attention, first cycle only
(= (slot-startup-orient $cycle)
   (if (== $cycle 0)
     (context-section "STARTUP_ORIENT" (get-startup-orient))
     ""))

;; TASKS — 1,500 chars — all NARS goals with status
(= (slot-tasks)
   (if (cap? goalPursuit)
     (context-section "TASKS" (get-tasks))
     ""))
```

### 2.5 Configuration

**File:** `agent/src/config/capabilities.js` (modify existing)

Add to `DEFAULTS`:
```js
actionTrace: false, memorySnapshots: false, separateEvaluator: false,
coordinatorMode: false,
```

Add to `DEPENDENCY_TABLE`:
```js
actionTrace:       ['auditLog'],
memorySnapshots:   ['semanticMemory'],
separateEvaluator: ['subAgentSpawning'],
coordinatorMode:   ['multiEmbodiment'],
```

Update `evolved` profile: add `actionTrace`  
Update `full` profile: add `actionTrace`, `memorySnapshots`, `separateEvaluator`, `coordinatorMode`

### 2.6 Stage 2 Test Plan

| # | Test | Passes When |
|---|---|---|
| 2.6.1 | NarsExtension grounded ops | All `nar-*` ops return correct data |
| 2.6.2 | Session restore | `nar-deserialize` restores goals, beliefs, focus sets |
| 2.6.3 | Goal lifecycle | `nar-goal-add` → `nar-goals :active` → `nar-goal-complete` → removed |
| 2.6.4 | Snapshot capture + compare | `nar-snapshot` creates file; `nar-snapshot-compare` returns truth shifts |
| 2.6.5 | Derivation stamps | `nar-stamps` returns stamp chain with ancestry |
| 2.6.6 | Focus sets | `nar-focus-create` → `nar-focus-sets` shows new set |
| 2.6.7 | NAL revision | `nar-revision` inputs evidence; truth value updates |
| 2.6.8 | STARTUP_ORIENT slot | Present on cycle 0 with active goals; absent on cycle 1+ |
| 2.6.9 | TASKS slot | Shows all NARS goals with active/pending status |
| 2.6.10 | Session checkpoint on budget exhaustion | JSON file written to `memory/sessions/` |

---

## Stage 3: Autonomous Background (Conditional)

**Prerequisites:** Stages 0–2 complete and verified  
**Only pursue if:** there's a concrete production-autonomy use case

### 3.1 Webhook Bridge

**File:** `metta/src/extensions/NarsExtension.js` (extend existing, +80 lines)

Lightweight HTTP server using Node's built-in `http` module. Binds `127.0.0.1:7331` by default. Routes: `/triggers/:id`. Injects goals into NARS on valid webhook receipt. HMAC validation. Rate limiting.

### 3.2 Sleep/Resume

**File:** `metta/src/extensions/NarsExtension.js` (extend existing, +40 lines)

`nar-sleep` serializes state, sets a timer, and resumes by deserializing + injecting a resume goal.

### 3.3 Stage 3 Test Plan

| # | Test | Passes When |
|---|---|---|
| 3.3.1 | Webhook → goal injection | POST to `/triggers/:id` → goal appears in NARS |
| 3.3.2 | HMAC validation | Invalid signature → 403 |
| 3.3.3 | Sleep/resume | `nar-sleep` serializes + sets timer; resume injects goal |
| 3.3.4 | Clean shutdown | Webhook server closes on `nar-webhook-stop` |

---

## Critical Path & Sequencing

```
Stage 0: Fix the Foundation (unblocks everything)
├── [P0] 0.1  Fix Logger export          ← tests can't run without this
├── [P0] 0.2  Remove triple context      ← simplifies the loop
├── [P0] 0.3  Unify skill registration   ← eliminates drift
├── [P0] 0.4  Wire "not yet wired"       ← skills must work
├── [P1] 0.5  Initialize memory files    ← persistence must work
└── [P2] 0.6  Stage 0 tests              ← verify foundation

Stage 1: Functional Chatbot
├── [P0] 1.1  Agent loop cleanup         ← depends on 0.2
├── [P0] 1.2  ContextBuilder fix         ← depends on 0.2
├── [P0] 1.3  SkillDispatcher from .metta ← depends on 0.3
├── [P1] 1.6  SemanticMemory persistence ← depends on 0.5
├── [P1] 1.7  AuditSpace persistence     ← depends on 0.5
└── [P2] 1.8  Stage 1 tests              ← verify chatbot

Stage 2: Neuro-Symbolic Bridge
├── [P0] 2.1  NarsExtension              ← the bridge; depends on Stage 1
├── [P1] 2.2  ContextBuilder NARS slots  ← depends on 2.1
├── [P1] 2.3  Agent loop NARS wiring     ← depends on 2.1
├── [P2] 2.4  .metta updates             ← depends on 2.1
├── [P2] 2.5  Config updates             ← independent
└── [P3] 2.6  Stage 2 tests              ← verify bridge

Stage 3: Autonomous Background (conditional)
├── [P0] 3.1  Webhook bridge             ← extends NarsExtension
├── [P1] 3.2  Sleep/resume               ← extends NarsExtension
└── [P2] 3.3  Stage 3 tests              ← verify autonomy
```

### Execution Order (20 steps)

| Step | Task | Est. Lines | Cumulative |
|---|---|---|---|
| 1 | Fix Logger export (0.1) | ~5 | 5 |
| 2 | Remove triple context (0.2) | -80 | -75 |
| 3 | Unify skill registration (0.3) | +30 | -45 |
| 4 | Wire "not yet wired" (0.4) | +15 | -30 |
| 5 | Initialize memory files (0.5) | +10 | -20 |
| 6 | Stage 0 tests (0.6) | — | -20 |
| 7 | Agent loop cleanup (1.1) | -80 | -100 |
| 8 | ContextBuilder fix (1.2) | +10 | -90 |
| 9 | SkillDispatcher from .metta (1.3) | +30 | -60 |
| 10 | SemanticMemory persistence (1.6) | +5 | -55 |
| 11 | AuditSpace persistence (1.7) | +5 | -50 |
| 12 | Stage 1 tests (1.8) | — | -50 |
| 13 | NarsExtension (2.1) | +200 | +150 |
| 14 | ContextBuilder NARS slots (2.2) | +40 | +190 |
| 15 | Agent loop NARS wiring (2.3) | +30 | +220 |
| 16 | .metta updates (2.4) | +60 | +280 |
| 17 | Config updates (2.5) | +10 | +290 |
| 18 | Stage 2 tests (2.6) | — | +290 |
| 19 | Webhook + sleep (3.1–3.2) | +120 | +410 |
| 20 | Stage 3 tests (3.3) | — | +410 |

**Net change: +410 lines** (vs. ~1,500 in the how2 plan). Most of this is NarsExtension (~200 lines) — the single bridge that replaces five duplicate systems.

---

## File Change Summary

| File | Action | Stage | Lines |
|---|---|---|---|
| `metta/src/extensions/NarsExtension.js` | **NEW** | 2 | +200 |
| `agent/src/skills/SkillDispatcher.js` | MODIFY | 0, 1 | +30 |
| `agent/src/memory/ContextBuilder.js` | MODIFY | 1, 2 | +50 |
| `agent/src/Agent.js` | MODIFY | 0, 1, 2 | -50 |
| `agent/src/memory/SemanticMemory.js` | MODIFY | 1 | +5 |
| `agent/src/memory/AuditSpace.js` | MODIFY | 1 | +5 |
| `agent/src/config/capabilities.js` | MODIFY | 2 | +10 |
| `agent/src/metta/skills.metta` | MODIFY | 2 | +20 |
| `agent/src/metta/safety.metta` | MODIFY | 2 | +10 |
| `agent/src/metta/AgentLoop.metta` | MODIFY | 2 | +30 |
| `agent/src/metta/ContextBuilder.metta` | MODIFY | 2 | +15 |
| `core/src/util/Logger.js` or `core/src/index.js` | MODIFY | 0 | ~5 |

**Total: 1 new file, 11 modified files. Net +410 lines.**

---

## What Was Removed

| Removed | Replaced By | Lines Saved |
|---|---|---|
| `buildContextFn()` inline in Agent.js | `ContextBuilder.js` only | ~80 |
| Dual skill registration | `.metta` declarations + validated JS handlers | ~20 (net) |
| `SessionManager.js` (how2) | `nar-serialize` / `nar-deserialize` | ~60 |
| `TaskManager.js` (how2) | `nar-goals` / `nar-goal-add` via NARS | ~250 |
| `ActionTraceSpace.js` (how2) | `nar-stamps` via NARS Stamp | ~100 |
| `MemorySnapshot.js` (how2) | `nar-snapshot` via NARS serialization | ~150 |
| `CoordinatorSpace.js` (how2) | `nar-focus-sets` via NARS Focus | ~150 |
| `coordinator.metta` (how2) | Focus set MeTTa rules | ~50 |
| Separate evaluator logic (how2) | `nar-revision` via NAL | ~80 |
| Cron infrastructure (how2) | NARS urgency decay | ~60 |
| **Total saved** | | **~1,000** |

---

## Design Rationale

### Why This Works

**1. The chatbot works first.** Stage 0 fixes the actual blockers (import errors, placeholder strings, missing persistence). Stage 1 gets a conversation flowing. Everything else is layered on top.

**2. One source of truth per concern.** `.metta` for declarations (skills, safety rules, hooks, context structure). `.js` for execution (handlers, I/O, heavy computation). No duplication.

**3. NARS is the cognitive substrate, not a parallel system.** Goals are NARS goals. Memory is NARS memory. Attention is NARS focus. Derivation is NARS stamps. The bridge (`NarsExtension`) exposes them through MeTTa — it doesn't duplicate them.

**4. MeTTa is the control plane, not a mirror.** The MeTTa files (`AgentLoop.metta`, `ContextBuilder.metta`, `skills.metta`, `safety.metta`, `hooks.metta`) are the authoritative specs. The JS code implements the grounded ops they reference. When the MeTTa interpreter gains robust async grounded op support, the JS loop can be replaced by MeTTa execution without changing the specs.

**5. Stage 3 is optional.** Webhooks and sleep/resume are genuinely new capabilities — not part of the core cognitive architecture. They're only needed if the agent runs autonomously in production.

### What "Elegant" Means Here

- **No file exists just to wrap another file.** Every new file provides unique functionality.
- **No function exists just to call another function.** Every function does real work.
- **No data structure exists just to mirror another data structure.** NARS structures are queried directly.
- **The LLM sees the same world the agent lives in.** Context slots surface NARS state. Skills operate on NARS structures. The agent is transparent to itself.

### Migration Path

1. **Stage 0** — Fix import errors, remove duplication, wire placeholders. The codebase becomes honest about what it does.
2. **Stage 1** — Get a conversation working. Prove the loop: message → context → LLM → skill → response → persist.
3. **Stage 2** — Expose NARS through MeTTa. The agent can now query its own cognition.
4. **Stage 3** — Add autonomy (optional). Webhooks, sleep/resume, scheduled triggers.

Each stage is independently testable and independently valuable. Stage 1 alone delivers a working chatbot. Stage 2 alone delivers self-awareness. Stage 3 alone delivers production autonomy.