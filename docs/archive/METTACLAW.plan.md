# METTACLAW.plan.md — Enhancement Menu

> **Purpose**: A selectable menu of design enhancements — each self-contained, dependency-explicit, implementation-complete. Choose any node; implement it independently. Replaces the phase-sequential structure of `METTACLAW.upgrade.md` with a flat, composable tree.

> **Relationship to existing docs**: `METTACLAW.md` specifies the base architecture (Phases 1–6, implemented). `METTACLAW.upgrade.md` is the full narrative spec from which this menu was derived. This document reorganizes that material by functional unit rather than by implementation order.

---

## Gap Closure Summary

Maps Anthropic-published harness patterns to their MeTTa-native equivalents in this menu.

| Anthropic Pattern | Previous Coverage | This Plan |
|---|---|---|
| Context resets beat compaction | `loopBudget` terminates but no checkpoint protocol | A2: checkpoint-before-wipe, structured restart |
| Separate generator/evaluator | `selfEvaluation` self-grades | C1: isolated sub-agent, no generator context |
| Feature list immutability, one task at a time | `goalPursuit` atoms but no structural constraint | B1–B2: write-once task atoms, one-active enforcement |
| Session startup ritual | No orient-first protocol in `AgentLoop.metta` | A1: explicit orient phase before first cycle |
| 24/7 background / cron / sleep+resume | `autonomousLoop` but no external triggers | D1–D3: first-class trigger + sleep atoms |
| Coordinator mode for multi-worker | `multiModelRouting` routes requests, not tasks | E1–E3: task-level worker state + stall detection |
| E2E behavioral tracing | `multiEmbodiment` but no action telemetry | F1–F2: typed action atoms per skill execution |
| Memory snapshot across session wipes | `memoryConsolidation` prunes but no point-in-time capture | F3–F4: rolling capture, cross-session queryability |

---

## Implementation Status

Phases 1–6 are complete. All of the following are implemented in `agent/src/`:

`SkillDispatcher.js` · `SemanticMemory.js` · `ModelRouter.js` · `SafetyLayer.js` · `AuditSpace.js` · `EmbodimentBus.js` · `VirtualEmbodiment.js` · `HarnessOptimizer.js` · `IntrospectionOps.js` · `HookOrchestrator.js` · `capabilities.js` · `AgentLoop.metta` · `ContextBuilder.metta` · `skills.metta` · `safety.metta` · `hooks.metta`

The `mettaclaw/` directory is the Python-based historical reference only. Active codebase is `agent/src/` + `metta/src/`.

---

## Enhancement Menu

```
A. Session Lifecycle
   A1. Session Startup Protocol
   A2. Context Reset & Checkpoint Protocol

B. Task Management
   B1. Task Atom Format & Lifecycle
   B2. One-At-A-Time Enforcement
   B3. Cold-Start Task Seeding
   B4. Task List Context Slot
   B5. Task Write Protection

C. Evaluation Independence
   C1. Separate Evaluator Sub-Agent
   C2. Artifact Collection
   C3. Evaluator–Generator Model Diversity
   C4. Iteration Limit & Auto-Abandon

D. Background & Scheduled Activation
   D1. Trigger Atoms (cron / webhook / goal-completion)
   D2. TriggerDispatcher Engine
   D3. Sleep/Resume Protocol
   D4. Webhook Security Hardening

E. Multi-Worker Coordination
   E1. CoordinatorSpace & Worker State Atoms
   E2. Stall Detection & Task Reassignment
   E3. Deadlock Detection

F. Observability
   F1. Action Trace Events
   F2. ActionTraceSpace & HarnessOptimizer Integration
   F3. Memory Snapshots
   F4. Cross-Session Snapshot Comparison

G. Security Hardening
   G1. MeTTa Skill Arbitrary-Evaluation Gap
   G2. Task Directory Write Protection
```

Each node below is a complete implementation unit: problem statement, architectural primitive mapping, full spec (atoms, code, skills, files), and explicit dependencies.

---

## A. Session Lifecycle

### A1 — Session Startup Protocol

**Capability flag**: none (extends `agent-init` unconditionally; sub-behaviors gated by existing flags)  
**Dependencies**: none new; uses `persistentHistory`, `goalPursuit`, `taskList`, `auditLog` when enabled  
**Generic primitive**: `pointer_index` (STARTUP_ORIENT slot), `lazy_topic_fetcher` (checkpoint restore), `watch_pattern_matcher` (cycle-0 detection)

#### Problem

The existing `agent-start → agent-init → agent-loop` path does not define what `agent-init` does. Agents restart and re-solve problems they already solved, ignore open tasks, and ignore recent failures. Anthropic's documented pattern — check git log, read progress file, select one feature, verify before implementing — maps directly to a specced `agent-init` that orients before the first cycle.

#### Extended `agent-init` (`AgentLoop.metta`)

Extend §5.1 of `AgentLoop.metta`. Runs once before the main loop:

```metta
(= (agent-init)
   (do
     ;; 1. Orient: manifest confirms active capabilities
     (when (cap? runtimeIntrospection)
       (let $m (manifest)
            (attend (atom->string $m) 0.9)))

     ;; 2. Restore session checkpoint (goals + high-priority WM)
     (when (cap? persistentHistory)
       (let $cp (latest-session-checkpoint)
            (if (not (== $cp ()))
              (do (restore-goals-from-checkpoint $cp)
                  (restore-wm-from-checkpoint $cp))
              ())))

     ;; 3. Orient on active task (if taskList enabled)
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
```

#### STARTUP_ORIENT Context Slot (`ContextBuilder.metta`)

Populated **only on cycle 0** of a session (when `&cycle-count` has just been reset). Sits before `PINNED` in `build-context`:

```
STARTUP_ORIENT — 2,000 chars — session checkpoint + active task + recent failures, first cycle only
```

Not re-assembled after cycle 0. Cycle-0 detection: `(== (get-state &cycle-count) 0)`.

#### New Grounded Ops (`AgentBuilder.buildMeTTaLoop()`)

```javascript
interp.registerOp('latest-session-checkpoint', () => SessionManager.getLatestCheckpoint())
interp.registerOp('restore-goals-from-checkpoint', (cp) => GoalManager.restoreFrom(cp))
interp.registerOp('restore-wm-from-checkpoint',   (cp) => WMManager.restoreFrom(cp))
interp.registerOp('get-active-task',               () => TaskManager.getActive())
interp.registerOp('recent-audit-failures',         (n) => AuditSpace.getRecentFailures(n))
```

#### New File

**`agent/src/session/SessionManager.js`** (~50 lines): reads/writes `session-checkpoint` atoms to `history.metta`.

```javascript
// SessionManager.js — thin checkpoint I/O
export class SessionManager {
  static async getLatestCheckpoint() { /* query history.metta for most recent (session-checkpoint ...) */ }
  static async writeCheckpoint(cp)   { /* append checkpoint atom to history.metta */ }
}
```

#### Anthropic Equivalent

| Anthropic Artifact | MeTTa-native Equivalent |
|---|---|
| `init.sh` / session startup ritual | `agent-init` in `AgentLoop.metta` |
| `claude-progress.txt` | `session-checkpoint` atom in `history.metta` |

---

### A2 — Context Reset & Checkpoint Protocol

**Capability flag**: `persistentHistory` (checkpoint); `memorySnapshots` (optional pre-reset snapshot)  
**Dependencies**: A1 (`agent-init` restores from checkpoint)  
**Generic primitives**: `token_budget_enforcer` (budget-0 branch), `append_only_logger` (checkpoint write), `graceful_degradation_handler` (reset vs halt decision)

#### Problem

`memoryConsolidation` prunes the atom store mid-session — a different operation from what Anthropic found effective. Article 1's clearest finding: **context resets outperform compaction**. Clearing the context window and reasoning from atom-retrieved facts outperforms a full context window with accumulated stale reasoning. The existing `agent-loop` budget-0 branch calls `agent-halt` or `reset-budget` with no checkpoint.

#### Extended `agent-loop` Termination Branch (`AgentLoop.metta`)

```metta
(= (agent-loop 0)
   (do
     ;; Checkpoint before wiping context
     (when (cap? persistentHistory)
       (emit-session-checkpoint))

     ;; Then reset or halt
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))))

(= (emit-session-checkpoint)
   (let*
     (($goals   (if (cap? goalPursuit)      (get-active-goals) ()))
      ($task    (if (cap? taskList)         (get-active-task) ()))
      ($wm      (get-state &wm))
      ($cycle   (get-state &cycle-count))
      ($snap    (if (cap? memorySnapshots)  (trigger-snapshot :session-boundary) ()))
      ($cp      (session-checkpoint
                  :id           (gen-id "cp")
                  :cycle        $cycle
                  :timestamp    (now)
                  :active-goals $goals
                  :active-task  $task
                  :wm-priority  (filter-wm-above $wm 0.6)
                  :snapshot-ref $snap)))
     (append-to-history $cp)))
```

#### What Survives a Reset

| State | Survives? | Mechanism |
|---|---|---|
| `SemanticMemory` atoms | Yes | `PersistentSpace` — not in context window |
| `AuditSpace` atoms | Yes | `PersistentSpace` — not in context window |
| Active task (`:in-progress`) | Yes | Written to checkpoint; restored by A1 `agent-init` |
| `&wm` entries, priority > 0.6 | Yes | Written to checkpoint; restored by A1 `agent-init` |
| `&wm` entries, priority ≤ 0.6 | No | Low-priority WM is scratch; intentionally cleared |
| Active goals | Yes | Written to checkpoint; restored by A1 `agent-init` |
| Context window content | No | This is the point: accumulated context is expendable |

#### Reset vs. Consolidation

These are complementary, not competing:

- **`memoryConsolidation`**: prunes and merges the *atom store* mid-session. Keeps atoms clean.
- **Context reset**: wipes the *context window* at budget boundaries. Fresh scratch pad.

Both can be active simultaneously. Atom store = persistent layer; context window = expendable scratch.

#### Additional Grounded Ops

```javascript
interp.registerOp('filter-wm-above',     (wm, threshold) => WMManager.filterAbove(wm, threshold))
interp.registerOp('trigger-snapshot',    (trigger)       => MemorySnapshot.capture(trigger))
interp.registerOp('append-to-history',   (atom)          => SessionManager.writeCheckpoint(atom))
interp.registerOp('emit-session-checkpoint', ()          => emitSessionCheckpoint())
```

`trigger-snapshot` is the grounded op called inside `emit-session-checkpoint` when `memorySnapshots` is enabled. It delegates to `MemorySnapshot.capture()` (see F3).

---

## B. Task Management

**Capability flag**: `taskList`  
**Dependency**: `goalPursuit`, `semanticMemory`  
**Generic primitives**: `protected_resource_registry` (write-once fields), `task_lifecycle_manager` (state machine), `shared_scratchpad` (TASKS context slot), `anti_lazy_delegation_constraint` (one-active enforcement)

### B1 — Task Atom Format & Lifecycle

#### Problem

Two pathologies from Anthropic Article 2: (1) premature completion — agent marks tasks done without verification; (2) task sprawl — agent opens parallel threads without finishing any. The `feature_list.json` pattern was effective because it was structurally simple: write-once, one mutable field (`passes`). MeTTa-native equivalent follows the same logic.

#### Task Atom

```metta
(task
  :id           "t_20260402_abc"
  :description  "Implement new-chat-button with hover state and Ctrl+N shortcut"
  :created-cycle 142
  :status       :pending        ; :pending | :in-progress | :done | :abandoned
  :done         false           ; only :status, :done, :eval-note change after creation
  :eval-note    ())             ; set by evaluator: plain-language pass/fail reason
```

**Immutability rule**: `:description` and `:created-cycle` are write-once. `TaskManager.updateTask()` rejects writes to locked fields with an audit event.

The description is plain language. No embedded evaluation predicates — criteria verification is handled conversationally or by the separate evaluator (C1).

#### Task Lifecycle State Machine

```
(create-task "description")
  → status :pending, done false

(start-task id)
  → status :in-progress
  → at most one task may be :in-progress at a time (enforced by B2)

(complete-task id)
  → status :done, done true
  → agent must call this explicitly; autonomousLoop does not auto-complete

(abandon-task id "reason")
  → status :abandoned
  → reason stored in :eval-note

(request-eval id)
  → invokes separate evaluator (if separateEvaluator enabled; see C1)
  → evaluator sets :eval-note; marks :done true or returns to :in-progress
```

#### `TaskManager.js` (`agent/src/tasks/TaskManager.js`)

```javascript
export class TaskManager {
  static async createTask(description)           // mint task atom, persist to tasks.metta
  static async startTask(id)                     // enforce one-active; set :in-progress
  static async completeTask(id)                  // set :done true, :status :done
  static async abandonTask(id, reason)           // set :status :abandoned, :eval-note reason
  static async updateTask(id, fields)            // rejects writes to :description, :created-cycle
  static async getActive()                       // returns single :in-progress task or null
  static async getAny()                          // returns any non-abandoned task or null
  static async getTask(id)                       // full task atom
  static async listTasks()                       // all non-abandoned tasks, oldest-first
  static async createFromGoal(goalAtom)          // converts goal atom to task with done condition
  static async collectArtifacts(taskId)          // see C2
}
```

#### Skills (`skills.metta`)

```metta
(skill create-task   (String)        taskList :meta "Create task with description; returns task id")
(skill start-task    (String)        taskList :meta "Set task :in-progress (one at a time)")
(skill complete-task (String)        taskList :meta "Mark task done (agent asserts completion)")
(skill abandon-task  (String String) taskList :meta "Abandon task with reason")
(skill list-tasks    ()              taskList :meta "List all tasks with status")
(skill request-eval  (String)        taskList :meta "Request separate evaluation of in-progress task")
```

#### Anthropic Equivalent

| Anthropic Artifact | MeTTa-native Equivalent |
|---|---|
| `feature_list.json` | `task` atoms in `memory/tasks/tasks.metta` |

---

### B2 — One-At-A-Time Enforcement

**Dependency**: B1

When `taskList` is enabled:

- `generate-self-task` checks `TaskManager.getActive()` before generating any new task. If a `:in-progress` task exists, it generates only sub-tasks scoped to that task.
- `set-goal` is demoted: goals produce tasks via `TaskManager.createFromGoal()`. Every goal becomes a task with an explicit done condition.
- Idle autonomous cycles do not open new tasks while one is `:in-progress`.

```javascript
// In VirtualEmbodiment.generateSelfTask()
if (config.capabilities.taskList) {
  const active = TaskManager.getActive();
  if (active) return scopedSubTask(active);  // sub-tasks only
  const any = TaskManager.getAny();
  if (!any) return null;  // cold-start case: see B3
  return null; // tasks exist but none active; agent should start one
}
```

---

### B3 — Cold-Start Task Seeding

**Dependency**: B1, B2; `autonomousLoop`

With `taskList` + `autonomousLoop` enabled and no existing tasks (first run or after all tasks complete), `generate-self-task` returns null — the agent idles indefinitely. Seeding prevents this:

```javascript
// In VirtualEmbodiment.generateSelfTask() — cold-start branch
if (config.capabilities.taskList) {
  const active = TaskManager.getActive();
  if (active) return scopedSubTask(active);
  const any = TaskManager.getAny();
  if (!any) return "Review goals and memory, then create the next task using (create-task ...)";
  return null; // tasks exist but none active; agent should call (start-task id)
}
```

The agent is given exactly one thing to do when no task exists: create a task. It does not silently idle.

---

### B4 — Task List Context Slot

**Dependency**: B1

`build-context` gains a `TASKS` slot (`ContextBuilder.metta`):

```
TASKS — 1,500 chars — all non-abandoned tasks with current status, oldest-first
```

This gives the agent full task visibility each cycle without requiring a `(list-tasks)` call. The agent sees done, pending, and active tasks — and the failure note from the last evaluation (if any) — on every cycle.

Slot position: after `PINNED`, before `RECENT_HISTORY`. This ensures the agent always knows the task state before processing new input.

---

### B5 — Task List Write Protection

**Dependency**: B1; `safetyLayer`

`TaskManager.updateTask()` enforces field immutability at the JS layer, but `write-file` with `fileWriteSkill` enabled can overwrite `memory/tasks/tasks.metta` directly, bypassing `TaskManager`. Add to `safety.metta`:

```metta
(= (consequence-of (write-file "memory/tasks/tasks.metta" $_)
                   (task-integrity-violated) :high))
(= (consequence-of (write-file "memory/tasks/" $_)
                   (task-integrity-violated) :high))
```

Any direct write to the tasks directory becomes a high-risk consequence, blocked by `SafetyLayer` when enabled.

---

## C. Evaluation Independence

**Capability flag**: `separateEvaluator`  
**Dependencies**: `subAgentSpawning`, B1 (`taskList`); soft dependency on F1 (`actionTrace`) — degrades gracefully without it  
**Generic primitives**: `coordinator_role`/`worker_role` (generator/evaluator split), `anti_lazy_delegation_constraint` (evaluator sees only artifact), `specialist_role` (evaluator as domain-specific verifier), `role_based_specialization`

### C1 — Separate Evaluator Sub-Agent

#### Problem

`selfEvaluation` (existing experimental flag) has the agent grade its own output. This is structurally biased: the model that produced an artifact has a strong prior toward rating it positively — "this is good" continues naturally from "I produced this." The fix is not better prompting — it is structural isolation. The evaluator sees the artifact and criteria, not the generator's reasoning chain.

#### Invocation (`AgentLoop.metta`)

```metta
(= (run-separate-evaluation $task-id)
   (let*
     (($task       (get-task $task-id))
      ($desc       (task-description $task))
      ($artifacts  (collect-task-artifacts $task-id))
      ($eval-prompt (string-concat
                      "Evaluate whether this task is complete.\n"
                      "Task: " $desc "\n\n"
                      $artifacts "\n\n"
                      "Respond with exactly one of:\n"
                      "(pass \"reason the task is done\")\n"
                      "(fail \"specific reason it is not done\")\n"
                      "Assess only whether the result meets the task description."))
      ($result      (spawn-agent $eval-prompt 5)))    ; 5-cycle budget
     (process-eval-result $task-id $result)))
```

The evaluator sub-agent receives:
- Task description (what was supposed to be done)
- Git diff of changes made during the task (up to 8,000 chars)
- Test output from any test commands that ran during the task
- List of files written during the task
- Explicit instruction: assess completion, not process

The evaluator does **not** receive:
- The generator's chain of thought
- The generator's session `&wm`
- Any reasoning about why the generator made the choices it made

#### Evaluator Output Format

```metta
;; Passing
(eval-result :task-id "t_abc" :verdict :pass :note "Button renders, hover state visible, Ctrl+N fires event")

;; Failing
(eval-result :task-id "t_abc" :verdict :fail :note "Ctrl+N shortcut not bound; tested via console event listener")
```

#### `process-eval-result` (in `TaskManager.js`)

```javascript
async processEvalResult(taskId, evalResult) {
  if (evalResult.verdict === ':pass') {
    await this.completeTask(taskId);
    await this.updateTask(taskId, { evalNote: evalResult.note });
  } else {
    // Return to :in-progress; increment iteration counter
    const task = await this.getTask(taskId);
    const iters = (task.evalIterations || 0) + 1;
    if (iters >= config.maxEvalIterations) {
      await this.abandonTask(taskId, `Exceeded maxEvalIterations: ${evalResult.note}`);
    } else {
      await this.updateTask(taskId, {
        status: ':in-progress',
        evalNote: evalResult.note,
        evalIterations: iters
      });
    }
  }
}
```

Failure notes are visible in the `TASKS` context slot (B4) on the next cycle, so the generator knows exactly what to fix.

#### Relationship to `selfEvaluation`

`selfEvaluation` (existing experimental flag) scores **conversational output quality** against preference atoms — it grades how well the agent communicated, not whether a task was completed. `separateEvaluator` is specifically for **task completion verification** against a concrete artifact.

Both can be enabled simultaneously; they do not interfere. `selfEvaluation` runs on every cycle's output. `separateEvaluator` runs only when `(request-eval id)` is called on a specific task.

---

### C2 — Artifact Collection

**Dependency**: C1; soft dependency on F1 (`actionTrace`)

Runs before spawning the evaluator. Produces a string summary of work done since the task was started:

```javascript
// In TaskManager.collectArtifacts(taskId)
async collectArtifacts(taskId) {
  const task = this.getTask(taskId);
  const parts = [];

  // 1. Git diff of changes made during the task
  const diff = await execSafe('git diff HEAD', { cwd: workdir, maxBytes: 8000 });
  if (diff) parts.push(`## Changes (git diff)\n${diff}`);

  // 2. Recent test output if any test command ran during the task
  // Requires actionTrace (F1); degrades to empty if not enabled
  if (config.capabilities.actionTrace) {
    const testEvents = ActionTraceSpace.getForTask(taskId)
      .filter(e => e.skill.startsWith('(shell') && e.skill.includes('test'));
    if (testEvents.length) {
      parts.push(`## Test output\n${testEvents.map(e => e.returnVal).join('\n')}`);
    }

    // 3. Files written during the task
    const writes = ActionTraceSpace.getForTask(taskId)
      .filter(e => e.skill.startsWith('(write-file') || e.skill.startsWith('(append-file'));
    if (writes.length) {
      parts.push(`## Files modified\n${writes.map(e => e.skill).join('\n')}`);
    }
  }

  return parts.join('\n\n') || '(no artifact evidence collected)';
}
```

Without `actionTrace`, only the git diff is available. This is sufficient for code tasks; `actionTrace` adds test output and file write evidence.

---

### C3 — Evaluator–Generator Model Diversity

**Dependency**: C1; `multiModelRouting`

When `multiModelRouting` is enabled, the evaluator sub-agent routes to the `:introspection` task type (existing in `ModelRouter`), which typically routes to a different model than the `:code` generator. Natural model diversity without explicit configuration.

No new code required — the routing is handled by the existing `spawn-agent` path through `ModelRouter.route()`.

---

### C4 — Iteration Limit & Auto-Abandon

**Dependency**: C1

Tasks have a configurable `maxEvalIterations` (default 5, from `agent.json`). When a task fails evaluation this many times, it is automatically abandoned with the final evaluator note preserved. Prevents infinite retry loops.

```json
// agent.json schema addition
{
  "maxEvalIterations": 5
}
```

The final evaluator failure note is preserved in `:eval-note` on the abandoned task atom, providing a diagnostic record.

---

## D. Background & Scheduled Activation

**Capability flag**: `backgroundTriggers`  
**Dependencies**: `autonomousLoop`, `virtualEmbodiment`  
**Generic primitives**: `multi_condition_trigger`, `tick_scheduler`, `watch_pattern_matcher`, `proactive_action_planner`, `blocking_budget_enforcer`, `append_only_logger`

#### Problem

`autonomousLoop` runs continuously or halts — it has no native concept of scheduled or externally-triggered activation. There is no way to express "run the nightly audit at midnight" or "resume this goal when the deploy webhook fires." The agent either runs reactively (responds to external input) or autonomously generative (creates its own tasks when idle); it cannot sleep with intention. Without triggers, time-specific work either blocks the main loop or is forgotten.

### D1 — Trigger Atoms

**Storage**: `SemanticMemory` (`:type :procedural`); survive restarts; `TriggerDispatcher` re-arms on startup

```metta
(trigger-atom
  :id          "trig_nightly-audit"
  :type        :cron              ; :cron | :webhook | :goal-completion
  :spec        "0 0 * * *"        ; cron: cron expression; webhook: path suffix; goal-completion: goal-id
  :action      (inject-task "Run nightly memory consolidation and audit review")
  :enabled     true
  :last-fired  ()
  :fire-count  0
  :secret      "...")             ; generated at creation; used for HMAC validation (see D4)
```

`:secret` is generated by `TriggerDispatcher` at atom creation time and stored in `SemanticMemory`. It is never returned to the caller after creation; only the HMAC signature derived from it is used at webhook receipt time.

All three trigger types (`:cron`, `:webhook`, `:goal-completion`) share the same atom format; the `:spec` field interpretation varies by `:type`.

#### Skills (`skills.metta`)

```metta
(skill set-trigger    (SExpr)             backgroundTriggers :meta "Register trigger atom")
(skill remove-trigger (String)            backgroundTriggers :meta "Disable trigger by id")
(skill list-triggers  ()                  backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until    (Timestamp String)  backgroundTriggers :meta "Sleep until timestamp; resume with reason")
```

---

### D2 — TriggerDispatcher Engine

**Location**: `agent/src/triggers/TriggerDispatcher.js`

```javascript
class TriggerDispatcher {
  constructor(agentLoop, atomStore, config) {}

  async start()  // load trigger atoms from SemanticMemory; arm all :enabled triggers
  async stop()   // disarm all triggers cleanly

  // Called every minute by internal cron tick
  async checkCronTriggers()

  // Express route handler (mounted at /triggers/:id if webhooksEnabled)
  async onWebhookReceived(req, res)

  // Called when agent emits sleep-atom via sleep-until skill
  async onSleepEmitted(sleepAtom)  // suspends autonomous loop

  // Called when sleep condition met
  async onResumeConditionMet(sleepId)  // resumes autonomous loop; injects resume-task
}
```

**Cron**: Uses `node-cron`. Each `:cron` trigger arms a job on `start()`. Fires via `VirtualEmbodiment.injectTask(trigger.action)`.

**Webhooks**: HTTP listener (port configurable, default 7331, localhost-only). Routes are `/triggers/:id` — derived from trigger ID, not user-supplied. Only triggers that exist as atoms in `SemanticMemory` are routable. No dynamic registration at request time.

**Goal-completion**: `TriggerDispatcher` subscribes to `AuditSpace` events. When `(audit-event :type :task-complete :task-id $id)` fires, checks for matching `:goal-completion` triggers.

**Wire-up in `AgentBuilder.buildMeTTaLoop()`**:

```javascript
const dispatcher = new TriggerDispatcher(agentLoop, atomStore, config);
await dispatcher.start();
process.on('SIGTERM', () => dispatcher.stop());
```

---

### D3 — Sleep/Resume Protocol

**Dependency**: D1, D2; A2 (checkpoint on sleep)

```metta
(sleep-atom
  :id           "sleep_deploy-wait"
  :reason       "Waiting for deployment pipeline"
  :resume-at    (timestamp 2026-04-03T06:00:00)   ; absolute — relative dates converted at creation
  :resume-on    (or :timestamp :webhook "deploy-complete")
  :resume-task  "Verify deployment and run smoke tests"
  :checkpoint   "cp_20260402_xyz")
```

The `sleep-until` skill handler **first emits a session checkpoint** before suspending:

```javascript
// In sleep-until skill handler
async function sleepUntilHandler(timestamp, reason) {
  // Checkpoint before suspending — sleep may be for hours
  if (config.capabilities.persistentHistory) {
    await emitSessionCheckpoint();  // same as budget-exhaustion checkpoint (A2)
  }
  const sleepAtom = buildSleepAtom(timestamp, reason);
  await SemanticMemory.store(sleepAtom);
  await TriggerDispatcher.onSleepEmitted(sleepAtom);
  // Loop suspension happens in TriggerDispatcher
}
```

Without this, goals or WM entries set between the last budget-exhaustion checkpoint and the `sleep-until` call would be silently lost on resume.

On resume (timestamp reached or webhook fired), `agent-init` (A1) runs with the sleep atom's `:resume-task` injected into `STARTUP_ORIENT`.

**Safety audit events**:
- `(audit-event :type :agent-sleeping :resume-at $ts)`
- `(audit-event :type :agent-resumed :sleep-id $id)`
- Max sleep duration: `maxSleepHours` in `agent.json` (default 24)

---

### D4 — Webhook Security Hardening

**Dependency**: D2

Webhooks are the highest-risk feature in this section. All mitigations apply when `backgroundTriggers` is enabled and `webhooksEnabled: true`.

**Localhost-only by default**: Listener binds `127.0.0.1`. External exposure requires explicit `"webhooks": { "bindHost": "0.0.0.0" }` in `agent.json`.

**HMAC validation**: Each trigger atom has a `:secret` field (generated at creation, stored as atom). Incoming requests must include `X-Trigger-Signature: sha256=<hmac>` matching the body.

```javascript
// In TriggerDispatcher.onWebhookReceived()
const sig = req.headers['x-trigger-signature'];
const expected = `sha256=${hmac('sha256', trigger.secret, rawBody)}`;
if (!timingSafeEqual(sig, expected)) return res.status(403).end();
```

**Allowlisted trigger IDs only**: A request to an unknown ID returns 404 with no information leakage.

**SafetyLayer gate on `set-trigger`** (`safety.metta`):

```metta
(= (consequence-of (set-trigger $atom) (trigger-registered :external) :medium))
```

**Rate limiting**: Configurable `maxWebhookFiringPerHour` (default 60). Excess firings emit audit events and are dropped.

**All trigger firings are audited**:

```metta
(audit-event :type :trigger-fired :id $id :trigger-type $type)
```

---

## E. Multi-Worker Coordination

**Capability flag**: `coordinatorMode`  
**Dependencies**: `multiEmbodiment`, `multiModelRouting`  
**Generic primitives**: `coordinator_role`, `task_lifecycle_manager`, `concurrent_dispatch`, `dependency_analyzer`, `structured_notification`

#### Scope Clarification

`CoordinatorSpace` tracks **external workers** — named model connections and named channel embodiments registered with `EmbodimentBus`. It does not track sub-agents spawned via `spawn-agent`. Sub-agents are short-lived (5–10 cycle budget), communicate results via their return value, and are managed by the spawning cycle's `let*` binding. Their stall detection is a timeout on the `spawn-agent` call itself (configurable `subAgentTimeoutMs`, default = `budget × sleepInterval`).

The coordinator is for the scenario where the main agent has multiple long-lived worker embodiments handling different task categories across many cycles.

#### What the Coordinator Actually Does

The coordinator adds three capabilities that `ModelRouter` does not have:

1. **Task-level assignment tracking**: records which worker is handling which task, not just which model handled a request
2. **Stall detection**: notices when a worker's last-active timestamp is old and the task is still open
3. **Reassignment on failure**: when a worker emits `:failed` or stalls past threshold, routes the task to the next-best available worker

Assignment ordering uses `ModelRouter.getExpectedScore()` as its scoring function. The coordinator does not duplicate routing logic — it adds the layer above it.

### E1 — CoordinatorSpace & Worker State Atoms

**Location**: `agent/src/coordinator/CoordinatorSpace.js`  
A `PersistentSpace` separate from `SemanticMemory` — coordinator state is operational, not semantic.

```metta
(worker-state
  :id          "worker-opus-1"
  :type        :model             ; :model | :sub-agent | :channel
  :task-id     "t_20260402_abc"   ; () if idle
  :status      :busy              ; :idle | :busy | :stalled | :failed
  :last-active (timestamp 2026-04-02T10:30:00)
  :task-type   :code
  :assigned-cycle 142)
```

```javascript
export class CoordinatorSpace {
  static async upsertWorkerState(workerState)
  static async getWorkerState(workerId)
  static async listWorkers()
  static async listIdleWorkers()
  static async listStalledWorkers()
  static async updateLastActive(workerId)
}
```

#### Relationship to Existing Components

| Component | Scope | What It Tracks |
|---|---|---|
| `ModelRouter` | Request-level | Which model to invoke for this LLM call |
| `CoordinatorSpace` | Task-level | Which worker is assigned to which multi-cycle task; stall/failure state |
| `EmbodimentBus` | Message-level | Which channel has a pending message; salience ordering |

---

### E2 — Stall Detection & Task Reassignment

**Location**: `agent/src/coordinator/coordinator.metta`

```metta
;; A worker is stalled if busy without update past threshold
(= (stalled? $w)
   (and (== (worker-status $w) :busy)
        (> (elapsed-ms (worker-last-active $w))
           (get-config "coordinator.stallThresholdMs"))))   ; default 600000 (10 min)

;; Best idle worker for a task type: highest NAL expectation score
(= (best-worker-for $task-type)
   (argmax-by
     (filter-workers :idle)
     (lambda $w (model-expectation $w $task-type))))
```

Assignment ordering uses `ModelRouter.getExpectedScore()` as its scoring function. The coordinator does not duplicate routing logic — it adds the task-assignment layer above it.

**Wire into `agent-loop`** (added before `build-context`):

```metta
(when (cap? coordinatorMode)
  (do (update-stalled-workers)
      (when (coordinator-deadlock?) (emit-cycle-audit :coordinator-deadlock ()))
      (reassign-stalled-tasks)))
```

`reassign-stalled-tasks`: marks stalled worker `:failed`; calls `best-worker-for` on the task type; emits new assignment; audits the reassignment.

#### Skills (`skills.metta`)

```metta
(skill assign-task   (String String) coordinatorMode :meta "Assign task id to worker id explicitly")
(skill worker-status ()              coordinatorMode :meta "List current worker states from CoordinatorSpace")
(skill rebalance     ()              coordinatorMode :meta "Force immediate coordinator rebalancing pass")
```

---

### E3 — Deadlock Detection

**Dependency**: E1, E2

```metta
;; Deadlock: all workers busy, task queue non-empty
(= (coordinator-deadlock?)
   (and (all-workers-busy?)
        (not (empty? (task-queue)))))
```

When deadlock is detected: emit `(audit-event :type :coordinator-deadlock)`. The coordinator does not auto-resolve deadlock — it surfaces it for agent inspection. The agent can call `(rebalance)` or `(abandon-task id reason)` to unblock.

---

## F. Observability

### F1 — Action Trace Events

**Capability flag**: `actionTrace`  
**Dependencies**: `auditLog`  
**Generic primitives**: `replay_trace_logger`, `audit_log_emitter`, `append_only_logger`, `usage_pattern_adapter`

#### Distinction from AuditLog

| | `auditLog` | `actionTrace` |
|---|---|---|
| Records | Decisions | Execution telemetry |
| Events | Skill blocked, LLM called, memory written, harness modified | Every skill call, args, return value, timing |
| Consumer | Accountability, safety review, `HarnessOptimizer` failure sampling | Performance analysis, behavioral regression, harness comparison |
| Retention | Indefinite (history.metta) | 7-day rolling (configurable) |

#### `action-trace-event` Atom

```metta
(action-trace-event
  :id          "act_20260402_abc"
  :timestamp   1743600000000
  :cycle       142
  :skill       (write-file "memory/foo.md" "...")   ; full call with args
  :result      :success              ; :success | :failure | :blocked
  :return-val  "ok"                  ; truncated to 500 chars
  :duration-ms 12
  :model       "claude-sonnet-4-6"
  :embodiment  "virtual-self"
  :task-id     "t_20260402_abc")     ; () if not within an active task
```

#### Integration: `SkillDispatcher.execute()`

```javascript
// In SkillDispatcher.execute() — add after existing AuditSpace.emit()
if (config.capabilities.actionTrace) {
  ActionTraceSpace.emit(skillCall, result, {
    cycle: agentState.cycleCount,
    model: currentModel,
    embodiment: currentEmbodiment,
    taskId: TaskManager.getActive()?.id ?? null,
    durationMs: Date.now() - startTime,
  });
}
```

#### `ActionTraceSpace.js` (`agent/src/safety/ActionTraceSpace.js`)

```javascript
export class ActionTraceSpace {
  static emit(skillCall, result, metadata)          // append trace event
  static getRecent(n)                               // last N events
  static getForTask(taskId)                         // events within a task (used by C2)
  static getForCycle(cycle)                         // events within a cycle
  static getSkillDistribution(sinceTs)              // skill-name → count map (used by F2)
  static prune(beforeTimestamp)                     // remove old events
}
```

**Pruning**: retains events for `actionTraceRetentionDays` (default 7, configurable in `agent.json`). Pruned during `memoryConsolidation` self-tasks, or on startup if consolidation is disabled.

#### Anthropic Equivalent

| Anthropic Artifact | MeTTa-native Equivalent |
|---|---|
| Playwright E2E trace | `action-trace-event` atoms in `memory/traces/` |

---

### F2 — ActionTraceSpace & HarnessOptimizer Integration

**Dependency**: F1; `harnessOptimization`

`HarnessOptimizer` gains a supplementary comparison signal: when evaluating a candidate harness change, compares `ActionTraceSpace.getSkillDistribution()` from recent cycles against a pre-change baseline.

```javascript
// In HarnessOptimizer.evaluateCandidate()
if (config.capabilities.actionTrace) {
  const beforeDist = ActionTraceSpace.getSkillDistribution(candidate.proposedAt - windowMs);
  const afterDist  = ActionTraceSpace.getSkillDistribution(candidate.proposedAt);
  const distDrift  = computeDistributionDrift(beforeDist, afterDist);
  // Meaningful drift (e.g., fewer failed parse retries, different skill mix) is a positive signal
  candidate.metrics.skillDistributionDrift = distDrift;
}
```

This supplements the existing failure-rate comparison in `HarnessOptimizer` §5.8.1 without replacing it.

---

### F3 — Memory Snapshots

**Capability flag**: `memorySnapshots`  
**Dependencies**: `semanticMemory` (not `memoryConsolidation` — snapshots are useful earlier)  
**Generic primitives**: `pointer_index` (snapshot index), `raw_transcript_searcher` (cross-session query), `write_verify_protocol` (retention enforcement)

#### Distinction from `memoryConsolidation`

| | `memoryConsolidation` | `memorySnapshots` |
|---|---|---|
| Effect | Prunes, merges, decays atoms | Non-destructive capture |
| Timing | Mid-session, every N cycles | Session boundaries + pre-harness-change |
| Output | Modified atom store | Immutable point-in-time copy |
| Queryable across time? | No — only current state | Yes — any snapshot by id or timestamp |
| Useful when? | Session is long and atom store bloats | Before harness changes; session restart; debugging |

Snapshots do not require `memoryConsolidation`. Most useful in Phase 6 where `harnessOptimization` proposes harness changes — snapshot before, snapshot after = inputs for behavioral drift analysis.

#### Snapshot Atom

```metta
(memory-snapshot
  :id           "snap_20260402_abc"
  :timestamp    1743600000000
  :cycle        142
  :trigger      :session-boundary   ; :session-boundary | :pre-harness-change | :explicit
  :atom-count   847
  :space-ref    "memory/snapshots/snap_20260402_abc.metta"
  :parent-snap  "snap_20260401_xyz" ; most recent prior snapshot; () for first
  :retained-until ())               ; set by pruning pass when kept past rolling window
```

#### Trigger Points (automatic)

1. **Session boundary** — `emit-session-checkpoint` (A2) calls `trigger-snapshot :session-boundary` when `memorySnapshots` is enabled.
2. **Pre-harness-change** — `HarnessOptimizer` calls `trigger-snapshot :pre-harness-change` before writing any candidate.
3. **Explicit** — `(take-snapshot)` skill call.

#### Retention Policy

Rolling window: 10 snapshots (configurable via `"memorySnapshots": { "retentionCount": 10 }` in `agent.json`).

Exception: snapshots taken immediately before a harness change (`trigger: :pre-harness-change`) are retained until the harness change is confirmed or rolled back. They are the rollback baseline.

Pruning is deterministic and audited:

```metta
(audit-event :type :snapshot-pruned :id $id :reason "rolling-window")
```

#### `MemorySnapshot.js` (`agent/src/memory/MemorySnapshot.js`)

```javascript
export class MemorySnapshot {
  static async capture(trigger)                          // write snapshot atom + .metta file
  static async load(snapId)                              // deserialize snapshot file
  static async compare(snapIdBefore, snapIdAfter, opts) // returns atom-level drift
  static async prune()                                   // enforce retention policy
  static async list()                                    // list recent snapshots
}
```

#### Skills (`skills.metta`)

```metta
(skill take-snapshot      ()              memorySnapshots :meta "Capture memory snapshot immediately")
(skill list-snapshots     ()              memorySnapshots :meta "List recent snapshots with timestamps")
(skill compare-snapshots  (String String) memorySnapshots :meta "Show atoms that shifted between two snapshots")
```

#### Anthropic Equivalent

| Anthropic Artifact | MeTTa-native Equivalent |
|---|---|
| `AGENT_MEMORY_SNAPSHOT` env var pattern | `memory-snapshot` atoms in `memory/snapshots/` |

---

### F4 — Cross-Session Snapshot Comparison

**Dependency**: F3

```javascript
// Returns: [{ atom, stv_before, stv_after, delta }]
MemorySnapshot.compare(snapIdBefore, snapIdAfter, { minDelta: 0.1 })
```

Given two snapshot IDs, returns atoms whose truth values shifted by more than `minDelta`. Does not automatically apply NAL revision — produces a diff for agent or human inspection.

Useful after a harness change: did the change cause belief drift? The comparison primitive is the building block; automated revision from snapshot drift is out of scope here.

---

## G. Security Hardening

### G1 — MeTTa Skill Arbitrary-Evaluation Gap

**Dependency**: `safetyLayer`  
**Generic primitive**: `input_sanitizer_pipeline`, `resource_protector`

The `metta` skill calls the MeTTa interpreter with an arbitrary S-expression. `(metta (write-file ...))` bypasses `SkillDispatcher`'s capability gates — the capability check happens inside the skill handler, but `metta` evaluates directly.

**Fix** (`safety.metta`):

```metta
(= (consequence-of (metta $expr) (arbitrary-evaluation) :high))
```

With `safetyLayer` enabled, any `(metta ...)` call triggers forward inference as a high-risk consequence.

**Exemption approach** (for known-safe patterns like `(metta (manifest))` or `(metta (|- ...))`): add explicit exception rules rather than lowering the blanket rating:

```metta
;; Exemptions for safe, read-only metta invocations
(= (consequence-of (metta (manifest)) (arbitrary-evaluation) :none))
(= (consequence-of (metta (|- $lhs $rhs)) (arbitrary-evaluation) :none))
```

Whitelisting specific patterns is better long-term than blanket acceptance; it requires rule maintenance but avoids implicit trust escalation.

---

### G2 — Task Directory Write Protection

**Covered in B5.** Cross-referenced here for the security-focused view.

`safety.metta` rules block direct file writes to `memory/tasks/` — all task mutations must go through `TaskManager.updateTask()` which enforces field immutability at the JS layer.

---

### G3 — Webhook Security Hardening

**Covered in D4.** Cross-referenced here for the security-focused view.

Summary of controls: localhost-only bind, HMAC validation, allowlisted trigger IDs only, SafetyLayer gate on `set-trigger`, rate limiting, full audit trail.

---

## Capability Flag Registry

This section extends §2.2 (Evolution Tier) and §2.3 (Experimental Tier) of `METTACLAW.md`.

### Evolution Tier Additions

| Flag | Default | What It Does | Risk If Enabled | Menu Nodes |
|---|---|---|---|---|
| `taskList` | `false` | Write-once task atoms; one-active enforcement; TASKS context slot | Requires `goalPursuit`; open tasks without resolution path stall autonomous operation | B1–B5 |
| `separateEvaluator` | `false` | Artifact evaluation delegated to isolated sub-agent; no generator context | Requires `subAgentSpawning`; doubles LLM calls per evaluation | C1–C4 |
| `backgroundTriggers` | `false` | First-class trigger atoms (`:cron`, `:webhook`, `:goal-completion`); sleep/resume | **Medium.** Webhooks expose HTTP listener; cron fires without user prompt; misconfigured triggers loop indefinitely | D1–D4 |
| `coordinatorMode` | `false` | `CoordinatorSpace` tracks worker embodiments; stall detection; reassignment on failure | **Medium.** Stall threshold misconfiguration causes premature reassignment | E1–E3 |
| `actionTrace` | `false` | Every skill execution produces a typed `action-trace-event` atom; behavioral telemetry | Storage growth; trace atoms include full skill args and results | F1–F2 |

### Experimental Tier Additions

| Flag | Default | What It Does | Risk If Enabled | Menu Nodes |
|---|---|---|---|---|
| `memorySnapshots` | `false` | Point-in-time `memory-snapshot` atoms at session boundaries and pre-harness-change; rolling window of 10 | **Low-Medium.** Snapshot writes are large; retention fixed at 10 (configurable); cross-session comparison is read-only | F3–F4 |

### Dependency Graph (additions to §2.4 of `METTACLAW.md`)

```
taskList              → goalPursuit, semanticMemory
separateEvaluator     → subAgentSpawning, taskList
separateEvaluator     → actionTrace          (soft — degrades gracefully without)
backgroundTriggers    → autonomousLoop, virtualEmbodiment
coordinatorMode       → multiEmbodiment, multiModelRouting
actionTrace           → auditLog
memorySnapshots       → semanticMemory       (NOT memoryConsolidation)
```

### Profile Updates (additions to §3 of `METTACLAW.md`)

**`evolved` profile**: add `actionTrace` (low risk, high observability value)

**`full` profile**: add `taskList`, `separateEvaluator`, `actionTrace`, `backgroundTriggers`, `coordinatorMode`

**`memorySnapshots`**: remains experimental — not in any profile by default; enable explicitly

---

## New Skill Declarations

Full extension of `skills.metta` (§5.2 of `METTACLAW.md`):

```metta
;; ── Task Management (B) ──────────────────────────────────────────────
(skill create-task       (String)          taskList           :meta "Create write-once task atom")
(skill start-task        (String)          taskList           :meta "Set task :in-progress (one at a time)")
(skill complete-task     (String)          taskList           :meta "Mark task done")
(skill abandon-task      (String String)   taskList           :meta "Abandon task with reason")
(skill list-tasks        ()                taskList           :meta "List tasks with current status")
(skill request-eval      (String)          taskList           :meta "Request separate evaluation of task")

;; ── Memory Snapshots (F) ─────────────────────────────────────────────
(skill take-snapshot     ()                memorySnapshots    :meta "Capture immediate memory snapshot")
(skill list-snapshots    ()                memorySnapshots    :meta "List recent snapshots by timestamp")
(skill compare-snapshots (String String)   memorySnapshots    :meta "Show atom drift between two snapshots")

;; ── Background Triggers (D) ──────────────────────────────────────────
(skill set-trigger       (SExpr)           backgroundTriggers :meta "Register trigger atom")
(skill remove-trigger    (String)          backgroundTriggers :meta "Disable trigger by id")
(skill list-triggers     ()                backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until       (Timestamp String) backgroundTriggers :meta "Sleep until timestamp with reason")

;; ── Coordinator (E) ──────────────────────────────────────────────────
(skill assign-task       (String String)   coordinatorMode    :meta "Assign task to worker explicitly")
(skill worker-status     ()                coordinatorMode    :meta "List worker states from CoordinatorSpace")
(skill rebalance         ()                coordinatorMode    :meta "Force coordinator rebalancing pass")
```

---

## File Structure Additions

Extensions to §12 of `METTACLAW.md`:

```
agent/src/
├── AgentBuilder.js                     (existing — extend: TriggerDispatcher wiring, new grounded ops)
├── session/
│   └── SessionManager.js              ← A1: session-checkpoint read/write (~50 lines)
├── tasks/
│   └── TaskManager.js                 ← B1, B2, B3, C2, C4: task lifecycle + artifact collection
├── triggers/
│   └── TriggerDispatcher.js           ← D2: cron/webhook/goal-completion trigger engine
├── coordinator/
│   ├── CoordinatorSpace.js            ← E1: worker-state atom store
│   └── coordinator.metta              ← E2, E3: stall/deadlock/assignment inference rules
├── safety/
│   ├── SafetyLayer.js                 (existing)
│   ├── AuditSpace.js                  (existing)
│   └── ActionTraceSpace.js            ← F1: execution telemetry atoms
├── skills/
│   ├── SkillDispatcher.js             (existing — extend: actionTrace emit in execute())
│   └── HookOrchestrator.js            (existing)
├── introspection/
│   └── IntrospectionOps.js            (existing)
├── harness/
│   └── HarnessOptimizer.js            (existing — extend: actionTrace distribution comparison)
├── models/
│   ├── ModelRouter.js                 (existing)
│   └── ModelBenchmark.js              (existing)
├── io/
│   ├── EmbodimentBus.js               (existing)
│   ├── VirtualEmbodiment.js           (existing — extend: cold-start seeding, B3)
│   └── channels/                      (existing)
└── memory/
    ├── SemanticMemory.js              (existing)
    ├── Embedder.js                    (existing)
    └── MemorySnapshot.js              ← F3, F4: point-in-time snapshot capture and comparison

agent/src/metta/
├── AgentLoop.metta                    (existing — extend: agent-init A1, checkpoint on budget-0 A2)
├── ContextBuilder.metta               (existing — extend: STARTUP_ORIENT A1, TASKS slot B4)
├── skills.metta                       (existing — extend: all new skill declarations above)
├── safety.metta                       (existing — extend: G1 metta eval gap, B5 task write protection)
├── hooks.metta                        (existing)
└── coordinator.metta                  ← E2, E3: new

memory/
├── snapshots/                         ← F3: snapshot atom files (rolling window of 10)
│   └── snap_*.metta
├── tasks/
│   └── tasks.metta                   ← B1: task list atoms
├── triggers/
│   └── triggers.metta                ← D1: trigger and sleep atoms
├── traces/
│   └── traces.metta                  ← F1: action trace atoms (7-day retention)
├── harness/
│   └── prompt.metta                  (existing)
├── history.metta                     (existing — extended: session-checkpoint atoms A2)
└── audit.metta                       (existing)
```

---

## Architectural Primitive Cross-Reference

Maps each menu node to its Generic Architectural Functionality Index counterpart.

| Menu Node | Generic Index Primitive(s) |
|---|---|
| A1 Session Startup | `pointer_index` (STARTUP_ORIENT), `lazy_topic_fetcher` (checkpoint restore), `watch_pattern_matcher` (cycle-0 detection) |
| A2 Context Reset | `token_budget_enforcer` (budget-0 branch), `append_only_logger` (checkpoint write), `graceful_degradation_handler` (reset vs halt) |
| B1 Task Atoms | `protected_resource_registry` (write-once fields), `task_lifecycle_manager` (state machine) |
| B2 One-At-A-Time | `anti_lazy_delegation_constraint`, `blocking_budget_enforcer` |
| B3 Cold-Start Seeding | `proactive_action_planner`, `multi_condition_trigger` |
| B4 TASKS Slot | `shared_scratchpad`, `modular_section_builder` |
| B5 Write Protection | `protected_resource_registry`, `resource_protector` |
| C1 Separate Evaluator | `coordinator_role`/`worker_role`, `anti_lazy_delegation_constraint`, `specialist_role` |
| C2 Artifact Collection | `replay_trace_logger` (trace query), `raw_transcript_searcher` |
| C3 Model Diversity | `role_based_specialization`, `version_negotiation_header` |
| C4 Iteration Limit | `token_budget_enforcer`, `graceful_degradation_handler` |
| D1 Trigger Atoms | `multi_condition_trigger`, `append_only_logger` |
| D2 TriggerDispatcher | `tick_scheduler`, `watch_pattern_matcher`, `concurrent_dispatch` |
| D3 Sleep/Resume | `multi_condition_trigger`, `watch_and_wait_pattern`, `append_only_logger` |
| D4 Webhook Security | `input_sanitizer_pipeline`, `per_call_auth_wrapper`, `auth_validator`, `audit_log_emitter` |
| E1 CoordinatorSpace | `coordinator_role`, `task_lifecycle_manager`, `shared_scratchpad` |
| E2 Stall Detection | `task_lifecycle_manager`, `dependency_analyzer`, `structured_notification` |
| E3 Deadlock Detection | `coordinator_role`, `health_endpoint_expositor` |
| F1 Action Trace | `replay_trace_logger`, `audit_log_emitter`, `append_only_logger` |
| F2 HarnessOptimizer Integration | `usage_pattern_adapter`, `observation_merger` |
| F3 Memory Snapshots | `pointer_index`, `write_verify_protocol`, `raw_transcript_searcher` |
| F4 Snapshot Comparison | `contradiction_resolver`, `observation_merger` |
| G1 MeTTa Eval Gap | `input_sanitizer_pipeline`, `permission_mode`, `risk_classifier` |
| G2 Task Write Protection | `protected_resource_registry`, `resource_protector` |
| G3 Webhook Security | `per_call_auth_wrapper`, `auth_validator`, `audit_log_emitter` |

### Composition Patterns (from Generic Index)

The enhancements in this menu compose into the canonical patterns defined in the Generic Index:

```
Secure Tool Execution (existing Phases 1–6):
  [skill_registry] → [risk_classifier] → [SafetyLayer]
  → [input_sanitizer] → [SkillDispatcher] → [AuditSpace]

  Extended by: G1 (metta eval gap), B5 (task write), D4 (webhook security)

Autonomous Background Loop (D):
  [tick_scheduler / TriggerDispatcher] → [multi_condition_trigger]
  → [watch_pattern_matcher] → [VirtualEmbodiment.injectTask]
  → [blocking_budget_enforcer / maxWebhookFiringPerHour]
  → [concise_output_formatter / TASKS slot]

Multi-Agent Task Pipeline (C, E):
  [coordinator_role / CoordinatorSpace] → [dependency_analyzer]
  → [concurrent_dispatch / spawn-agent]
  → [worker_role / evaluator sub-agent + structured_notification]
  → [task_lifecycle_manager / TaskManager] → [observation_merger]

Cache-Aware Prompt Assembly (A1, B4):
  [modular_section_builder / build-context]
  + [static_dynamic_boundary / STARTUP_ORIENT cycle-0 flag]
  → [TASKS slot] + [token_aware_formatter]
  → [volatile_section_wrapper / dynamic slots] → [context_assembler]

Observability Stack (F):
  [ActionTraceSpace] + [AuditSpace] + [MemorySnapshot]
  → [replay_trace_logger] + [audit_log_emitter]
  → [HarnessOptimizer comparison]
```

---

## Design Rationale

### Context Reset Over Compaction (A2)

The atom store is the persistent layer; the context window is expendable scratch. Accumulated context is not just noisy — it is actively misleading, because the model develops false confidence in stale earlier reasoning. Compaction (`memoryConsolidation`) keeps the atom store clean; context reset gives the model a fresh scratch pad at budget boundaries. Both are needed simultaneously.

### Task List Simplicity (B)

Article 2's JSON feature list worked because it was structurally simple. The constraint that mattered was not the format — it was the rule "only `passes` changes." The MeTTa equivalent enforces the same constraint: `TaskManager.updateTask()` rejects writes to `:description`. NAL truth values on task status are not needed; `:done` is a boolean because task completion is binary. Complexity belongs at the evaluation layer (C), not the task structure layer.

### Separate Evaluator Is Structural, Not a Prompt Fix (C)

The self-evaluation bias is a structural property of language models: given text the model produced plus the question "is this good?", the model has a strong prior toward yes. This cannot be fixed with better prompting. The structural fix is isolation: the evaluator sees the artifact and criteria, not the generator's reasoning chain. Plain-language criteria and plain-language verdict are sufficient — the evaluator does not need symbolic predicates.

### Background Triggers Enable a New Mode (D)

Without triggers, the agent is reactive (responds to external input) or autonomously generative (creates its own tasks when idle). Triggers add a third mode: **scheduled intent** — work that should happen at a specific time or in response to a specific external event, even if the agent is otherwise idle. A nightly audit, a deployment-verification resume, a goal triggered by another goal completing — these have clear real-world uses and are worth the implementation complexity.

### Coordinator Scope Is External Workers Only (E)

`coordinatorMode` targets long-lived external worker embodiments, not sub-agents. Sub-agents spawned via `spawn-agent` are sequential and short-lived; their timeout is the `spawn-agent` budget. Tracking them in `CoordinatorSpace` would require inter-context state sharing that the current architecture doesn't support and doesn't need.

### Action Trace vs. Audit Log (F)

Accountability (`auditLog`) and observability (`actionTrace`) are different concerns with different consumers. The audit log should be minimal and complete for the accountability record. The action trace can be verbose and time-bounded (7-day retention) because its consumer is analysis and regression detection, not compliance. Different retention policies, different access patterns, cleaner indexing for each purpose.

### Memory Snapshots Are Not a Duplicate of Consolidation (F)

Consolidation changes the atom store; snapshots observe it. Snapshots answer "what did the agent believe before X?" Consolidation answers "how do I reduce storage and increase coherence?" They compose: consolidate, then snapshot; the snapshot captures the post-consolidation state as a clean baseline.

### The MeTTa Skill Security Gap (G1)

The `(metta $expr)` skill path bypasses `SkillDispatcher`'s capability gates. The blanket `:high` consequence rating with specific exemptions for known-safe patterns (`:none` for `(manifest)`, `(|-  ...)`) is better than either blanket trust or blanket block. It requires rule maintenance but avoids implicit trust escalation and keeps the common safe patterns unimpeded.

---

## Verification Checklist

Acceptance criteria organized by functional group. Each criterion should pass before the group is considered complete.

### A — Session Lifecycle
- [ ] Restart reads latest `session-checkpoint` atom and restores goals and high-priority `&wm` entries
- [ ] `STARTUP_ORIENT` slot appears in context on cycle 0; absent on cycle 1+
- [ ] Budget-0 path writes a `session-checkpoint` atom to `history.metta` before resetting or halting
- [ ] WM entries with priority ≤ 0.6 are absent from the checkpoint; entries with priority > 0.6 are present

### B — Task Management
- [ ] `TaskManager.updateTask()` rejects writes to `:description` and `:created-cycle` with an audit event
- [ ] At most one task is `:in-progress` at any time; `start-task` on a second task while one is active returns an error
- [ ] `TASKS` slot appears in context each cycle listing all non-abandoned tasks
- [ ] With no tasks and `autonomousLoop` enabled, `generate-self-task` returns the planning prompt (B3), not null
- [ ] Direct write to `memory/tasks/tasks.metta` via `write-file` is blocked by `SafetyLayer` with a `:high` consequence

### C — Evaluation Independence
- [ ] `request-eval` spawns a sub-agent that receives the task description + git diff but not the generator's `&wm` or chain of thought
- [ ] `:fail` verdict from evaluator sets `:eval-note` on the task atom; note is visible in `TASKS` slot on the next cycle
- [ ] `:pass` verdict calls `complete-task`; task status is `:done` and `:done true`
- [ ] Task is automatically abandoned after `maxEvalIterations` failures; final evaluator note preserved in `:eval-note`
- [ ] With `multiModelRouting` enabled, evaluator sub-agent routes to `:introspection` task type (different model than `:code` generator)

### D — Background & Scheduled Activation
- [ ] `:cron` trigger fires on schedule and calls `VirtualEmbodiment.injectTask()` with the trigger's `:action`
- [ ] `sleep-until` emits a session checkpoint before suspending the autonomous loop
- [ ] Agent resumes after `sleep-until` with `:resume-task` injected into `STARTUP_ORIENT`
- [ ] Webhook request with invalid HMAC returns 403; valid HMAC fires the trigger
- [ ] Webhook request for unknown trigger ID returns 404 with no body
- [ ] Firings beyond `maxWebhookFiringPerHour` emit an audit event and are dropped

### E — Multi-Worker Coordination
- [ ] Worker state becomes `:stalled` after `stallThresholdMs` with no `:last-active` update
- [ ] Stalled task is reassigned to the next-best idle worker; reassignment is audited
- [ ] Deadlock (all workers busy, queue non-empty) emits `(audit-event :type :coordinator-deadlock)`
- [ ] Coordinator check runs at the top of each `agent-loop` cycle when `coordinatorMode` is enabled (before `build-context`)

### F — Observability
- [ ] Every skill execution emits an `action-trace-event` atom via `ActionTraceSpace.emit()` when `actionTrace` is enabled
- [ ] `ActionTraceSpace.getForTask(taskId)` returns only events with matching `:task-id`
- [ ] `HarnessOptimizer.evaluateCandidate()` populates `candidate.metrics.skillDistributionDrift` when `actionTrace` is enabled
- [ ] `emit-session-checkpoint` calls `trigger-snapshot :session-boundary` when `memorySnapshots` is enabled
- [ ] `HarnessOptimizer` calls `trigger-snapshot :pre-harness-change` before writing any candidate
- [ ] Snapshot comparison returns atoms with truth-value delta > `minDelta`; atoms below threshold are excluded
- [ ] After 10 snapshots, the oldest is pruned with an audit event; `:pre-harness-change` snapshots are exempt from pruning until the change is confirmed or rolled back

### G — Security Hardening
- [ ] `(metta (write-file ...))` is blocked by `SafetyLayer` as a `:high` consequence
- [ ] `(metta (manifest))` passes through without block (exemption rule active)
- [ ] `(set-trigger ...)` routes through `SafetyLayer` as a `:medium` consequence

---

## `agent.json` Schema Additions

```json
{
  "capabilities": {
    "taskList": false,
    "separateEvaluator": false,
    "backgroundTriggers": false,
    "coordinatorMode": false,
    "actionTrace": false,
    "memorySnapshots": false
  },
  "maxEvalIterations": 5,
  "actionTraceRetentionDays": 7,
  "subAgentTimeoutMs": null,
  "memorySnapshots": {
    "retentionCount": 10
  },
  "coordinator": {
    "stallThresholdMs": 600000
  },
  "webhooks": {
    "enabled": false,
    "port": 7331,
    "bindHost": "127.0.0.1",
    "maxWebhookFiringPerHour": 60
  },
  "maxSleepHours": 24
}
```
