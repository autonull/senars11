# METTACLAW.upgrade.how.md — Development Plan

> **Phases 7–9 Implementation Plan**  
> **Version:** 1.0 (April 2026)  
> **Status:** Draft

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| SessionManager | Separate module | Clean separation from PersistenceManager; thin read/write on `history.metta` |
| CoordinatorScope | Unified worker model | Attempt to treat sub-agents and external workers uniformly via a common `worker-state` atom; fall back to external-only if unification proves complex |
| ContextBuilder | Extend existing class | Add STARTUP_ORIENT and TASKS slots inline; existing slot assembly logic is parameterized and handles optional slots well |
| TriggerDispatcher | Extend VirtualEmbodiment | Co-locate trigger/sleep logic with the embodiment that already handles autonomous behavior; avoids new HTTP dependency |

---

## Phase 7 — Structural Reliability

**Prerequisites:** Phases 1–6 (implemented)  
**Risk:** Low — all additions are gated behind new capability flags, default `false`

### 7.1 SessionManager

**File:** `agent/src/session/SessionManager.js` (~50 lines)

- Read/write `session-checkpoint` atoms to `memory/history.metta`
- Methods: `saveCheckpoint(checkpoint)`, `getLatestCheckpoint()`, `restoreFrom(checkpoint)`
- Checkpoint format mirrors `emit-session-checkpoint` spec (§4.2): `{ id, cycle, timestamp, activeGoals, activeTask, wmPriority, snapshotRef }`
- Uses `appendToFile` pattern (append-only, like AuditSpace)

### 7.2 TaskManager

**File:** `agent/src/tasks/TaskManager.js` (~200 lines)

- Task atom lifecycle: `create()`, `start()`, `complete()`, `abandon()`, `getActive()`, `getAny()`, `updateTask()`
- **Immutability enforcement:** `updateTask()` rejects writes to `:description` and `:created-cycle`; logs audit event on violation
- Persistence: reads/writes `memory/tasks/tasks.metta`
- `collectArtifacts(taskId)` for evaluator (§6.2): git diff + action trace events + file writes since task start
- `processEvalResult(taskId, verdict, note)` — maps evaluator output to task state; enforces `maxEvalIterations`
- One-active-task enforcement: `start()` fails if another task is `:in-progress`

### 7.3 ActionTraceSpace

**File:** `agent/src/safety/ActionTraceSpace.js` (~100 lines)

- Append-only telemetry store: `emit(skillCall, result, metadata)`
- Query methods: `getRecent(n)`, `getForTask(taskId)`, `getForCycle(cycle)`, `getSkillDistribution(sinceTs)`
- Persistence: `memory/traces/traces.metta`
- Pruning: `prune(beforeTimestamp)` called by `memoryConsolidation` or startup; retention from `actionTraceRetentionDays` (default 7)

### 7.4 MemorySnapshot

**File:** `agent/src/memory/MemorySnapshot.js` (~150 lines)

- `capture(trigger, atomStore)` — serializes current atom store to `memory/snapshots/snap_<id>.metta`
- `load(snapId)` — reads snapshot file, returns atom list
- `compare(snapIdA, snapIdB, { minDelta })` — returns `[{ atom, stv_before, stv_after, delta }]`
- `prune(retentionCount, harnessChangeSnapshots)` — rolling window of 10; pre-harness-change snapshots exempt until confirmed/rolled back
- Auto-triggered by: `emit-session-checkpoint` (session-boundary), `HarnessOptimizer` (pre-harness-change), `take-snapshot` skill

### 7.5 ContextBuilder Extension

**File:** `agent/src/memory/ContextBuilder.js` (modify existing)

- Add `STARTUP_ORIENT` slot: 2,000 chars, populated **only on cycle 0** (when `cycleCount === 0`), placed before `PINNED`
- Add `TASKS` slot: 1,500 chars, all non-abandoned tasks with status, oldest-first
- Both slots are optional — only assembled when their capability flag is enabled
- Add grounded ops: `filter-wm-above`, `trigger-snapshot` (if not already present)

### 7.6 SkillDispatcher Extension

**File:** `agent/src/skills/SkillDispatcher.js` (modify existing)

- In `execute()`, after audit emit, also emit to `ActionTraceSpace` when `actionTrace` is enabled
- One additional line: `ActionTraceSpace.emit(cmd, result, metadata)` alongside existing `AuditSpace.emit(...)`

### 7.7 Agent.js / AgentBuilder.js Extensions

**Files:** `agent/src/Agent.js`, `agent/src/AgentBuilder.js` (modify existing)

- Register new grounded ops in `_buildMeTTaLoop()`:
  - `latest-session-checkpoint` → `SessionManager.getLatestCheckpoint()`
  - `restore-goals-from-checkpoint` → `GoalManager.restoreFrom(cp)` (thin wrapper; goals stored in SemanticMemory)
  - `restore-wm-from-checkpoint` → restores WM entries from checkpoint
  - `get-active-task` → `TaskManager.getActive()`
  - `recent-audit-failures` → `AuditSpace.getRecent(n, 'skill-blocked')` or similar
  - `emit-session-checkpoint` → writes checkpoint + triggers snapshot if enabled
  - `filter-wm-above` → filters WM entries above priority threshold
  - `trigger-snapshot` → calls `MemorySnapshot.capture()`
- Wire `SessionManager`, `TaskManager`, `ActionTraceSpace`, `MemorySnapshot` as lazy-loaded singletons (follow existing pattern)

### 7.8 Skill Handlers

Register in `_registerMeTTaSkills()`:

| Skill | Handler | Capability |
|---|---|---|
| `create-task` | `TaskManager.create()` | `taskList` |
| `start-task` | `TaskManager.start()` | `taskList` |
| `complete-task` | `TaskManager.complete()` | `taskList` |
| `abandon-task` | `TaskManager.abandon()` | `taskList` |
| `list-tasks` | `TaskManager.listAll()` | `taskList` |
| `request-eval` | Stub for Phase 8 (no-op until `separateEvaluator`) | `taskList` |
| `take-snapshot` | `MemorySnapshot.capture('explicit')` | `memorySnapshots` |
| `list-snapshots` | `MemorySnapshot.listRecent()` | `memorySnapshots` |
| `compare-snapshots` | `MemorySnapshot.compare()` | `memorySnapshots` |

### 7.9 VirtualEmbodiment Extension — Cold-Start Task Seeding

**File:** `agent/src/io/VirtualEmbodiment.js` (modify existing)

- In idle task generation, when `taskList` is enabled:
  - If active task exists → generate sub-task scoped to it
  - If no tasks exist → return `"Review goals and memory, then create the next task using (create-task ...)"`
  - If tasks exist but none active → return null (agent should start one)

### 7.10 .metta File Updates

| File | Change |
|---|---|
| `skills.metta` | Add 11 new skill declarations (§12 of spec) |
| `safety.metta` | Add task-integrity rules: `(write-file "memory/tasks/" ...)` → high-risk consequence |
| `AgentLoop.metta` | Extend `agent-init` with orient protocol (§3.2); extend `agent-loop 0` with checkpoint-before-reset (§4.2) |
| `ContextBuilder.metta` | Add `STARTUP_ORIENT` and `TASKS` slot definitions |

### 7.11 Configuration

**File:** `agent/src/config/capabilities.js` (modify existing)

- Add to `DEFAULTS`: `taskList: false`, `separateEvaluator: false`, `backgroundTriggers: false`, `coordinatorMode: false`, `actionTrace: false`, `memorySnapshots: false`
- Add to `DEPENDENCY_TABLE`:
  ```
  taskList              → goalPursuit, semanticMemory
  separateEvaluator     → subAgentSpawning, taskList
  backgroundTriggers    → autonomousLoop, virtualEmbodiment
  coordinatorMode       → multiEmbodiment, multiModelRouting
  actionTrace           → auditLog
  memorySnapshots       → semanticMemory
  separateEvaluator     → actionTrace  (soft — degrades gracefully)
  ```
- Update `evolved` profile: add `actionTrace`
- Update `full` profile: add `taskList`, `separateEvaluator`, `actionTrace`, `backgroundTriggers`, `coordinatorMode`
- `memorySnapshots` remains experimental — not in any profile by default

**File:** `agent/workspace/agent.json` — add config keys:
- `actionTraceRetentionDays: 7`
- `memorySnapshots: { retentionCount: 10 }`
- `maxEvalIterations: 5`
- `coordinator: { stallThresholdMs: 600000 }`
- `maxSleepHours: 24`

### 7.12 Directory Structure

Create:
```
agent/src/session/SessionManager.js
agent/src/tasks/TaskManager.js
agent/src/safety/ActionTraceSpace.js
agent/src/memory/MemorySnapshot.js
memory/snapshots/          (directory)
memory/tasks/              (directory)
memory/traces/             (directory, may already exist)
```

### 7.13 Test Plan

| Test | What It Verifies |
|---|---|
| Restart reads checkpoint | `SessionManager.getLatestCheckpoint()` returns valid data after restart |
| Task immutability | `TaskManager.updateTask(id, { description: 'new' })` throws/audits |
| One-active-task | Starting a second task while one is `:in-progress` fails |
| Action trace emitted | Each skill execution produces an `action-trace-event` atom |
| Snapshot at boundary | `emit-session-checkpoint` creates snapshot when `memorySnapshots` enabled |
| Snapshot comparison | After belief update, `compare()` returns shifted atoms |
| Cold-start seeding | Empty task list → agent generates "create a task" prompt |

---

## Phase 8 — Evaluation Independence

**Prerequisites:** Phase 7, `subAgentSpawning` stable  
**Risk:** Medium — doubles LLM calls per evaluation; requires careful prompt isolation

### 8.1 Separate Evaluator Implementation

**File:** `agent/src/tasks/TaskManager.js` (extend existing)

- `runSeparateEvaluation(taskId)` — builds evaluator prompt, calls `spawn-agent`, processes result
- Evaluator prompt: task description + artifacts (git diff + test output + file list) + explicit pass/fail instruction
- `processEvalResult(taskId, verdict, note)` — already scaffolded in Phase 7; now fully wired
- `maxEvalIterations` enforcement: auto-abandon after N failures

### 8.2 `request-eval` Skill Handler

- Full implementation (was stub in Phase 7)
- When `separateEvaluator` enabled: spawns evaluation sub-agent
- When disabled: falls back to no-op with audit log

### 8.3 Model Routing for Evaluator

- When `multiModelRouting` enabled, evaluator sub-agent routes to `:introspection` task type
- Natural model diversity: evaluator typically gets a different model than the generator

### 8.4 HarnessOptimizer Extension

**File:** `agent/src/harness/HarnessOptimizer.js` (modify existing)

- Add `getSkillDistribution()` comparison as supplementary signal alongside failure-rate comparison
- Compare `ActionTraceSpace.getSkillDistribution()` from recent cycles against baseline
- Signal: fewer failed parse retries, different skill mix = positive indicator

### 8.5 Test Plan

| Test | What It Verifies |
|---|---|
| Evaluator isolation | Sub-agent receives artifacts + criteria, NOT generator reasoning |
| Pass verdict | `:pass` → task marked `:done`, eval-note set |
| Fail verdict | `:fail` → task returns to `:in-progress`, note visible in TASKS slot |
| Iteration limit | Task abandoned after `maxEvalIterations` failures |
| Model routing | Evaluator routes to `:introspection` when `multiModelRouting` enabled |

---

## Phase 9 — Autonomous Background & Coordination

**Prerequisites:** Phase 7, Phase 8  
**Risk:** Medium-High — webhooks expose HTTP listener; coordinator adds per-cycle overhead

### 9.1 TriggerDispatcher (in VirtualEmbodiment)

**File:** `agent/src/io/VirtualEmbodiment.js` (extend existing)

Add methods:
- `start()` — load trigger atoms from SemanticMemory; arm cron jobs
- `stop()` — disarm all triggers cleanly
- `checkCronTriggers()` — called every minute by internal cron tick
- `onWebhookReceived(req, res)` — HTTP handler for webhook triggers
- `onSleepEmitted(sleepAtom)` — suspends autonomous loop
- `onResumeConditionMet(sleepId)` — resumes autonomous loop, injects resume-task
- `registerTrigger(triggerAtom)` — CRUD for trigger atoms
- `removeTrigger(triggerId)` — disable trigger by ID

**Webhook implementation:**
- Use Node's built-in `http` module (no Express dependency)
- Bind `127.0.0.1:7331` by default; configurable via `agent.json`
- Routes: `/triggers/:id` — derived from trigger atom ID, not user-supplied
- HMAC validation: `X-Trigger-Signature: sha256=<hmac>` using trigger atom's `:secret`
- Rate limiting: `maxWebhookFiringPerHour` (default 60)

**Cron implementation:**
- Use `node-cron` package (lightweight, already common in Node ecosystems)
- Each `:cron` trigger arms a job on `start()`
- Fires by calling `this.generateSelfTask(trigger.action)`

**Goal-completion:**
- Subscribe to `AuditSpace` events
- On `(audit-event :type :task-complete :task-id $id)`, check for matching `:goal-completion` triggers

### 9.2 Sleep Atom Handling

- `sleep-until` skill handler: emits session checkpoint first, then builds sleep atom, stores in SemanticMemory, calls `TriggerDispatcher.onSleepEmitted()`
- On resume: `agent-init` runs with sleep atom's `:resume-task` injected into `STARTUP_ORIENT`
- Max sleep duration: `maxSleepHours` (default 24)

### 9.3 CoordinatorSpace

**File:** `agent/src/coordinator/CoordinatorSpace.js` (~150 lines)

- `worker-state` atom CRUD: `registerWorker()`, `updateWorker()`, `getWorker()`, `getAllWorkers()`
- `updateStalledWorkers()` — checks `last-active` against `stallThresholdMs`
- `reassignStalledTasks()` — moves stalled tasks to next-best worker
- Deadlock detection: all workers busy + queue non-empty
- Scoring: uses `ModelRouter.getExpectedScore()` for assignment ordering

**Unified worker model attempt:**
- Sub-agents and external workers both produce `worker-state` atoms
- Common fields: `:id`, `:type` (`:model` | `:sub-agent` | `:channel`), `:task-id`, `:status`, `:last-active`
- Sub-agents tracked via `VirtualEmbodiment.getSubAgents()` → converted to `worker-state` atoms
- If unification adds significant complexity (inter-context state sharing), fall back to external-only tracking

### 9.4 coordinator.metta

**File:** `agent/src/coordinator/coordinator.metta` (~50 lines)

```metta
(= (stalled? $w)
   (and (== (worker-status $w) :busy)
        (> (elapsed-ms (worker-last-active $w))
           (get-config "coordinator.stallThresholdMs"))))

(= (best-worker-for $task-type)
   (argmax-by (filter-workers :idle)
              (lambda $w (model-expectation $w $task-type))))

(= (coordinator-deadlock?)
   (and (all-workers-busy?) (not (empty? (task-queue)))))
```

### 9.5 Agent Loop Integration

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

- Wire coordinator check at top of each cycle when `coordinatorMode` enabled:
  ```
  (when (cap? coordinatorMode)
    (do (update-stalled-workers)
        (when (coordinator-deadlock?) (emit-cycle-audit :coordinator-deadlock ()))
        (reassign-stalled-tasks)))
  ```
- Wire `TriggerDispatcher.start()` into startup sequence (after `_buildMeTTaLoop()` returns, before loop begins)
- Wire `TriggerDispatcher.stop()` into `Agent.shutdown()`

### 9.6 Skill Handlers

| Skill | Handler | Capability |
|---|---|---|
| `set-trigger` | `TriggerDispatcher.registerTrigger()` | `backgroundTriggers` |
| `remove-trigger` | `TriggerDispatcher.removeTrigger()` | `backgroundTriggers` |
| `list-triggers` | Query SemanticMemory for trigger atoms | `backgroundTriggers` |
| `sleep-until` | Checkpoint + build sleep atom + suspend loop | `backgroundTriggers` |
| `assign-task` | `CoordinatorSpace.assignTask()` | `coordinatorMode` |
| `worker-status` | `CoordinatorSpace.getAllWorkers()` | `coordinatorMode` |
| `rebalance` | `CoordinatorSpace.reassignStalledTasks()` | `coordinatorMode` |

### 9.7 Safety

- `safetyLayer` gate on `set-trigger`: `(consequence-of (set-trigger $atom) (trigger-registered :external) :medium)`
- All trigger firings emit audit events
- Sleep atoms emit `(audit-event :type :agent-sleeping :resume-at $ts)` and `(audit-event :type :agent-resumed :sleep-id $id)`

### 9.8 Test Plan

| Test | What It Verifies |
|---|---|
| Cron trigger fires | Task injected on schedule |
| `sleep-until` suspends | Loop halts, checkpoint written |
| Resume with correct task | `agent-init` receives `:resume-task` in `STARTUP_ORIENT` |
| Stall detection | Worker marked `:stalled` after `stallThresholdMs` |
| Task reassignment | Stalled task moved to next-best worker |
| Deadlock audit | Event emitted when all workers busy + queue non-empty |
| Webhook HMAC rejection | Invalid signature → 403, no info leakage |
| Rate limiting | Excess webhook firings dropped + audit event |

---

## Critical Path & Sequencing

```
Phase 7 (Structural Reliability)
├── 7.1  SessionManager          ← independent, no deps
├── 7.3  ActionTraceSpace        ← independent, no deps
├── 7.4  MemorySnapshot          ← depends on SemanticMemory (existing)
├── 7.2  TaskManager             ← depends on 7.3 (collectArtifacts needs ActionTraceSpace)
├── 7.5  ContextBuilder ext      ← depends on 7.2 (TASKS slot needs TaskManager)
├── 7.6  SkillDispatcher ext     ← depends on 7.3 (actionTrace emit)
├── 7.7  Agent.js grounded ops   ← depends on 7.1, 7.2, 7.4
├── 7.8  Skill handlers          ← depends on 7.2, 7.4, 7.7
├── 7.9  VirtualEmbodiment ext   ← depends on 7.2 (cold-start seeding)
├── 7.10 .metta updates          ← depends on 7.5, 7.8
├── 7.11 Config updates          ← independent, should be done early
└── 7.12 Directory structure     ← must be done first

Phase 8 (Evaluation Independence)
├── 8.1  Evaluator in TaskManager ← depends on Phase 7 (TaskManager, spawn-agent)
├── 8.2  request-eval handler     ← depends on 8.1
├── 8.3  Model routing for eval   ← depends on 8.1, ModelRouter (existing)
├── 8.4  HarnessOptimizer ext     ← depends on Phase 7 (ActionTraceSpace)
└── 8.5  Tests                    ← depends on 8.1–8.4

Phase 9 (Autonomous Background & Coordination)
├── 9.1  TriggerDispatcher        ← depends on Phase 7 (SessionManager for checkpoint)
├── 9.2  Sleep atom handling      ← depends on 9.1, 7.1 (checkpoint)
├── 9.3  CoordinatorSpace         ← depends on ModelRouter (existing)
├── 9.4  coordinator.metta        ← depends on 9.3
├── 9.5  Agent loop integration   ← depends on 9.1, 9.3
├── 9.6  Skill handlers           ← depends on 9.1, 9.3
├── 9.7  Safety rules             ← depends on 9.1
└── 9.8  Tests                    ← depends on 9.1–9.7
```

### Optimal Execution Order

1. **Config + directories** (7.11, 7.12) — unblock everything
2. **SessionManager** (7.1) — independent, needed by many downstream items
3. **ActionTraceSpace** (7.3) — independent, needed by TaskManager and HarnessOptimizer
4. **MemorySnapshot** (7.4) — independent, uses existing SemanticMemory
5. **TaskManager** (7.2) — needs ActionTraceSpace for `collectArtifacts`
6. **ContextBuilder extension** (7.5) — needs TaskManager for TASKS slot
7. **SkillDispatcher extension** (7.6) — needs ActionTraceSpace
8. **Agent.js grounded ops** (7.7) — needs SessionManager, TaskManager, MemorySnapshot
9. **Skill handlers** (7.8) — needs grounded ops + managers
10. **VirtualEmbodiment extension** (7.9) — needs TaskManager
11. **.metta updates** (7.10) — needs everything above
12. **Phase 7 tests** (7.13)

13. **Phase 8: Evaluator** (8.1–8.4) — needs Phase 7 complete
14. **Phase 8 tests** (8.5)

15. **Phase 9: TriggerDispatcher** (9.1–9.2) — needs SessionManager from Phase 7
16. **Phase 9: CoordinatorSpace** (9.3–9.4) — can parallel with 15
17. **Phase 9: Integration** (9.5–9.7) — needs 15 and 16
18. **Phase 9 tests** (9.8)

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Webhook security | Localhost-only default, HMAC validation, allowlisted IDs, rate limiting |
| Task immutability bypass | Safety rule on direct file writes to `memory/tasks/` |
| Coordinator overhead | Lightweight check per cycle; skip when `coordinatorMode` disabled |
| Snapshot storage growth | Fixed retention window (10); pre-harness-change snapshots exempt only until confirmed/rolled back |
| Action trace storage growth | Time-bounded retention (7 days); pruning during consolidation |
| Evaluator cost | `maxEvalIterations` cap (default 5); only runs on explicit `request-eval` |
| Sub-agent / worker unification | Fall back to external-only if inter-context state sharing proves complex |

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `agent/src/session/SessionManager.js` | NEW | 7 |
| `agent/src/tasks/TaskManager.js` | NEW | 7 |
| `agent/src/safety/ActionTraceSpace.js` | NEW | 7 |
| `agent/src/memory/MemorySnapshot.js` | NEW | 7 |
| `agent/src/coordinator/CoordinatorSpace.js` | NEW | 9 |
| `agent/src/coordinator/coordinator.metta` | NEW | 9 |
| `agent/src/memory/ContextBuilder.js` | MODIFY | 7 |
| `agent/src/skills/SkillDispatcher.js` | MODIFY | 7 |
| `agent/src/Agent.js` | MODIFY | 7, 9 |
| `agent/src/io/VirtualEmbodiment.js` | MODIFY | 7, 9 |
| `agent/src/harness/HarnessOptimizer.js` | MODIFY | 8 |
| `agent/src/config/capabilities.js` | MODIFY | 7 |
| `agent/src/metta/skills.metta` | MODIFY | 7 |
| `agent/src/metta/safety.metta` | MODIFY | 7 |
| `agent/src/metta/AgentLoop.metta` | MODIFY | 7 |
| `agent/src/metta/ContextBuilder.metta` | MODIFY | 7 |
| `agent/workspace/agent.json` | MODIFY | 7 |
