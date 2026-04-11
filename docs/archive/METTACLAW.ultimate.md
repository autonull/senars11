# METTACLAW.ultimate.md — Unified Architecture Specification

> **"MeTTa is the operating system. LLMs are peripherals."**

This document is the synthesis of `METTACLAW.upgrade.md` (Phases 7–9) and the *Generic Architectural Functionality Index* / *Elemental Primitives Index*. Phases 1–6 are implemented in `agent/src/`. Phases 7–9 are specified in `METTACLAW.upgrade.md` and reproduced here in full. Phase 10 closes the remaining gaps identified by cross-referencing the two index documents against the upgrade spec.

**What's new here vs. `METTACLAW.upgrade.md`:**
- §15: Integration map — every Generic Index pattern placed against existing or planned components
- §16: Phase 10 capability flags (11 new flags)
- §17: Phase 10 — Production Hardening (write-verify, input sanitization, health endpoints, graceful degradation, cached capability resolution, parallel dispatch, observation merger, brief mode, env auto-profile, explainable authorization, cached schema registry)
- §18: MeTTa-native composition patterns
- §19: Extended file structure

---

## Table of Contents

1. [Gap Closure Summary](#1-gap-closure-summary)
2. [Capability Flags](#2-capability-flags)
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
14. [Design Rationale (Phases 7–9)](#14-design-rationale-phases-79)
15. [Generic Index Integration Map](#15-generic-index-integration-map)
16. [Phase 10 Capability Flags](#16-phase-10-capability-flags)
17. [Phase 10 — Production Hardening](#17-phase-10--production-hardening)
18. [MeTTa-Native Composition Patterns](#18-metta-native-composition-patterns)
19. [Extended File Structure](#19-extended-file-structure)
20. [Design Rationale (Phase 10)](#20-design-rationale-phase-10)

---

## 1. Gap Closure Summary

### Phases 7–9 (from `METTACLAW.upgrade.md`)

| Anthropic Pattern | Previous Coverage | Upgrade Spec |
|---|---|---|
| Context resets beat compaction | `loopBudget` terminates but no checkpoint protocol | §4 Context Reset: checkpoint-before-wipe, structured restart |
| Separate generator/evaluator | `selfEvaluation` self-grades | §6 Separate Evaluator: isolated sub-agent, no generator context |
| Feature list immutability, one task at a time | `goalPursuit` atoms but no structural constraint | §5 Task List: write-once task atoms, one-active enforcement |
| Session startup ritual | No orient-first protocol in `AgentLoop.metta` | §3 Session Startup: explicit orient phase before first cycle |
| 24/7 background / cron / sleep+resume | `autonomousLoop` but no external triggers | §7 Background Triggers: first-class trigger + sleep atoms |
| Coordinator mode for multi-worker | `multiModelRouting` routes requests, not tasks | §8 Symbolic Coordinator: task-level worker state + stall detection |
| E2E behavioral tracing | `multiEmbodiment` but no action telemetry | §9 Action Trace: typed action atoms per skill execution |
| Memory snapshot across session wipes | `memoryConsolidation` prunes but no point-in-time capture | §10 Memory Snapshots: rolling capture, cross-session queryability |

### Phase 10 (new — Generic Index synthesis)

| Generic Index Pattern | Previous Coverage | This Spec |
|---|---|---|
| Write-Verify Protocol | SemanticMemory writes are fire-and-forget | §17.1 Verify persistence before index update; reject on failure |
| Multi-vector input sanitization | Path traversal blocked; no Unicode/injection pipeline | §17.2 Layered normalize→validate→gate pipeline in SafetyLayer |
| Health monitoring endpoints | No liveness/readiness over HTTP | §17.3 `/health` + `/ready` on TriggerDispatcher's existing Express server |
| Graceful degradation | Components throw on failure; no fallback protocol | §17.4 Circuit-breaker atoms per external dep; safe-mode fallbacks |
| Cached capability resolution | `cap?` evaluates MeTTa per call | §17.5 Per-cycle capability cache; invalidated on harness change |
| Parallel task dispatch | Coordinator assigns sequentially | §17.6 Dependency analyzer + concurrent dispatch for independent tasks |
| Observation merger | `memoryConsolidation` rewrites atoms mid-session; no pre-snapshot synthesis | §17.7 Separate merge pass before session-boundary snapshots |
| Brief mode toggle | Background agent output is full-length | §17.8 `briefMode` flag compresses background notifications |
| Environment auto-profile | Profiles are manually selected | §17.9 `envAutoProfile` detects CI/dev/prod and activates correct profile |
| Explainable authorization | SafetyLayer blocks with no explanation to the agent | §17.10 Consequence reasoning injected into `&wm` when blocked |
| Cached schema registry | `skills.metta` re-parsed each context build | §17.11 Compiled skill schema cache; invalidated on `skills.metta` write |

---

## 2. Capability Flags

### 2.1 Evolution Tier (Phases 7–8)

| Flag | Default | What It Does | Risk |
|---|---|---|---|
| `taskList` | `false` | Write-once task atoms; one active at a time; `generate-self-task` works on active task only | Requires `goalPursuit`; open tasks without path stall autonomous operation |
| `separateEvaluator` | `false` | Artifact evaluation by isolated sub-agent; no generator context | Requires `subAgentSpawning`; doubles LLM calls per evaluation |
| `backgroundTriggers` | `false` | First-class trigger atoms (`:cron`, `:webhook`, `:goal-completion`) and sleep atoms | **Medium.** Webhooks expose HTTP; cron fires without prompt; misconfigured triggers loop |
| `coordinatorMode` | `false` | `CoordinatorSpace` tracks worker embodiments; stall detection; task reassignment on failure | **Medium.** Stall threshold misconfiguration causes premature reassignment |
| `actionTrace` | `false` | Every skill execution → typed `action-trace-event` atom in `ActionTraceSpace` | Storage growth; trace atoms include full args and results |

### 2.2 Experimental Tier (Phase 7)

| Flag | Default | What It Does | Risk |
|---|---|---|---|
| `memorySnapshots` | `false` | Point-in-time `memory-snapshot` atoms at session boundaries and pre-harness-change; rolling window of 10 | **Low-Medium.** Snapshot writes are large; retention fixed at 10 (configurable) |

### 2.3 Dependency Graph (Phases 7–9)

```
taskList              → goalPursuit, semanticMemory
separateEvaluator     → subAgentSpawning, taskList, actionTrace (soft: degrades without)
backgroundTriggers    → autonomousLoop, virtualEmbodiment
coordinatorMode       → multiEmbodiment, multiModelRouting
actionTrace           → auditLog
memorySnapshots       → semanticMemory
```

### 2.4 Profile Updates (Phases 7–9)

- `evolved` profile: add `actionTrace`
- `full` profile: add `taskList`, `separateEvaluator`, `actionTrace`, `backgroundTriggers`, `coordinatorMode`
- `memorySnapshots`: experimental — not in any profile; enable explicitly

---

## 3. Session Startup Protocol

### 3.1 Problem

The existing `agent-start → agent-init → agent-loop` path does not specify what `agent-init` does. Agents that begin executing without reading their own state produce inconsistent results across restarts: they re-solve problems they already solved, ignore open tasks, and ignore recent failures. The session startup ritual maps to a specced `agent-init` that orients the agent before the first cycle.

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

Context resets outperform compaction. `memoryConsolidation` prunes the atom store mid-session — that is a different operation. Clearing the *context window* and reasoning from a fresh start (with atom-retrieved facts) outperforms a full context window with accumulated confusion from stale earlier reasoning. The existing `agent-loop` budget-exhaustion path calls `agent-halt` or `reset-budget` with no checkpoint, so orientation state is silently lost.

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

- **`memoryConsolidation`** — prunes and merges the *atom store* mid-session
- **Context reset** — wipes the *context window* at budget boundaries

Both can be active simultaneously. The atom store is the persistent layer; the context window is expendable.

---

## 5. Task List

### 5.1 Problem

Two pathologies: (1) **premature completion** — agent marks tasks done without verification; (2) **task sprawl** — agent opens parallel threads without finishing any. The MeTTa-native equivalent of `feature_list.json` follows the same logic: write-once structure, one mutable status field, one active task at a time.

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

**Immutability rule**: `:description` and `:created-cycle` are write-once. Only `:status`, `:done`, and `:eval-note` change. `TaskManager.updateTask()` rejects writes to locked fields with an audit event.

### 5.3 One Task At a Time

When `taskList` is enabled:
- `generate-self-task` checks `TaskManager.getActive()` before generating any new task. If a `:in-progress` task exists, it generates only sub-tasks scoped to that task.
- Goals produce tasks via `TaskManager.createFromGoal()`. Every goal becomes a task with an explicit done condition.
- Idle autonomous cycles do not open new tasks while one is `:in-progress`.

### 5.4 Task List Context Slot

```
TASKS — 1,500 chars — all non-abandoned tasks with current status, oldest-first
```

The agent has full task visibility each cycle without calling `(list-tasks)`.

### 5.5 Task Lifecycle

```
(create-task "description")   → status :pending, done false
(start-task id)               → status :in-progress (at most one at a time)
(complete-task id)            → status :done, done true (agent must call explicitly)
(abandon-task id "reason")    → status :abandoned, reason in :eval-note
(request-eval id)             → invokes separate evaluator (if separateEvaluator enabled)
```

### 5.6 Cold-Start Task Seeding

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

### 5.7 Task List Protection

```metta
;; safety.metta
(= (consequence-of (write-file "memory/tasks/tasks.metta" $_)
                   (task-integrity-violated) :high))
(= (consequence-of (write-file "memory/tasks/" $_)
                   (task-integrity-violated) :high))
```

### 5.8 New Skills

```metta
(skill create-task   (String)        taskList :meta "Create task with description; returns task id")
(skill start-task    (String)        taskList :meta "Set task :in-progress (one at a time)")
(skill complete-task (String)        taskList :meta "Mark task done (agent asserts completion)")
(skill abandon-task  (String String) taskList :meta "Abandon task with reason")
(skill list-tasks    ()              taskList :meta "List all tasks with status")
(skill request-eval  (String)        taskList :meta "Request separate evaluation of in-progress task")
```

---

## 6. Separate Evaluator

### 6.1 Problem

`selfEvaluation` has the agent grade its own output. This is structurally biased: the model that produced an artifact has a strong prior toward rating it positively. The solution is structural isolation of the evaluator from the generator's reasoning chain.

### 6.2 Design

Artifact collection runs before spawning the evaluator:

```javascript
// In TaskManager.collectArtifacts(taskId)
async collectArtifacts(taskId) {
  const task = this.getTask(taskId);
  const parts = [];

  const diff = await execSafe('git diff HEAD', { cwd: workdir, maxBytes: 8000 });
  if (diff) parts.push(`## Changes (git diff)\n${diff}`);

  const testEvents = ActionTraceSpace.getForTask(taskId)
    .filter(e => e.skill.startsWith('(shell') && e.skill.includes('test'));
  if (testEvents.length) {
    parts.push(`## Test output\n${testEvents.map(e => e.returnVal).join('\n')}`);
  }

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
      ($result      (spawn-agent $eval-prompt 5)))
     (process-eval-result $task-id $result)))
```

The evaluator does **not** receive: the generator's chain of thought, the generator's session `&wm`, or any reasoning about why the generator made its choices.

### 6.3 Output Format

```metta
(eval-result :task-id "t_abc" :verdict :pass :note "Button renders, hover state visible, Ctrl+N fires event")
(eval-result :task-id "t_abc" :verdict :fail :note "Ctrl+N shortcut not bound; tested via console event listener")
```

`process-eval-result`: `:pass` → `complete-task`; `:fail` → return to `:in-progress`, set `:eval-note`, increment iteration counter.

### 6.4 Model Routing

When `multiModelRouting` is enabled, the evaluator sub-agent routes to `:introspection` task type — typically a different model than the `:code` generator, producing natural model diversity without explicit configuration.

### 6.5 Iteration Limit

`maxEvalIterations` (default 5, from `agent.json`). When a task fails this many times, it is automatically abandoned with the final evaluator note preserved.

### 6.6 Relationship to `selfEvaluation`

`selfEvaluation` scores conversational output quality against preference atoms — a different operation. Both can be enabled; they do not interfere.

---

## 7. Background Triggers

### 7.1 Problem

`autonomousLoop` runs continuously or halts — no native concept of scheduled or externally-triggered activation. No way to express "run the nightly audit at midnight" or "resume when the deploy webhook fires."

### 7.2 Trigger Atom

```metta
(trigger-atom
  :id          "trig_nightly-audit"
  :type        :cron              ; :cron | :webhook | :goal-completion
  :spec        "0 0 * * *"
  :action      (inject-task "Run nightly memory consolidation and audit review")
  :enabled     true
  :last-fired  ()
  :fire-count  0)
```

### 7.3 Sleep Atom

```metta
(sleep-atom
  :id           "sleep_deploy-wait"
  :reason       "Waiting for deployment pipeline"
  :resume-at    (timestamp 2026-04-03T06:00:00)
  :resume-on    (or :timestamp :webhook "deploy-complete")
  :resume-task  "Verify deployment and run smoke tests"
  :checkpoint   "cp_20260402_xyz")
```

`sleep-until` skill handler emits a session checkpoint before suspending — sleep may be for hours:

```javascript
async function sleepUntilHandler(timestamp, reason) {
  if (config.capabilities.persistentHistory) {
    await emitSessionCheckpoint();
  }
  const sleepAtom = buildSleepAtom(timestamp, reason);
  await SemanticMemory.store(sleepAtom);
  await TriggerDispatcher.onSleepEmitted(sleepAtom);
}
```

### 7.4 `TriggerDispatcher.js`

**Location:** `agent/src/triggers/TriggerDispatcher.js`

```javascript
class TriggerDispatcher {
  async start()                       // load trigger atoms; arm :enabled triggers
  async stop()                        // disarm cleanly
  async checkCronTriggers()           // called every minute
  async onWebhookReceived(req, res)   // Express route handler
  async onSleepEmitted(sleepAtom)     // suspends autonomous loop
  async onResumeConditionMet(sleepId) // resumes, injects resume-task
}
```

**Cron**: `node-cron`. **Webhooks**: localhost-only Express listener (port 7331). **Goal-completion**: subscribes to `AuditSpace` events.

### 7.5 Webhook Security

- Localhost-only by default (bind `127.0.0.1`); external exposure requires explicit `agent.json` opt-in
- HMAC validation: `X-Trigger-Signature: sha256=<hmac>` per trigger atom `:secret`
- Allowlisted trigger IDs only; unknown IDs → 404 with no information leakage
- `safetyLayer` gate on `set-trigger`: `(consequence-of (set-trigger $atom) (trigger-registered :external) :medium)`
- Rate limiting: `maxWebhookFiringPerHour` (default 60)

### 7.6 Safety

All trigger firings emit audit events. Max sleep duration configurable (`maxSleepHours`, default 24).

---

## 8. Symbolic Coordinator

### 8.1 Problem and Scope

`multiModelRouting` selects models at request level, stateless about worker availability. `CoordinatorSpace` adds task-level tracking for **external long-lived workers** — named model connections and named channel embodiments registered with `EmbodimentBus`. Sub-agents (short-lived, 5–10 cycle budget) are not tracked here; their stall detection is a timeout on the `spawn-agent` call.

### 8.2 Three Coordinator Capabilities

1. **Task-level assignment tracking**: which worker handles which task across multiple cycles
2. **Stall detection**: worker's last-active timestamp is old, task still open
3. **Reassignment on failure**: worker emits `:failed` or stalls → route to next-best available worker

Assignment ordering uses `ModelRouter.getExpectedScore()` as scoring function.

### 8.3 CoordinatorSpace

```metta
(worker-state
  :id          "worker-opus-1"
  :type        :model             ; :model | :sub-agent | :channel
  :task-id     "t_20260402_abc"
  :status      :busy              ; :idle | :busy | :stalled | :failed
  :last-active (timestamp 2026-04-02T10:30:00)
  :task-type   :code
  :assigned-cycle 142)
```

`CoordinatorSpace` is a `PersistentSpace` separate from `SemanticMemory` — coordinator state is operational, not semantic.

### 8.4 Coordinator Logic

```metta
(= (stalled? $w)
   (and (== (worker-status $w) :busy)
        (> (elapsed-ms (worker-last-active $w))
           (get-config "coordinator.stallThresholdMs"))))   ; default 600000 (10 min)

(= (best-worker-for $task-type)
   (argmax-by
     (filter-workers :idle)
     (lambda $w (model-expectation $w $task-type))))

(= (coordinator-deadlock?)
   (and (all-workers-busy?)
        (not (empty? (task-queue)))))
```

Coordinator check runs at top of each `agent-loop` cycle before context assembly:

```metta
(when (cap? coordinatorMode)
  (do (update-stalled-workers)
      (when (coordinator-deadlock?) (emit-cycle-audit :coordinator-deadlock ()))
      (reassign-stalled-tasks)))
```

### 8.5 Layer Separation

| Component | Scope | Tracks |
|---|---|---|
| `ModelRouter` | Request-level | Which model for this LLM call |
| `CoordinatorSpace` | Task-level | Which worker handles which multi-cycle task |
| `EmbodimentBus` | Message-level | Which channel has pending message; salience ordering |

### 8.6 New Skills

```metta
(skill assign-task   (String String) coordinatorMode :meta "Assign task id to worker id explicitly")
(skill worker-status ()              coordinatorMode :meta "List current worker states from CoordinatorSpace")
(skill rebalance     ()              coordinatorMode :meta "Force immediate coordinator rebalancing pass")
```

---

## 9. Action Trace

### 9.1 Distinction from AuditLog

- `auditLog` → **decisions**: skill blocked, LLM called, memory written, harness modified — accountability events
- `actionTrace` → **execution telemetry**: every skill call, args, return value, timing — observability events

### 9.2 `action-trace-event` Atom

```metta
(action-trace-event
  :id          "act_20260402_abc"
  :timestamp   1743600000000
  :cycle       142
  :skill       (write-file "memory/foo.md" "...")
  :result      :success              ; :success | :failure | :blocked
  :return-val  "ok"                  ; truncated to 500 chars
  :duration-ms 12
  :model       "claude-sonnet-4-6"
  :embodiment  "virtual-self"
  :task-id     "t_20260402_abc")     ; () if not within an active task
```

### 9.3 Integration Points

**`SkillDispatcher.execute()`** emits `ActionTraceSpace.emit()` after each skill call alongside `AuditSpace.emit()`.

**`HarnessOptimizer`** gains `getSkillDistribution` comparison signal: candidate harness producing a different skill invocation pattern (fewer failed parse retries, different skill mix) is a supplementary signal alongside failure-rate comparison.

### 9.4 `ActionTraceSpace.js`

**Location:** `agent/src/safety/ActionTraceSpace.js`

```javascript
export class ActionTraceSpace {
  static emit(skillCall, result, metadata)
  static getRecent(n)
  static getForTask(taskId)
  static getForCycle(cycle)
  static getSkillDistribution(sinceTs)    // for harness comparison
  static prune(beforeTimestamp)           // called by memoryConsolidation
}
```

Retention: `actionTraceRetentionDays` (default 7).

---

## 10. Memory Snapshots

### 10.1 Distinction from `memoryConsolidation`

| Operation | `memoryConsolidation` | `memorySnapshots` |
|---|---|---|
| Effect | Prunes, merges, decays atoms | Non-destructive capture |
| Timing | Mid-session, every N cycles | Session boundaries + pre-harness-change |
| Output | Modified atom store | Immutable point-in-time copy |
| Queryable across time? | No | Yes — any snapshot by id or timestamp |

### 10.2 Snapshot Atom

```metta
(memory-snapshot
  :id           "snap_20260402_abc"
  :timestamp    1743600000000
  :cycle        142
  :trigger      :session-boundary   ; :session-boundary | :pre-harness-change | :explicit
  :atom-count   847
  :space-ref    "memory/snapshots/snap_20260402_abc.metta"
  :parent-snap  "snap_20260401_xyz"
  :retained-until ())
```

### 10.3 Snapshot Triggers

1. **Session boundary** — `emit-session-checkpoint` calls `trigger-snapshot :session-boundary`
2. **Pre-harness-change** — `HarnessOptimizer` calls `trigger-snapshot :pre-harness-change`
3. **Explicit** — `(take-snapshot)` skill call

### 10.4 Retention Policy

Rolling window of 10 (configurable: `"memorySnapshots": { "retentionCount": 10 }`). Pre-harness-change snapshots retained until the change is confirmed or rolled back.

### 10.5 Cross-Session Comparison

```javascript
// Returns: [{ atom, stv_before, stv_after, delta }]
MemorySnapshot.compare(snapIdBefore, snapIdAfter, { minDelta: 0.1 })
```

Produces a diff for inspection; does not automatically apply NAL revision.

### 10.6 New Skills

```metta
(skill take-snapshot      ()              memorySnapshots :meta "Capture memory snapshot immediately")
(skill list-snapshots     ()              memorySnapshots :meta "List recent snapshots with timestamps")
(skill compare-snapshots  (String String) memorySnapshots :meta "Show atoms that shifted between two snapshots")
```

---

## 11. Phase Plan Extensions

### Phase 7 — Structural Reliability

**Prerequisite:** Phases 1–6 (implemented)

1. Session Startup Protocol: `agent-init` extension, `SessionManager.js`, grounded ops, `STARTUP_ORIENT` slot
2. Context Reset Protocol: checkpoint before budget-0 termination, `filter-wm-above`, `trigger-snapshot` ops
3. Task List: `TaskManager.js` with immutability enforcement, `TASKS` slot, skill handlers
4. Action Trace: `ActionTraceSpace.js`, wire into `SkillDispatcher.execute()`
5. Memory Snapshots: `MemorySnapshot.js`, wire into checkpoint emission, retention policy
6. Update `agent.json` schema
7. Tests: restart reads checkpoint; task immutability enforced; trace event per skill; snapshot at boundary

### Phase 8 — Evaluation Independence

**Prerequisite:** Phase 7, `subAgentSpawning` stable

1. Evaluation sub-agent invocation in `request-eval`
2. `process-eval-result` in `TaskManager`
3. Wire `multiModelRouting` for evaluator → `:introspection` task type
4. Wire `actionTrace` into `HarnessOptimizer`
5. Tests: evaluator invoked without generator reasoning; `:fail` note in next `TASKS` slot; abandoned after `maxEvalIterations`

### Phase 9 — Autonomous Background & Coordination

**Prerequisite:** Phase 7, Phase 8

1. `TriggerDispatcher.js` — cron, webhook, goal-completion, HMAC, rate limiting
2. Trigger/sleep atom schema, skill handlers
3. `CoordinatorSpace.js`, `coordinator.metta`
4. Wire coordinator check into `agent-loop` cycle top
5. Wire `TriggerDispatcher` into `AgentBuilder.buildMeTTaLoop()`
6. Tests: cron fires on schedule; sleep suspends/resumes; stall detection and reassignment; deadlock audit; HMAC rejection

---

## 12. New Skill Declarations (Phases 7–9)

```metta
;; Task list
(skill create-task       (String)           taskList           :meta "Create write-once task atom")
(skill start-task        (String)           taskList           :meta "Set task :in-progress (one at a time)")
(skill complete-task     (String)           taskList           :meta "Mark task done")
(skill abandon-task      (String String)    taskList           :meta "Abandon task with reason")
(skill list-tasks        ()                 taskList           :meta "List tasks with current status")
(skill request-eval      (String)           taskList           :meta "Request separate evaluation of task")

;; Memory snapshots
(skill take-snapshot     ()                 memorySnapshots    :meta "Capture immediate memory snapshot")
(skill list-snapshots    ()                 memorySnapshots    :meta "List recent snapshots by timestamp")
(skill compare-snapshots (String String)    memorySnapshots    :meta "Show atom drift between two snapshots")

;; Background triggers
(skill set-trigger       (SExpr)            backgroundTriggers :meta "Register trigger atom")
(skill remove-trigger    (String)           backgroundTriggers :meta "Disable trigger by id")
(skill list-triggers     ()                 backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until       (Timestamp String) backgroundTriggers :meta "Sleep until timestamp; resume with reason")

;; Coordinator
(skill assign-task       (String String)    coordinatorMode    :meta "Assign task to worker explicitly")
(skill worker-status     ()                 coordinatorMode    :meta "List worker states from CoordinatorSpace")
(skill rebalance         ()                 coordinatorMode    :meta "Force coordinator rebalancing pass")
```

---

## 13. File Structure Additions (Phases 7–9)

```
agent/src/
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
└── memory/
    ├── SemanticMemory.js          (existing)
    ├── Embedder.js                (existing)
    └── MemorySnapshot.js          ← NEW: point-in-time snapshot capture and comparison

memory/
├── snapshots/                     ← NEW: rolling window of 10 snapshot files
├── tasks/tasks.metta              ← NEW: task list atoms
├── triggers/triggers.metta        ← NEW: trigger and sleep atoms
└── traces/traces.metta            ← NEW: action trace atoms (7-day retention)
```

### Anthropic-Pattern Equivalents

| Anthropic Artifact | MeTTa-native Equivalent | Phase |
|---|---|---|
| `claude-progress.txt` | `session-checkpoint` atom in `history.metta` | 7 |
| `feature_list.json` | `task` atoms in `memory/tasks/tasks.metta` | 7 |
| `init.sh` | `agent-init` startup protocol in `AgentLoop.metta` | 7 |
| `AGENT_MEMORY_SNAPSHOT` | `memory-snapshot` atoms in `memory/snapshots/` | 7 |
| Playwright E2E trace | `action-trace-event` atoms in `memory/traces/` | 7 |

---

## 14. Design Rationale (Phases 7–9)

**Context Reset Over Compaction**: The atom store is the persistent layer; the context window is expendable scratch. Accumulated context is not just noisy — it is actively misleading. Compaction keeps the atom store clean; context reset gives the model a fresh scratch pad. Both are needed.

**Task List Simplicity**: `TaskManager.updateTask()` rejects writes to `:description`. NAL truth values on task status are not needed; `:done` is a boolean because task completion is binary. Complexity belongs at the evaluation layer, not the task structure.

**Separate Evaluator Is Structural**: Self-evaluation bias cannot be fixed with better prompting. The structural fix is isolation: evaluator sees artifact and criteria, not the generator's reasoning chain.

**Background Triggers Enable a Third Mode**: Without triggers, agents are reactive or autonomously generative. Triggers add **scheduled intent** — work at a specific time or in response to a specific external event. A nightly audit, a deployment-verification resume, a goal triggered by another goal completing.

**Coordinator Scope Is External Workers Only**: Sub-agents spawned via `spawn-agent` are sequential and short-lived; their timeout is the `spawn-agent` budget. Tracking them in `CoordinatorSpace` would require inter-context state sharing the architecture doesn't support or need.

**Action Trace vs. Audit Log**: Accountability (`auditLog`) and observability (`actionTrace`) serve different consumers with different retention needs. Keeping them separate allows different retention policies and cleaner indexing for each purpose.

**Memory Snapshots Are Not Consolidation**: Consolidation changes the atom store; snapshots observe it. They compose: consolidate, then snapshot — the snapshot captures the post-consolidation state as a clean baseline.

**The `metta` Skill Security Gap**: `(metta $expr)` evaluates directly, bypassing `SkillDispatcher` capability gates. Mitigation:

```metta
(= (consequence-of (metta $expr) (arbitrary-evaluation) :high))
```

Expected patterns like `(metta (manifest))` should be explicitly exempted via hook rules if overhead is unacceptable.

---

## 15. Generic Index Integration Map

This section places every pattern from both Generic Index documents against existing or planned components. Patterns marked **[covered]** are already addressed. Patterns marked **[Phase 10]** are implemented in §17.

### Capability & Tooling Layer
| Pattern | Status | MeTTa Native |
|---|---|---|
| Discrete Tool Registration | **covered** | `skill` atoms in `skills.metta`; schema-validated, cap-gated |
| Permission-Gated Execution | **covered** | `SafetyLayer` + `consequence-of` rules |
| Risk Classification | **covered** | `:low`/`:medium`/`:high` consequence tiers |
| Sandboxed Execution | **covered** | `ShellGuard.js` allowlist; `fileReadSkill` scoped to `cwd` |
| Structured Result Contracts | **covered** | Typed atoms as return values; `&error` feedback protocol |
| Input Sanitization Pipeline | **[Phase 10 §17.2]** | Multi-vector: normalize→validate→gate in `SafetyLayer` |

### Multi-Agent Orchestration
| Pattern | Status | MeTTa Native |
|---|---|---|
| Coordinator/Worker Topology | **covered** | `CoordinatorSpace` + `ModelRouter` + `EmbodimentBus` |
| Parallel Task Dispatch | **[Phase 10 §17.6]** | `DependencyAnalyzer.js` in coordinator; independent tasks dispatched concurrently |
| Shared Context Protocol | **covered** | `EmbodimentBus` structured messages; `SemanticMemory` as scratchpad |
| Role-Based Specialization | **covered** | `ModelRouter` task-type routing; `:code`/`:introspection`/`:search` |
| Task Notification System | **covered** | `AuditSpace` events; `EmbodimentBus` salience queue |
| Anti-Lazy Delegation | **covered** | Evaluator receives only artifact + criteria; reasoning chain excluded by design |

### Memory & Context Management
| Pattern | Status | MeTTa Native |
|---|---|---|
| Tiered Memory (Index/Topic/Archive) | **covered** | Index: `MEMORY.md` + pointer atoms; Topic: `SemanticMemory` atoms; Archive: `history.metta` + `audit.metta` |
| Lazy Loading Discipline | **covered** | `contextBudgets` slots; only referenced atoms fetched per cycle |
| Background Consolidation | **covered** | `memoryConsolidation` flag; self-task triggered consolidation |
| Write-Verify Protocol | **[Phase 10 §17.1]** | Persistence verified before index pointer update |
| Size-Constrained Index | **covered** | Per-slot char budgets; `MEMORY.md` 200-line limit |
| Contradiction Resolver | **covered** | NAL truth value revision; `memoryConsolidation` merge pass |

### Autonomous Background Processing
| Pattern | Status | MeTTa Native |
|---|---|---|
| Trigger-Gated Activation | **covered** | `trigger-atom` with `:type`, `:spec`, `:enabled` |
| Blocking Budget Enforcer | **[Phase 10 §17.8]** | `briefMode` + background notification throttle |
| Append-Only Logging | **covered** | `AuditSpace` + `ActionTraceSpace` — both append-only `PersistentSpace` |
| Concise Output Mode | **[Phase 10 §17.8]** | `briefMode` flag for background agent output formatting |
| Watch-and-Wait Pattern | **covered** | `TriggerDispatcher` cron + webhook listeners |
| Observation Merger | **[Phase 10 §17.7]** | Pre-snapshot synthesis pass; separate from consolidation |

### Configuration & Feature Management
| Pattern | Status | MeTTa Native |
|---|---|---|
| Compile-Time Feature Elimination | partial | Module-level capability checks; full dead-code elimination deferred |
| Runtime Feature Gating | **covered** | `cap?` atoms; skill visibility gated per flag |
| Environment-Based Activation | **[Phase 10 §17.9]** | `envAutoProfile` detects CI/dev/prod; activates profile |
| Kill-Switch Infrastructure | **covered** | Any capability flag set to `false` immediately removes skills from context |
| Cached Feature Resolution | **[Phase 10 §17.5]** | Per-cycle `cap?` cache; invalidated on harness change |

### Security & Permission Model
| Pattern | Status | MeTTa Native |
|---|---|---|
| Multi-Modal Permission Modes | **covered** | `SafetyLayer` modes; `safetyLayer` flag controls enforcement level |
| Explainable Authorization | **[Phase 10 §17.10]** | Consequence reasoning injected into `&wm` on block |
| Protected Resource Lists | **covered** | `safety.metta` consequence rules on critical paths |
| Input Sanitization Pipeline | **[Phase 10 §17.2]** | Layered defense in `SafetyLayer` |
| Audit-Ready Execution | **covered** | Every skill call → `AuditSpace` + `ActionTraceSpace` event |

### Prompt & Context Composition
| Pattern | Status | MeTTa Native |
|---|---|---|
| Modular Prompt Sections | **covered** | Named context slots in `ContextBuilder.metta` |
| Static/Dynamic Boundary | **covered** | `PINNED` slot (static) vs. dynamic slots (per-cycle); `STARTUP_ORIENT` (cycle-0 only) |
| Cache-Breaking API | **covered** | Slot char budgets; PINNED content changes invalidate cache |
| Ownership Metadata | partial | Slot names imply ownership; explicit attribution deferred |
| Token-Aware Formatter | **covered** | `contextBudgets` per-slot char limits; skills truncated when cap disabled |

### Remote Execution & Offload
| Pattern | Status | MeTTa Native |
|---|---|---|
| Task Offload Protocol | **covered** | `subAgentSpawning` + `spawn-agent` |
| Async Polling Pattern | partial | `spawn-agent` is synchronous; async extension deferred |
| Session Token Management | **covered** | Per-trigger HMAC secrets in trigger atoms |

### Observability & Reliability
| Pattern | Status | MeTTa Native |
|---|---|---|
| Health Monitoring Endpoints | **[Phase 10 §17.3]** | `/health` + `/ready` on `TriggerDispatcher` Express server |
| Per-Call Authentication | **covered** | `auth_validator` pattern via `SafetyLayer` gate |
| Usage Pattern Adaptation | **covered** | `HarnessOptimizer` models failure rates; `ModelBenchmark` tracks call patterns |
| Append-Only Audit Logs | **covered** | `AuditSpace` + `ActionTraceSpace` |
| Graceful Degradation | **[Phase 10 §17.4]** | Circuit-breaker atoms per external dep; `SafetyLayer` safe-mode fallback |

### Interface & Schema Management
| Pattern | Status | MeTTa Native |
|---|---|---|
| Cached Schema Registry | **[Phase 10 §17.11]** | `SkillSchemaCache.js`; `skills.metta` parsed once per session |
| Dynamic Schema Generation | **covered** | Skill atoms generated from MeTTa rules; cap-gated at build time |
| Versioned API Negotiation | deferred | Skill atoms don't carry version; deferred |
| Token-Aware Design | **covered** | `contextBudgets`; skill schema minimized (type signature only) |

### Resource & Cost Awareness
| Pattern | Status | MeTTa Native |
|---|---|---|
| Context Window Optimization | **covered** | Context reset protocol (§4); slot budgets; lazy atom retrieval |
| Lazy Fetching | **covered** | `query` op fetches on demand; `lazy_topic_fetcher` pattern via `SemanticMemory` |
| Cost-Aware Tool Design | **covered** | Skill results truncated to 500 chars in trace; `webSearchSkill` returns minimal JSON |
| Budget Enforcement | **covered** | `loopBudget` terminates autonomousLoop; `subAgentSpawning` 5-cycle budget |

---

## 16. Phase 10 Capability Flags

### 16.1 Evolution Tier Additions

| Flag | Default | What It Does | Risk |
|---|---|---|---|
| `writeVerify` | `false` | Every `SemanticMemory` and `TaskManager` write verifies persistence before updating pointer index | Low; small write latency increase |
| `inputSanitization` | `false` | Multi-vector sanitization pipeline in `SafetyLayer`: path traversal, Unicode normalization, injection patterns | Low; may reject unusual but valid inputs — tunable |
| `healthEndpoints` | `false` | `/health` + `/ready` routes on `TriggerDispatcher` Express server; exposes component liveness | Low; localhost-only by default |
| `parallelDispatch` | `false` | `DependencyAnalyzer` in `CoordinatorSpace` detects independent tasks; dispatches concurrently | **Medium.** Requires `coordinatorMode`. Concurrent execution can interleave side effects |
| `observationMerger` | `false` | Pre-snapshot synthesis pass: merges fragmented observations into coherent facts before session boundary | Low; adds latency to session boundary |
| `briefMode` | `false` | Background agent output uses abbreviated format; notification channel receives compressed events | Low; may reduce debugging information |
| `envAutoProfile` | `false` | Detect CI/dev/prod environment on startup; activate matching capability profile | Low; detection heuristics may misclassify unusual envs |
| `explainableAuth` | `false` | When `SafetyLayer` blocks a skill, consequence reasoning injected into `&wm` so agent understands why | Low; small `&wm` overhead per block |
| `cachedCapability` | `false` | `cap?` results cached per cycle; cache invalidated on harness atom change | Low; stale for the remainder of cycle if harness changes mid-cycle |
| `cachedSchemaRegistry` | `false` | `skills.metta` parsed once per session; skill schema cache rebuilt on `write-file` to `skills.metta` | Low; stale schemas if `skills.metta` modified externally |

### 16.2 Experimental Tier Additions

| Flag | Default | What It Does | Risk |
|---|---|---|---|
| `gracefulDegradation` | `false` | Circuit-breaker atoms per external dependency; component failures trigger safe-mode fallback rather than crash | **Low-Medium.** Circuit breaker may suppress genuine errors; requires tuning open/close thresholds |

### 16.3 Dependency Additions

```
writeVerify           → semanticMemory
inputSanitization     → safetyLayer
healthEndpoints       → backgroundTriggers (reuses Express server)
parallelDispatch      → coordinatorMode
observationMerger     → memorySnapshots (runs before snapshot capture)
briefMode             → autonomousLoop
envAutoProfile        → (none; runs before any capability loads)
explainableAuth       → safetyLayer
cachedCapability      → mettaControlPlane
cachedSchemaRegistry  → sExprSkillDispatch
gracefulDegradation   → safetyLayer
```

### 16.4 Profile Updates

- `evolved` profile: add `writeVerify`, `inputSanitization`, `cachedCapability`, `cachedSchemaRegistry`
- `full` profile: add all Phase 10 flags except `gracefulDegradation` and `parallelDispatch`
- `gracefulDegradation`, `parallelDispatch`: experimental — enable explicitly

---

## 17. Phase 10 — Production Hardening

### 17.1 Write-Verify Protocol

**Problem**: `SemanticMemory.store()` and `TaskManager.createTask()` write atoms and update pointer structures in a single pass. If the write fails mid-way, pointer corruption leaves the index pointing to non-existent content.

**Design**: Adopt the Generic Index's write-verify pattern: write to topic file first, verify persistence, then update pointer index. Rollback on verification failure.

```javascript
// In SemanticMemory.js — when writeVerify enabled
async storeVerified(atom) {
  const atomId = genId('mem');
  const filePath = `memory/semantic/${atomId}.metta`;

  // 1. Write atom to topic file
  await fs.writeFile(filePath, atomToString(atom));

  // 2. Verify: re-read and parse
  const written = await fs.readFile(filePath, 'utf8');
  const parsed = parseMeTTa(written);
  if (!atomsEqual(atom, parsed)) {
    await fs.unlink(filePath);  // rollback
    throw new Error(`write-verify failed for ${atomId}`);
  }

  // 3. Only now update the pointer index
  await this.updateIndex(atomId, atom.type, atom.tags);
  return atomId;
}
```

Same pattern in `TaskManager.createTask()`: write task atom, verify, then add to `tasks.metta` index.

**Audit**: Failed verifications emit `(audit-event :type :write-verify-failed :atom-id $id :reason "corruption")`.

**Performance**: Write-verify adds one read per write. For the expected write frequency (dozens per session, not thousands), this is negligible.

### 17.2 Input Sanitization Pipeline

**Problem**: The current `SafetyLayer` blocks known dangerous patterns via `consequence-of` rules but does not preprocess inputs before evaluation — Unicode normalization attacks, path traversal variants, and injection in unexpected positions can bypass rule matching.

**Design**: Add a `SanitizationPipeline` that runs before `SafetyLayer.evaluate()` on all skill arguments:

```javascript
// agent/src/safety/SanitizationPipeline.js
export class SanitizationPipeline {
  static normalize(input) {
    // 1. Unicode normalization (NFC) — prevents homograph attacks
    const nfc = input.normalize('NFC');

    // 2. Path traversal elimination — resolve and check against cwd
    if (looksLikePath(nfc)) {
      const resolved = path.resolve(nfc);
      if (!resolved.startsWith(WORKDIR)) {
        throw new SanitizationError('path-traversal', nfc);
      }
    }

    // 3. Null byte injection — strings with \0 are always rejected
    if (nfc.includes('\0')) {
      throw new SanitizationError('null-byte-injection', nfc);
    }

    // 4. S-expression injection — if arg is string type, reject unbalanced parens
    if (hasUnbalancedParens(nfc)) {
      throw new SanitizationError('sexpr-injection', nfc);
    }

    return nfc;
  }

  static sanitizeSkillArgs(skillName, args) {
    return args.map((arg, i) => {
      try {
        return typeof arg === 'string' ? this.normalize(arg) : arg;
      } catch (e) {
        AuditSpace.emit({ type: 'sanitization-rejected', skill: skillName, argIndex: i, reason: e.code });
        throw e;
      }
    });
  }
}
```

Wire into `SkillDispatcher.execute()` before the `SafetyLayer` gate:

```javascript
// In SkillDispatcher.execute()
const cleanArgs = config.capabilities.inputSanitization
  ? SanitizationPipeline.sanitizeSkillArgs(skillName, args)
  : args;
// then SafetyLayer.evaluate(skillName, cleanArgs)
```

**MeTTa rule extension** in `safety.metta`:

```metta
;; Any skill arg containing shell metacharacters is high-risk
(= (consequence-of (skill-arg-contains $arg $metachar) (injection-risk) :high))
```

### 17.3 Health Monitoring

**Problem**: No component exposes liveness or readiness status. `TriggerDispatcher` already runs an Express server (port 7331) for webhooks.

**Design**: Add `/health` and `/ready` routes to `TriggerDispatcher`'s existing Express app:

```javascript
// In TriggerDispatcher.js — mounted when healthEndpoints enabled
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cycle: AgentState.getCycleCount(),
    timestamp: Date.now()
  });
});

app.get('/ready', async (req, res) => {
  const checks = {
    semanticMemory: await SemanticMemory.ping(),
    auditSpace:     await AuditSpace.ping(),
    modelRouter:    await ModelRouter.ping(),
  };
  const allReady = Object.values(checks).every(Boolean);
  res.status(allReady ? 200 : 503).json({ ready: allReady, checks });
});
```

Each dependency exposes a `ping()` method returning `true`/`false` — a fast existence check, not a full query.

**Audit**: `TriggerDispatcher.start()` emits `(audit-event :type :health-endpoint-active :port 7331)`.

**Security**: Same localhost-only binding as webhooks. No authentication on `/health` or `/ready` — liveness checks must be non-blocking and should not require credentials. If external exposure is needed, it shares the `webhooks.bindHost` config key.

### 17.4 Graceful Degradation

**Problem**: When a model provider API returns 503, or `SemanticMemory` is temporarily unavailable, components throw and propagate the error to `agent-loop`, causing the autonomous cycle to halt rather than degrading gracefully.

**Design**: Circuit-breaker atoms in `SemanticMemory` track external dependency health:

```metta
(circuit-breaker
  :dep         "anthropic-api"
  :state       :closed          ; :closed | :open | :half-open
  :failures    0
  :last-failure ()
  :open-until  ()               ; timestamp when to attempt :half-open
  :threshold   5                ; failures before opening
  :reset-ms    60000)           ; time in :open before :half-open
```

`GracefulDegradation.js` wraps external calls:

```javascript
// agent/src/safety/GracefulDegradation.js
export class GracefulDegradation {
  static async call(depName, fn, fallback) {
    const breaker = await CircuitBreakerStore.get(depName);
    if (breaker.state === 'open') {
      if (Date.now() < breaker.openUntil) {
        AuditSpace.emit({ type: 'circuit-open', dep: depName });
        return fallback();
      }
      await CircuitBreakerStore.setHalfOpen(depName);
    }
    try {
      const result = await fn();
      await CircuitBreakerStore.recordSuccess(depName);
      return result;
    } catch (e) {
      await CircuitBreakerStore.recordFailure(depName);
      AuditSpace.emit({ type: 'dep-failure', dep: depName, error: e.message });
      return fallback();
    }
  }
}
```

Fallback strategies per component:
- `ModelRouter`: route to next-ranked model
- `SemanticMemory`: return empty result set, skip write
- `webSearchSkill`: return `(error "search unavailable")` to agent
- `TriggerDispatcher` webhooks: queue event, retry on circuit close

**`safety.metta` rule**:

```metta
;; When a dependency circuit is open, block skills that exclusively rely on it
(= (consequence-of (use-dep $dep) (dep-unavailable $dep) :medium)
   (circuit-open? $dep))
```

This prevents the agent from attempting operations it knows will fail — a different mechanism than the input sanitization block. The agent can query `(circuit-status dep-name)` to see which deps are available.

### 17.5 Cached Capability Resolution

**Problem**: `cap?` calls evaluate MeTTa each time. In a cycle with heavy context assembly and many skill checks, this is redundant — capabilities don't change mid-cycle (only between cycles, via harness changes).

**Design**: Per-cycle capability cache invalidated at cycle start and on harness atom mutation:

```javascript
// agent/src/capabilities/CapabilityCache.js
export class CapabilityCache {
  static #cache = new Map();
  static #cycle = -1;

  static get(flag, interp) {
    const currentCycle = AgentState.getCycleCount();
    if (currentCycle !== this.#cycle) {
      this.#cache.clear();
      this.#cycle = currentCycle;
    }
    if (!this.#cache.has(flag)) {
      this.#cache.set(flag, interp.eval(`(cap? ${flag})`));
    }
    return this.#cache.get(flag);
  }

  static invalidate() {
    this.#cache.clear();  // called by HarnessOptimizer when writing capability atoms
  }
}
```

`cap?` grounded op delegates to `CapabilityCache.get()` when `cachedCapability` is enabled.

**Impact**: In a 10-capability system with 50 `cap?` calls per cycle, this eliminates ~50 MeTTa evaluations per cycle — measurable at high loop rates.

### 17.6 Parallel Task Dispatch

**Problem**: `CoordinatorSpace` assigns tasks sequentially by availability — no analysis of which tasks are independent and could run simultaneously.

**Design**: `DependencyAnalyzer` in the coordinator layer identifies independent tasks and dispatches them to separate workers concurrently:

```javascript
// agent/src/coordinator/DependencyAnalyzer.js
export class DependencyAnalyzer {
  // Returns groups of task IDs that can run concurrently
  // Tasks in the same group have no shared dependencies
  static partition(tasks) {
    const graph = this.buildDependencyGraph(tasks);
    return this.topologicalPartition(graph);
  }

  static buildDependencyGraph(tasks) {
    // Dependency detected from: explicit :depends-on field in task atom,
    // or shared file paths in task description (heuristic)
    const edges = [];
    for (const task of tasks) {
      const deps = task.dependsOn || [];
      for (const dep of deps) edges.push([dep, task.id]);
    }
    return { tasks, edges };
  }
}
```

Task atom extension for explicit dependencies:

```metta
(task
  :id          "t_20260402_def"
  :description "Write integration tests for the button feature"
  :depends-on  ("t_20260402_abc")   ; explicit dependency on button implementation
  :status      :pending
  :done        false
  :eval-note   ())
```

Coordinator dispatch logic:

```metta
;; coordinator.metta extension
(= (dispatch-independent-tasks)
   (let*
     (($pending   (filter-tasks :pending))
      ($groups    (partition-by-dependency $pending))
      ($parallel  (head $groups)))     ; first group has no inter-dependencies
     (map dispatch-to-best-worker $parallel)))
```

**Safety constraint**: Max concurrent task count configurable (`coordinator.maxParallel`, default 3). Tasks that write to shared files get conservative single-dispatch regardless of dependency graph (detected via `SafetyLayer` file path overlap analysis).

**Audit**: `(audit-event :type :parallel-dispatch :task-ids $ids :worker-ids $workers)`.

### 17.7 Observation Merger

**Problem**: The Generic Index distinguishes *background consolidation* (atom store cleanup) from *observation merging* (synthesizing fragmented session data into unified facts before it is snapshotted). `memoryConsolidation` handles the former; the latter has no dedicated component.

**Design**: `ObservationMerger.js` runs as a pre-snapshot pass — after the session checkpoint but before the snapshot write:

```javascript
// agent/src/memory/ObservationMerger.js
export class ObservationMerger {
  // Merge fragmented facts about the same subject into unified atoms
  async merge(sinceTimestamp) {
    const fragments = await SemanticMemory.getFragmentsSince(sinceTimestamp);
    const grouped = this.groupBySubject(fragments);
    const merged = [];

    for (const [subject, facts] of grouped) {
      if (facts.length < 2) continue;  // nothing to merge

      const resolution = await this.resolveContradictions(facts);
      const unified = this.unifyFacts(resolution);
      merged.push(unified);

      // Mark originals as merged (not deleted — snapshots can still reference them)
      for (const fact of facts) {
        await SemanticMemory.tag(fact.id, ':merged-into', unified.id);
      }
    }

    return merged;
  }

  groupBySubject(fragments) { /* group atoms with same :subject field */ }
  resolveContradictions(facts) { /* NAL strength-weighted resolution */ }
  unifyFacts(resolved) { /* produce single canonical atom */ }
}
```

Wire into `emit-session-checkpoint` when `observationMerger` is enabled:

```metta
(= (emit-session-checkpoint)
   (let*
     ...
     ($merged  (if (cap? observationMerger)
                 (merge-observations (last-checkpoint-timestamp))
                 ()))
     ...))
```

**Distinction from `memoryConsolidation`**:
- `ObservationMerger` runs at session boundaries (before snapshot), on new observations since last checkpoint
- `memoryConsolidation` runs mid-session every N cycles, on the full atom store, with decay and pruning
- Both can be active; merger prepares clean facts for consolidation to process in the next session

### 17.8 Brief Mode

**Problem**: Background agents running during autonomous operation emit full-length output to the notification channel, flooding the primary interface even for routine operations.

**Design**: `briefMode` flag activates abbreviated output formatting for background-sourced events:

```javascript
// agent/src/io/BriefFormatter.js
export class BriefFormatter {
  static format(event) {
    switch (event.type) {
      case 'task-complete':
        return `✓ ${event.taskId.slice(-6)}: ${event.note.slice(0, 60)}`;
      case 'trigger-fired':
        return `⚡ ${event.triggerId}`;
      case 'snapshot-taken':
        return `📸 snap ${event.snapshotId.slice(-6)} (${event.atomCount} atoms)`;
      case 'eval-fail':
        return `✗ ${event.taskId.slice(-6)}: ${event.note.slice(0, 80)}`;
      default:
        return `[${event.type}] ${JSON.stringify(event).slice(0, 100)}`;
    }
  }
}
```

`briefMode` also gates notification frequency: background events are **batched** into a single notification per cycle rather than emitting individually. Batch flush happens at the end of each `agent-loop` cycle when `briefMode` is active.

**Blocking Budget**: When `briefMode` is enabled, the `EmbodimentBus` enforces `maxBackgroundNotificationsPerCycle` (default 3). Events beyond this per-cycle limit are logged to `AuditSpace` but not forwarded to the primary interface. This prevents the background loop from flooding channels during high-activity autonomous periods.

```metta
;; safety.metta
(= (consequence-of (notify-channel $ch $n)
                   (notification-flood)
                   :low)
   (and (cap? briefMode)
        (> (notifications-this-cycle $ch) (get-config "briefMode.maxPerCycle"))))
```

### 17.9 Environment Auto-Profile

**Problem**: The correct capability profile (minimal vs. evolved vs. full) depends on the deployment environment, but profiles are currently selected manually. Developers running locally want `evolved`; CI pipelines want `minimal`; production autonomous runs want `full`.

**Design**: `EnvDetector.js` runs before capability loading in `AgentBuilder.buildMeTTaLoop()`:

```javascript
// agent/src/capabilities/EnvDetector.js
export class EnvDetector {
  static detect() {
    // CI signals
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.JENKINS_URL) {
      return 'minimal';
    }

    // Production signals (explicit opt-in required)
    if (process.env.SENARS_ENV === 'production') {
      return 'full';
    }

    // Internal/dev signals
    if (process.env.SENARS_ENV === 'dev' || !process.env.SENARS_ENV) {
      return 'evolved';
    }

    return null;  // no detection; use agent.json profile as-is
  }
}
```

`EnvDetector.detect()` runs in `AgentBuilder` before `capabilities.js` loads. If a non-null profile is returned and `envAutoProfile` is enabled, it **overrides** the `agent.json` profile setting. The override is logged:

```javascript
AuditSpace.emit({ type: 'env-profile-override', detected: profile, previous: configProfile });
```

**MeTTa atom** for the active profile:

```metta
(env-profile :detected "evolved" :source :env-detector :overrode "minimal")
```

Agent can query `(get-env-profile)` to see what profile is active and why.

**Precedence**: explicit `SENARS_ENV` > auto-detection heuristics > `agent.json` profile. `envAutoProfile: false` disables auto-detection entirely (manual profile only).

### 17.10 Explainable Authorization

**Problem**: When `SafetyLayer` blocks a skill, the agent receives `(error "skill blocked by safety layer")` — no information about *why*. The agent cannot distinguish "this path is forbidden" from "this operation requires a capability you don't have" from "this consequence was too risky." Without explanation, the agent may retry with the same approach, loop, or make incorrect inferences.

**Design**: When `explainableAuth` is enabled, the `SafetyLayer` block injects the consequence chain into `&wm`:

```metta
;; SafetyLayer.evaluate() — when explainableAuth enabled and consequence is :high or :medium
(= (inject-block-explanation $skill $consequence $risk)
   (add-to-wm
     (block-explanation
       :skill       $skill
       :consequence $consequence
       :risk        $risk
       :suggestion  (suggest-safe-alternative $skill $consequence))
     0.7))   ; priority 0.7 — important but not urgent
```

```javascript
// In SafetyLayer.js
if (config.capabilities.explainableAuth && riskLevel !== 'low') {
  const explanation = {
    skill: skillName,
    consequence: consequenceName,
    risk: riskLevel,
    rule: matchedRule,
    suggestion: SafetyLayer.suggestAlternative(skillName, consequenceName)
  };
  WMManager.add('block-explanation', explanation, 0.7);
}
```

The `block-explanation` atom appears in the `WORKING_MEMORY` context slot on the next cycle (priority 0.7 means it will appear). The agent's prompt already shows WM, so it sees:

```
[WM 0.70] (block-explanation :skill (write-file "agent.json" ...) 
           :consequence (capability-self-modification) :risk :high
           :suggestion "Use (propose-harness-change ...) instead of direct write")
```

**Suggestion logic**: `SafetyLayer.suggestAlternative()` maps known consequence types to safe alternative patterns. This is not AI-generated — it is a lookup table in `safety.metta`:

```metta
(= (safe-alternative capability-self-modification)
   "Use (propose-harness-change ...) instead of direct capability modification")
(= (safe-alternative task-integrity-violated)
   "Use (update-task ...) which enforces field immutability")
(= (safe-alternative arbitrary-evaluation)
   "Express the intent as a named skill or grounded op")
```

### 17.11 Cached Schema Registry

**Problem**: `ContextBuilder.metta`'s `build-context` assembles the `SKILLS` context slot by evaluating skill atoms from `skills.metta` every cycle. For a system with 40+ skills, this is the most expensive part of context assembly.

**Design**: `SkillSchemaCache.js` parses `skills.metta` once per session and serves the compiled schema from memory:

```javascript
// agent/src/skills/SkillSchemaCache.js
export class SkillSchemaCache {
  static #cache = null;
  static #skills_metta_mtime = null;

  static async get(interp) {
    const mtime = await fs.stat('memory/harness/skills.metta').then(s => s.mtimeMs);
    if (this.#cache && mtime === this.#skills_metta_mtime) {
      return this.#cache;
    }

    // Rebuild cache
    const atoms = await interp.eval('(get-all-skills)');
    this.#cache = this.compileSchemas(atoms);
    this.#skills_metta_mtime = mtime;
    AuditSpace.emit({ type: 'schema-cache-rebuilt', skillCount: this.#cache.size });
    return this.#cache;
  }

  static invalidate() {
    this.#cache = null;  // called when skills.metta is written by agent
  }

  static compileSchemas(atoms) {
    // Returns Map<skillName, { signature, capability, meta }>
    return new Map(atoms.map(a => [a.name, {
      signature: a.args,
      capability: a.capability,
      meta: a.meta
    }]));
  }
}
```

Wire invalidation into `SkillDispatcher` when a `write-file` targets `skills.metta`:

```javascript
if (filePath.endsWith('skills.metta')) {
  SkillSchemaCache.invalidate();
}
```

The `build-context` SKILLS slot builder calls `SkillSchemaCache.get()` instead of re-evaluating `(get-all-skills)` each cycle. For a 40-skill system at 100 cycles/session, this eliminates ~4,000 redundant MeTTa evaluations.

---

## 18. MeTTa-Native Composition Patterns

These are the Generic Index's canonical composition patterns, translated to MeTTa atoms and JS components.

### Pattern A: Secure Tool Execution

**Generic**: `[tool_registry] → [risk_classifier] → [permission_gate] → [input_sanitizer] → [sandbox_executor] → [audit_emitter]`

**MeTTa-native**:

```metta
;; skills.metta: tool registry
(skill $name $args $cap :meta $desc)

;; safety.metta: risk classification
(= (consequence-of ($name ...) $consequence $risk))

;; agent-loop: execution pipeline
(= (execute-skill $call)
   (let*
     (($sanitized  (if (cap? inputSanitization)
                     (sanitize-args $call)
                     $call))
      ($check      (if (cap? safetyLayer)
                     (forward-infer-consequences $sanitized)
                     :ok))
      ($result     (if (== $check :ok)
                     (dispatch $sanitized)
                     (block-skill $sanitized $check))))
     (do
       (when (cap? auditLog)   (emit-audit $call $result))
       (when (cap? actionTrace) (emit-trace $call $result))
       $result)))
```

### Pattern B: Autonomous Background Loop

**Generic**: `[tick_scheduler] → [multi_condition_trigger] → [watch_pattern_matcher] → [proactive_action_planner] → [blocking_budget_enforcer] → [concise_output_formatter]`

**MeTTa-native**:

```metta
;; TriggerDispatcher: tick_scheduler + watch_pattern_matcher
;; trigger-atom: multi_condition_trigger (cron | webhook | goal-completion)
;; VirtualEmbodiment.generateSelfTask(): proactive_action_planner
;; briefMode: blocking_budget_enforcer + concise_output_formatter

(= (background-cycle)
   (do
     ;; Check triggers (multi_condition_trigger)
     (when (cap? backgroundTriggers)
       (check-and-fire-triggers))

     ;; Generate proactive task if idle (proactive_action_planner)
     (when (cap? autonomousLoop)
       (let $task (generate-self-task)
            (if (not (== $task ()))
              (inject-task $task)
              ())))

     ;; Budget check before notifying (blocking_budget_enforcer)
     (when (cap? briefMode)
       (flush-brief-notifications))))
```

### Pattern C: Multi-Agent Task Pipeline

**Generic**: `[coordinator_role] → [dependency_analyzer] → [concurrent_dispatch] → [worker_role + structured_notification + shared_scratchpad] → [task_lifecycle_manager] → [observation_merger]`

**MeTTa-native**:

```metta
;; coordinator.metta: coordinator_role
(= (coordinator-cycle)
   (do
     ;; dependency_analyzer + concurrent_dispatch (Phase 10)
     (when (cap? parallelDispatch)
       (dispatch-independent-tasks))

     ;; structured_notification: AuditSpace events for task completion
     ;; shared_scratchpad: SemanticMemory as cross-worker store
     ;; task_lifecycle_manager
     (update-stalled-workers)
     (reassign-stalled-tasks)

     ;; observation_merger (Phase 10, pre-snapshot)
     (when (cap? observationMerger)
       (merge-recent-observations))))
```

### Pattern D: Cache-Aware Prompt Assembly

**Generic**: `[modular_section_builder] + [static_dynamic_boundary] → [cached_schema_registry] + [token_aware_formatter] → [volatile_section_wrapper] → [context_assembler]`

**MeTTa-native**:

```metta
;; ContextBuilder.metta
(= (build-context)
   (let*
     ;; Static/pinned (cache-stable)
     (($pinned     (get-pinned-context))

      ;; Session-once (cycle 0 only — volatile, breaks cache)
      ($orient     (if (== (get-state &cycle-count) 0)
                     (build-startup-orient)
                     ""))

      ;; Task context (per-cycle volatile)
      ($tasks      (if (cap? taskList)
                     (format-task-list (list-tasks))
                     ""))

      ;; Skills (cached schema registry — Phase 10)
      ($skills     (if (cap? cachedSchemaRegistry)
                     (get-cached-skill-schema)
                     (format-skill-atoms (get-all-skills))))

      ;; Working memory (per-cycle volatile)
      ($wm         (format-wm-above &wm 0.3))

      ;; Semantic context (lazily fetched)
      ($semantic   (query-relevant-memory (current-input))))

     (assemble-context $orient $pinned $tasks $skills $wm $semantic)))
```

### Pattern E: Session Boundary Protocol

**Generic**: checkpoint + snapshot + merge + reset

**MeTTa-native**: Full protocol at budget exhaustion:

```metta
(= (session-boundary-protocol)
   (do
     ;; 1. Merge observations (Phase 10)
     (when (cap? observationMerger)
       (merge-observations (last-checkpoint-timestamp)))

     ;; 2. Snapshot memory state (before it changes)
     (when (cap? memorySnapshots)
       (trigger-snapshot :session-boundary))

     ;; 3. Write session checkpoint (goals + task + high-priority WM)
     (when (cap? persistentHistory)
       (emit-session-checkpoint))

     ;; 4. Reset context window (the actual reset)
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))))
```

---

## 19. Extended File Structure

Full additions across all phases:

```
agent/src/
├── AgentBuilder.js                 (existing — extend for TriggerDispatcher, EnvDetector wiring)
├── capabilities/
│   ├── capabilities.js             (existing)
│   ├── CapabilityCache.js          ← NEW (Phase 10): per-cycle cap? cache
│   └── EnvDetector.js              ← NEW (Phase 10): CI/dev/prod detection
├── session/
│   └── SessionManager.js          ← NEW (Phase 7): session-checkpoint read/write
├── tasks/
│   └── TaskManager.js             ← NEW (Phase 7): task atom lifecycle, immutability
├── triggers/
│   └── TriggerDispatcher.js       ← NEW (Phase 9): cron/webhook/goal-completion + health endpoints
├── coordinator/
│   ├── CoordinatorSpace.js        ← NEW (Phase 9): worker-state atom store
│   ├── DependencyAnalyzer.js      ← NEW (Phase 10): parallel dispatch dependency graph
│   └── coordinator.metta          ← NEW (Phase 9): stall/deadlock/assignment inference rules
├── safety/
│   ├── SafetyLayer.js             (existing — extend with explainableAuth, inputSanitization hooks)
│   ├── AuditSpace.js              (existing)
│   ├── ActionTraceSpace.js        ← NEW (Phase 7): execution telemetry atoms
│   ├── SanitizationPipeline.js    ← NEW (Phase 10): normalize→validate→gate
│   └── GracefulDegradation.js     ← NEW (Phase 10): circuit-breaker per external dep
├── skills/
│   ├── SkillDispatcher.js         (existing — extend with actionTrace, sanitization hooks)
│   ├── SkillSchemaCache.js        ← NEW (Phase 10): compiled skill schema cache
│   └── HookOrchestrator.js        (existing)
├── io/
│   ├── EmbodimentBus.js           (existing — extend with briefMode batch flush)
│   ├── VirtualEmbodiment.js       (existing — extend with cold-start seeding)
│   ├── BriefFormatter.js          ← NEW (Phase 10): abbreviated event formatting
│   └── channels/                  (existing)
├── memory/
│   ├── SemanticMemory.js          (existing — extend with write-verify, ping())
│   ├── Embedder.js                (existing)
│   ├── MemorySnapshot.js          ← NEW (Phase 7): snapshot capture and comparison
│   └── ObservationMerger.js       ← NEW (Phase 10): pre-snapshot synthesis pass

agent/src/metta/
├── AgentLoop.metta                 (existing — extend agent-init, session-boundary-protocol)
├── ContextBuilder.metta            (existing — add STARTUP_ORIENT, TASKS, cachedSchemaRegistry)
├── skills.metta                    (existing — extend with all new skill declarations)
├── safety.metta                    (existing — extend with task-list, briefMode, metta rules)
├── hooks.metta                     (existing)
├── coordinator.metta               ← NEW (Phase 9)
└── capabilities.metta              ← NEW (Phase 10): env-profile atom, circuit-breaker queries

memory/
├── snapshots/                      ← NEW (Phase 7): rolling window of 10 snapshot files
│   └── snap_*.metta
├── tasks/
│   └── tasks.metta                 ← NEW (Phase 7): task list atoms
├── triggers/
│   └── triggers.metta              ← NEW (Phase 9): trigger and sleep atoms
├── traces/
│   └── traces.metta                ← NEW (Phase 7): action trace atoms (7-day retention)
├── coordinator/
│   └── coordinator.metta           ← NEW (Phase 9): worker-state atoms
├── harness/
│   └── prompt.metta               (existing)
├── history.metta                   (existing)
└── audit.metta                     (existing)
```

### Anthropic-Pattern Equivalents (all phases)

| Anthropic Artifact | MeTTa-native Equivalent | Phase |
|---|---|---|
| `claude-progress.txt` | `session-checkpoint` atom in `history.metta` | 7 |
| `feature_list.json` | `task` atoms in `memory/tasks/tasks.metta` | 7 |
| `init.sh` | `agent-init` startup protocol in `AgentLoop.metta` | 7 |
| `AGENT_MEMORY_SNAPSHOT` | `memory-snapshot` atoms in `memory/snapshots/` | 7 |
| Playwright E2E trace | `action-trace-event` atoms in `memory/traces/` | 7 |
| `.env` profile selection | `EnvDetector.js` + `env-profile` atom | 10 |
| Health check script | `/health` `/ready` on TriggerDispatcher Express | 10 |
| Input validation middleware | `SanitizationPipeline.js` in `SkillDispatcher` | 10 |
| Retry/circuit breaker lib | `GracefulDegradation.js` + circuit-breaker atoms | 10 |

---

## 20. Design Rationale (Phase 10)

**Write-Verify Prevents Silent Corruption**: Index corruption from mid-write failure is rare but catastrophic — the system believes it has a fact it cannot retrieve. The cost of one extra read per write is negligible against the cost of a corrupted task or memory atom discovered mid-session. Verify or rollback; never leave the index in an inconsistent state.

**Input Sanitization Is a Separate Concern from Consequence Inference**: `SafetyLayer` reasons about *what a skill does* — its semantic consequences. `SanitizationPipeline` reasons about *what a skill receives* — whether the input itself is an attack. These are different threat models. A consequence rule blocks "write to agent.json because that's capability modification." A sanitization rule blocks "write to `../agent.json`" because that's path traversal regardless of what file is targeted. Both layers are needed.

**Health Endpoints Belong on the Existing HTTP Server**: `TriggerDispatcher` already runs Express. Adding `/health` and `/ready` to the same server avoids a second listener, reuses the same localhost-only binding, and ensures health status reflects the same process that handles webhooks. Zero additional infrastructure cost.

**Graceful Degradation Is an Atoms-First Problem**: Circuit breakers are typically implemented as in-memory state, which means they reset on process restart. Storing circuit-breaker state as atoms in `SemanticMemory` means the agent knows a dependency was flaky the last time it ran — and can factor that into its planning. This is a qualitatively different capability than an in-memory breaker: the agent can query `(circuit-status "anthropic-api")` and see the failure history.

**Cap? Caching Is Safe Because Capabilities Are Cycle-Stable**: The only mechanism that changes capabilities mid-session is `HarnessOptimizer` writing candidate harness changes — which explicitly calls `CapabilityCache.invalidate()`. Outside of that path, capabilities are stable within a cycle. Caching them per-cycle eliminates redundant MeTTa evaluation without any risk of stale reads.

**Parallel Dispatch Requires Explicit Dependency Annotation**: Implicit dependency detection (heuristic file path overlap) is unreliable. The right design is to make dependencies explicit — the `:depends-on` field in task atoms. This means agents must declare dependencies when creating tasks, which is a higher bar than implicit detection but produces a correct dependency graph. The heuristic (shared file paths) is a secondary signal, not the primary one.

**Observation Merger vs. Memory Consolidation**: These operate on different time horizons with different goals. Merger runs at session boundaries, on recent observations, to produce clean pre-snapshot state. Consolidation runs mid-session, on the full atom store, to manage long-term health. They are not alternatives; they are different phases of the same memory hygiene concern. Merger makes consolidation easier by reducing fragmentation before it accumulates.

**Brief Mode Is About Signal-to-Noise, Not Suppression**: The goal is not to hide what the agent is doing — it is to prevent the background agent from dominating the interface during autonomous operation. Full audit records still exist in `AuditSpace` and `ActionTraceSpace`. Brief mode only affects the *notification channel output* — what the human or primary interface sees in real time. The record is complete; the signal is compressed.

**Explainable Authorization Changes the Agent's Learning Loop**: Without explanation, blocked actions are opaque — the agent knows it was stopped but not why. With block explanations in `&wm`, the agent can reason: "I tried (write-file "agent.json" ...) and learned that causes `capability-self-modification :high`. I should use `propose-harness-change` instead." This is the mechanism by which the agent develops correct mental models of its own permission structure — without human intervention, purely from observing its own blocked actions.

**Schema Caching Is Safe Because `skills.metta` Writes Are Audited**: The cache is invalidated on any `write-file` to `skills.metta`. Since all file writes go through `SkillDispatcher`, and `SkillDispatcher` is the component that reads from `SkillSchemaCache`, the invalidation call is in the same code path as the write. External writes to `skills.metta` (bypassing `SkillDispatcher`) would bypass the cache too — but those are blocked by `SafetyLayer` when `safetyLayer` is enabled.

---

*End of METTACLAW.ultimate.md*
