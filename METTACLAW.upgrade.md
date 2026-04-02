# METTACLAW.upgrade.md — Harness Elevation Specification

> **Addendum to METTACLAW.md + METTACLAW.update.md**  
> **Version:** 2.0 (April 2026)  
> **Status:** Proposed

This document closes the actionable gaps identified in Anthropic's published harness designs while using MeTTa's symbolic substrate to implement each pattern more reliably than the Anthropic originals. Where Anthropic uses flat files, prompt conventions, and external tooling, this spec uses typed atoms, NAL inference, and grounded ops — making each pattern self-describing, queryable, and agent-modifiable.

**Implementation status of base plan:** Phases 1–6 components are already implemented in `agent/src/` — `SkillDispatcher.js`, `SemanticMemory.js`, `ModelRouter.js`, `SafetyLayer.js`, `AuditSpace.js`, `EmbodimentBus.js`, `VirtualEmbodiment.js`, `HarnessOptimizer.js`, `IntrospectionOps.js`, `HookOrchestrator.js`, `capabilities.js`, and all five `.metta` files including `AgentLoop.metta` and `ContextBuilder.metta`. The custom MeTTa interpreter lives in `metta/src/`. This spec adds Phases 7–9 on top of that foundation. The `mettaclaw/` directory is the Python-based historical reference only and is not part of the active codebase.

---

## Table of Contents

1. [Gap Closure Summary](#1-gap-closure-summary)
2. [New Capability Flags](#2-new-capability-flags)
3. [Session Startup Protocol](#3-session-startup-protocol)
4. [Context Reset Protocol](#4-context-reset-protocol)
5. [Task List](#5-task-list)
6. [Separate Evaluator](#6-separate-evaluator)
7. [Background Triggers](#7-background-triggers)
8. [Symbolic Coordinator](#8-symbolic-coordinator)
9. [Action Trace](#9-action-trace)
10. [Memory Snapshots](#10-memory-snapshots)
11. [Phase Plan Extensions](#11-phase-plan-extensions)
12. [New Skill Declarations](#12-new-skill-declarations)
13. [File Structure Additions](#13-file-structure-additions)
14. [Design Rationale](#14-design-rationale)

---

## 1. Gap Closure Summary

| Anthropic Pattern | Previous Coverage | This Spec |
|---|---|---|
| Context resets beat compaction | `loopBudget` terminates but no checkpoint protocol | §4 Context Reset: checkpoint-before-wipe, structured restart |
| Separate generator/evaluator | `selfEvaluation` self-grades | §6 Separate Evaluator: isolated sub-agent, no generator context |
| Feature list immutability, one task at a time | `goalPursuit` atoms but no structural constraint | §5 Task List: write-once task atoms, one-active enforcement |
| Session startup ritual | No orient-first protocol in `AgentLoop.metta` | §3 Session Startup: explicit orient phase before first cycle |
| 24/7 background / cron / sleep+resume | `autonomousLoop` but no external triggers | §7 Background Triggers: first-class trigger + sleep atoms |
| Coordinator mode for multi-worker | `multiModelRouting` routes requests, not tasks | §8 Symbolic Coordinator: task-level worker state + stall detection |
| E2E behavioral tracing | `multiEmbodiment` but no action telemetry | §9 Action Trace: typed action atoms per skill execution |
| Memory snapshot across session wipes | `memoryConsolidation` prunes but no point-in-time capture | §10 Memory Snapshots: rolling capture, cross-session queryability |

---

## 2. New Capability Flags

These rows extend §2.2 (Evolution Tier) and §2.3 (Experimental Tier) of METTACLAW.md.

### 2.1 Evolution Tier Additions

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `taskList` | `false` | Write-once task atoms with description and done flag; `generate-self-task` works one task at a time; tasks are queryable and agent-readable | Requires `goalPursuit`; open tasks without a resolution path stall autonomous operation |
| `separateEvaluator` | `false` | Artifact evaluation delegated to an isolated sub-agent receiving only the artifact + plain-language criteria, not the generator's reasoning; eliminates self-evaluation bias | Requires `subAgentSpawning`; doubles LLM calls per evaluation; evaluation model should differ from generator |
| `backgroundTriggers` | `false` | First-class trigger atoms (`:cron`, `:webhook`, `:goal-completion`) and sleep atoms with structured resume; `TriggerDispatcher.js` fires goals on schedule or external signal | **Medium.** Webhooks expose HTTP listener; cron fires without user prompt; misconfigured triggers loop indefinitely |
| `coordinatorMode` | `false` | `CoordinatorSpace` tracks active worker embodiments with last-active timestamps; detects stalls; reassigns tasks on failure; NAL scores inform assignment ordering | **Medium.** Stall threshold misconfiguration causes premature task reassignment; coordinator adds per-cycle overhead when workers > 1 |
| `actionTrace` | `false` | Every skill execution produces a typed `action-trace-event` atom in an append-only `ActionTraceSpace` separate from `auditLog`; enables behavioral telemetry and harness regression detection | Storage growth; trace atoms include full skill args and results |

### 2.2 Experimental Tier Additions

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `memorySnapshots` | `false` | Point-in-time `memory-snapshot` atoms captured at session boundaries and before harness changes; rolling window of 10 kept; snapshots are queryable across time | **Low-Medium.** Snapshot writes are large; retention policy is fixed at 10 (configurable); cross-session comparison is read-only and non-destructive |

### 2.3 Dependency Additions

Append to §2.4 of METTACLAW.md:

```
taskList              → goalPursuit, semanticMemory
separateEvaluator     → subAgentSpawning, taskList
backgroundTriggers    → autonomousLoop, virtualEmbodiment
coordinatorMode       → multiEmbodiment, multiModelRouting
actionTrace           → auditLog
memorySnapshots       → semanticMemory
```

Note: `memorySnapshots` depends on `semanticMemory`, not on `memoryConsolidation`. Snapshots are useful before `memoryConsolidation` is needed — particularly for capturing state before harness changes.

### 2.4 Profile Updates

Extend `evolved` profile to include `actionTrace` (low risk, high observability value).

Extend `full` profile to include `taskList`, `separateEvaluator`, `actionTrace`, `backgroundTriggers`, `coordinatorMode`.

`memorySnapshots` remains experimental — not in any profile by default; enable explicitly.

---

## 3. Session Startup Protocol

### 3.1 Problem

The existing `agent-start → agent-init → agent-loop` path does not specify what `agent-init` does. Agents that begin executing without reading their own state produce inconsistent results across restarts: they re-solve problems they already solved, ignore open tasks, and ignore recent failures. Article 2's session startup ritual — check git log, read progress file, select one feature, verify before implementing — maps to a specced `agent-init` that orients the agent before the first cycle.

### 3.2 Extended `agent-init`

Extend `AgentLoop.metta` §5.1. `agent-init` runs once before the main loop:

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

### 3.3 STARTUP_ORIENT Context Slot

`build-context` gains a `STARTUP_ORIENT` slot populated **only on cycle 0** of a session (when `&cycle-count` has just been reset):

```
STARTUP_ORIENT — 2,000 chars — session checkpoint + active task + recent failures, first cycle only
```

This slot sits before `PINNED`, ensuring orientation precedes any task. It is not re-assembled after cycle 0.

### 3.4 New Grounded Ops

Registered in `AgentBuilder.buildMeTTaLoop()`:

```javascript
interp.registerOp('latest-session-checkpoint', () => SessionManager.getLatestCheckpoint())
interp.registerOp('restore-goals-from-checkpoint', (cp) => GoalManager.restoreFrom(cp))
interp.registerOp('restore-wm-from-checkpoint',   (cp) => WMManager.restoreFrom(cp))
interp.registerOp('get-active-task',               () => TaskManager.getActive())
interp.registerOp('recent-audit-failures',         (n) => AuditSpace.getRecentFailures(n))
```

`SessionManager` is a thin module (~50 lines) that reads/writes `session-checkpoint` atoms to `history.metta`.

---

## 4. Context Reset Protocol

### 4.1 Problem

Article 1's clearest finding: **context resets outperform compaction.** `memoryConsolidation` prunes the atom store mid-session — that is a different operation. What the article found is that clearing the *context window* and reasoning from a fresh start (with atom-retrieved facts) outperforms a full context window with accumulated confusion from stale earlier reasoning. The existing `agent-loop` budget-exhaustion path calls `agent-halt` or `reset-budget` with no checkpoint, so orientation state is silently lost.

### 4.2 Checkpoint-Before-Reset

Extend the `agent-loop` termination branch in `AgentLoop.metta`:

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

### 4.3 What Survives a Reset

| State | Survives? | Mechanism |
|---|---|---|
| `SemanticMemory` atoms | Yes | `PersistentSpace` — not in context window |
| `AuditSpace` atoms | Yes | `PersistentSpace` — not in context window |
| Active task (`:in-progress`) | Yes | Written to checkpoint; restored by `agent-init` |
| `&wm` entries, priority > 0.6 | Yes | Written to checkpoint; restored by `agent-init` |
| `&wm` entries, priority ≤ 0.6 | No | Low-priority WM is scratch; context wipe clears it intentionally |
| Active goals | Yes | Written to checkpoint; restored by `agent-init` |
| Context window content | No | This is the point: accumulated context is noise after budget exhaustion |

### 4.4 Reset vs. Consolidation

These are complementary, not competing:

- **`memoryConsolidation`** — prunes and merges the *atom store* mid-session. Keeps atoms clean.
- **Context reset** — wipes the *context window* at budget boundaries. Gives the model a fresh scratch pad.

Both can be active simultaneously. The atom store is the persistent layer; the context window is expendable.

---

## 5. Task List

### 5.1 Problem

Two pathologies from Article 2:
1. **Premature completion**: agent marks tasks done without real verification
2. **Task sprawl**: agent opens multiple parallel threads without finishing any

Article 2's `feature_list.json` (a flat list with a `passes` boolean, where only `passes` is mutable) was effective precisely because it was structurally simple. The MeTTa-native equivalent follows the same logic: write-once structure, one mutable status field, one active task at a time.

### 5.2 Task Atom Format

```metta
(task
  :id           "t_20260402_abc"
  :description  "Implement new-chat-button with hover state and Ctrl+N shortcut"
  :created-cycle 142
  :status       :pending        ; :pending | :in-progress | :done | :abandoned
  :done         false           ; only this and :status change after creation
  :eval-note    ())             ; set by evaluator: plain-language pass/fail reason
```

**Immutability rule**: `:description` and `:created-cycle` are write-once. Only `:status`, `:done`, and `:eval-note` change after creation. `TaskManager.updateTask()` rejects writes to locked fields with an audit event.

The description is plain language. No embedded evaluation predicates — criteria verification is handled conversationally or by the separate evaluator (§6).

### 5.3 One Task At a Time

When `taskList` is enabled:
- `generate-self-task` checks `TaskManager.getActive()` before generating any new task. If a `:in-progress` task exists, it generates only sub-tasks scoped to that task.
- `set-goal` is still available but demoted: goals produce tasks via `TaskManager.createFromGoal()`. Every goal becomes a task with an explicit done condition.
- Idle autonomous cycles do not open new tasks while one is `:in-progress`.

### 5.4 Task List Context Slot

`build-context` gains a `TASKS` slot:

```
TASKS — 1,500 chars — all non-abandoned tasks with current status, oldest-first
```

This gives the agent full task visibility each cycle without it needing to call `(list-tasks)`. The agent sees what is done, what is pending, and what is active — and cannot accidentally ignore it.

### 5.5 Task Lifecycle

```
(create-task "description")
  → status :pending, done false

(start-task id)
  → status :in-progress
  → at most one task may be :in-progress at a time

(complete-task id)
  → status :done, done true
  → agent must call this explicitly; autonomousLoop does not auto-complete

(abandon-task id "reason")
  → status :abandoned
  → reason stored in :eval-note

(request-eval id)
  → invokes separate evaluator (if separateEvaluator enabled)
  → evaluator sets :eval-note; marks :done true or returns to :in-progress
```

### 5.6 Cold-Start Task Seeding

With `taskList` + `autonomousLoop` enabled and no existing tasks (first run or after all tasks complete), `generate-self-task` would return null — the agent idles. To prevent this, `generate-self-task` falls back to a planning task when the task list is empty:

```javascript
// In VirtualEmbodiment.generateSelfTask()
if (config.capabilities.taskList) {
  const active = TaskManager.getActive();
  if (active) return scopedSubTask(active);
  const any = TaskManager.getAny();
  if (!any) return "Review goals and memory, then create the next task using (create-task ...)";
  return null; // tasks exist but none active; agent should start one
}
```

This gives the agent exactly one thing to do when no task exists: make a task. It does not silently idle.

### 5.7 Task List Protection

`TaskManager.updateTask()` enforces field immutability at the JS layer, but `write-file` with `fileWriteSkill` enabled can overwrite `memory/tasks/tasks.metta` directly, bypassing `TaskManager`. Add to `safety.metta`:

```metta
(= (consequence-of (write-file "memory/tasks/tasks.metta" $_)
                   (task-integrity-violated) :high))
(= (consequence-of (write-file "memory/tasks/" $_)
                   (task-integrity-violated) :high))
```

This makes any direct write to the tasks directory a high-risk consequence, blocked by `SafetyLayer` when enabled.

### 5.8 New Skills

```metta
(skill create-task   (String)    taskList :meta "Create task with description; returns task id")
(skill start-task    (String)    taskList :meta "Set task :in-progress (one at a time)")
(skill complete-task (String)    taskList :meta "Mark task done (agent asserts completion)")
(skill abandon-task  (String String) taskList :meta "Abandon task with reason")
(skill list-tasks    ()          taskList :meta "List all tasks with status")
(skill request-eval  (String)    taskList :meta "Request separate evaluation of in-progress task")
```

---

## 6. Separate Evaluator

### 6.1 Problem

`selfEvaluation` (existing experimental flag) has the agent grade its own output. This is structurally biased: the model that produced an artifact has a strong prior toward rating it positively, because the text "this is good" continues naturally from "I produced this." The solution is not better prompting — it is structural isolation of the evaluator from the generator's reasoning chain.

Article 1 found this decisively: separate generator/evaluator produced markedly better quality control than self-evaluation.

### 6.2 Design

When `separateEvaluator` is enabled, `request-eval` on a task spawns an evaluation sub-agent:

Artifact collection runs before spawning the evaluator. The `collect-task-artifacts` grounded op produces a string summary of work done since the task was started:

```javascript
// In TaskManager.collectArtifacts(taskId)
// Returns a string usable directly in the evaluator prompt
async collectArtifacts(taskId) {
  const task = this.getTask(taskId);
  const sinceTs = task.startedAt;
  const parts = [];

  // 1. Git diff of changes made during the task
  const diff = await execSafe('git diff HEAD', { cwd: workdir, maxBytes: 8000 });
  if (diff) parts.push(`## Changes (git diff)\n${diff}`);

  // 2. Recent test output if any test command ran during the task
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

  return parts.join('\n\n') || '(no artifact evidence collected)';
}
```

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
- The task description (what was supposed to be done)
- A git diff of changes made during the task (up to 8,000 chars)
- Test output from any test commands that ran during the task
- A list of files written during the task
- An explicit instruction to assess completion, not to assess process

`collectArtifacts` requires `actionTrace` to be enabled (it reads from `ActionTraceSpace`). When `actionTrace` is disabled, only the git diff is available. Add to dependency spec: `separateEvaluator → actionTrace` (soft dependency — degrades gracefully without it).

The evaluator sub-agent does **not** receive:
- The generator's chain of thought
- The generator's session `&wm`
- Any reasoning about why the generator made the choices it made

### 6.3 Output Format

The evaluator returns a plain-language verdict atom:

```metta
;; Passing
(eval-result :task-id "t_abc" :verdict :pass :note "Button renders, hover state visible, Ctrl+N fires event")

;; Failing
(eval-result :task-id "t_abc" :verdict :fail :note "Ctrl+N shortcut not bound; tested via console event listener")
```

`process-eval-result` maps this to the task:
- `:pass` → `complete-task id`, set `:eval-note` to note
- `:fail` → return task to `:in-progress`, set `:eval-note` to failure reason, increment iteration counter

Failure notes are visible in the `TASKS` context slot on the next cycle, so the generator knows specifically what to fix.

### 6.4 Model Routing

When `multiModelRouting` is enabled, the evaluator sub-agent routes to the `:introspection` task type, which typically routes to a different model than the `:code` generator. This produces natural model diversity in the generator–evaluator pair without any explicit configuration.

### 6.5 Iteration Limit

Tasks have a configurable `maxEvalIterations` (default 5, from `agent.json`). When a task fails evaluation this many times, it is automatically abandoned with the final evaluator note preserved. This prevents infinite retry loops.

### 6.6 Relationship to `selfEvaluation`

`selfEvaluation` (existing experimental flag) scores conversational output quality against preference atoms — a different operation. `separateEvaluator` is specifically for task completion verification. Both can be enabled; they do not interfere.

---

## 7. Background Triggers

### 7.1 Problem

`autonomousLoop` runs continuously or halts — it has no native concept of scheduled or externally-triggered activation. There is no way to express "run the nightly audit at midnight" or "resume this goal when the deploy webhook fires." The agent either runs reactively or generates its own tasks; it cannot sleep with intention.

### 7.2 Trigger Atom

```metta
(trigger-atom
  :id          "trig_nightly-audit"
  :type        :cron              ; :cron | :webhook | :goal-completion
  :spec        "0 0 * * *"        ; cron: cron expression; webhook: path suffix; goal-completion: goal-id
  :action      (inject-task "Run nightly memory consolidation and audit review")
  :enabled     true
  :last-fired  ()
  :fire-count  0)
```

Trigger atoms are stored in `SemanticMemory` (`:type :procedural`) and survive restarts. `TriggerDispatcher.js` reads them on startup and re-arms.

### 7.3 Sleep Atom

```metta
(sleep-atom
  :id           "sleep_deploy-wait"
  :reason       "Waiting for deployment pipeline"
  :resume-at    (timestamp 2026-04-03T06:00:00)   ; absolute — relative dates are converted at creation
  :resume-on    (or :timestamp :webhook "deploy-complete")
  :resume-task  "Verify deployment and run smoke tests"
  :checkpoint   "cp_20260402_xyz")
```

When the agent calls `(sleep-until timestamp reason)`, the skill handler **first emits a session checkpoint** before passing control to `TriggerDispatcher.js`:

```javascript
// In sleep-until skill handler
async function sleepUntilHandler(timestamp, reason) {
  // Checkpoint before suspending — sleep may be for hours
  if (config.capabilities.persistentHistory) {
    await emitSessionCheckpoint();  // same as budget-exhaustion checkpoint
  }
  const sleepAtom = buildSleepAtom(timestamp, reason);
  await SemanticMemory.store(sleepAtom);
  await TriggerDispatcher.onSleepEmitted(sleepAtom);
  // Loop suspension happens in TriggerDispatcher
}
```

Without this, any goals or WM entries set between the last budget-exhaustion checkpoint and the `sleep-until` call would be silently lost on resume.

On resume (timestamp reached or webhook fired), `agent-init` runs with the sleep atom's `:resume-task` injected into `STARTUP_ORIENT`.

### 7.4 `TriggerDispatcher.js`

**Location:** `agent/src/triggers/TriggerDispatcher.js`  
**Governed by:** `backgroundTriggers`

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
  async onResumeConditionMet(sleepId)  // resumes autonomous loop, injects resume-task
}
```

**Cron**: Uses `node-cron`. Each `:cron` trigger arms a job on `start()`. Fires by calling `VirtualEmbodiment.injectTask(trigger.action)`.

**Webhooks**: An HTTP listener (port configurable, default 7331, localhost-only). Routes are `/triggers/:id` — path is derived from trigger ID, not user-supplied. No dynamic registration at request time. Only triggers that exist as atoms in `SemanticMemory` are routable.

**Goal-completion**: `TriggerDispatcher` subscribes to `AuditSpace` events. When `(audit-event :type :task-complete :task-id $id)` fires, it checks for matching `:goal-completion` triggers and fires them.

### 7.5 Webhook Security

Webhooks are the highest-risk feature in this spec. Mitigations:

- **Localhost-only by default.** The listener binds `127.0.0.1`. External exposure requires explicit `"webhooks": { "bindHost": "0.0.0.0" }` in `agent.json`.
- **HMAC validation.** Each trigger atom has a `:secret` field (generated at creation, stored as atom). Incoming requests must include `X-Trigger-Signature: sha256=<hmac>` matching the body.
- **Allowlisted trigger IDs only.** No trigger fires unless its atom exists in `SemanticMemory` with `:enabled true`. A request to an unknown ID returns 404 with no information leakage.
- **`safetyLayer` gate on `set-trigger`.** The `set-trigger` skill routes through `SafetyLayer` when enabled. The safety rule:
  ```metta
  (= (consequence-of (set-trigger $atom) (trigger-registered :external) :medium))
  ```
- **Rate limiting.** Configurable `maxWebhookFiringPerHour` (default 60). Excess firings emit audit events and are dropped.

### 7.6 Safety

All trigger firings emit `(audit-event :type :trigger-fired :id $id :type $type)`. Sleep atoms emit `(audit-event :type :agent-sleeping :resume-at $ts)` and `(audit-event :type :agent-resumed :sleep-id $id)`. Max sleep duration is configurable (`maxSleepHours`, default 24).

---

## 8. Symbolic Coordinator

### 8.1 Problem and Scope

`multiModelRouting` selects the best model for a given LLM call — request-level routing, stateless about worker availability. When `multiEmbodiment` is active with multiple named channel embodiments or multiple configured model connections, there is no component tracking which workers are busy, which have stalled, and what happens to a task when its worker fails.

**Scope clarification**: `CoordinatorSpace` tracks **external workers** — named model connections and named channel embodiments registered with `EmbodimentBus`. It does not directly track sub-agents spawned via `spawn-agent`. Sub-agents are short-lived (5–10 cycle budget), communicate results via their return value, and are managed by the spawning cycle's `let*` binding. Their "stall detection" is a timeout on the `spawn-agent` call itself (configurable `subAgentTimeoutMs`, default equal to `budget × sleepInterval`).

The coordinator is for the scenario where the main agent has multiple long-lived worker embodiments — e.g., a `worker-gpt4` model connection handling code tasks while a `worker-claude` handles reasoning tasks across many cycles each.

### 8.2 What the Coordinator Actually Does

The coordinator adds three capabilities that `ModelRouter` does not have:

1. **Task-level assignment tracking**: records which worker is handling which task, not just which model handled a request
2. **Stall detection**: notices when a worker's last-active timestamp is old and the task is still open
3. **Reassignment on failure**: when a worker emits `:failed` or stalls past threshold, routes the task to the next-best available worker

Assignment ordering uses `ModelRouter.getExpectedScore()` as its scoring function. The coordinator does not duplicate routing logic — it adds the layer above it.

### 8.3 CoordinatorSpace

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

`CoordinatorSpace` is a `PersistentSpace` holding `worker-state` atoms. It is separate from `SemanticMemory` — coordinator state is operational, not semantic.

### 8.4 Coordinator Logic

```metta
;; coordinator.metta — inference rules

;; A worker is stalled if it has been busy without an update past threshold
(= (stalled? $w)
   (and (== (worker-status $w) :busy)
        (> (elapsed-ms (worker-last-active $w))
           (get-config "coordinator.stallThresholdMs"))))   ; default 600000 (10 min)

;; Best idle worker for a task type: highest NAL expectation score
(= (best-worker-for $task-type)
   (argmax-by
     (filter-workers :idle)
     (lambda $w (model-expectation $w $task-type))))

;; Deadlock: all workers busy, queue non-empty
(= (coordinator-deadlock?)
   (and (all-workers-busy?)
        (not (empty? (task-queue)))))
```

The coordinator runs as a lightweight check at the top of each `agent-loop` cycle when `coordinatorMode` is enabled, before context assembly. It updates stale worker statuses and injects reassignment tasks into `VirtualEmbodiment` when stalls or deadlocks are detected.

```metta
;; Added to agent-loop before build-context
(when (cap? coordinatorMode)
  (do (update-stalled-workers)
      (when (coordinator-deadlock?) (emit-cycle-audit :coordinator-deadlock ()))
      (reassign-stalled-tasks)))
```

### 8.5 Relationship to Existing Components

| Component | Scope | What It Tracks |
|---|---|---|
| `ModelRouter` | Request-level | Which model to invoke for this LLM call |
| `CoordinatorSpace` | Task-level | Which worker is assigned to which multi-cycle task; stall/failure state |
| `EmbodimentBus` | Message-level | Which channel has a pending message; salience ordering |

These are three different layers. The coordinator does not replace either of the others.

### 8.6 New Skills

```metta
(skill assign-task    (String String) coordinatorMode :meta "Assign task id to worker id explicitly")
(skill worker-status  ()              coordinatorMode :meta "List current worker states from CoordinatorSpace")
(skill rebalance      ()              coordinatorMode :meta "Force immediate coordinator rebalancing pass")
```

---

## 9. Action Trace

### 9.1 Distinction from AuditLog

`auditLog` records **decisions**: skill blocked, LLM called, memory written, harness modified. These are accountability events — the record of what the agent chose to do and what was permitted.

`actionTrace` records **execution telemetry**: every skill call, its arguments, return value, and timing. These are observability events — the record of what actually happened and how long it took.

The distinction matters because they serve different consumers:
- `auditLog` → accountability, safety review, `HarnessOptimizer` failure sampling
- `actionTrace` → performance analysis, behavioral regression detection, harness candidate comparison

### 9.2 `action-trace-event` Atom

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

### 9.3 Integration Points

**`SkillDispatcher.execute()`** emits `ActionTraceSpace.emit()` after each skill call, alongside the existing `AuditSpace.emit()`. One additional line when `actionTrace` is enabled.

**`HarnessOptimizer`** gains a new comparison signal: when evaluating a candidate harness change, it compares the `ActionTraceSpace` event distribution from recent cycles against a baseline. If the candidate harness produces a meaningfully different skill invocation pattern (e.g., fewer failed parse retries, different skill mix), that is a signal worth analyzing. This supplements the existing failure-rate comparison in §5.8.1 without replacing it.

### 9.4 `ActionTraceSpace.js`

**Location:** `agent/src/safety/ActionTraceSpace.js`  
**Governed by:** `actionTrace`

```javascript
export class ActionTraceSpace {
  static emit(skillCall, result, metadata)  // append trace event
  static getRecent(n)                       // last N events
  static getForTask(taskId)                 // events within a task
  static getForCycle(cycle)                 // events within a cycle
  static getSkillDistribution(sinceTs)      // skill-name → count map for harness comparison
  static prune(beforeTimestamp)             // remove old events (called by memoryConsolidation)
}
```

Pruning: `ActionTraceSpace` retains events for `actionTraceRetentionDays` (default 7, configurable in `agent.json`). Older events are pruned during `memoryConsolidation` self-tasks (or on startup if consolidation is disabled).

---

## 10. Memory Snapshots

### 10.1 Distinction from `memoryConsolidation`

| Operation | `memoryConsolidation` | `memorySnapshots` |
|---|---|---|
| Effect | Prunes, merges, decays atoms | Non-destructive capture |
| Timing | Mid-session, every N cycles | Session boundaries + pre-harness-change |
| Output | Modified atom store | Immutable point-in-time copy |
| Queryable across time? | No — only current state | Yes — any snapshot by id or timestamp |
| Useful when? | Session is long and atom store bloats | Harness changes; session restart; debugging |

Snapshots do not require `memoryConsolidation`. They are useful earlier — particularly in Phase 6 where `harnessOptimization` proposes harness changes. A snapshot before the change and a snapshot after are the inputs for determining whether the change caused behavioral drift.

### 10.2 Snapshot Atom

```metta
(memory-snapshot
  :id           "snap_20260402_abc"
  :timestamp    1743600000000
  :cycle        142
  :trigger      :session-boundary   ; :session-boundary | :pre-harness-change | :explicit
  :atom-count   847
  :space-ref    "memory/snapshots/snap_20260402_abc.metta"
  :parent-snap  "snap_20260401_xyz" ; most recent prior snapshot; () for first
  :retained-until ())               ; set by pruning pass when this snapshot is kept past rolling window
```

### 10.3 Snapshot Triggers

Automatically triggered in three situations:

1. **Session boundary** — `emit-session-checkpoint` (§4.2) calls `trigger-snapshot :session-boundary` when `memorySnapshots` is enabled.
2. **Pre-harness-change** — `HarnessOptimizer` calls `trigger-snapshot :pre-harness-change` before writing any candidate.
3. **Explicit** — `(take-snapshot)` skill call.

### 10.4 Retention Policy

The rolling window is 10 snapshots (configurable via `"memorySnapshots": { "retentionCount": 10 }` in `agent.json`). When a new snapshot is taken, the oldest beyond the retention count is deleted. There is one exception: snapshots taken immediately before a harness change (`trigger: :pre-harness-change`) are retained until the harness change is either confirmed or rolled back — they are the rollback baseline.

Pruning is deterministic and logged: `(audit-event :type :snapshot-pruned :id $id :reason "rolling-window")`.

### 10.5 Cross-Session Comparison

Given two snapshot IDs, `MemorySnapshot.compare()` returns the atoms whose truth values shifted by more than a configurable threshold:

```javascript
// Returns: [{ atom, stv_before, stv_after, delta }]
MemorySnapshot.compare(snapIdBefore, snapIdAfter, { minDelta: 0.1 })
```

This is useful after a harness change: did the change cause any beliefs to drift significantly? It does not automatically apply NAL revision — it produces a diff for human or agent inspection. Automated revision from snapshot drift is deferred; the comparison primitive is the building block.

### 10.6 New Skills

```metta
(skill take-snapshot      ()             memorySnapshots :meta "Capture memory snapshot immediately")
(skill list-snapshots     ()             memorySnapshots :meta "List recent snapshots with timestamps")
(skill compare-snapshots  (String String) memorySnapshots :meta "Show atoms that shifted significantly between two snapshots")
```

---

## 11. Phase Plan Extensions

Phases 1–6 are already implemented. Phase 7 can begin immediately.

### Phase 7 — Structural Reliability

**Prerequisite:** Phases 1–6 (implemented)  
**Unlocks:** Session Startup, Context Reset, Task List, Action Trace, Memory Snapshots (all low-risk, observability-focused)

1. **Session Startup Protocol**: Implement `agent-init` extension (§3.2). Add `SessionManager.js` (~50 lines). Register `latest-session-checkpoint`, `restore-goals-from-checkpoint`, `restore-wm-from-checkpoint` grounded ops. Add `STARTUP_ORIENT` slot to `build-context`.
2. **Context Reset Protocol**: Extend `agent-loop` termination to call `emit-session-checkpoint` (§4.2). Implement `filter-wm-above`, `trigger-snapshot` grounded ops.
3. **Task List**: Implement `TaskManager.js` — `createFromGoal()`, `updateTask()` (with immutability enforcement), `getActive()`. Add `TASKS` context slot to `build-context`. Implement `create-task`, `start-task`, `complete-task`, `abandon-task`, `list-tasks`, `request-eval` skill handlers.
4. **Action Trace**: Implement `ActionTraceSpace.js`. Wire `SkillDispatcher.execute()`. Implement `getSkillDistribution()` for harness comparison use (Phase 6 extension).
5. **Memory Snapshots**: Implement `MemorySnapshot.js` — `capture()`, `load()`, `compare()`, `prune()`. Wire `emit-session-checkpoint` to call `trigger-snapshot`. Implement `take-snapshot`, `list-snapshots`, `compare-snapshots` skill handlers. Add retention policy enforcement.
6. **Update `agent.json` schema**: Add `taskList`, `actionTrace`, `memorySnapshots` flags. Add `actionTraceRetentionDays`, `memorySnapshots.retentionCount` config keys.
7. **Test**: Restart reads checkpoint, restores task and WM; task immutability enforced (description write rejected); `action-trace-event` emitted per skill; snapshot captured at session boundary; snapshot comparison returns diff after belief update.

### Phase 8 — Evaluation Independence

**Prerequisite:** Phase 7, `subAgentSpawning` stable (already implemented in Phase 6)

**Unlocks:** `separateEvaluator`

1. Implement evaluation sub-agent invocation in `request-eval` handler: build evaluator prompt (§6.2), call `spawn-agent`, process `(eval-result ...)` atom.
2. Implement `process-eval-result` in `TaskManager`: `:pass` → `complete-task`; `:fail` → return to `:in-progress`, set `:eval-note`, increment iteration counter; `:abandoned` on `maxEvalIterations` exceeded.
3. Wire `multiModelRouting` for evaluator: route evaluator sub-agent to `:introspection` task type when `multiModelRouting` is enabled.
4. Wire `actionTrace` into `HarnessOptimizer`: add `getSkillDistribution` comparison as a supplementary signal alongside failure-rate comparison in §5.8.1.
5. **Test**: Generator produces artifact; evaluator sub-agent invoked with no generator reasoning; `:fail` note returned and visible in next cycle's `TASKS` slot; `:pass` marks task done; task abandoned after `maxEvalIterations` failures.

### Phase 9 — Autonomous Background & Coordination

**Prerequisite:** Phase 7, Phase 8

**Unlocks:** `backgroundTriggers`, `coordinatorMode`

1. Implement `TriggerDispatcher.js` — cron scheduler (node-cron), webhook listener (express, localhost-only), goal-completion subscription. Implement HMAC validation, rate limiting, trigger atom CRUD.
2. Add trigger and sleep atoms to `SemanticMemory` schema. Implement `set-trigger`, `remove-trigger`, `list-triggers`, `sleep-until` skill handlers.
3. Implement `CoordinatorSpace.js` — `worker-state` atom CRUD, `updateStalledWorkers()`, `reassignStalledTasks()`, deadlock detection.
4. Implement `coordinator.metta` — `stalled?`, `best-worker-for`, `coordinator-deadlock?` inference rules (§8.4).
5. Wire coordinator check into `agent-loop` cycle top (§8.4).
6. Wire `TriggerDispatcher` into `AgentBuilder.buildMeTTaLoop()` startup sequence.
7. **Test**: Cron trigger fires on schedule, injects task into VirtualEmbodiment; `sleep-until` suspends loop, resumes with correct task; stall detection fires after `stallThresholdMs`; task reassigned to next-best worker; deadlock audit event emitted when all workers busy; webhook HMAC rejection works.

---

## 12. New Skill Declarations

Extend `skills.metta` (§5.2 of METTACLAW.md):

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

;; Background triggers
(skill set-trigger       (SExpr)           backgroundTriggers :meta "Register trigger atom")
(skill remove-trigger    (String)          backgroundTriggers :meta "Disable trigger by id")
(skill list-triggers     ()                backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until       (Timestamp String) backgroundTriggers :meta "Sleep until timestamp; resume with reason")

;; Coordinator
(skill assign-task       (String String)   coordinatorMode   :meta "Assign task to worker explicitly")
(skill worker-status     ()                coordinatorMode   :meta "List worker states from CoordinatorSpace")
(skill rebalance         ()                coordinatorMode   :meta "Force coordinator rebalancing pass")
```

---

## 13. File Structure Additions

Add to §12 of METTACLAW.md:

```
agent/src/
├── AgentBuilder.js                (existing — extend for TriggerDispatcher wiring)
├── session/
│   └── SessionManager.js          ← NEW: session-checkpoint read/write (~50 lines)
├── tasks/
│   └── TaskManager.js             ← NEW: task atom lifecycle, immutability enforcement
├── triggers/
│   └── TriggerDispatcher.js       ← NEW: cron/webhook/goal-completion trigger engine
├── coordinator/
│   ├── CoordinatorSpace.js        ← NEW: worker-state atom store
│   └── coordinator.metta          ← NEW: stall/deadlock/assignment inference rules
├── safety/
│   ├── SafetyLayer.js             (existing)
│   ├── AuditSpace.js              (existing)
│   └── ActionTraceSpace.js        ← NEW: execution telemetry atoms
├── skills/
│   ├── SkillDispatcher.js         (existing — extend with actionTrace emit)
│   └── HookOrchestrator.js        (existing)
├── introspection/
│   └── IntrospectionOps.js        (existing)
├── harness/
│   └── HarnessOptimizer.js        (existing — extend with actionTrace comparison)
├── models/
│   ├── ModelRouter.js             (existing)
│   └── ModelBenchmark.js          (existing)
├── io/
│   ├── EmbodimentBus.js           (existing)
│   ├── VirtualEmbodiment.js       (existing — extend with cold-start seeding)
│   └── channels/                  (existing)
└── memory/
    ├── SemanticMemory.js          (existing)
    ├── Embedder.js                (existing)
    └── MemorySnapshot.js          ← NEW: point-in-time snapshot capture and comparison

agent/src/metta/
├── AgentLoop.metta                (existing — extend agent-init, add checkpoint on budget-0)
├── ContextBuilder.metta           (existing — add STARTUP_ORIENT and TASKS slots)
├── skills.metta                   (existing — extend with new skill declarations)
├── safety.metta                   (existing — extend with task-list and metta-skill rules)
└── hooks.metta                    (existing)

memory/
├── snapshots/                     ← NEW: snapshot atom files (rolling window of 10)
│   └── snap_*.metta
├── tasks/
│   └── tasks.metta                ← NEW: task list atoms
├── triggers/
│   └── triggers.metta             ← NEW: trigger and sleep atoms
├── traces/
│   └── traces.metta               ← NEW: action trace atoms (7-day retention)
├── harness/
│   └── prompt.metta               (existing)
├── history.metta                  (existing)
└── audit.metta                    (existing)
```

Anthropic-pattern equivalents:

| Anthropic Artifact | MeTTa-native Equivalent | Phase |
|---|---|---|
| `claude-progress.txt` | `session-checkpoint` atom in `history.metta` | 7 |
| `feature_list.json` | `task` atoms in `memory/tasks/tasks.metta` | 7 |
| `init.sh` | `agent-init` startup protocol in `AgentLoop.metta` | 7 |
| `AGENT_MEMORY_SNAPSHOT` | `memory-snapshot` atoms in `memory/snapshots/` | 7 |
| Playwright E2E trace | `action-trace-event` atoms in `memory/traces/` | 7 |

---

## 14. Design Rationale

### 14.1 Context Reset Over Compaction

The atom store is the persistent layer; the context window is expendable scratch. Accumulated context is not just noisy — it is actively misleading, because the model develops false confidence in stale earlier reasoning. Compaction (consolidation) keeps the atom store clean; context reset gives the model a fresh scratch pad at budget boundaries. Both are needed.

### 14.2 Task List Simplicity

Article 2's JSON feature list worked because it was structurally simple. The constraint that mattered was not the format — it was the rule "only `passes` changes." The MeTTa equivalent enforces the same constraint: `TaskManager.updateTask()` rejects writes to `:description`. NAL truth values on task status are not needed here; `:done` is a boolean because task completion is binary. Complexity belongs at the evaluation layer (§6), not the task structure layer.

### 14.3 Separate Evaluator Is Structural, Not a Prompt Fix

The self-evaluation bias is a structural property of language models: given text the model produced plus the question "is this good?", the model has a strong prior toward yes. This cannot be fixed with better prompting. The structural fix is isolation: the evaluator sees the artifact and criteria, not the generator's reasoning chain. Plain-language criteria and plain-language verdict (`(pass "reason")` / `(fail "reason")`) are sufficient — the evaluator does not need symbolic predicates to render a useful verdict.

### 14.4 Background Triggers Enable a New Mode

Without triggers, the agent is reactive (responds to external input) or autonomously generative (creates its own tasks when idle). Triggers add a third mode: **scheduled intent** — work that should happen at a specific time or in response to a specific external event, even if the agent is otherwise idle. This is different from `autonomousLoop`'s continuous self-task generation. A nightly audit, a deployment-verification resume, a goal triggered by another goal completing — these have clear real-world uses and are worth the implementation complexity.

### 14.5 Why the Coordinator Scope Is External Workers Only

`coordinatorMode` targets long-lived external worker embodiments, not sub-agents. Sub-agents spawned via `spawn-agent` are sequential and short-lived; their timeout is the `spawn-agent` budget. Tracking them in `CoordinatorSpace` would require inter-context state sharing that the current architecture doesn't support and doesn't need. The coordinator's value is in the scenario where `multiEmbodiment` has multiple named model workers each handling a category of tasks over many cycles — where stall detection and reassignment are meaningful operations with meaningful consequences for ongoing work.

### 14.8 The `metta` Skill Security Gap

The `metta` skill calls the MeTTa interpreter with an arbitrary S-expression. This means `(metta (write-file ...))` bypasses `SkillDispatcher`'s capability gates — the write-file capability check happens inside the skill handler, but `metta` evaluates directly. This gap exists in the current implementation and needs a `safety.metta` rule:

```metta
(= (consequence-of (metta $expr) (arbitrary-evaluation) :high))
```

With `safetyLayer` enabled, this makes any `(metta ...)` call a high-risk consequence that triggers forward inference. For the expected use cases of `(metta (manifest))` or `(metta (|- ...))`, this is overhead; those specific patterns should be explicitly exempted via hook rules if the overhead is unacceptable. The alternative — whitelisting specific `metta` call patterns in `safety.metta` — is better long-term but requires more rule maintenance.

### 14.6 Memory Snapshots Are Not a Duplicate of Consolidation

The confusion between snapshots and consolidation is common. Consolidation changes the atom store; snapshots observe it. Snapshots are most useful exactly where consolidation is most needed — before a harness change that might cause behavioral drift, and across session boundaries where context is wiped. Snapshots answer "what did the agent believe before X?" Consolidation answers "how do I reduce storage and increase coherence?" They compose: consolidate, then snapshot; the snapshot captures the post-consolidation state as a clean baseline.

### 14.7 Action Trace vs. Audit Log

Accountability (auditLog) and observability (actionTrace) are different concerns with different consumers. The audit log should be minimal and complete for the accountability record. The action trace can be verbose and time-bounded (7-day retention) because its consumer is analysis and regression detection, not compliance. Keeping them separate allows different retention policies, different access patterns, and cleaner indexing for each purpose.
