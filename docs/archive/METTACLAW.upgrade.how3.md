# METTACLAW.upgrade.how3.md — Neuro-Symbolic Development Plan

> **Phases 7–9 Reimagined for SeNARS**  
> **Version:** 1.0 (April 2026)  
> **Status:** Ready for implementation

---

## Guiding Principle

**Expose, don't duplicate.** Every capability in the original spec maps to an existing SeNARS mechanism. The upgrade is not about building new systems — it's about **bridging NARS cognition to MeTTa control** and adding the few genuinely missing pieces.

| Anthropic Pattern | LLM-Agent Approach (how2) | Neuro-Symbolic Approach (how3) |
|---|---|---|
| Session checkpoint | `SessionManager.js` — parse MeTTa atoms from file | `nar.serialize()` / `nar.deserialize()` — already exists |
| Task list | `TaskManager.js` — new atom store + CRUD | NARS `GOAL` tasks in `Bag` + `Focus` — already exists |
| Context reset | Checkpoint + wipe + restore | NARS `Focus` sets — named attention contexts already exist |
| Separate evaluator | `spawn-agent` sub-agent with isolated prompt | NAL truth revision — evidence from independent sources naturally revises `{f, c}` |
| Action trace | `ActionTraceSpace.js` — new telemetry store | NARS `Stamp` derivation chains — every inference already tracked |
| Memory snapshot | `MemorySnapshot.js` — new capture system | `memory.serialize()` + `getBeliefDeltas(ts)` — already exists |
| Coordinator | `CoordinatorSpace.js` — new worker tracker | NARS `Focus` multi-set + urgency scheduling — already exists |
| Cron triggers | `node-cron` + trigger atoms | Goal urgency decay + lightweight cron bridge |
| Sleep/resume | Suspend loop + checkpoint | Goal urgency pause + `serialize()` + timed resume |

**Net result:** ~1,500 lines of duplicate systems → ~300 lines of neuro-symbolic bridges.

---

## Architecture: The Neuro-Symbolic Stack

```
┌─────────────────────────────────────────────────────┐
│  MeTTa Control Plane (AgentLoop.metta)              │
│  ┌─────────────────────────────────────────────┐    │
│  │  Grounded Ops — the bridge layer             │    │
│  │  (nar-goals, nar-serialize, nar-revision,    │    │
│  │   nar-stamps, nar-snapshot, nar-focus)       │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │                                   │
│  ┌──────────────▼──────────────────────────────┐    │
│  │  MeTTa Interpreter                           │    │
│  │  • ReactiveSpace (atoms, rules, inference)   │    │
│  │  • Extensions (ChannelExtension,             │    │
│  │    MemoryExtension, new NarsExtension)        │    │
│  └──────────────┬──────────────────────────────┘    │
└─────────────────┼───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│  NARS Cognitive Kernel                               │
│  ┌──────────────┬──────────────────────────────┐    │
│  │  Memory      │  TaskManager                  │    │
│  │  (Concepts,  │  (Goals !, Beliefs .,         │    │
│  │   Bags,      │   Questions ?)                │    │
│  │   Focus)     │                               │    │
│  └──────────────┴──────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │  StreamReasoner + RuleEngine                 │    │
│  │  (NAL inference, truth revision, stamps)     │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

The bridge is **one direction**: MeTTa queries and commands NARS. NARS does not call back into MeTTa except through grounded ops. This keeps the architecture clean.

---

## What Actually Needs Building

Only **five things** aren't already provided by the SeNARS stack:

| # | What | Why It's New | Est. Lines |
|---|---|---|---|
| 1 | **NarsExtension** — MeTTa grounded ops that expose NARS | Bridge layer: query goals, serialize, revision, stamps, snapshots, focus | ~120 |
| 2 | **Context slots** — STARTUP_ORIENT + TASKS in ContextBuilder | Context assembly needs to surface NARS state to the LLM | ~40 |
| 3 | **Webhook bridge** — lightweight HTTP → goal injection | Only genuinely new I/O mechanism | ~80 |
| 4 | **Sleep/resume** — timed suspension with checkpoint | Not in NARS (which runs continuously) | ~40 |
| 5 | **Safety rules** — protect new skill surfaces | Additions to `safety.metta` | ~10 |

**Total: ~290 lines of genuinely new code.** Everything else is wiring existing mechanisms together.

---

## Phase 7 — Structural Reliability (Neuro-Symbolic)

**Prerequisites:** Phases 1–6 (implemented)  
**Risk:** Low — all additions are bridges to existing systems

### 7.1 NarsExtension

**File:** `metta/src/extensions/NarsExtension.js` (~120 lines)

This is the single most important file in the upgrade. It exposes NARS's native cognitive structures as MeTTa grounded operations.

```js
export class NarsExtension {
  constructor(metta, agent) {
    this.metta = metta;
    this.agent = agent;  // Agent extends NAR
  }

  register() {
    const g = this.metta.ground;

    // ── Goals (replaces TaskManager) ─────────────────────
    g.register('nar-goals', (type) => {
      // type: 'active' | 'pending' | 'all'
      const nar = this.agent;
      const goals = nar.taskManager.findTasksByType('GOAL');
      const filtered = type?.name === 'active'
        ? goals.filter(t => t.budget.priority >= 0.5)
        : type?.name === 'pending'
        ? nar.taskManager.getTasksNeedingAttention({ minPriority: 0.3, limit: 10 })
        : goals;
      return Term.grounded(filtered.map(t => this._taskToAtom(t)));
    });

    g.register('nar-goal-add', (desc, priority) => {
      // Creates a GOAL task in NARS memory
      const nar = this.agent;
      const term = nar.parser.parse(`(${desc})!`);
      term.budget.priority = parseFloat(priority) || 0.5;
      nar.input(term);
      return Term.sym('ok');
    });

    g.register('nar-goal-complete', (termStr) => {
      // Remove goal from NARS (achieved)
      const nar = this.agent;
      const goals = nar.taskManager.findTasksByType('GOAL');
      const match = goals.find(g => g.term.toString().includes(String(termStr)));
      if (match) {
        nar.taskManager.removeTask(match.id);
        return Term.sym('ok');
      }
      return Term.sym('not-found');
    });

    g.register('nar-goal-status', (termStr) => {
      const nar = this.agent;
      const goals = nar.taskManager.findTasksByType('GOAL');
      const match = goals.find(g => g.term.toString().includes(String(termStr)));
      if (!match) return Term.grounded({ status: 'not-found' });
      return Term.grounded({
        status: match.budget.priority >= 0.5 ? 'active' : 'pending',
        priority: match.budget.priority,
        truth: match.truth ? { f: match.truth.f, c: match.truth.c } : null,
      });
    });

    // ── Serialization (replaces SessionManager) ──────────
    g.register('nar-serialize', () => {
      const state = this.agent.serialize();
      const path = `memory/sessions/session_${Date.now()}.json`;
      writeFileSync(path, JSON.stringify(state, null, 2));
      return Term.grounded({ path, cycleCount: state.cycleCount });
    });

    g.register('nar-deserialize', (path) => {
      const state = JSON.parse(readFileSync(String(path), 'utf8'));
      this.agent.deserialize(state);
      return Term.sym('ok');
    });

    g.register('nar-latest-session', () => {
      // Find most recent session file
      const files = readdirSync('memory/sessions').filter(f => f.endsWith('.json')).sort();
      return Term.grounded(files.length ? files[files.length - 1] : null);
    });

    // ── Belief dump (replaces MemorySnapshot) ────────────
    g.register('nar-snapshot', (trigger) => {
      const nar = this.agent;
      const beliefs = nar.getBeliefs();
      const goals = nar.getGoals();
      const path = `memory/snapshots/snap_${Date.now()}.json`;
      writeFileSync(path, JSON.stringify({
        trigger: trigger?.name ?? 'explicit',
        timestamp: Date.now(),
        cycleCount: nar.cycleCount,
        beliefs: beliefs.map(b => this._taskToAtom(b)),
        goals: goals.map(g => this._taskToAtom(g)),
      }, null, 2));
      return Term.grounded({ path, beliefCount: beliefs.length, goalCount: goals.length });
    });

    g.register('nar-snapshot-compare', (pathA, pathB, minDelta) => {
      const a = JSON.parse(readFileSync(String(pathA), 'utf8'));
      const b = JSON.parse(readFileSync(String(pathB), 'utf8'));
      const delta = parseFloat(minDelta) || 0.1;
      // Compare truth values by term
      const aBeliefs = new Map(a.beliefs.map(b => [b.term, b.truth]));
      const bBeliefs = new Map(b.beliefs.map(b => [b.term, b.truth]));
      const shifts = [];
      for (const [term, truthA] of aBeliefs) {
        const truthB = bBeliefs.get(term);
        if (truthB) {
          const d = Math.abs(truthA.f - truthB.f) + Math.abs(truthA.c - truthB.c);
          if (d >= delta) shifts.push({ term, truthA, truthB, delta: d });
        }
      }
      return Term.grounded(shifts);
    });

    // ── Derivation stamps (replaces ActionTraceSpace) ────
    g.register('nar-stamps', (termStr) => {
      const nar = this.agent;
      const concept = nar.memory.getConcept(String(termStr));
      if (!concept) return Term.grounded([]);
      const tasks = concept.getAllTasks();
      return Term.grounded(tasks.map(t => ({
        term: t.term.toString(),
        type: t.type,
        stampId: t.stamp.id,
        source: t.stamp.source,
        depth: t.stamp.depth,
        derivations: t.stamp.derivations?.slice(-5) ?? [],  // last 5 ancestors
        truth: t.truth ? { f: t.truth.f, c: t.truth.c } : null,
      })));
    });

    g.register('nar-recent-derivations', (n) => {
      const nar = this.agent;
      const recent = nar._streamReasoner?.metrics?.recentDerivations?.slice(-(parseInt(n) || 20)) ?? [];
      return Term.grounded(recent);
    });

    // ── Focus sets (replaces CoordinatorSpace) ───────────
    g.register('nar-focus-sets', () => {
      const nar = this.agent;
      const sets = nar.focus?.getFocusSets() ?? [];
      return Term.grounded(sets.map(s => ({
        name: s.name,
        taskCount: s.tasks?.length ?? 0,
        avgPriority: s.tasks?.reduce((sum, t) => sum + (t.budget?.priority ?? 0), 0) / (s.tasks?.length || 1),
      })));
    });

    g.register('nar-focus-create', (name) => {
      const nar = this.agent;
      nar.focus?.createFocusSet(String(name));
      return Term.sym('ok');
    });

    g.register('nar-focus-switch', (name) => {
      const nar = this.agent;
      nar.focus?.setCurrentFocus(String(name));
      return Term.sym('ok');
    });

    // ── NAL truth revision (replaces Separate Evaluator) ─
    g.register('nar-revision', (termStr, evidence) => {
      // Input new evidence for a term; NARS naturally revises truth values
      const nar = this.agent;
      const term = nar.parser.parse(`(${termStr}).`);
      const ev = evidence?.value ?? {};
      if (ev.f !== undefined && ev.c !== undefined) {
        term.truth = new Truth(ev.f, ev.c);
        term.budget.priority = 0.8;  // High priority for revision
        nar.input(term);
      }
      // Return current truth value after revision
      const concept = nar.memory.getConcept(String(termStr));
      if (!concept) return Term.grounded({ status: 'not-found' });
      const belief = concept.getHighestPriorityTask('BELIEF');
      return Term.grounded(belief?.truth ? { f: belief.truth.f, c: belief.truth.c } : { status: 'no-belief' });
    });

    // ── Query helpers ────────────────────────────────────
    g.register('nar-beliefs', (termStr, limit) => {
      const nar = this.agent;
      const beliefs = nar.getBeliefs();
      const filtered = termStr
        ? beliefs.filter(b => b.term.toString().includes(String(termStr)))
        : beliefs;
      return Term.grounded(filtered.slice(0, parseInt(limit) || 20).map(b => this._taskToAtom(b)));
    });

    g.register('nar-stats', () => {
      const nar = this.agent;
      return Term.grounded({
        cycleCount: nar.cycleCount,
        conceptCount: nar.memory.getConceptCount(),
        goalCount: nar.taskManager.findTasksByType('GOAL').length,
        beliefCount: nar.getBeliefs().length,
        focusSets: nar.focus?.getFocusSets()?.length ?? 0,
        ...nar.taskManager.getTaskStats(),
      });
    });
  }

  _taskToAtom(task) {
    return {
      term: task.term.toString(),
      type: task.type,
      priority: task.budget.priority,
      truth: task.truth ? { f: task.truth.f, c: task.truth.c } : null,
      stampId: task.stamp.id,
    };
  }
}
```

**What this replaces:**

| Original Plan Component | NarsExtension Grounded Ops | Lines Saved |
|---|---|---|
| `SessionManager.js` (~60) | `nar-serialize`, `nar-deserialize`, `nar-latest-session` | ~60 |
| `TaskManager.js` (~250) | `nar-goals`, `nar-goal-add`, `nar-goal-complete`, `nar-goal-status` | ~250 |
| `MemorySnapshot.js` (~150) | `nar-snapshot`, `nar-snapshot-compare` | ~150 |
| `ActionTraceSpace.js` (~100) | `nar-stamps`, `nar-recent-derivations` | ~100 |
| `CoordinatorSpace.js` (~150) | `nar-focus-sets`, `nar-focus-create`, `nar-focus-switch` | ~150 |
| Separate evaluator logic | `nar-revision` | ~80 |
| **Total** | **120 lines** | **~890 lines saved** |

### 7.2 ContextBuilder Extension

**File:** `agent/src/memory/ContextBuilder.js` (modify existing, +40 lines)

Add to `budgets`:
```js
startupOrientChars: 2000,
tasksChars: 1500,
```

Add to `_concat()` headers (insert at index 3, before `PINNED`):
```js
const headers = ['SYSTEM_PROMPT', 'CAPABILITIES', 'SKILLS', 'STARTUP_ORIENT', 'TASKS', 'PINNED', ...];
```

Constructor accepts optional `nar` parameter (the NAR/Agent instance).

**`_getStartupOrient(cycleCount)`** — populated only on cycle 0:
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
```

**`_getTasks()`** — all active goals from NARS:
```js
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

Update `build()` to accept `cycleCount` and pass WM entries directly:
```js
async build(msg, cycleCount = 0) {
  // Pass WM entries directly instead of reading from config._wmEntries
  this.config._wmEntries = this._wmEntries || [];
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

### 7.3 Agent.js Extensions

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

Register NarsExtension:
```js
// After existing extension registrations:
const { NarsExtension } = await import('../../../metta/src/extensions/NarsExtension.js');
const narsExt = new NarsExtension(interp, this);
narsExt.register();
```

Pass `cycleCount` and `wmEntries` to ContextBuilder:
```js
// In the loop, before build-context:
loopState.wm = (loopState.wm ?? [])
  .map(e => ({ ...e, ttl: e.ttl - 1 }))
  .filter(e => e.ttl > 0);

// Pass WM entries to ContextBuilder
if (contextBuilder) {
  contextBuilder._wmEntries = loopState.wm;
}

const ctx = contextBuilder
  ? await contextBuilder.build(msg, loopState.cycleCount)
  : await buildContextFn(msg);
```

Extend `agent-init` in the loop (before main loop starts):
```js
// After loop state initialization, before while(true):
if (cap('persistentHistory')) {
  const SessionManager = await loadSessionManager();
  const latest = await SessionManager.getLatestCheckpoint();
  if (latest) {
    this.deserialize(JSON.parse(readFileSync(latest.path, 'utf8')));
    Logger.info('[MeTTa loop] Restored from session checkpoint');
  }
}
```

### 7.4 .metta File Updates

**`AgentLoop.metta`** — extend `agent-init` and `agent-loop`:
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
;; NARS goal management (replaces taskList skills)
(skill nar-goal-add       (String Float)   goalPursuit  :meta "Add goal to NARS memory")
(skill nar-goal-complete  (String)         goalPursuit  :meta "Mark goal achieved")
(skill nar-goal-status    (String)         goalPursuit  :meta "Query goal status")
(skill nar-goals          (Sym)            goalPursuit  :meta "List goals: :active | :pending | :all")

;; NARS state management
(skill nar-serialize      ()               persistentHistory :meta "Serialize full NARS state")
(skill nar-snapshot       (Sym)            memorySnapshots   :meta "Capture belief snapshot: :session-boundary | :pre-harness | :explicit")
(skill nar-snapshot-compare (String String Float) memorySnapshots :meta "Compare two snapshots")

;; NARS derivation tracing
(skill nar-stamps          (String)        actionTrace  :meta "Get derivation stamps for a term")
(skill nar-recent-derivations (Int)        actionTrace  :meta "Get recent derivation events")

;; NARS focus management
(skill nar-focus-sets     ()               coordinatorMode :meta "List focus sets")
(skill nar-focus-create   (String)         coordinatorMode :meta "Create named focus set")
(skill nar-focus-switch   (String)         coordinatorMode :meta "Switch to focus set")

;; NAL revision (replaces separate evaluator)
(skill nar-revision       (String SExpr)   separateEvaluator :meta "Input evidence for truth revision")
```

**`safety.metta`** — add:
```metta
;; NARS state protection
(consequence-of (nar-deserialize $path) (state-restored) :high)
(consequence-of (nar-goal-add $desc $pri) (goal-created) :low)
(consequence-of (nar-goal-complete $term) (goal-removed) :medium)
(consequence-of (nar-revision $term $evidence) (belief-revised) :medium)

;; Metta skill security gap fix (§14.8 of spec)
(consequence-of (metta $expr) (arbitrary-evaluation) :high)
```

### 7.5 VirtualEmbodiment Extension — Cold-Start Goal Seeding

**File:** `agent/src/io/VirtualEmbodiment.js` (modify existing, +15 lines)

Add `setNarRef(nar)` method. In `_onIdle()`, when `goalPursuit` is enabled:

```js
async _onIdle() {
  if (this._nar) {
    const goals = this._nar.taskManager.findTasksByType('GOAL');
    const active = goals.filter(g => g.budget.priority >= 0.5);
    if (active.length) {
      this.generateSelfTask(`Continue working on: ${active[0].term.toString()}`, {
        reason: 'idle-active-goal'
      });
      return;
    }
    const pending = this._nar.taskManager.getTasksNeedingAttention({ minPriority: 0.3, limit: 1 });
    if (pending.length) {
      this.generateSelfTask(`Start working on: ${pending[0].term.toString()}`, {
        reason: 'idle-pending-goal'
      });
      return;
    }
    // No goals — create one
    this.generateSelfTask('Review beliefs and create a goal using (nar-goal-add "description" 0.5).', {
      reason: 'idle-cold-start'
    });
    return;
  }
  // Fallback: existing behavior
  // ...
}
```

### 7.6 Configuration

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

Note: `taskList` is **removed** — it's replaced by `goalPursuit` (already exists). NARS goals are the task list.

Update `evolved` profile: add `actionTrace`  
Update `full` profile: add `actionTrace`, `memorySnapshots`, `separateEvaluator`, `coordinatorMode`

### 7.7 Test Plan

| # | Test | Verifies |
|---|---|---|
| 7.7.1 | NarsExtension grounded ops | All `nar-*` ops return correct data from NARS |
| 7.7.2 | Session restore | `nar-deserialize` restores goals, beliefs, focus sets |
| 7.7.3 | Goal lifecycle | `nar-goal-add` → `nar-goals :active` → `nar-goal-complete` → removed |
| 7.7.4 | Snapshot capture + compare | `nar-snapshot` creates file; `nar-snapshot-compare` returns truth shifts |
| 7.7.5 | Derivation stamps | `nar-stamps` returns stamp chain with ancestry |
| 7.7.6 | Focus sets | `nar-focus-create` → `nar-focus-sets` shows new set; `nar-focus-switch` activates |
| 7.7.7 | NAL revision | `nar-revision` inputs evidence; truth value updates via NAL |
| 7.7.8 | STARTUP_ORIENT slot | Present on cycle 0 with active goals; absent on cycle 1+ |
| 7.7.9 | TASKS slot | Shows all NARS goals with active/pending status |
| 7.7.10 | Cold-start seeding | No goals → agent generates "create a goal" prompt |

---

## Phase 8 — Evaluation Independence (Neuro-Symbolic)

**Prerequisites:** Phase 7 complete  
**Risk:** Low — NAL revision is a core NARS mechanism

### 8.1 NAL Revision as Evaluator

The original spec's "separate evaluator" solves a real problem: self-evaluation bias. But the LLM-agent approach (spawn a sub-agent with an isolated prompt) is a workaround for systems that lack a native revision mechanism.

**NARS already has revision.** When two independent pieces of evidence arrive for the same term, NARS applies the NAL revision rule:

```
<f1, c1> + <f2, c2> → <F, C>

where F = (f1*c1*(1-c2) + f2*c2*(1-c1)) / (c1*(1-c2) + c2*(1-c1))
      C = c1*(1-c2) + c2*(1-c2)  (simplified)
```

This is **structural isolation by design**: the revision rule doesn't care about the source of evidence. It naturally downweights conflicting evidence and increases confidence when sources agree.

### 8.2 Implementation

The `nar-revision` grounded op (already defined in 7.1) is the evaluator bridge:

```metta
;; Agent calls this after completing a task
(= (evaluate-task $task-term $evidence-f $evidence-c)
   (nar-revision $task-term (truth $evidence-f $evidence-c)))
```

When `separateEvaluator` is enabled, the evaluation evidence comes from an **independent source**:

```js
// In request-eval skill handler
dispatcher.register('request-eval', async (taskId, evidenceF, evidenceC) => {
  // When separateEvaluator enabled: evidence comes from LLM evaluation
  // When disabled: evidence comes from self-assessment (biased)
  if (isEnabled(agentCfg, 'separateEvaluator')) {
    // Spawn isolated evaluator sub-agent
    const artifacts = await collectArtifacts(taskId);
    const evalPrompt = `Evaluate: ${taskId}\nArtifacts: ${artifacts}\nRespond with truth values {f, c}.`;
    const result = await agentRef._modelRouter.invoke(evalPrompt, { taskType: ':introspection' });
    // Parse {f, c} from response
    const { f, c } = parseTruthValues(result.text);
    nar.revision(taskId, f, c);
  } else {
    // Self-assessment (biased, but available)
    nar.revision(taskId, parseFloat(evidenceF), parseFloat(evidenceC));
  }
  return '(revision-applied)';
}, 'goalPursuit', ':meta');
```

The key difference from the original spec: **the evaluator doesn't produce a pass/fail verdict**. It produces **evidence** — a truth value `{f, c}` — which NARS revises against the existing belief. If the evaluator says "this task is done" with high confidence, and the existing belief says "this task is in progress," NARS naturally reconciles them through revision.

### 8.3 HarnessOptimizer Extension

**File:** `agent/src/harness/HarnessOptimizer.js` (modify existing, +20 lines)

Use NARS derivation stamps as the behavioral signal instead of a separate action trace:

```js
// In runOptimizationCycle(), after _sampleFailures():
// Use NARS derivation stamps as behavioral signal
const recentDerivations = this.agent._streamReasoner?.metrics?.recentDerivations ?? [];
const failureStamps = recentDerivations.filter(d => d.error || d.confidence < 0.3);
const failureRate = failureStamps.length / (recentDerivations.length || 1);

// If candidate prompt reduces failure rate, it's an improvement
if (candidateFailureRate < baselineFailureRate) {
  candidateScore += (baselineFailureRate - candidateFailureRate) * 0.5;
}
```

### 8.4 Test Plan

| # | Test | Verifies |
|---|---|---|
| 8.4.1 | NAL revision | `nar-revision` inputs evidence; truth value updates correctly |
| 8.4.2 | Conflicting evidence | Two contradictory inputs → confidence decreases (NAL revision rule) |
| 8.4.3 | Separate evaluator isolation | Sub-agent prompt contains only artifacts + criteria; no generator context |
| 8.4.4 | Graceful degradation | Without `separateEvaluator`, self-assessment still works (biased but functional) |
| 8.4.5 | HarnessOptimizer uses stamps | Failure rate from derivation stamps drives prompt evaluation |

---

## Phase 9 — Autonomous Background & Coordination (Neuro-Symbolic)

**Prerequisites:** Phase 7, Phase 8  
**Risk:** Medium — webhook listener is the only genuinely new I/O surface

### 9.1 Webhook Bridge

**File:** `metta/src/extensions/NarsExtension.js` (extend existing, +80 lines)

Add webhook listener to NarsExtension. This is the only genuinely new infrastructure component:

```js
// In NarsExtension constructor:
this._httpServer = null;
this._webhookHandlers = new Map();  // path → handler function

// In register():
g.register('nar-webhook-start', (port, host) => {
  const p = parseInt(port) || 7331;
  const h = host?.value ?? '127.0.0.1';
  this._httpServer = http.createServer((req, res) => {
    this._handleWebhook(req, res);
  });
  this._httpServer.listen(p, h, () => {
    Logger.info(`[NarsExtension] Webhook listener on ${h}:${p}`);
  });
  return Term.grounded({ port: p, host: h });
});

g.register('nar-webhook-stop', () => {
  if (this._httpServer) {
    this._httpServer.close();
    this._httpServer = null;
  }
  return Term.sym('ok');
});

g.register('nar-webhook-register', (path, goalTemplate) => {
  this._webhookHandlers.set(String(path), {
    goalTemplate: String(goalTemplate),
    lastFired: null,
    fireCount: 0,
  });
  return Term.sym('ok');
});

async _handleWebhook(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = this._webhookHandlers.get(url.pathname);
  if (!handler) { res.writeHead(404); res.end(); return; }

  // HMAC validation
  const signature = req.headers['x-trigger-signature'];
  // ... (same as how2 plan)

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // Inject goal into NARS
    const nar = this.agent;
    const goal = nar.parser.parse(handler.goalTemplate);
    goal.budget.priority = 0.9;  // High priority for external triggers
    nar.input(goal);

    handler.lastFired = Date.now();
    handler.fireCount++;
    res.writeHead(200); res.end(JSON.stringify({ status: 'goal-injected' }));
  });
}
```

### 9.2 Sleep/Resume

**File:** `metta/src/extensions/NarsExtension.js` (extend existing, +40 lines)

```js
g.register('nar-sleep', (timestamp, reason) => {
  // Serialize state, set resume timer
  const state = this.agent.serialize();
  const resumeAt = new Date(String(timestamp));
  const maxMs = (this.agent.agentCfg?.maxSleepHours ?? 24) * 3600_000;
  if (resumeAt.getTime() - Date.now() > maxMs) {
    return Term.sym('rejected');
  }

  // Save sleep context
  const sleepPath = `memory/sessions/sleep_${Date.now()}.json`;
  writeFileSync(sleepPath, JSON.stringify({
    ...state,
    sleepReason: String(reason),
    resumeAt: resumeAt.toISOString(),
  }, null, 2));

  // Set resume timer
  setTimeout(() => {
    this._resumeFromSleep(sleepPath);
  }, Math.min(resumeAt.getTime() - Date.now(), maxMs));

  return Term.grounded({ path: sleepPath, resumeAt: resumeAt.toISOString() });
});

async _resumeFromSleep(path) {
  const state = JSON.parse(readFileSync(path, 'utf8'));
  this.agent.deserialize(state);
  // Inject resume goal
  if (state.sleepReason) {
    const nar = this.agent;
    const goal = nar.parser.parse(`(resume-after "${state.sleepReason}")!`);
    goal.budget.priority = 0.9;
    nar.input(goal);
  }
}
```

### 9.3 Coordinator Mode (Focus Sets)

The original spec's `CoordinatorSpace` tracks workers, detects stalls, and reassigns tasks. **NARS already does this** through its attentional focus mechanism:

- **Worker tracking** → `Focus` sets already track which tasks are in attention
- **Stall detection** → low-priority tasks naturally decay in `Bag`; `getTasksNeedingAttention()` identifies stalled work
- **Reassignment** → switching focus sets (`nar-focus-switch`) redirects attention to different task groups
- **Assignment ordering** → `FocusSetSelector` already provides composite scoring (priority + urgency + diversity + recency + novelty + goal relevance + conflict)

The `coordinatorMode` capability simply exposes these mechanisms through MeTTa:

```metta
;; Create a focus set per worker
(nar-focus-create "worker-gpt4")
(nar-focus-create "worker-claude")

;; Assign a goal to a worker's focus set
(nar-focus-switch "worker-gpt4")
(nar-goal-add "Implement feature X" 0.7)

;; Check worker status
(nar-focus-sets)
;; → [{ name: "worker-gpt4", taskCount: 3, avgPriority: 0.65 }, ...]

;; Rebalance: switch focus to the worker with lowest load
(= (rebalance)
   (let $sets (nar-focus-sets)
        (nar-focus-switch (argmin-by $sets task-count))))
```

No new `CoordinatorSpace.js` needed. The focus set mechanism is the coordinator.

### 9.4 Cron Triggers (Goal Urgency)

The original spec uses `node-cron` for scheduled triggers. **NARS already handles temporal scheduling** through goal urgency decay:

- Goals with low initial priority naturally rise in urgency over time (NARS urgency decay rule)
- A "nightly audit" goal created with priority 0.1 will eventually reach the attention threshold
- For precise timing, the webhook bridge (9.1) can receive cron signals from an external scheduler

The minimal approach: use NARS urgency for approximate scheduling, webhook bridge for precise timing.

### 9.5 Agent Loop Integration

**File:** `agent/src/Agent.js` (modify `_buildMeTTaLoop()`)

Start webhook server when `backgroundTriggers` enabled:
```js
// After NarsExtension registration:
if (isEnabled(agentCfg, 'backgroundTriggers')) {
  interp.run('(nar-webhook-start 7331 "127.0.0.1")');
}
```

Stop on shutdown:
```js
async shutdown() {
  interp.run('(nar-webhook-stop)');
  await this.embodimentBus?.shutdown();
  if (super.shutdown) await super.shutdown();
}
```

### 9.6 Skill Handlers

| Skill | Grounded Op | Capability |
|---|---|---|
| `set-trigger` | `nar-webhook-register` | `backgroundTriggers` |
| `remove-trigger` | Remove from `_webhookHandlers` | `backgroundTriggers` |
| `list-triggers` | Query `_webhookHandlers` | `backgroundTriggers` |
| `sleep-until` | `nar-sleep` | `backgroundTriggers` |
| `assign-task` | `nar-focus-switch` + `nar-goal-add` | `coordinatorMode` |
| `worker-status` | `nar-focus-sets` | `coordinatorMode` |
| `rebalance` | MeTTa rule using `nar-focus-sets` | `coordinatorMode` |

### 9.7 Test Plan

| # | Test | Verifies |
|---|---|---|
| 9.7.1 | Webhook → goal injection | POST to `/triggers/audit` → goal appears in NARS |
| 9.7.2 | HMAC validation | Invalid signature → 403 |
| 9.7.3 | Sleep/resume | `nar-sleep` serializes + sets timer; resume injects goal |
| 9.7.4 | Focus sets as coordinator | `nar-focus-create` → `nar-focus-sets` → `nar-focus-switch` |
| 9.7.5 | Goal urgency scheduling | Low-priority goal rises over time via NARS urgency decay |
| 9.7.6 | Clean shutdown | `nar-webhook-stop` closes server |

---

## Critical Path & Sequencing

```
Phase 7 (Structural Reliability)
├── [P0] 7.1  NarsExtension            ← the bridge; unblocks everything
├── [P1] 7.2  ContextBuilder ext       ← depends on 7.1 (nar-* ops for data)
├── [P1] 7.3  Agent.js wiring          ← depends on 7.1 (extension registration)
├── [P2] 7.4  .metta updates           ← depends on 7.1 (grounded op names)
├── [P2] 7.5  VirtualEmbodiment ext    ← depends on 7.1 (nar ref)
├── [P3] 7.6  Config updates           ← independent, do early
└── [P4] 7.7  Tests                    ← depends on 7.1–7.5

Phase 8 (Evaluation Independence)
├── [P0] 8.1  NAL revision via nar-revision  ← already in 7.1
├── [P1] 8.2  request-eval handler     ← depends on 8.1
├── [P2] 8.3  HarnessOptimizer ext     ← depends on 7.1 (nar-stamps)
└── [P3] 8.4  Tests                    ← depends on 8.1–8.3

Phase 9 (Autonomous Background)
├── [P0] 9.1  Webhook bridge           ← extends NarsExtension (7.1)
├── [P1] 9.2  Sleep/resume             ← extends NarsExtension (7.1)
├── [P2] 9.3  Agent loop integration   ← depends on 9.1
└── [P3] 9.4  Tests                    ← depends on 9.1–9.3
```

### Optimal Execution Order (14 steps)

| Step | Task | Est. Lines |
|---|---|---|
| 1 | Config updates (7.6) | ~10 |
| 2 | **NarsExtension** (7.1) — the core bridge | ~120 |
| 3 | ContextBuilder extension (7.2) | ~40 |
| 4 | Agent.js wiring (7.3) | ~20 |
| 5 | .metta updates (7.4) | ~50 |
| 6 | VirtualEmbodiment extension (7.5) | ~15 |
| 7 | Phase 7 tests (7.7) | — |
| 8 | NAL revision handler (8.1–8.2) | ~30 |
| 9 | HarnessOptimizer extension (8.3) | ~20 |
| 10 | Phase 8 tests (8.4) | — |
| 11 | Webhook bridge (9.1) | ~80 |
| 12 | Sleep/resume (9.2) | ~40 |
| 13 | Agent loop integration (9.3) | ~10 |
| 14 | Phase 9 tests (9.7) | — |

**Total new code: ~290 lines** (vs. ~1,500 in the how2 plan)

---

## File Change Summary

| File | Action | Phase | Lines (est.) |
|---|---|---|---|
| `metta/src/extensions/NarsExtension.js` | **NEW** | 7, 8, 9 | ~240 |
| `agent/src/memory/ContextBuilder.js` | MODIFY | 7 | +40 |
| `agent/src/Agent.js` | MODIFY | 7, 9 | +30 |
| `agent/src/io/VirtualEmbodiment.js` | MODIFY | 7 | +15 |
| `agent/src/harness/HarnessOptimizer.js` | MODIFY | 8 | +20 |
| `agent/src/config/capabilities.js` | MODIFY | 7 | +10 |
| `agent/src/metta/skills.metta` | MODIFY | 7 | +20 |
| `agent/src/metta/safety.metta` | MODIFY | 7 | +10 |
| `agent/src/metta/AgentLoop.metta` | MODIFY | 7 | +30 |

**Total new code:** ~240 lines in 1 new file  
**Total modified code:** ~175 lines across 8 existing files

---

## Design Rationale

### Why This Is Better

**1. No duplicate systems.** The how2 plan built `TaskManager.js` parallel to NARS's `TaskManager`, `SessionManager.js` parallel to `serialize()/deserialize()`, `MemorySnapshot.js` parallel to `memory.serialize()`, `ActionTraceSpace.js` parallel to `Stamp` derivation chains, and `CoordinatorSpace.js` parallel to `Focus` sets. This plan uses the existing systems directly.

**2. NAL revision is the evaluator.** The original spec correctly identified that self-evaluation bias is structural. But the fix isn't "spawn a sub-agent" — it's "use independent evidence sources." NARS's revision rule does this natively. The evaluator sub-agent is just one source of evidence; human feedback, test results, and user ratings are others. All feed into the same revision mechanism.

**3. Focus sets are the coordinator.** The original spec's `CoordinatorSpace` tracks workers, detects stalls, and reassigns tasks. NARS's `Focus` mechanism does all three: named focus sets group tasks by worker, priority decay detects stalls, and `FocusSetSelector` provides composite scoring for assignment. The coordinator is just focus management exposed through MeTTa.

**4. Stamps are the action trace.** Every NARS inference carries a full derivation chain via `Stamp`. This is richer than an action trace — it tracks not just what happened, but why (which premises led to which conclusions). `nar-stamps` exposes this through MeTTa.

**5. Serialization is the session manager.** `nar.serialize()` already dumps the complete cognitive state: beliefs, goals, focus sets, task manager, config. `nar-deserialize()` restores it. No separate checkpoint system needed.

### What Was Removed

| how2 Component | how3 Replacement | Lines Saved |
|---|---|---|
| `SessionManager.js` | `nar-serialize` / `nar-deserialize` | ~60 |
| `TaskManager.js` | `nar-goals` / `nar-goal-add` / `nar-goal-complete` | ~250 |
| `ActionTraceSpace.js` | `nar-stamps` / `nar-recent-derivations` | ~100 |
| `MemorySnapshot.js` | `nar-snapshot` / `nar-snapshot-compare` | ~150 |
| `CoordinatorSpace.js` | `nar-focus-sets` / `nar-focus-create` / `nar-focus-switch` | ~150 |
| `coordinator.metta` | Focus set MeTTa rules | ~50 |
| Separate evaluator logic | `nar-revision` | ~80 |
| Cron trigger infrastructure | NARS urgency decay + webhook bridge | ~60 |
| **Total** | **NarsExtension.js** | **~900** |

### What Was Kept

| Component | Why |
|---|---|
| Webhook bridge | Genuinely new I/O surface — NARS doesn't do HTTP |
| Sleep/resume | NARS runs continuously; timed suspension is new |
| ContextBuilder slots | LLM needs to see NARS state in its context window |
| Safety rules | New skill surfaces need consequence rules |
| Cold-start seeding | VirtualEmbodiment needs to know about NARS goals |

---

## Implementation Notes

### Code Conventions

- NarsExtension follows the same pattern as `ChannelExtension` and `MemoryExtension`: constructor takes `(metta, agent)`, `register()` method adds grounded ops
- All grounded ops return `Term.grounded(...)` or `Term.sym(...)` — consistent with existing ops
- File I/O uses `fs/promises` for async operations where possible
- Error handling: fail-closed on NARS unavailability; log via `Logger`

### Migration Path

1. **Deploy NarsExtension first** — it's additive, no existing behavior changes
2. **Migrate task management** — switch from `taskList` capability to `goalPursuit` + `nar-*` ops
3. **Migrate session management** — switch from `SessionManager` to `nar-serialize`/`deserialize`
4. **Migrate evaluation** — switch from separate evaluator sub-agent to `nar-revision`
5. **Deprecate duplicate systems** — remove `TaskManager.js`, `SessionManager.js`, etc. once migration is verified

### The Neuro-Symbolic Synergy

This plan realizes the SeNARS vision: **MeTTa drives, NARS reasons**. The LLM is a peripheral — one grounded op among many. The agent's behavior is expressed in MeTTa, its cognition happens in NARS, and the bridge between them is clean, minimal, and bidirectional only where necessary (MeTTa → NARS queries/commands; NARS → MeTTa only through grounded op return values).

This is the architecture that the original MeTTaClaw spec described but didn't fully realize: the NARS kernel as the cognitive substrate, MeTTa as the control plane, and the LLM as a fluent but untrusted text generator.