# METTACLAW.upgrade.how2.md — Development Plan (Revised)

> **Phases 7–9 Implementation Plan**  
> **Version:** 2.0 (April 2026)  
> **Status:** Ready for implementation

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| SessionManager | Separate module | Thin read/write on `history.metta`; clean separation from PersistenceManager |
| CoordinatorScope | Unified worker model (attempted) | Common `worker-state` atom for sub-agents + external workers; fall back to external-only if inter-context state sharing proves complex |
| ContextBuilder | Extend existing class | Add STARTUP_ORIENT and TASKS slots inline; existing `_concat()` already filters empty strings, making optional slots trivial |
| TriggerDispatcher | Extend VirtualEmbodiment | Co-locate with autonomous behavior; use Node's built-in `http` module (no Express dep) |
| ActionTrace emit | In SkillDispatcher `_dispatch()` | Single insertion point after audit emit; covers all skill executions uniformly |
| Evaluator prompt isolation | Structural, not prompt-based | Evaluator sub-agent receives only artifacts + criteria via `spawn-agent`; generator's `&wm` and reasoning chain are never passed |

---

## Phase 7 — Structural Reliability

**Prerequisites:** Phases 1–6 (implemented)  
**Risk:** Low — all additions gated behind new capability flags, default `false`

### 7.0 Config + Directories (do first — unblocks everything)

**File:** `agent/src/config/capabilities.js`

Add to `DEFAULTS`:
```js
taskList: false, separateEvaluator: false, backgroundTriggers: false,
coordinatorMode: false, actionTrace: false, memorySnapshots: false,
```

Add to `DEPENDENCY_TABLE`:
```js
taskList:              ['goalPursuit', 'semanticMemory'],
separateEvaluator:     ['subAgentSpawning', 'taskList'],
backgroundTriggers:    ['autonomousLoop', 'virtualEmbodiment'],
coordinatorMode:       ['multiEmbodiment', 'multiModelRouting'],
actionTrace:           ['auditLog'],
memorySnapshots:       ['semanticMemory'],
// soft dependency: separateEvaluator degrades gracefully without actionTrace
```

Update `evolved` profile: add `actionTrace`  
Update `full` profile: add `taskList`, `separateEvaluator`, `actionTrace`, `backgroundTriggers`, `coordinatorMode`  
`memorySnapshots` remains experimental — not in any profile by default

**File:** `agent/workspace/agent.json` — add config keys:
```json
{
  "actionTraceRetentionDays": 7,
  "memorySnapshots": { "retentionCount": 10 },
  "maxEvalIterations": 5,
  "coordinator": { "stallThresholdMs": 600000 },
  "maxSleepHours": 24,
  "webhooks": { "port": 7331, "bindHost": "127.0.0.1" }
}
```

**Create directories:**
```
agent/src/session/
agent/src/tasks/
agent/src/coordinator/
memory/snapshots/
memory/tasks/
memory/traces/          (may already exist)
```

### 7.1 SessionManager

**File:** `agent/src/session/SessionManager.js` (~60 lines)

```js
// Pattern: append-only to memory/history.metta, parse last checkpoint atom
class SessionManager {
  static async saveCheckpoint(cp)    // append (session-checkpoint ...) to history.metta
  static async getLatestCheckpoint() // read history.metta, return last checkpoint atom or null
  static async restoreFrom(cp)       // no-op; restoration is done by grounded ops that read cp fields
}
```

- Checkpoint atom format: `(session-checkpoint :id "cp_..." :cycle 142 :timestamp 1743600000000 :active-goals (...) :active-task (...) :wm-priority (...) :snapshot-ref "...")`
- Uses `appendFile` from `fs/promises` (append-only, like AuditSpace's persistence pattern)
- `getLatestCheckpoint()` reads file, parses lines from end, returns first matching `(session-checkpoint ...)` atom

### 7.2 ActionTraceSpace

**File:** `agent/src/safety/ActionTraceSpace.js` (~100 lines)

```js
export class ActionTraceSpace {
  static _events = [];          // in-memory ring buffer
  static _filePath = 'memory/traces/traces.metta';

  static emit(skillCall, result, metadata)   // append action-trace-event atom
  static getRecent(n)                        // last N events
  static getForTask(taskId)                  // events with matching :task-id
  static getForCycle(cycle)                  // events with matching :cycle
  static getSkillDistribution(sinceTs)       // { skillName: count } map
  static async prune(beforeTimestamp)        // remove old events, persist
  static async _persist()                    // write to traces.metta
  static async _load()                       // read from traces.metta on init
}
```

- Atom format: `(action-trace-event :id "act_..." :timestamp N :cycle N :skill "(write-file ...)" :result :success :return-val "ok" :duration-ms 12 :model "..." :embodiment "..." :task-id "...")`
- `:return-val` truncated to 500 chars
- Pruning: called during `memoryConsolidation` or startup; removes events older than `actionTraceRetentionDays` (default 7)

### 7.3 MemorySnapshot

**File:** `agent/src/memory/MemorySnapshot.js` (~150 lines)

```js
export class MemorySnapshot {
  static async capture(trigger, atomStore)    // serialize atom store to snapshots/
  static async load(snapId)                   // read snapshot file, return atoms
  static async compare(snapIdA, snapIdB, opts) // [{ atom, stv_before, stv_after, delta }]
  static async prune(retentionCount)          // rolling window; exempt pre-harness-change
  static async listRecent(n)                  // list recent snapshot metadata
  static async _persist(snapshot)             // write to snapshots/snap_<id>.metta
}
```

- `capture()` serializes the current SemanticMemory atom store (`atoms.metta`) to `memory/snapshots/snap_<id>.metta`
- `compare()` loads two snapshots, parses atoms, computes truth value deltas; returns only atoms with `delta >= opts.minDelta` (default 0.1)
- Retention: rolling window of 10 (configurable); `:pre-harness-change` snapshots exempt until harness change is confirmed or rolled back
- Auto-triggered by: `emit-session-checkpoint` (session-boundary), `HarnessOptimizer` (pre-harness-change), `take-snapshot` skill

### 7.4 TaskManager

**File:** `agent/src/tasks/TaskManager.js` (~200 lines)

```js
export class TaskManager {
  constructor(config, auditSpace)

  // Lifecycle
  create(description)             // → task atom with :status :pending, :done false
  start(taskId)                   // → :in-progress; fails if another task is :in-progress
  complete(taskId)                // → :done, :done true
  abandon(taskId, reason)         // → :abandoned, reason in :eval-note
  updateTask(taskId, fields)      // enforces immutability: rejects :description, :created-cycle

  // Queries
  getActive()                     // return task with :status :in-progress, or null
  getAny()                        // return any non-abandoned task, or null
  listAll()                       // all non-abandoned tasks, oldest-first
  getTask(taskId)                 // return specific task

  // Evaluator support (Phase 8)
  collectArtifacts(taskId)        // git diff + action trace events + file writes
  processEvalResult(taskId, verdict, note)  // :pass → complete; :fail → return to :in-progress
  runSeparateEvaluation(taskId)   // Phase 8: spawn evaluator sub-agent

  // Persistence
  async _persist()                // write to memory/tasks/tasks.metta
  async _load()                   // read from memory/tasks/tasks.metta
}
```

**Immutability enforcement:** `updateTask()` rejects writes to `:description` and `:created-cycle`; emits `(audit-event :type :task-integrity-violation :task-id $id :field $field)` when violated

**One-active-task:** `start()` checks `getActive()`; if another task is `:in-progress`, returns error atom `(task-error :reason "task-already-in-progress" :active-task $id)`

**Persistence:** reads/writes `memory/tasks/tasks.metta` as MeTTa atoms

### 7.5 ContextBuilder Extension

**File:** `agent/src/memory/ContextBuilder.js` (modify existing)

Add to `budgets`:
```js
startupOrientChars: 2000,
tasksChars: 1500,
```

Add to `_concat()` headers (insert at index 3, before `PINNED`):
```js
const headers = ['SYSTEM_PROMPT', 'CAPABILITIES', 'SKILLS', 'STARTUP_ORIENT', 'TASKS', 'PINNED', ...];
```

Add two new slot methods:

**`_getStartupOrient(cycleCount)`** — populated **only on cycle 0**:
```js
async _getStartupOrient(cycleCount) {
  if (cycleCount !== 0) return '';
  const parts = [];
  if (isEnabled(this.config, 'persistentHistory') && this.sessionManager) {
    const cp = await SessionManager.getLatestCheckpoint();
    if (cp) parts.push(`Restored checkpoint: cycle ${cp.cycle}`);
  }
  if (isEnabled(this.config, 'taskList') && this.taskManager) {
    const active = this.taskManager.getActive();
    if (active) parts.push(`Active task: ${active.description}`);
  }
  if (isEnabled(this.config, 'auditLog') && this.auditSpace) {
    const fails = this.auditSpace.getRecent(5, 'skill-blocked');
    if (fails.length) parts.push(`Recent failures: ${fails.map(f => f.skill).join(', ')}`);
  }
  return this._truncate(parts.join('\n'), this.budgets.startupOrientChars);
}
```

**`_getTasks()`** — all non-abandoned tasks:
```js
_getTasks() {
  if (!isEnabled(this.config, 'taskList') || !this.taskManager) return '';
  const tasks = this.taskManager.listAll();
  if (!tasks.length) return '';
  return this._truncate(
    tasks.map(t => `[${t.status}] ${t.description}`).join('\n'),
    this.budgets.tasksChars
  );
}
```

Update `build()` signature to accept `cycleCount`:
```js
async build(msg, cycleCount = 0) {
  const sections = await Promise.all([
    this._loadHarnessPrompt(),
    this._filterCapabilities('active'),
    this._getActiveSkills(),
    this._getStartupOrient(cycleCount),   // NEW
    this._getTasks(),                      // NEW
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

Add dependency injection: constructor accepts optional `taskManager`, `sessionManager`, `auditSpace` params.

### 7.6 SkillDispatcher Extension

**File:** `agent/src/skills/SkillDispatcher.js` (modify existing)

In `_dispatch()`, after audit emit (line ~126), add:
```js
// Action trace emission (Phase 7)
if (this._config?.capabilities?.actionTrace && ActionTraceSpace) {
  ActionTraceSpace.emit(cmd, result ?? error, {
    cycle: this._cycleCount,
    taskId: this._activeTaskId,
    model: this._currentModel,
    embodiment: this._currentEmbodiment
  });
}
```

Need to track `_cycleCount`, `_activeTaskId`, `_currentModel`, `_currentEmbodiment` via setter methods or by reading from loopState.

### 7.7 Agent.js Extensions

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

Lazy-load new modules (follow existing pattern):
```js
let _SessionManager = null;
const loadSessionManager = async () => {
  if (!_SessionManager) {
    const mod = await import('./session/SessionManager.js');
    _SessionManager = mod.SessionManager;
  }
  return _SessionManager;
};
// Same pattern for TaskManager, ActionTraceSpace, MemorySnapshot
```

Register new grounded ops in `_buildMeTTaLoop()`:

| Grounded Op | Implementation |
|---|---|
| `latest-session-checkpoint` | `SessionManager.getLatestCheckpoint()` |
| `restore-goals-from-checkpoint` | Parse checkpoint's `:active-goals`, restore to SemanticMemory |
| `restore-wm-from-checkpoint` | Parse checkpoint's `:wm-priority`, restore to `loopState.wm` |
| `get-active-task` | `TaskManager.getActive()` |
| `recent-audit-failures` | `auditSpace.getRecent(n, 'skill-blocked')` |
| `emit-session-checkpoint` | `SessionManager.saveCheckpoint(cp)` + `MemorySnapshot.capture('session-boundary')` if enabled |
| `filter-wm-above` | `loopState.wm.filter(e => e.priority >= threshold)` |
| `trigger-snapshot` | `MemorySnapshot.capture(triggerType, atomStore)` |

**Wire managers into ContextBuilder:**
```js
if (contextBuilder) {
  contextBuilder.taskManager = taskManager;       // if taskList enabled
  contextBuilder.sessionManager = sessionManager; // if persistentHistory enabled
  contextBuilder.auditSpace = auditSpace;         // if auditLog enabled
}
```

**Pass `cycleCount` to `contextBuilder.build()`:**
```js
const ctx = contextBuilder
  ? await contextBuilder.build(msg, loopState.cycleCount)
  : await buildContextFn(msg);
```

### 7.8 Skill Handlers

Register in `_registerMeTTaSkills()`:

| Skill | Handler | Capability | Tier |
|---|---|---|---|
| `create-task` | `TaskManager.create()` | `taskList` | `:meta` |
| `start-task` | `TaskManager.start()` | `taskList` | `:meta` |
| `complete-task` | `TaskManager.complete()` | `taskList` | `:meta` |
| `abandon-task` | `TaskManager.abandon()` | `taskList` | `:meta` |
| `list-tasks` | `TaskManager.listAll()` | `taskList` | `:meta` |
| `request-eval` | Stub: `(eval-not-available :reason "separateEvaluator not enabled")` | `taskList` | `:meta` |
| `take-snapshot` | `MemorySnapshot.capture('explicit', atomStore)` | `memorySnapshots` | `:meta` |
| `list-snapshots` | `MemorySnapshot.listRecent()` | `memorySnapshots` | `:meta` |
| `compare-snapshots` | `MemorySnapshot.compare()` | `memorySnapshots` | `:meta` |

### 7.9 VirtualEmbodiment Extension — Cold-Start Task Seeding

**File:** `agent/src/io/VirtualEmbodiment.js` (modify existing)

Add `setTaskManager(taskManager)` method. In `_onIdle()`, when `taskList` is enabled:

```js
async _onIdle() {
  if (this._taskManager) {
    const active = this._taskManager.getActive();
    if (active) {
      // Generate sub-task scoped to active task
      this.generateSelfTask(`Continue working on: ${active.description}`, { reason: 'idle-subtask' });
      return;
    }
    const any = this._taskManager.getAny();
    if (!any) {
      this.generateSelfTask('Review goals and memory, then create the next task using (create-task ...)', {
        reason: 'idle-cold-start'
      });
      return;
    }
    // Tasks exist but none active — agent should start one
    this.generateSelfTask(`You have pending tasks. Start one using (start-task "${any.id}").`, {
      reason: 'idle-pending-tasks'
    });
    return;
  }
  // Fallback: existing behavior
  const generated = await this._generateTaskFromGenerators();
  if (generated) {
    this.generateSelfTask(generated.task, { ...generated.metadata, reason: 'idle-generated' });
  } else {
    this.generateSelfTask('Reflect on recent activity and identify improvements.', {
      reason: 'idle-default', type: 'reflection'
    });
  }
}
```

### 7.10 .metta File Updates

**`skills.metta`** — add:
```metta
;; Task list
(skill create-task       (String)          taskList          :meta "Create write-once task atom")
(skill start-task        (String)          taskList          :meta "Set task :in-progress (one at a time)")
(skill complete-task     (String)          taskList          :meta "Mark task done")
(skill abandon-task      (String String)   taskList          :meta "Abandon task with reason")
(skill list-tasks        ()                taskList          :meta "List tasks with current status")
(skill request-eval      (String)          taskList          :meta "Request separate evaluation of task")

;; Memory snapshots
(skill take-snapshot     ()                memorySnapshots   :meta "Capture immediate memory snapshot")
(skill list-snapshots    ()                memorySnapshots   :meta "List recent snapshots by timestamp")
(skill compare-snapshots (String String)   memorySnapshots   :meta "Show atom drift between two snapshots")
```

**`safety.metta`** — add:
```metta
;; Task integrity protection
(consequence-of (write-file "memory/tasks/tasks.metta" $_)
                (task-integrity-violated) :high)
(consequence-of (write-file "memory/tasks/" $_)
                (task-integrity-violated) :high)

;; Metta skill security gap fix (§14.8 of spec)
(consequence-of (metta $expr) (arbitrary-evaluation) :high)
```

**`AgentLoop.metta`** — extend `agent-init` and `agent-loop`:
```metta
;; Extended agent-init (runs once before main loop)
(= (agent-init)
   (do
     ;; 1. Orient: manifest confirms active capabilities
     (when (cap? runtimeIntrospection)
       (let $m (manifest)
            (attend (atom->string $m) 0.9)))

     ;; 2. Restore session checkpoint
     (when (cap? persistentHistory)
       (let $cp (latest-session-checkpoint)
            (if (not (== $cp ()))
              (do (restore-goals-from-checkpoint $cp)
                  (restore-wm-from-checkpoint $cp))
              ())))

     ;; 3. Orient on active task
     (when (cap? taskList)
       (let $active (get-active-task)
            (if (not (== $active ()))
              (attend (format-task $active) 0.85)
              ())))

     ;; 4. Surface recent failures
     (when (cap? auditLog)
       (let $fails (recent-audit-failures 5)
            (if (not (== $fails ()))
              (attend (format-failures $fails) 0.7)
              ())))

     (emit-cycle-audit :startup :complete)))

;; Extended agent-loop termination (checkpoint-before-reset)
(= (agent-loop 0)
   (do
     (when (cap? persistentHistory)
       (emit-session-checkpoint))
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))))
```

**`ContextBuilder.metta`** — add slot definitions:
```metta
;; STARTUP_ORIENT — 2,000 chars — session checkpoint + active task + recent failures, first cycle only
(= (slot-startup-orient $cycle)
   (if (== $cycle 0)
     (context-section "STARTUP_ORIENT"
       (get-startup-orient))
     ""))

;; TASKS — 1,500 chars — all non-abandoned tasks with current status
(= (slot-tasks)
   (if (cap? taskList)
     (context-section "TASKS"
       (get-tasks))
     ""))
```

### 7.11 Test Plan

| # | Test | Verifies |
|---|---|---|
| 7.13.1 | Restart reads checkpoint | `SessionManager.getLatestCheckpoint()` returns valid data; `agent-init` restores goals + WM |
| 7.13.2 | Task immutability | `TaskManager.updateTask(id, { description: 'new' })` rejects + audits |
| 7.13.3 | One-active-task | `TaskManager.start(id2)` while `id1` is `:in-progress` returns error |
| 7.13.4 | Action trace emitted | Each skill execution produces `action-trace-event` in `ActionTraceSpace` |
| 7.13.5 | Snapshot at boundary | `emit-session-checkpoint` creates snapshot when `memorySnapshots` enabled |
| 7.13.6 | Snapshot comparison | After belief update, `compare()` returns atoms with `delta >= minDelta` |
| 7.13.7 | Cold-start seeding | Empty task list + `autonomousLoop` → agent generates "create a task" prompt |
| 7.13.8 | Task list context slot | `TASKS` slot appears in context when `taskList` enabled |
| 7.13.9 | STARTUP_ORIENT slot | Present on cycle 0, absent on cycle 1+ |
| 7.13.10 | Safety rule blocks task file write | `(write-file "memory/tasks/tasks.metta" ...)` → high-risk consequence |

---

## Phase 8 — Evaluation Independence

**Prerequisites:** Phase 7 complete, `subAgentSpawning` stable  
**Risk:** Medium — doubles LLM calls per evaluation; requires careful prompt isolation

### 8.1 Separate Evaluator in TaskManager

**File:** `agent/src/tasks/TaskManager.js` (extend existing)

```js
async runSeparateEvaluation(taskId, agentRef) {
  const task = this.getTask(taskId);
  if (!task) return { error: 'task-not-found' };

  const artifacts = await this.collectArtifacts(taskId);
  const evalPrompt = [
    'Evaluate whether this task is complete.',
    `Task: ${task.description}`,
    '',
    artifacts,
    '',
    'Respond with exactly one of:',
    '(pass "reason the task is done")',
    '(fail "specific reason it is not done")',
    'Assess only whether the result meets the task description.',
  ].join('\n');

  // Spawn evaluator sub-agent via agentRef._virtualEmbodiment
  // The sub-agent receives ONLY: task description + artifacts + criteria
  // It does NOT receive: generator's &wm, reasoning chain, or session context
  const subAgentId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const budget = 5; // 5-cycle budget for evaluation

  // When multiModelRouting enabled, route to :introspection task type
  // This happens naturally if agentRef._modelRouter is used for the spawn
  const success = agentRef._virtualEmbodiment.spawnSubAgent(subAgentId, evalPrompt, {}, budget);
  if (!success) return { error: 'spawn-failed' };

  return { subAgentId, status: 'evaluating' };
}
```

**`collectArtifacts(taskId)`:**
```js
async collectArtifacts(taskId) {
  const task = this.getTask(taskId);
  const sinceTs = task.startedAt || task.createdCycle;
  const parts = [];

  // 1. Git diff of changes (always available)
  const { exec } = await import('child_process');
  const diff = await new Promise(resolve => {
    exec('git diff HEAD --no-color', { cwd: process.cwd(), maxBuffer: 8000 }, (_, stdout) => {
      resolve(stdout ? stdout.slice(0, 8000) : null);
    });
  });
  if (diff) parts.push(`## Changes (git diff)\n${diff}`);

  // 2. Action trace events (if actionTrace enabled)
  if (ActionTraceSpace) {
    const taskEvents = ActionTraceSpace.getForTask(taskId);
    const testEvents = taskEvents.filter(e =>
      e.skill?.startsWith('(shell') && e.skill?.includes('test'));
    if (testEvents.length) {
      parts.push(`## Test output\n${testEvents.map(e => e.returnVal).join('\n')}`);
    }
    const writes = taskEvents.filter(e =>
      e.skill?.startsWith('(write-file') || e.skill?.startsWith('(append-file'));
    if (writes.length) {
      parts.push(`## Files modified\n${writes.map(e => e.skill).join('\n')}`);
    }
  }

  return parts.join('\n\n') || '(no artifact evidence collected)';
}
```

**`processEvalResult(taskId, verdict, note)`:**
```js
processEvalResult(taskId, verdict, note) {
  const task = this.getTask(taskId);
  if (!task) return;

  task[':eval-note'] = note;
  task.evalIterations = (task.evalIterations || 0) + 1;

  if (verdict === ':pass') {
    this.complete(taskId);
  } else if (verdict === ':fail') {
    task[':status'] = ':in-progress';
    task[':done'] = false;
    if (task.evalIterations >= this.config.maxEvalIterations ?? 5) {
      this.abandon(taskId, `Failed evaluation ${task.evalIterations} times: ${note}`);
    }
  }
  this._persist();
}
```

### 8.2 `request-eval` Skill Handler

Full implementation in `_registerMeTTaSkills()`:
```js
dispatcher.register('request-eval', async (taskId) => {
  if (!isEnabled(agentCfg, 'separateEvaluator')) {
    return '(eval-not-available :reason "separateEvaluator not enabled")';
  }
  const taskManager = getTaskManager();
  const result = await taskManager.runSeparateEvaluation(String(taskId), this);
  return JSON.stringify(result);
}, 'taskList', ':meta');
```

### 8.3 Model Routing for Evaluator

When `multiModelRouting` is enabled, the evaluator sub-agent's prompt should be routed through `ModelRouter.invoke()` with a `:introspection` task type hint. This happens naturally if `spawn-agent` uses the model router — but currently `spawn-agent` in Agent.js uses `VirtualEmbodiment.spawnSubAgent()` directly.

**Implementation:** In `TaskManager.runSeparateEvaluation()`, instead of calling `spawnSubAgent()` directly, use `agentRef._modelRouter.invoke(evalPrompt, { taskType: ':introspection' })` when `multiModelRouting` is enabled. This ensures the evaluator uses a different model than the generator.

### 8.4 HarnessOptimizer Extension

**File:** `agent/src/harness/HarnessOptimizer.js` (modify existing)

In `runOptimizationCycle()`, after `_sampleFailures()`, add action trace comparison:

```js
// Action trace distribution comparison (Phase 7 extension)
if (ActionTraceSpace) {
  const baseline = ActionTraceSpace.getSkillDistribution(this.lastEvalTimestamp);
  const current = ActionTraceSpace.getSkillDistribution(Date.now());
  const distributionDelta = this._compareSkillDistributions(baseline, current);
  // If distribution improved (fewer failed parses, better skill mix), boost score
  if (distributionDelta > 0) {
    candidateScore += distributionDelta * 0.1; // supplementary signal
  }
}
```

Add `_compareSkillDistributions(baseline, current)`:
- Compare skill invocation patterns between baseline and current period
- Positive signals: fewer `parse-response` errors, fewer repeated failed skill calls, more diverse skill usage
- Returns a normalized score delta (0–1)

### 8.5 Test Plan

| # | Test | Verifies |
|---|---|---|
| 8.5.1 | Evaluator isolation | Sub-agent prompt contains only task description + artifacts + criteria; no generator `&wm` or reasoning |
| 8.5.2 | Pass verdict | `processEvalResult(id, ':pass', '...')` → task `:done`, `:eval-note` set |
| 8.5.3 | Fail verdict | `processEvalResult(id, ':fail', '...')` → task `:in-progress`, note visible in TASKS slot |
| 8.5.4 | Iteration limit | Task abandoned after `maxEvalIterations` consecutive failures |
| 8.5.5 | Model routing | When `multiModelRouting` enabled, evaluator routes to `:introspection` task type |
| 8.5.6 | Graceful degradation | `collectArtifacts()` works without `actionTrace` (git diff only) |

---

## Phase 9 — Autonomous Background & Coordination

**Prerequisites:** Phase 7, Phase 8  
**Risk:** Medium-High — webhooks expose HTTP listener; coordinator adds per-cycle overhead

### 9.1 TriggerDispatcher (in VirtualEmbodiment)

**File:** `agent/src/io/VirtualEmbodiment.js` (extend existing)

Add dependency: `node-cron` package (add to `package.json`)

```js
class VirtualEmbodiment extends Embodiment {
  // ... existing code ...

  // ── Trigger state ─────────────────────────────────────────
  _triggers = new Map();       // triggerId → { atom, cronJob? }
  _sleepAtoms = new Map();     // sleepId → sleepAtom
  _httpServer = null;          // Node http.Server for webhooks
  _webhookRateLimiter = new Map(); // triggerId → { count, resetAt }

  // ── Lifecycle ─────────────────────────────────────────────
  async start(agentRef) {
    // Load trigger atoms from SemanticMemory
    const triggers = await this._loadTriggerAtoms(agentRef);
    for (const trigger of triggers) {
      if (trigger[':enabled']) this._armTrigger(trigger, agentRef);
    }

    // Start webhook listener if backgroundTriggers enabled
    if (agentRef.agentCfg?.capabilities?.backgroundTriggers) {
      this._startWebhookServer(agentRef);
    }

    // Start cron tick (every minute)
    this._cronInterval = setInterval(() => this._checkCronTriggers(agentRef), 60_000);
  }

  async stop() {
    // Disarm all cron jobs
    for (const [, trigger] of this._triggers) {
      trigger.cronJob?.stop();
    }
    this._triggers.clear();

    // Stop webhook server
    this._stopWebhookServer();

    // Clear cron tick
    clearInterval(this._cronInterval);

    // Resume any sleeping agent (clean shutdown)
    for (const [, sleepAtom] of this._sleepAtoms) {
      this._resumeAgent(sleepAtom);
    }
    this._sleepAtoms.clear();
  }

  // ── Cron triggers ─────────────────────────────────────────
  _armTrigger(triggerAtom, agentRef) {
    if (triggerAtom[':type'] === ':cron') {
      const job = cron.schedule(triggerAtom[':spec'], () => {
        this._fireTrigger(triggerAtom, agentRef);
      });
      this._triggers.set(triggerAtom[':id'], { atom: triggerAtom, cronJob: job });
    } else {
      this._triggers.set(triggerAtom[':id'], { atom: triggerAtom });
    }
  }

  _checkCronTriggers(agentRef) {
    // node-cron handles scheduling; this is a safety check for any missed firings
  }

  _fireTrigger(triggerAtom, agentRef) {
    // Rate limiting for webhooks
    if (triggerAtom[':type'] === ':webhook') {
      if (!this._checkRateLimit(triggerAtom[':id'])) return;
    }

    // Update last-fired, fire-count
    triggerAtom[':last-fired'] = Date.now();
    triggerAtom[':fire-count'] = (triggerAtom[':fire-count'] || 0) + 1;

    // Inject task into VirtualEmbodiment
    const action = triggerAtom[':action'];
    if (typeof action === 'string') {
      this.generateSelfTask(action, { reason: `trigger:${triggerAtom[':id']}`, type: 'trigger-fired' });
    }

    // Audit event
    this.emit('trigger-fired', { id: triggerAtom[':id'], type: triggerAtom[':type'] });
  }

  // ── Webhook server ────────────────────────────────────────
  _startWebhookServer(agentRef) {
    const cfg = agentRef.agentCfg?.webhooks ?? {};
    const host = cfg.bindHost ?? '127.0.0.1';
    const port = cfg.port ?? 7331;

    this._httpServer = http.createServer((req, res) => {
      this._handleWebhook(req, res, agentRef);
    });

    this._httpServer.listen(port, host, () => {
      Logger.info(`[TriggerDispatcher] Webhook server on ${host}:${port}`);
    });

    this._httpServer.on('error', (err) => {
      Logger.error('[TriggerDispatcher] Webhook server error:', err);
    });
  }

  _stopWebhookServer() {
    if (this._httpServer) {
      this._httpServer.close();
      this._httpServer = null;
    }
  }

  async _handleWebhook(req, res, agentRef) {
    if (req.method !== 'POST') {
      res.writeHead(405); res.end(); return;
    }

    // Parse path: /triggers/:id
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== 'triggers') {
      res.writeHead(404); res.end(); return;
    }
    const triggerId = parts[1];

    // Lookup trigger atom — no dynamic registration
    const trigger = this._triggers.get(triggerId);
    if (!trigger) {
      res.writeHead(404); res.end(); return;
    }

    // Read body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      // HMAC validation
      const signature = req.headers['x-trigger-signature'];
      const secret = trigger.atom[':secret'];
      if (!this._verifyHmac(body, signature, secret)) {
        res.writeHead(403); res.end(); return;
      }

      this._fireTrigger(trigger.atom, agentRef);
      res.writeHead(200); res.end(JSON.stringify({ status: 'fired' }));
    });
  }

  _verifyHmac(body, signature, secret) {
    if (!signature || !secret) return false;
    const crypto = await import('crypto');
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  _checkRateLimit(triggerId) {
    const maxPerHour = this.config.maxWebhookFiringPerHour ?? 60;
    const now = Date.now();
    let entry = this._webhookRateLimiter.get(triggerId);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 3600_000 };
      this._webhookRateLimiter.set(triggerId, entry);
    }
    if (entry.count >= maxPerHour) return false;
    entry.count++;
    return true;
  }

  // ── Sleep handling ────────────────────────────────────────
  async onSleepEmitted(sleepAtom, agentRef) {
    this._sleepAtoms.set(sleepAtom[':id'], sleepAtom);

    // Audit: agent sleeping
    this.emit('agent-sleeping', { sleepId: sleepAtom[':id'], resumeAt: sleepAtom[':resume-at'] });

    // Suspend autonomous loop: set a flag that the main loop checks
    this._isSleeping = true;
    this._sleepResumeTask = sleepAtom[':resume-task'];

    // Set up resume condition
    if (sleepAtom[':resume-on']) {
      this._setupResumeCondition(sleepAtom, agentRef);
    }
  }

  _setupResumeCondition(sleepAtom, agentRef) {
    const resumeOn = sleepAtom[':resume-on'];
    if (resumeOn === ':timestamp' || resumeOn?.startsWith(':timestamp')) {
      const resumeAt = new Date(sleepAtom[':resume-at']).getTime();
      const delay = resumeAt - Date.now();
      if (delay > 0) {
        setTimeout(() => this._resumeAgent(sleepAtom, agentRef), Math.min(delay, this.config.maxSleepHours * 3600_000));
      }
    }
    // :webhook resume conditions handled by _handleWebhook when matching trigger fires
  }

  async _resumeAgent(sleepAtom, agentRef) {
    this._isSleeping = false;
    this._sleepAtoms.delete(sleepAtom[':id']);

    // Audit: agent resumed
    this.emit('agent-resumed', { sleepId: sleepAtom[':id'] });

    // Inject resume task into VirtualEmbodiment
    if (sleepAtom[':resume-task']) {
      this.generateSelfTask(sleepAtom[':resume-task'], {
        reason: `resume:${sleepAtom[':id']}`, type: 'sleep-resume'
      });
    }
  }

  // ── Goal-completion triggers ──────────────────────────────
  _onAuditEvent(event) {
    if (event.type !== 'task-complete') return;
    for (const [, trigger] of this._triggers) {
      if (trigger.atom[':type'] === ':goal-completion' &&
          trigger.atom[':spec'] === event.taskId) {
        this._fireTrigger(trigger.atom, agentRef);
      }
    }
  }

  // ── Trigger CRUD ──────────────────────────────────────────
  registerTrigger(triggerAtom, agentRef) {
    this._triggers.set(triggerAtom[':id'], { atom: triggerAtom });
    if (triggerAtom[':enabled']) this._armTrigger(triggerAtom, agentRef);
    this._persistTrigger(triggerAtom, agentRef);
  }

  removeTrigger(triggerId, agentRef) {
    const trigger = this._triggers.get(triggerId);
    if (trigger) {
      trigger.cronJob?.stop();
      this._triggers.delete(triggerId);
      this._persistTriggers(agentRef);
    }
  }
}
```

### 9.2 Sleep Atom Skill Handler

Register in `_registerMeTTaSkills()`:
```js
dispatcher.register('sleep-until', async (timestamp, reason) => {
  if (!isEnabled(agentCfg, 'backgroundTriggers')) {
    return '(sleep-not-available :reason "backgroundTriggers not enabled")';
  }
  // Check max sleep duration
  const resumeAt = new Date(String(timestamp));
  const maxMs = (agentCfg.maxSleepHours ?? 24) * 3600_000;
  if (resumeAt.getTime() - Date.now() > maxMs) {
    return '(sleep-rejected :reason "exceeds-max-sleep-duration")';
  }

  // Emit session checkpoint first
  if (isEnabled(agentCfg, 'persistentHistory')) {
    await SessionManager.saveCheckpoint(buildCheckpoint(loopState));
  }

  // Build and store sleep atom
  const sleepAtom = {
    ':id': `sleep_${Date.now()}`,
    ':reason': String(reason),
    ':resume-at': resumeAt.toISOString(),
    ':resume-task': null, // Will be set by caller via subsequent create-task
    ':checkpoint': checkpointId,
  };
  await SemanticMemory.store(sleepAtom);

  // Suspend loop via VirtualEmbodiment
  await this._virtualEmbodiment.onSleepEmitted(sleepAtom, this);
  return `(sleeping :id "${sleepAtom[':id']}" :resume-at "${resumeAt.toISOString()}")`;
}, 'backgroundTriggers', ':meta');
```

### 9.3 CoordinatorSpace

**File:** `agent/src/coordinator/CoordinatorSpace.js` (~150 lines)

```js
export class CoordinatorSpace {
  constructor(config, modelRouter, embodimentBus) {
    this._workers = new Map();  // workerId → worker-state
    this._config = config;
    this._modelRouter = modelRouter;
    this._embodimentBus = embodimentBus;
  }

  // CRUD
  registerWorker(workerState)     // add/update worker-state atom
  getWorker(id)                   // get worker by id
  getAllWorkers()                 // all workers
  assignTask(taskId, workerId)    // explicitly assign task to worker

  // Coordinator logic
  updateStalledWorkers() {
    const threshold = this._config.coordinator?.stallThresholdMs ?? 600_000;
    const now = Date.now();
    for (const [id, w] of this._workers) {
      if (w[':status'] === ':busy' && (now - w[':last-active']) > threshold) {
        w[':status'] = ':stalled';
        Logger.warn(`[Coordinator] Worker ${id} stalled`);
      }
    }
  }

  reassignStalledTasks() {
    const stalled = [...this._workers.values()].filter(w => w[':status'] === ':stalled');
    for (const w of stalled) {
      if (w[':task-id']) {
        // Find next-best idle worker
        const next = this._bestIdleWorker(w[':task-type']);
        if (next) {
          this.assignTask(w[':task-id'], next[':id']);
          w[':status'] = ':failed';
          w[':task-id'] = null;
        }
      }
    }
  }

  detectDeadlock() {
    const allBusy = [...this._workers.values()].every(w => w[':status'] === ':busy');
    const queueNonEmpty = this._taskQueue?.length > 0;
    return allBusy && queueNonEmpty;
  }

  // Assignment: uses ModelRouter's NAL expectation scoring
  _bestIdleWorker(taskType) {
    const idle = [...this._workers.values()].filter(w => w[':status'] === ':idle');
    if (idle.length === 0) return null;
    // Score by model expectation
    return idle.reduce((best, w) => {
      const score = this._modelRouter?.nalExpectation?.(
        this._modelRouter._modelScores.get(w[':id'])?.[taskType]?.frequency ?? 0.5,
        this._modelRouter._modelScores.get(w[':id'])?.[taskType]?.confidence ?? 0.3
      ) ?? 0.5;
      return score > best.score ? { worker: w, score } : best;
    }, { worker: null, score: -1 }).worker;
  }

  // Sync workers from EmbodimentBus + VirtualEmbodiment
  syncWorkers(embodimentBus, virtualEmbodiment) {
    // External workers from EmbodimentBus
    for (const emb of embodimentBus.getAll()) {
      if (emb.status === 'connected') {
        this.registerWorker({
          ':id': emb.id,
          ':type': ':channel',
          ':task-id': null,
          ':status': ':idle',
          ':last-active': Date.now(),
        });
      }
    }

    // Sub-agents from VirtualEmbodiment (unified model attempt)
    for (const subAgent of virtualEmbodiment.getSubAgents()) {
      this.registerWorker({
        ':id': subAgent.id,
        ':type': ':sub-agent',
        ':task-id': subAgent.task ? `task_${subAgent.id}` : null,
        ':status': subAgent.status === 'active' ? ':busy' : ':idle',
        ':last-active': subAgent.createdAt,
      });
    }
  }
}
```

**Unified worker model:** `syncWorkers()` populates `CoordinatorSpace` from both `EmbodimentBus` (external channels) and `VirtualEmbodiment` (sub-agents). If sub-agent tracking proves problematic (inter-context state sharing), the `VirtualEmbodiment` portion can be commented out without affecting external worker tracking.

### 9.4 coordinator.metta

**File:** `agent/src/coordinator/coordinator.metta` (~50 lines)

```metta
;; coordinator.metta — Inference rules for Symbolic Coordinator
;;
;; Governed by: coordinatorMode capability flag
;;
;; These rules operate on worker-state atoms in CoordinatorSpace.
;; The JS CoordinatorSpace class provides the grounded ops.

;; ── Stall detection ──────────────────────────────────────────

(= (stalled? $w)
   (and (== (worker-status $w) :busy)
        (> (elapsed-ms (worker-last-active $w))
           (get-config "coordinator.stallThresholdMs"))))

;; ── Worker selection ─────────────────────────────────────────

(= (best-worker-for $task-type)
   (argmax-by
     (filter-workers :idle)
     (lambda $w (model-expectation $w $task-type))))

;; ── Deadlock detection ───────────────────────────────────────

(= (coordinator-deadlock?)
   (and (all-workers-busy?)
        (not (empty? (task-queue)))))

;; ── Grounded ops (implemented in CoordinatorSpace.js) ────────
;;
;;   (worker-status $w)        → :idle | :busy | :stalled | :failed
;;   (worker-last-active $w)   → timestamp
;;   (worker-task $w)          → task-id or ()
;;   (filter-workers $status)  → list of workers with given status
;;   (all-workers-busy?)       → True | False
;;   (model-expectation $w $task-type) → NAL expectation score
;;   (elapsed-ms $timestamp)   → milliseconds since timestamp
;;   (get-config $key)         → config value
;;   (task-queue)              → pending task list
;;   (empty? $list)            → True | False
;;   (argmax-by $list $fn)     → element with highest fn value
```

### 9.5 Agent Loop Integration

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

**Coordinator check at top of each cycle** (before budget check):
```js
// Inside the main loop, before budget check:
if (isEnabled(agentCfg, 'coordinatorMode') && coordinatorSpace) {
  coordinatorSpace.syncWorkers(this.embodimentBus, this._virtualEmbodiment);
  coordinatorSpace.updateStalledWorkers();
  if (coordinatorSpace.detectDeadlock()) {
    Logger.warn('[Coordinator] Deadlock detected');
    // Emit audit event
  }
  coordinatorSpace.reassignStalledTasks();
}
```

**TriggerDispatcher startup:**
```js
// After _buildMeTTaLoop() returns, before the loop starts:
if (isEnabled(agentCfg, 'backgroundTriggers')) {
  await this._virtualEmbodiment.start(this);
}
```

**TriggerDispatcher shutdown:**
```js
// In Agent.shutdown():
async shutdown() {
  if (isEnabled(this.agentCfg, 'backgroundTriggers')) {
    await this._virtualEmbodiment.stop();
  }
  await this.embodimentBus?.shutdown();
  if (super.shutdown) await super.shutdown();
}
```

### 9.6 Skill Handlers

| Skill | Handler | Capability |
|---|---|---|
| `set-trigger` | `VirtualEmbodiment.registerTrigger()` | `backgroundTriggers` |
| `remove-trigger` | `VirtualEmbodiment.removeTrigger()` | `backgroundTriggers` |
| `list-triggers` | Query `VirtualEmbodiment._triggers` | `backgroundTriggers` |
| `sleep-until` | Checkpoint + build sleep atom + `onSleepEmitted()` | `backgroundTriggers` |
| `assign-task` | `CoordinatorSpace.assignTask()` | `coordinatorMode` |
| `worker-status` | `CoordinatorSpace.getAllWorkers()` | `coordinatorMode` |
| `rebalance` | `CoordinatorSpace.reassignStalledTasks()` | `coordinatorMode` |

### 9.7 Safety

Add to `safety.metta`:
```metta
;; Trigger registration
(consequence-of (set-trigger $atom) (trigger-registered :external) :medium)
```

Audit events for all trigger firings, sleep/resume:
- `(audit-event :type :trigger-fired :id $id :trigger-type $type)`
- `(audit-event :type :agent-sleeping :sleep-id $id :resume-at $ts)`
- `(audit-event :type :agent-resumed :sleep-id $id)`

### 9.8 Test Plan

| # | Test | Verifies |
|---|---|---|
| 9.8.1 | Cron trigger fires | Task injected on schedule via `node-cron` |
| 9.8.2 | `sleep-until` suspends | Loop halts, checkpoint written, `agent-sleeping` audit event |
| 9.8.3 | Resume with correct task | `agent-init` receives `:resume-task` in `STARTUP_ORIENT` |
| 9.8.4 | Stall detection | Worker marked `:stalled` after `stallThresholdMs` |
| 9.8.5 | Task reassignment | Stalled task moved to next-best worker via NAL scoring |
| 9.8.6 | Deadlock audit | Event emitted when all workers busy + queue non-empty |
| 9.8.7 | Webhook HMAC rejection | Invalid signature → 403, no information leakage |
| 9.8.8 | Webhook rate limiting | Excess firings dropped + audit event emitted |
| 9.8.9 | Unknown trigger ID | Request to unknown ID → 404, no info leakage |
| 9.8.10 | Max sleep duration | `sleep-until` beyond `maxSleepHours` → rejected |
| 9.8.11 | Clean shutdown | `stop()` disarms all triggers, resumes sleeping agent |
| 9.8.12 | Unified workers | Both channel embodiments and sub-agents appear in `worker-status` |

---

## Critical Path & Sequencing

```
Phase 7 (Structural Reliability) — 12 steps
├── [P0] 7.0  Config + directories          ← unblocks everything
├── [P0] 7.1  SessionManager                ← independent, needed by 7.7, 9.1
├── [P0] 7.2  ActionTraceSpace              ← independent, needed by 7.4, 7.6, 8.4
├── [P1] 7.3  MemorySnapshot                ← depends on SemanticMemory (existing)
├── [P1] 7.4  TaskManager                   ← depends on 7.2 (collectArtifacts)
├── [P1] 7.5  ContextBuilder extension      ← depends on 7.4 (TASKS slot)
├── [P1] 7.6  SkillDispatcher extension     ← depends on 7.2 (actionTrace emit)
├── [P1] 7.7  Agent.js grounded ops         ← depends on 7.1, 7.3, 7.4
├── [P2] 7.8  Skill handlers                ← depends on 7.4, 7.7
├── [P2] 7.9  VirtualEmbodiment ext         ← depends on 7.4 (cold-start)
├── [P2] 7.10 .metta updates                ← depends on 7.5, 7.8
└── [P3] 7.11 Tests                         ← depends on 7.1–7.10

Phase 8 (Evaluation Independence) — 6 steps
├── [P0] 8.1  Evaluator in TaskManager      ← depends on Phase 7
├── [P1] 8.2  request-eval handler          ← depends on 8.1
├── [P1] 8.3  Model routing for evaluator   ← depends on 8.1, ModelRouter
├── [P2] 8.4  HarnessOptimizer extension    ← depends on Phase 7 (ActionTraceSpace)
└── [P3] 8.5  Tests                         ← depends on 8.1–8.4

Phase 9 (Autonomous Background & Coordination) — 8 steps
├── [P0] 9.1  TriggerDispatcher             ← depends on Phase 7 (SessionManager)
├── [P1] 9.2  Sleep atom handler            ← depends on 9.1, 7.1
├── [P0] 9.3  CoordinatorSpace              ← depends on ModelRouter (existing)
├── [P1] 9.4  coordinator.metta             ← depends on 9.3
├── [P2] 9.5  Agent loop integration        ← depends on 9.1, 9.3
├── [P2] 9.6  Skill handlers                ← depends on 9.1, 9.3
├── [P2] 9.7  Safety rules                  ← depends on 9.1
└── [P3] 9.8  Tests                         ← depends on 9.1–9.7
```

### Optimal Execution Order (18 steps)

| Step | Task | Parallel? | Est. Complexity |
|---|---|---|---|
| 1 | Config + directories (7.0) | — | Trivial |
| 2 | SessionManager (7.1) | — | Low |
| 3 | ActionTraceSpace (7.2) | Parallel with 2 | Low |
| 4 | MemorySnapshot (7.3) | Parallel with 2–3 | Low-Medium |
| 5 | TaskManager (7.4) | After 3 | Medium |
| 6 | ContextBuilder ext (7.5) | After 5 | Low |
| 7 | SkillDispatcher ext (7.6) | After 3 | Trivial |
| 8 | Agent.js grounded ops (7.7) | After 2, 4, 5 | Medium |
| 9 | Skill handlers (7.8) | After 8 | Low |
| 10 | VirtualEmbodiment ext (7.9) | After 5 | Low |
| 11 | .metta updates (7.10) | After 6, 9 | Low |
| 12 | Phase 7 tests (7.11) | After 1–11 | Medium |
| 13 | Evaluator (8.1) | After 12 | Medium |
| 14 | request-eval + model routing (8.2–8.3) | After 13 | Low |
| 15 | HarnessOptimizer ext (8.4) | After 12 (parallel with 13–14) | Low |
| 16 | Phase 8 tests (8.5) | After 13–15 | Medium |
| 17 | TriggerDispatcher (9.1) | After 12 | High |
| 18 | Sleep handler (9.2) | After 17 | Low |
| 19 | CoordinatorSpace (9.3) | After 12 (parallel with 17) | Medium |
| 20 | coordinator.metta (9.4) | After 19 | Low |
| 21 | Agent loop integration (9.5) | After 17, 19 | Medium |
| 22 | Phase 9 skill handlers + safety (9.6–9.7) | After 21 | Low |
| 23 | Phase 9 tests (9.8) | After 17–22 | High |

**Critical path length:** 1 → 2 → 5 → 8 → 9 → 11 → 12 → 13 → 16 → 17 → 21 → 22 → 23

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Webhook security breach | Medium | High | Localhost-only default, HMAC validation, allowlisted IDs, rate limiting, no info leakage on 404 |
| Task immutability bypass via file write | Low | High | Safety rule on `memory/tasks/` path; hooks.metta rule for `write-file` |
| Coordinator per-cycle overhead | Low | Medium | Lightweight check; skip when disabled; threshold-based stall detection (not per-ms polling) |
| Snapshot storage growth | Low | Medium | Fixed retention (10); pre-harness-change exempt only until confirmed/rolled back |
| Action trace storage growth | Low | Medium | 7-day retention; pruning during consolidation or startup |
| Evaluator LLM cost | Medium | Medium | `maxEvalIterations` cap (5); explicit `request-eval` only (not automatic) |
| Sub-agent/worker unification complexity | Medium | Low | Fall back to external-only tracking; unified model is additive, not required |
| `node-cron` dependency | Low | Low | Lightweight, zero native deps; widely used |
| Context slot ordering regression | Low | Medium | Headers array update in `_concat()` must match `build()` section order; tested by 7.13.8–7.13.9 |
| `metta` skill security gap | Low | High | New safety rule makes `(metta $expr)` high-risk; existing `(metta (manifest))` and `(metta (|- ...))` use cases covered by hook exemptions |

---

## File Change Summary

| File | Action | Phase | Lines (est.) |
|---|---|---|---|
| `agent/src/session/SessionManager.js` | **NEW** | 7 | ~60 |
| `agent/src/tasks/TaskManager.js` | **NEW** | 7, 8 | ~250 |
| `agent/src/safety/ActionTraceSpace.js` | **NEW** | 7 | ~100 |
| `agent/src/memory/MemorySnapshot.js` | **NEW** | 7 | ~150 |
| `agent/src/coordinator/CoordinatorSpace.js` | **NEW** | 9 | ~150 |
| `agent/src/coordinator/coordinator.metta` | **NEW** | 9 | ~50 |
| `agent/src/memory/ContextBuilder.js` | MODIFY | 7 | +40 |
| `agent/src/skills/SkillDispatcher.js` | MODIFY | 7 | +10 |
| `agent/src/Agent.js` | MODIFY | 7, 9 | +80 |
| `agent/src/io/VirtualEmbodiment.js` | MODIFY | 7, 9 | +200 |
| `agent/src/harness/HarnessOptimizer.js` | MODIFY | 8 | +30 |
| `agent/src/config/capabilities.js` | MODIFY | 7 | +15 |
| `agent/src/metta/skills.metta` | MODIFY | 7 | +12 |
| `agent/src/metta/safety.metta` | MODIFY | 7, 9 | +8 |
| `agent/src/metta/AgentLoop.metta` | MODIFY | 7 | +30 |
| `agent/src/metta/ContextBuilder.metta` | MODIFY | 7 | +15 |
| `agent/workspace/agent.json` | MODIFY | 7 | +10 |
| `package.json` | MODIFY | 9 | +1 (`node-cron`) |

**Total new code:** ~1,050 lines across 6 new files  
**Total modified code:** ~450 lines across 12 existing files

---

## Implementation Notes

### Code Sharing Patterns

- **Persistence:** All new modules use the same append-to-file pattern as AuditSpace (`fs.promises.appendFile` for writes, `readFileSync` + parse for reads)
- **Lazy loading:** Follow existing pattern in Agent.js (`let _X = null; const loadX = async () => { if (!_X) ... }`)
- **Capability gating:** Every new feature checks `isEnabled(config, flag)` before activation; no feature activates by default
- **Singleton pattern:** Static methods for SessionManager, ActionTraceSpace, MemorySnapshot (consistent with AuditSpace)
- **Event emission:** New modules emit via `EventEmitter` (consistent with EmbodimentBus, Embodiment)

### General-Purpose Improvements

1. **`metta` skill security gap** — Add safety rule making `(metta $expr)` high-risk (§14.8 of spec). This is a pre-existing gap, not introduced by this upgrade.
2. **ContextBuilder `_getWmEntries()` reads from `config._wmEntries`** — This is a coupling leak. The WM entries should be passed to `build()` as a parameter. Fix: add `wmEntries` parameter to `build(msg, cycleCount, wmEntries)`.
3. **AuditSpace `getRecent()` supports type filtering** — Already implemented; use for `recent-audit-failures(n)` → `auditSpace.getRecent(n, 'skill-blocked')`.
4. **ModelRouter has no `getExpectedScore()` method** — The spec references this; use `nalExpectation()` function + `getScores()` instead.

### Migration Notes

- All changes are backward-compatible: new capability flags default to `false`
- Existing parity/evolved/full profiles are extended but not broken
- `.metta` files are additive — no existing rules are removed or modified
- `ContextBuilder.build()` gains optional parameters with defaults; existing callers unaffected