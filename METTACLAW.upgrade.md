# METTACLAW.upgrade.md — Anthropic Parity & Dominance Specification

> **Addendum to METTACLAW.md + METTACLAW.update.md**  
> **Version:** 1.0 (April 2026)  
> **Status:** Proposed

This document closes every actionable gap identified in Anthropic's published harness designs (harness-design-long-running-apps, effective-harnesses-for-long-running-agents) while leveraging MeTTa's symbolic hypergraph foundation to achieve **dominance** — not mere parity — in reliability, verifiability, self-improvement, and long-running autonomy.

Anthropic's harnesses are LLM-native workarounds for context collapse, self-evaluation bias, and stateless sessions. MeTTaClaw is already a native symbolic control plane. This spec fuses their best patterns into first-class MeTTa constructs so the agent becomes provably coherent, auditable, and self-evolving rather than prompt-engineered.

---

## Table of Contents

1. [Gap Closure Summary](#1-gap-closure-summary)
2. [New Capability Flags](#2-new-capability-flags)
3. [Session Startup Protocol](#3-session-startup-protocol)
4. [Context Reset Protocol](#4-context-reset-protocol)
5. [Sprint Contracts](#5-sprint-contracts)
6. [Separate Evaluator](#6-separate-evaluator)
7. [Background Triggers (KAIROS Layer)](#7-background-triggers-kairos-layer)
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
| Context resets beat compaction | `loopBudget` terminates but no checkpoint protocol | §4 Context Reset Protocol: checkpoint-before-wipe, structured restart |
| Separate generator/evaluator | `selfEvaluation` self-grades (anti-pattern) | §6 Separate Evaluator: isolated sub-agent with no generator context |
| Feature list immutability (one task at a time) | `goalPursuit` atoms but no structural constraint | §5 Sprint Contracts: acceptance criteria locked at creation |
| Session startup ritual | No orient-first protocol in `AgentLoop.metta` | §3 Session Startup Protocol: explicit startup phase in loop |
| Sprint contracts (planner–executor negotiation) | No formalized handoff | §5 Sprint Contracts: atom-typed contracts with NAL entailment |
| 24/7 background / cron / webhook / sleep+resume | `autonomousLoop` but no external triggers | §7 Background Triggers: first-class trigger and sleep atoms |
| Coordinator mode for multi-worker | `multiModelRouting` has no coordinator role | §8 Symbolic Coordinator: NAL-orchestrated worker hypergraph |
| Playwright/Puppeteer E2E + behavioral replay | `multiEmbodiment` but no action tracing | §9 Action Trace: typed action atoms, shadow-space replay |
| AGENT_MEMORY_SNAPSHOT across session wipes | `memoryConsolidation` prunes but no point-in-time capture | §10 Memory Snapshots: queryable, mergeable snapshot atoms |

**Dominance thesis:** Where Anthropic uses files + prompts + external tools as crutches, MeTTaClaw uses typed hypergraph atoms + NAL inference as the native substrate. Every Anthropic pattern becomes a MeTTa-native primitive that is self-describing, provably correct, and self-modifying.

---

## 2. New Capability Flags

These rows extend §2.2 (Evolution Tier) and §2.3 (Experimental Tier) of METTACLAW.md.

### 2.1 Evolution Tier Additions

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `sprintContracts` | `false` | Formal sprint-contract atoms with locked acceptance criteria; agent works one contract at a time; only `:status` fields are mutable by the generator | Requires `goalPursuit`; contracts that cannot be satisfied block progress without a resolution path |
| `separateEvaluator` | `false` | Evaluation of artifacts is delegated to an isolated sub-agent that receives the artifact and criteria but not the generator's reasoning; eliminates self-evaluation bias | Requires `subAgentSpawning`; doubles LLM calls per evaluated artifact; evaluation model should differ from generator |
| `backgroundTriggers` | `false` | First-class trigger atoms (`cron`, `webhook`, `file-watch`, `goal-completion`) and sleep atoms with structured resume; `TriggerDispatcher.js` fires goals on schedule | **Medium.** External triggers can fire during sessions; webhook endpoints expose attack surface; requires careful allowlisting |
| `coordinatorMode` | `false` | `CoordinatorSpace` maintains NAL-scored hypergraph of active workers; assigns tasks, detects deadlocks, rebalances; activates automatically when `multiEmbodiment` has >1 worker embodiment | **Medium.** Coordinator inference adds overhead; misclassification of worker state can cause task loss or duplication |
| `actionTrace` | `false` | Every skill execution produces a typed `action-trace-event` atom in an append-only `ActionTraceSpace`; enables behavioral replay and shadow-space counterfactual verification | Storage growth (separate from `auditLog`); trace atoms include full skill args and results |

### 2.2 Experimental Tier Additions

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `memorySnapshots` | `false` | Point-in-time `memory-snapshot` atoms captured at session boundaries and before harness changes; snapshots are queryable across time; NAL revision can span sessions via snapshot comparison | **Low-Medium.** Snapshot writes are large; storage accumulates; requires periodic snapshot pruning policy |

### 2.3 Dependency Additions

Append to §2.4 of METTACLAW.md:

```
sprintContracts       → goalPursuit, semanticMemory
separateEvaluator     → subAgentSpawning, sprintContracts
backgroundTriggers    → autonomousLoop, virtualEmbodiment
coordinatorMode       → multiEmbodiment, multiModelRouting
actionTrace           → auditLog
memorySnapshots       → memoryConsolidation, semanticMemory
```

### 2.4 Profile Updates

Add `separateEvaluator`, `sprintContracts`, and `actionTrace` to the `full` profile. Add `actionTrace` to the `evolved` profile (low risk, high observability value).

---

## 3. Session Startup Protocol

### 3.1 Problem

Article 2's most concrete finding: agents that start executing without first reading their own state produce inconsistent results. The existing `agent-start` → `agent-init` → `agent-loop` path does not specify what `agent-init` does, creating implicit state that varies between runs.

### 3.2 Extended `agent-init`

Extend `AgentLoop.metta` §5.1. `agent-init` is the startup phase; it runs once before the main loop:

```metta
(= (agent-init)
   (do
     ;; 1. Orient: read manifest and confirm capability state
     (let $m (manifest)
          (if (cap? runtimeIntrospection)
            (attend (atom->string $m) 0.9)  ; high-priority WM entry
            ()))

     ;; 2. Restore session checkpoint (if any)
     (when (cap? persistentHistory)
       (let $cp (latest-session-checkpoint)
            (if (not (== $cp ()))
              (do (restore-goals-from-checkpoint $cp)
                  (restore-wm-from-checkpoint $cp))
              ())))

     ;; 3. Orient on active contracts (if sprintContracts enabled)
     (when (cap? sprintContracts)
       (let $active (query-active-contracts)
            (if (not (== $active ()))
              (attend (format-contracts $active) 0.85)
              ())))

     ;; 4. Scan recent failures from audit log
     (when (cap? auditLog)
       (let $fails (recent-audit-failures 5)
            (if (not (== $fails ()))
              (attend (format-failures $fails) 0.7)
              ())))

     ;; 5. Report ready
     (emit-cycle-audit :startup :complete)))
```

### 3.3 Session Startup Context Slot

The `build-context` function (JS grounded op, promoted to `ContextBuilder.metta` in Phase 6) gains a new `STARTUP_ORIENT` slot that is populated only on cycle 0 of a session (i.e., when `&cycle-count` has just been reset):

```
STARTUP_ORIENT — 2,000 chars — populated from session checkpoint + active contracts on first cycle only
```

This slot sits at the top of context, before `PINNED`, ensuring the agent orients before processing any task. It is cleared after cycle 0 (not re-assembled every cycle).

### 3.4 Grounded Ops Required

New grounded ops registered in `AgentBuilder.buildMeTTaLoop()`:

```javascript
interp.registerOp('latest-session-checkpoint', () => SessionManager.getLatestCheckpoint())
interp.registerOp('restore-goals-from-checkpoint', (cp) => GoalManager.restoreFrom(cp))
interp.registerOp('restore-wm-from-checkpoint', (cp) => WMManager.restoreFrom(cp))
interp.registerOp('query-active-contracts', () => ContractManager.getActive())  // if sprintContracts
interp.registerOp('recent-audit-failures', (n) => AuditSpace.getRecentFailures(n))
```

`SessionManager` is a thin module (~50 lines) that reads/writes `session-checkpoint` atoms to `history.metta`.

---

## 4. Context Reset Protocol

### 4.1 Problem

Article 1's most impactful finding: **context resets beat compaction.** The existing design relies primarily on `memoryConsolidation` (compaction strategy) to manage long context. The `loopBudget` exhaustion path restarts the loop but does not checkpoint state, resulting in silent context loss.

### 4.2 Checkpoint-Before-Reset

Extend the `agent-loop` termination branch in `AgentLoop.metta` §5.1. When budget exhausts (k → 0):

```metta
(= (agent-loop 0)
   (do
     ;; CHECKPOINT PHASE (before any context wipe)
     (when (cap? persistentHistory)
       (emit-session-checkpoint))

     ;; RESET PHASE
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))))

(= (emit-session-checkpoint)
   (let*
     (($goals   (if (cap? goalPursuit) (get-active-goals) ()))
      ($wm      (get-state &wm))
      ($cycle   (get-state &cycle-count))
      ($snap-id (if (cap? memorySnapshots) (trigger-snapshot :session-boundary) ()))
      ($cp      (session-checkpoint
                  :id          (gen-id "cp")
                  :cycle       $cycle
                  :timestamp   (now)
                  :active-goals $goals
                  :wm-priority  (filter-wm-above $wm 0.6)   ; only high-priority WM survives
                  :snapshot-ref $snap-id)))
     (append-to-history $cp)))
```

### 4.3 What Survives a Reset

| State | Survives? | Mechanism |
|---|---|---|
| `SemanticMemory` atoms | Yes | `PersistentSpace` — not in context window |
| `AuditSpace` atoms | Yes | `PersistentSpace` — not in context window |
| `&wm` entries with priority > 0.6 | Yes | Written to `session-checkpoint`, restored by `agent-init` |
| `&wm` entries with priority ≤ 0.6 | No | Ephemeral; context wipe is a feature for low-priority items |
| Active goals | Yes | Written to `session-checkpoint`, restored by `agent-init` |
| Open sprint contracts | Yes | Atom in `SemanticMemory`; contract `:status` persists |
| In-flight skill calls | No | Abort on budget exhaustion; skill handlers are idempotent |
| Context window content | No | This is the point. Old context is noise after budget; atom-based state is the signal |

### 4.4 Reset vs. Consolidation

`memoryConsolidation` (Phase 6) prunes and merges atoms within a running session. Context reset is a different operation — it wipes the *context window* while preserving atoms. These are complementary:

- `memoryConsolidation` → runs mid-session, keeps atom store clean
- Context reset → fires at budget boundary, gives the model a fresh window to reason in

The key insight from Article 1: a fresh context window with accurate atom-retrieved facts outperforms a full context window with accumulated confusion. The atom store is the persistent layer; the context window is a scratch pad.

---

## 5. Sprint Contracts

### 5.1 Purpose

Addresses two pathologies identified in Article 2:
1. **Premature completion**: agent marks task done without real verification
2. **Scope creep**: agent rewrites task criteria mid-execution

Article 2 used a JSON feature list with `passes` as the only mutable field. Sprint contracts are the MeTTa-native version: a typed atom graph where the structure is locked at creation and only `:status` fields change.

### 5.2 Contract Atom Format

```metta
(sprint-contract
  :id          "sc_20260402_abc"
  :goal        "Implement new-chat-button with hover state and keyboard shortcut"
  :created-cycle 142
  :iteration   0
  :max-iterations 5
  :status      :open           ; :open | :in-progress | :evaluating | :complete | :abandoned
  :criteria    (
    (criterion :id "c1" :description "Button renders in nav bar"
               :eval (feature-renders? "new-chat-button")
               :status :pending)   ; :pending | :passing | :failing
    (criterion :id "c2" :description "Hover state visible"
               :eval (visual-check? "new-chat-button" :hover)
               :status :pending)
    (criterion :id "c3" :description "Ctrl+N triggers new chat"
               :eval (keybinding-works? "ctrl+n" "new-chat")
               :status :pending))
  :generator-context  "You are implementing feature X. Your goal is: ..."
  :evaluator-context  "Evaluate this artifact against the criteria below. ..."  ; no generator reasoning
  :artifacts          ()         ; space-refs added by generator during execution
  :eval-result        ()         ; (eval-result ...) atom added by evaluator
  :completed-cycle    ())
```

**Immutability rule**: The `:goal`, `:criteria` descriptions, `:eval` expressions, `:generator-context`, and `:evaluator-context` fields are write-once. Only these fields change after creation: `:status`, `:iteration`, `:artifacts`, `:eval-result`, `:completed-cycle`.

This is enforced structurally: `ContractManager.updateContract()` rejects writes to locked fields and emits `(audit-event :type :contract-field-violation ...)`.

### 5.3 One Contract At a Time

When `sprintContracts` is enabled:

- `generate-self-task` (in `VirtualEmbodiment`) checks `ContractManager.getActive()` before generating new tasks. If an open contract exists, it generates tasks only within the scope of that contract.
- `(set-goal ...)` is still available but is demoted: goals spawn contracts through `ContractManager.createFromGoal()`, not directly. This ensures every goal becomes a verifiable contract.
- `autonomousLoop` idle cycles do not open new contracts while one is `:in-progress`.

### 5.4 Contract Lifecycle

```
(create-contract goal criteria) 
  → status :open
  → generator receives :generator-context

(start-contract id)
  → status :in-progress
  → generator works; appends artifact space-refs

(request-evaluation id)
  → status :evaluating
  → evaluator sub-agent invoked (if separateEvaluator) OR symbolic check (if only sprintContracts)

(evaluation-complete id eval-result)
  → if all criteria :passing → status :complete, emit audit
  → if any criteria :failing and iteration < max-iterations → status :in-progress, iteration++
  → if iteration >= max-iterations → status :abandoned, emit audit

(abandon-contract id reason)
  → status :abandoned, record reason atom
```

### 5.5 Symbolic Evaluation (Without `separateEvaluator`)

When `sprintContracts` is enabled but `separateEvaluator` is not, criteria evaluation is symbolic-only:

```metta
;; Evaluation predicates registered as grounded ops
(= (feature-renders? $selector)   (js-dom-check $selector :exists))
(= (visual-check? $selector $state) (js-dom-check $selector $state))
(= (keybinding-works? $key $action) (js-event-test $key $action))
```

These predicates are registered as grounded ops delegating to `EmbodimentVerifier.js` (§9). They are MeTTa-callable, so the agent can run `(metta (feature-renders? "new-chat-button"))` directly and get a truth value back.

### 5.6 New Skills

```metta
(skill create-contract  (String SExpr) sprintContracts :meta "Create sprint contract with goal and criteria list")
(skill start-contract   (String)       sprintContracts :meta "Transition contract to :in-progress")
(skill eval-contract    (String)       sprintContracts :meta "Request evaluation of active contract")
(skill list-contracts   ()             sprintContracts :meta "List all contracts with their current status")
```

---

## 6. Separate Evaluator

### 6.1 Problem

Article 1's clearest finding: *agents confidently praise mediocre work*. The existing `selfEvaluation` flag (§2.3 Experimental) is a self-grading anti-pattern — the same agent that produced the artifact evaluates it.

### 6.2 Design

When `separateEvaluator` is enabled, `eval-contract` spawns an evaluation sub-agent with strict context isolation:

```metta
(= (run-separate-evaluation $contract-id)
   (let*
     (($contract  (get-contract $contract-id))
      ($artifacts (contract-artifacts $contract))
      ($criteria  (contract-criteria $contract))
      ($eval-ctx  (contract-evaluator-context $contract))  ; no generator reasoning
      ($eval-task (format-eval-task $eval-ctx $artifacts $criteria))
      ($result    (spawn-agent $eval-task 10)))            ; 10-cycle budget
     (process-eval-result $contract-id $result)))
```

The evaluator sub-agent receives:
- The artifact content (files, outputs, rendered results)
- The evaluation criteria from the contract
- The `evaluator-context` string (not the generator's reasoning chain)
- A fresh SemanticMemory snapshot from before the generation task (no contamination)

The evaluator sub-agent does **not** receive:
- The generator's chain of thought
- The generation session's `&wm` contents
- Any context about how the artifact was produced

This is the key isolation. The evaluator sees only: "Here is what was produced. Here are the criteria. Does it pass?"

### 6.3 Model Routing for Evaluation

When `multiModelRouting` is enabled, the evaluator sub-agent routes to the `:introspection` task type, which tends to route to a different model than `:code` (the generator's typical task type). This creates natural model diversity in the generator–evaluator pair.

```metta
(= (format-eval-task $ctx $artifacts $criteria)
   (task-spec
     :type   :introspection    ; routes to different model than :code generator
     :context $ctx
     :artifacts $artifacts
     :criteria $criteria
     :output-format "(eval-result :criteria (...) :overall-pass Bool :failures (list ...) :score (stv F C))"))
```

### 6.4 Relationship to `selfEvaluation`

`selfEvaluation` (existing experimental flag) is not removed — it serves a different function: scoring the agent's conversational output quality against stored preference atoms. `separateEvaluator` is specifically for artifact evaluation within `sprintContracts`.

When both are enabled: `selfEvaluation` runs as a periodic self-task; `separateEvaluator` runs per-contract at evaluation time. They are independent.

---

## 7. Background Triggers (KAIROS Layer)

### 7.1 Problem

`autonomousLoop` runs continuously when idle, but it has no native concept of scheduled activation or sleep. There is no way to say "check this repository at midnight" or "resume this goal when this webhook fires." The agent either runs or halts; it cannot sleep.

### 7.2 Trigger Atom

```metta
(trigger-atom
  :id           "trig_1"
  :type         :cron             ; :cron | :webhook | :file-watch | :goal-completion | :signal
  :spec         "0 0 * * *"       ; cron: cron-spec; webhook: URL path; file-watch: glob; goal-completion: goal-id
  :action       (resume-goal (space-ref GoalSpace/nightly-audit))
  :enabled      true
  :last-fired   ()
  :fire-count   0)
```

Triggers are stored as atoms in `SemanticMemory` (`:type :procedural`) and survive restarts. `TriggerDispatcher.js` reads them on startup and re-arms the schedule.

### 7.3 Sleep Atom

```metta
(sleep-atom
  :id           "sleep_1"
  :reason       "Waiting for deployment to complete"
  :resume-at    (timestamp 2026-04-03T12:00:00)   ; absolute timestamp
  :resume-trigger (or :timestamp :webhook-signal)  ; either/or resume condition
  :resume-goal  (space-ref GoalSpace/verify-deployment)
  :checkpoint   (space-ref checkpoint-id))
```

When the agent emits a `sleep-atom` (via `(sleep-until timestamp reason)` skill), `TriggerDispatcher.js` halts the autonomous loop and schedules a wakeup. The loop re-enters at `agent-init` on resume, which reads the most recent `session-checkpoint` and the `sleep-atom`'s `:resume-goal`.

### 7.4 `TriggerDispatcher.js`

**Location:** `agent/src/triggers/TriggerDispatcher.js`  
**Governed by:** `backgroundTriggers`

```javascript
class TriggerDispatcher {
  constructor(agentLoop, atomStore, config) {}
  
  async start()           // load trigger atoms, arm all active triggers
  async stop()            // disarm all triggers
  
  // Called when a trigger fires; injects task into VirtualEmbodiment queue
  async onTriggerFired(triggerId, context) {}
  
  // Called when agent emits sleep-atom; suspends autonomous loop
  async onSleepEmitted(sleepAtom) {}
  
  // Called by cron scheduler, webhook handler, file watcher
  async checkAndFire()    // called every minute by cron; checks all :cron triggers
}
```

Webhook triggers expose an HTTP listener (configurable port, localhost-only by default). Webhook paths are derived from trigger IDs — no dynamic path registration.

### 7.5 New Skills

```metta
(skill set-trigger     (SExpr)         backgroundTriggers :meta "Register a trigger atom")
(skill remove-trigger  (String)        backgroundTriggers :meta "Disable a trigger by id")
(skill list-triggers   ()              backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until     (Timestamp String) backgroundTriggers :meta "Sleep until timestamp, then resume with reason")
```

### 7.6 Safety

- `set-trigger` requires `safetyLayer` gate: webhook URLs are validated against an allowlist; cron specs are validated syntactically; file-watch globs must be within `cwd`.
- `sleep-until` maximum sleep duration is configurable (`maxSleepHours`, default 24). Longer sleeps require explicit config override.
- All trigger firings emit `(audit-event :type :trigger-fired ...)`.

---

## 8. Symbolic Coordinator

### 8.1 Problem

`multiModelRouting` routes tasks to models by task type, but it is stateless about worker *availability and current state*. There is no concept of workers being busy, stuck, or having failed. When `multiEmbodiment` has multiple active channels, there is no coordinator tracking their states.

### 8.2 CoordinatorSpace

When `coordinatorMode` is enabled, a new `CoordinatorSpace` PersistentSpace is created. It holds `worker-state` atoms:

```metta
(worker-state
  :id          "worker-claude-2"
  :type        :model            ; :model | :channel | :subprocess | :sub-agent
  :task        (space-ref TaskSpace/task-17)
  :status      :busy             ; :idle | :busy | :stalled | :failed
  :last-active (timestamp 2026-04-02T10:30:00)
  :task-type   :code
  :score       (stv 0.82 0.71)   ; NAL score for current task type
  :assigned-cycle 142)
```

### 8.3 Coordinator Inference

NAL multi-goal inference operates over `CoordinatorSpace` to:

1. **Assign tasks**: When a new task arrives, score all `:idle` workers by their NAL score for the task's type. Assign to highest-expectation worker.
2. **Detect stalls**: If a worker's `last-active` timestamp is `> stall-threshold` (default 10 minutes) and status is `:busy`, infer `:stalled`.
3. **Rebalance on failure**: When a worker emits `:failed`, NAL revision updates its `model-score` for that task type and reassigns the task.
4. **Deadlock detection**: If all workers are `:busy` and the task queue is non-empty, emit `(audit-event :type :coordinator-deadlock)` and trigger reassignment.

```metta
;; Coordinator inference rule (in coordinator.metta)
(= (best-worker-for $task-type)
   (argmax-by
     (filter-workers :idle)
     (lambda $w (nal-expectation (worker-score $w $task-type)))))

(= (is-stalled? $worker)
   (and (== (worker-status $worker) :busy)
        (> (time-since (worker-last-active $worker))
           (get-config "coordinator.stallThresholdMs"))))
```

### 8.4 Relationship to Existing Components

`CoordinatorSpace` is not a replacement for `ModelRouter`. The relationship:
- `ModelRouter`: routes single LLM calls by task type (request-level)
- `CoordinatorSpace`: tracks multi-step work assignment across multiple workers (task-level)

When both are enabled, coordinator assignment uses `ModelRouter.getExpectedScore()` as its scoring function, so NAL model scores flow upward into coordinator decisions.

### 8.5 New Skills

```metta
(skill assign-task     (String String) coordinatorMode :meta "Assign task to specific worker by id")
(skill worker-status   ()              coordinatorMode :meta "List current worker states from CoordinatorSpace")
(skill rebalance       ()              coordinatorMode :meta "Trigger immediate coordinator rebalancing pass")
```

---

## 9. Action Trace

### 9.1 Distinction from AuditLog

`auditLog` records **decisions** (skill blocked, LLM called, memory written, harness modified). `actionTrace` records **execution telemetry** (every skill execution, its args, result, and timing), enabling:
- Behavioral replay against a shadow MeTTa space
- Regression detection after harness changes
- Counterfactual analysis ("what if this skill had failed?")
- E2E verification equivalent to Playwright/Puppeteer but at the atom level

### 9.2 ActionTraceEvent Atom

```metta
(action-trace-event
  :id           "act_20260402_abc"
  :timestamp    1743600000000
  :cycle        142
  :skill        (write-file "memory/foo.md" "...")   ; full call with args
  :result       :success              ; :success | :failure | :blocked
  :return-value "ok"                  ; truncated to 500 chars
  :duration-ms  12
  :model        "claude-sonnet-4-6"   ; model that generated this skill call
  :embodiment   "virtual-self"
  :contract-id  "sc_20260402_abc")    ; nil if not within a sprint contract
```

Stored in `ActionTraceSpace` — a separate `PersistentSpace` from `AuditSpace`. This separation allows `actionTrace` to be enabled independently of `auditLog` and allows different retention policies (action traces can be more aggressively pruned).

### 9.3 Shadow-Space Replay

When `actionTrace` and `harnessOptimization` are both enabled, `HarnessOptimizer` gains the ability to replay a sequence of `action-trace-event` atoms against a shadow `MeTTaInterpreter` instance:

```javascript
// In HarnessOptimizer.js — new method
async replayTraceInShadow(traceAtoms, candidateHarness) {
  const shadow = new MeTTaInterpreter(candidateHarness);
  const results = [];
  for (const event of traceAtoms) {
    const result = await shadow.evalSkill(event.skill, event.args);
    results.push({ expected: event.result, actual: result });
  }
  return this.compareTraceResults(results);
}
```

This replaces the current "replay sampled tasks" step in §5.8.1 with a deterministic replay over actual recorded behavior — no LLM call needed for replay.

### 9.4 `ActionTraceSpace.js`

**Location:** `agent/src/safety/ActionTraceSpace.js`  
**Governed by:** `actionTrace`

API mirrors `AuditSpace.js`:
```javascript
export class ActionTraceSpace {
  static emit(skillCall, result, metadata) {}  // append to trace
  static getRecent(n)                   {}  // last N events
  static getForContract(contractId)     {}  // events within a contract
  static getForCycle(cycle)             {}  // events within a cycle
  static prune(beforeTimestamp)         {}  // remove old events
}
```

`SkillDispatcher.execute()` calls `ActionTraceSpace.emit()` after each skill, when `actionTrace` is enabled. This is a single line after the existing audit emit.

---

## 10. Memory Snapshots

### 10.1 Distinction from `memoryConsolidation`

`memoryConsolidation` (Phase 6) **prunes and merges** atoms mid-session — it is destructive by design. `memorySnapshots` captures **point-in-time state** non-destructively:

| Operation | `memoryConsolidation` | `memorySnapshots` |
|---|---|---|
| Timing | Every N cycles, mid-session | Session boundaries, pre-harness-change |
| Effect on atoms | Prunes, merges, decays | Non-destructive; snapshot is a read-only copy |
| Queryability | Current state only | Any snapshot by timestamp |
| NAL revision | Happens inline during consolidation | Can compare snapshot N-1 → N to derive revisions |
| Article analogy | Periodic GC | `AGENT_MEMORY_SNAPSHOT` checkpoint file |

### 10.2 Snapshot Atom

```metta
(memory-snapshot
  :id                    "snap_20260402_abc"
  :timestamp             1743600000000
  :cycle                 142
  :trigger               :session-boundary  ; :session-boundary | :pre-harness-change | :explicit | :scheduled
  :atom-count            847
  :space-ref             "memory/snapshots/snap_20260402_abc.metta"
  :consolidated-from     ("snap_20260401_xyz")   ; parent snapshots
  :confidence-threshold  0.92                    ; atoms below this were pruned before snapshot
  :nal-revision-pending  ())                     ; revision atoms to apply on next consolidation
```

### 10.3 Snapshot Triggers

Snapshots are triggered automatically in three situations:

1. **Session boundary** (`emit-session-checkpoint` calls `trigger-snapshot :session-boundary` when `memorySnapshots` enabled)
2. **Pre-harness-change** (`HarnessOptimizer` calls `trigger-snapshot :pre-harness-change` before writing a candidate)
3. **Explicit** (`(take-snapshot)` skill call)

### 10.4 Cross-Session NAL Revision

Snapshots enable a capability that consolidation alone cannot: comparing atom truth values across sessions to derive NAL revision weights.

```metta
;; Snapshot comparison: identify atoms whose truth drifted significantly
(= (snapshot-drift $snap-id-before $snap-id-after)
   (let*
     (($before (load-snapshot $snap-id-before))
      ($after  (load-snapshot $snap-id-after))
      ($pairs  (match-atoms-by-content $before $after)))
     (filter-by (lambda $p (> (truth-delta (fst $p) (snd $p)) 0.1)) $pairs)))
```

`memoryConsolidation` in Phase 6 currently applies NAL revision within a single session. With snapshots, the consolidation self-task can additionally apply `snapshot-drift` to catch beliefs that have systematically changed across multiple sessions.

### 10.5 New Skills

```metta
(skill take-snapshot    ()      memorySnapshots :meta "Capture a memory snapshot immediately")
(skill list-snapshots   ()      memorySnapshots :meta "List all memory snapshots with timestamps")
(skill compare-snapshots (String String) memorySnapshots :meta "Compute NAL drift between two snapshots")
```

---

## 11. Phase Plan Extensions

These phases extend the existing Phase 1–6 plan in §6 of METTACLAW.md. They do not block on Phase 6 being complete — Phase 7 can start when Phase 4 (Safety) and Phase 5 (Embodiment) are done.

### Phase 7 — Structural Reliability Layer

**Prerequisite:** Phase 4 (Safety), Phase 5 (Embodiment)  
**Unlocks:** `sprintContracts`, `actionTrace`, `memorySnapshots`, and the context reset / session startup protocols

**Deliverables:**

1. **Session Startup Protocol**: Implement `agent-init` extension (§3.2). Add `latest-session-checkpoint`, `restore-goals-from-checkpoint`, `restore-wm-from-checkpoint` grounded ops. Add `SessionManager.js` (~50 lines).
2. **Context Reset Protocol**: Extend `agent-loop` termination to call `emit-session-checkpoint` (§4.2). Implement `filter-wm-above`, `trigger-snapshot` grounded ops.
3. **Sprint Contracts**: Implement `ContractManager.js` — `createFromGoal()`, `updateContract()` (with immutability enforcement), `getActive()`. Add `CONTRACTS` context slot (1,500 chars) to `build-context`. Implement `create-contract`, `start-contract`, `eval-contract`, `list-contracts` skill handlers.
4. **Action Trace**: Implement `ActionTraceSpace.js`. Wire `SkillDispatcher.execute()` to emit after each skill. Implement `action-trace-event` atom format.
5. **Memory Snapshots**: Implement `MemorySnapshot.js` — `capture()`, `load()`, `compareSnapshots()`. Wire `emit-session-checkpoint` to call `trigger-snapshot`. Add `take-snapshot`, `list-snapshots`, `compare-snapshots` skill handlers.
6. **Update `agent.json` schema**: Add `sprintContracts`, `actionTrace`, `memorySnapshots` flags.
7. **Test**: Session restart reads checkpoint, restores goals and WM; contract locks on creation; `action-trace-event` emitted per skill; snapshot captured at session boundary; cross-session snapshot diff returns non-empty result after belief update.

### Phase 8 — Evaluation Independence

**Prerequisite:** Phase 6 (Meta-Harness), Phase 7 (Structural Reliability)  
**Unlocks:** `separateEvaluator`

**Deliverables:**

1. Implement evaluation context isolation: `ContractManager` exposes separate `:generator-context` and `:evaluator-context` fields; `spawn-agent` receives evaluator context only.
2. Implement `EvaluatorAgent` task spec format (§6.3): routes to `:introspection` task type, expects `(eval-result ...)` atom as output.
3. Implement `process-eval-result` in `ContractManager`: map evaluation output to per-criterion `:status` updates; trigger retry or completion.
4. Wire `actionTrace` into harness optimization: replace "replay sampled tasks" in `HarnessOptimizer` §5.8 with shadow-space replay over `ActionTraceSpace` atoms (§9.3).
5. Implement `EmbodimentVerifier.js` — JS grounded op implementations for `feature-renders?`, `visual-check?`, `keybinding-works?` (delegating to browser automation if available, returning `(stv 0.0 0.5)` stub if not).
6. Promote `selfEvaluation` from experimental to evolution tier once `separateEvaluator` is available as the more rigorous alternative.
7. **Test**: Generator produces artifact; evaluator sub-agent has no access to generator reasoning; criterion `(eval-result ...)` atom returned; failing criterion triggers contract iteration; passing all criteria marks contract `:complete`.

### Phase 9 — Autonomous Background & Coordination

**Prerequisite:** Phase 7 (Structural Reliability), Phase 8 (Evaluation Independence)  
**Unlocks:** `backgroundTriggers`, `coordinatorMode`

**Deliverables:**

1. Implement `TriggerDispatcher.js` with cron scheduler (use `node-cron` or equivalent), webhook listener (express, localhost-only by default), file watcher (`chokidar`).
2. Add trigger and sleep atoms to `SemanticMemory` schema. Implement `set-trigger`, `remove-trigger`, `list-triggers`, `sleep-until` skill handlers.
3. Implement `CoordinatorSpace.js` — `worker-state` atom CRUD, `bestWorkerFor()` using ModelRouter scores, `detectStalls()`, `rebalanceOnFailure()`.
4. Implement `coordinator.metta` — NAL inference rules for task assignment, stall detection, deadlock detection.
5. Wire `TriggerDispatcher` into `AgentBuilder.buildMeTTaLoop()` startup sequence.
6. Wire `CoordinatorSpace` into `ModelRouter.route()` — coordinator assignment takes precedence when >1 worker embodiment active.
7. **Test**: Cron trigger fires correctly on schedule; sleep/resume cycle restores to correct goal; stalled worker is detected and task reassigned; coordinator deadlock audit event fires when all workers busy.

---

## 12. New Skill Declarations

These extend `skills.metta` (§5.2 of METTACLAW.md):

```metta
;; Session / context management
(skill take-snapshot      ()                        memorySnapshots   :meta "Capture memory snapshot")
(skill list-snapshots     ()                        memorySnapshots   :meta "List snapshots by timestamp")
(skill compare-snapshots  (String String)           memorySnapshots   :meta "NAL drift between two snapshots")

;; Sprint contracts
(skill create-contract    (String SExpr)            sprintContracts   :meta "Create sprint contract with goal + criteria")
(skill start-contract     (String)                  sprintContracts   :meta "Begin work on contract")
(skill eval-contract      (String)                  sprintContracts   :meta "Request evaluation of active contract")
(skill list-contracts     ()                        sprintContracts   :meta "List contracts with status")

;; Background triggers
(skill set-trigger        (SExpr)                   backgroundTriggers :meta "Register trigger atom")
(skill remove-trigger     (String)                  backgroundTriggers :meta "Disable trigger by id")
(skill list-triggers      ()                        backgroundTriggers :meta "List all trigger atoms")
(skill sleep-until        (Timestamp String)        backgroundTriggers :meta "Sleep until timestamp, then resume")

;; Coordinator
(skill assign-task        (String String)           coordinatorMode   :meta "Assign task to worker by id")
(skill worker-status      ()                        coordinatorMode   :meta "List worker states")
(skill rebalance          ()                        coordinatorMode   :meta "Trigger coordinator rebalancing")
```

---

## 13. File Structure Additions

Add to §12 of METTACLAW.md:

```
agent/src/
├── session/
│   └── SessionManager.js          ← NEW: session-checkpoint read/write (§3)
├── contracts/
│   └── ContractManager.js         ← NEW: sprint contract lifecycle (§5)
├── triggers/
│   └── TriggerDispatcher.js       ← NEW: cron/webhook/sleep trigger engine (§7)
├── coordinator/
│   ├── CoordinatorSpace.js        ← NEW: worker-state atom store (§8)
│   └── coordinator.metta          ← NEW: NAL coordinator inference rules (§8)
├── safety/
│   ├── SafetyLayer.js             (existing)
│   ├── AuditSpace.js              (existing)
│   └── ActionTraceSpace.js        ← NEW: execution telemetry atoms (§9)
├── verification/
│   └── EmbodimentVerifier.js      ← NEW: symbolic criteria evaluation grounded ops (§5.5, §6)
└── memory/
    ├── SemanticMemory.js          (existing)
    └── MemorySnapshot.js          ← NEW: point-in-time snapshot atoms (§10)

memory/
├── snapshots/                     ← NEW: snapshot atom files
│   └── snap_*.metta
├── contracts/                     ← NEW: sprint contract atoms
│   └── contracts.metta
├── triggers/                      ← NEW: trigger and sleep atoms
│   └── triggers.metta
├── traces/                        ← NEW: action trace atoms
│   └── traces.metta               (separate from audit.metta)
├── harness/
│   └── prompt.metta               (existing)
├── history.metta                  (existing)
└── audit.metta                    (existing)
```

Superseded files table additions (§12):

| Old Pattern | Superseded By | Phase |
|---|---|---|
| `selfEvaluation` as primary eval | `separateEvaluator` sub-agent | 8 |
| Manual restart recovery | `session-checkpoint` + `agent-init` restore | 7 |
| Anthropic's `claude-progress.txt` | `session-checkpoint` atom in `history.metta` | 7 |
| Anthropic's `feature_list.json` | `sprint-contract` atoms in `contracts.metta` | 7 |

---

## 14. Design Rationale

### 14.1 Context Reset Over Compaction

Article 1 found that context resets outperform compaction because accumulated context is not just noisy — it's often *actively misleading*. The model develops false confidence in stale reasoning from earlier in the context. Atoms in `PersistentSpace` don't have this problem: they are retrieved by semantic similarity or explicit query, not accumulated blindly.

The design consequence: `loopBudget` exhaustion is a feature, not a failure mode. It forces the model to reason from the atom store rather than from context momentum. `memoryConsolidation` keeps the atom store clean; context resets keep the reasoning fresh.

### 14.2 Why Sprint Contracts Beat JSON Feature Lists

Article 2 used a JSON file with `passes: bool` because JSON is easy to write and read. But it had problems: the agent could accidentally edit criteria; the file was not queryable; truth values were binary. MeTTa atoms solve all three: write-once fields are enforced by `ContractManager`, atoms are queryable, and NAL truth values replace binary pass/fail. The `(stv 0.0 0.9)` starting value for unverified criteria encodes "we're 90% confident this is not yet passing" — more information than `false`.

### 14.3 Separate Evaluator Is Not Optional Quality

The finding that generators confidently praise their own work isn't a model bug — it's a structural property of how language models work. Given text they wrote plus a question "is this good?", they have a strong prior toward "yes." This is not fixable with better prompting. It requires a structural solution: a different agent with a different context. `separateEvaluator` is the structural solution.

The isolation requirement (evaluator sees artifact + criteria, not generator reasoning) is critical. Giving the evaluator the generator's reasoning chain defeats the purpose — the evaluator inherits the generator's confidence.

### 14.4 Triggers as Atoms, Not Cron Jobs

Traditional background scheduling uses cron jobs external to the agent — files on disk, system cron, external services. These are invisible to the agent's reasoning: it cannot query "what triggers exist?", cannot modify them via skill calls, and cannot reason about their relationship to goals.

Trigger atoms solve this: `(list-triggers)` gives the agent full visibility, `(set-trigger ...)` lets it register new ones under `safetyLayer` control, and the NAL `(stv ...)` confidence on trigger events allows the coordinator to reason about trigger reliability over time.

### 14.5 ActionTrace vs AuditLog

The separation follows different purposes: audit is about *accountability* (who did what, what was blocked, compliance record). Action trace is about *verification* (did the system behave correctly, can we replay and check). Mixing them would make the audit log enormous and the trace data hard to query. Separate PersistentSpaces with separate retention policies is the right call.

The shadow-space replay in §9.3 is the key payoff: it converts harness optimization from "replay tasks with an LLM and hope" (the current spec) into "replay recorded behavior deterministically against the candidate harness and compare outcomes." This is strictly more reliable.

### 14.6 Memory Snapshots as the Missing Time Dimension

`memoryConsolidation` operates in the present. `SemanticMemory` stores what's true now. Neither captures how truth values have changed over time. Snapshots add this time dimension: you can query "what did the agent believe about X three sessions ago?" and compare it to now.

This matters for `harnessOptimization`: if the harness change three sessions ago caused a systematic shift in belief patterns (beliefs about what models are good at, what topics are safe), snapshot comparison can detect this and flag it for review — something no amount of present-state inspection can reveal.

---

*This document is a complete addendum to METTACLAW.md + METTACLAW.update.md. All existing specs remain in force. Implementation follows the extended phase plan (§11) after Phase 6 is complete, with Phase 7 starting as soon as Phase 4 and Phase 5 are done.*
