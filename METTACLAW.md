# METTACLAW.md — SeNARS Agent: Architecture & Development Plan

> **"MeTTa is the operating system. LLMs are peripherals."**

## Table of Contents

1. [Vision & Guiding Principles](#1-vision--guiding-principles)
2. [Capability Matrix](#2-capability-matrix)
3. [Configuration Profiles](#3-configuration-profiles)
4. [Architecture Overview](#4-architecture-overview)
5. [Component Specifications](#5-component-specifications)
6. [Phase Plan](#6-phase-plan)
7. [Safety & Accountability](#7-safety--accountability)
8. [Multi-Model Intelligence](#8-multi-model-intelligence)
9. [Embodiment Abstraction](#9-embodiment-abstraction)
10. [Meta-Harness: Self-Improving Prompts](#10-meta-harness-self-improving-prompts)
11. [Memory Architecture](#11-memory-architecture)
12. [File Structure](#12-file-structure)
13. [Key Interfaces](#13-key-interfaces)
14. [Design Decisions & Rationale](#14-design-decisions--rationale)
15. [References](#15-references)

---

## 1. Vision & Guiding Principles

### 1.1 The Mission

Evolve `agent/` into an **autonomous cognitive agent** — MeTTa as the control plane, LLMs as replaceable peripherals, arbitrary I/O embodiments, independently toggleable capability at every level from chatbot to self-improving agent.

### 1.2 Transcending MeTTaClaw's Assumptions

| MeTTaClaw Assumption | This Design's Stance |
|---|---|
| One LLM provider, fixed model | Model selection is learned; empirically scored, ranked, routed |
| IRC is the primary I/O modality | Embodiment is an abstraction; agent is modality-agnostic |
| Loop count is a configuration parameter | Loop budget is a cognitive resource the agent manages itself |
| Python handles all I/O | 100% Node.js |
| History is a flat text file | Typed MeTTa atoms with vector indexing |
| Skills are a fixed list | Skills are atoms; agent can add, remove, compose them |
| Safety is the user's problem | First-class runtime concern with reflective enforcement |
| Agent has one identity | Identity, goals, values are stored atoms — observable and revisable |

### 1.3 Guiding Principles

1. **Atoms all the way down.** Any fact, skill, preference, belief, or audit record that should survive a restart is a MeTTa atom in a PersistentSpace.

2. **The agent can read its own source.** Self-modification is the primary mechanism for long-term improvement. Skill definitions, harness fragments, and model preferences are atoms it can query and update.

3. **Every model is broken; learn which ones are less broken, for what.** Don't find "the best model." Build infrastructure to discover empirically which models succeed at which task types, tracked with NAL truth values. End goal: models the agent fine-tunes itself.

4. **Consequences before actions.** Before any side-effecting skill executes, the SafetyLayer does a forward-inference pass. Unsafe results abort execution and produce an audit record.

5. **No invisible work.** Every LLM call, skill invocation, memory write, and preference update is an append-only audit event.

6. **Individual capability control.** Every meta/reflexive feature is independently toggleable. The system runs cleanly at any point on the spectrum.

---

## 2. Capability Matrix

Each capability is a flag in `agent.json` under `"capabilities"`. Three tiers: **Parity** (matches MeTTaClaw), **Evolution** (exceeds it), **Experimental** (uncertain — enable one at a time).

Skills whose governing capability flag is disabled are **invisible to the LLM** — omitted from the SKILLS context slot entirely. The agent cannot invoke what it cannot see.

### 2.1 Parity Tier

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `mettaControlPlane` | `true` | `AgentLoop.metta` drives execution instead of the JS LIDA cycle | None — this is the core architecture |
| `sExprSkillDispatch` | `true` | LLM outputs S-expression skill calls; parsed and dispatched | Weak models produce malformed output; `&error` feedback + retry handles it |
| `semanticMemory` | `true` | Embedding-backed persistent memory with `remember`/`query`/`pin`/`forget` | Memory grows unboundedly without `memoryConsolidation` |
| `persistentHistory` | `true` | Conversation/action history survives restarts within char budget | None; budget limits prevent bloat |
| `loopBudget` | `true` | Iteration counter; loop terminates on exhaustion | None |
| `contextBudgets` | `true` | Per-slot character budgets for context assembly | None |
| `fileReadSkill` | `true` | `(read-file path)` within working directory | Scoped to `cwd`; path traversal blocked |
| `webSearchSkill` | `true` | `(search query)` returns web results | Network egress; API cost |
| `fileWriteSkill` | `false` | `(write-file path content)` and `(append-file path content)` | **Medium.** Agent can overwrite its own config. Scope to `memory/` initially |
| `shellSkill` | `false` | `(shell cmd)` executes allowlisted OS commands | **High.** Even allowlisted commands can have unintended consequences |

### 2.2 Evolution Tier

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `multiModelRouting` | `false` | `ModelRouter` selects model per task type via NAL scores | Higher cost; requires providers configured |
| `modelExploration` | `false` | Epsilon-greedy exploration benchmarks under-sampled models | Sends requests to lower-quality models during exploration |
| `modelScoreUpdates` | `false` | NAL truth values updated automatically after each invocation | Score drift if task-type classifier misclassifies |
| `multiEmbodiment` | `false` | Multiple simultaneous I/O channels via `EmbodimentBus` | Cross-embodiment complexity; messages may reach unintended channels |
| `virtualEmbodiment` | `false` | Internal self-directed channel; agent generates its own tasks | Agent may spin on trivial self-tasks; pair with `autonomousLoop` |
| `autonomousLoop` | `false` | Loop runs continuously; generates self-tasks when idle | **Medium.** Runs indefinitely; continuous API calls without user prompting |
| `attentionSalience` | `false` | Multi-embodiment input prioritized by salience score rather than FIFO | May deprioritize low-salience but important inputs |
| `safetyLayer` | `false` | Reflective consequence analysis before side-effecting skills execute | ~50ms overhead per skill. Can block legitimate actions if rules too conservative |
| `auditLog` | `false` | Append-only record of all skill invocations, LLM calls, memory writes | Storage growth; minor I/O overhead |
| `rlhfCollection` | `false` | Execution traces written to `rlfp_training_data.jsonl` | Disk storage; conversation content captured to file |
| `dynamicSkillDiscovery` | `false` | Scans `memory/skills/*.metta` and `SKILL.md` files at startup/reload; auto-registers valid skill definitions with `SkillDispatcher` | Agent may load malformed skill definitions; requires `safetyLayer` gate for `add-skill` path |
| `executionHooks` | `false` | Enables declarative `pre-skill-hook` / `post-skill-hook` atoms in `hooks.metta`; hooks execute before/after skill handlers with mutation/deny/audit capabilities | Hook logic errors can block legitimate skill execution; requires careful rule authoring |
| `runtimeIntrospection` | `false` | Exposes `manifest`, `skill-inventory`, `subsystems`, `agent-state` as always-available grounded ops; generates `agent-manifest.metta` with active capabilities, registered skills, model scores | Minor overhead for manifest generation; introspection output may reveal internal structure |

### 2.3 Experimental Tier

Enable one at a time. Observe audit log carefully before enabling the next.

| Flag | Default | What It Does | Risk If Enabled |
|---|---|---|---|
| `selfModifyingSkills` | `false` | `(add-skill sexpr)` writes new skill definitions to `skills.metta` | **High.** Agent can create broken or malicious skill definitions. Requires `safetyLayer` + `auditLog` |
| `harnessOptimization` | `false` | Agent analyzes failure traces and proposes changes to `memory/harness/prompt.metta` | **High.** Agent can corrupt its own system prompt. Git is the rollback mechanism |
| `memoryConsolidation` | `false` | Merges near-duplicate memories, decays low-confidence beliefs, prunes below threshold | **Medium.** May prune memories that were load-bearing context. Threshold tunable |
| `goalPursuit` | `false` | Agent sets and autonomously pursues goals across cycles via `(set-goal desc priority)` | **Medium.** Open-ended pursuit generates many unintended side effects without constraints |
| `subAgentSpawning` | `false` | Spawns scoped sub-agents (VirtualEmbodiment + isolated context) | **Medium.** Multiplies LLM calls; sub-agents share SemanticMemory |
| `selfEvaluation` | `false` | Agent scores its own recent outputs against stored preferences | **Low-Medium.** Circular evaluation possible if evaluation criteria are themselves evaluated |
| `harnessDiffusion` | `false` | Harness changes propagate via CRDT merge across multiple agent instances | **Experimental.** Concurrent modifications may conflict non-obviously. Implementation TBD (Phase 7+) |

### 2.4 Capability Dependencies

```
autonomousLoop        → loopBudget
goalPursuit           → autonomousLoop, virtualEmbodiment
selfModifyingSkills   → safetyLayer, auditLog
harnessOptimization   → selfModifyingSkills, auditLog, persistentHistory
subAgentSpawning      → virtualEmbodiment
memoryConsolidation   → semanticMemory
modelExploration      → multiModelRouting, modelScoreUpdates
harnessDiffusion      → harnessOptimization
dynamicSkillDiscovery → selfModifyingSkills, semanticMemory
executionHooks        → safetyLayer, auditLog
runtimeIntrospection  → mettaControlPlane
```

Unsatisfied dependencies produce a clear startup error. No silent degradation.

---

## 3. Configuration Profiles

The `"profile"` key in `agent.json` selects a preset. Any `"capabilities"` keys in the same file override the profile. Unspecified flags take their documented defaults.

### `minimal` — Reactive chatbot, no MeTTa control plane

```json
{
  "profile": "minimal",
  "capabilities": {
    "mettaControlPlane":  false,
    "sExprSkillDispatch": false,
    "semanticMemory":     false,
    "persistentHistory":  false,
    "loopBudget":         false,
    "contextBudgets":     false,
    "fileReadSkill":      false,
    "fileWriteSkill":     false,
    "shellSkill":         false,
    "webSearchSkill":     true
  }
}
```

### `parity` — Full MeTTaClaw feature parity, no autonomous/self-modifying capabilities

```json
{
  "profile": "parity",
  "capabilities": {
    "mettaControlPlane":  true,
    "sExprSkillDispatch": true,
    "semanticMemory":     true,
    "persistentHistory":  true,
    "loopBudget":         true,
    "contextBudgets":     true,
    "fileReadSkill":      true,
    "fileWriteSkill":     false,
    "shellSkill":         false,
    "webSearchSkill":     true,
    "auditLog":           true
  }
}
```

### `evolved` — Parity + evolution tier, no self-modification

```json
{
  "profile": "evolved",
  "capabilities": {
    "mettaControlPlane":  true,
    "sExprSkillDispatch": true,
    "semanticMemory":     true,
    "persistentHistory":  true,
    "loopBudget":         true,
    "contextBudgets":     true,
    "fileReadSkill":      true,
    "fileWriteSkill":     true,
    "shellSkill":         false,
    "webSearchSkill":     true,
    "multiModelRouting":  true,
    "modelExploration":   true,
    "modelScoreUpdates":  true,
    "multiEmbodiment":    true,
    "virtualEmbodiment":  true,
    "autonomousLoop":     true,
    "attentionSalience":  true,
    "safetyLayer":        true,
    "auditLog":           true,
    "rlhfCollection":     true
  }
}
```

### `full` — All capabilities. Controlled experimentation only.

```json
{
  "profile": "full",
  "capabilities": {
    "mettaControlPlane":    true,
    "sExprSkillDispatch":   true,
    "semanticMemory":       true,
    "persistentHistory":    true,
    "loopBudget":           true,
    "contextBudgets":       true,
    "fileReadSkill":        true,
    "fileWriteSkill":       true,
    "shellSkill":           false,
    "webSearchSkill":       true,
    "multiModelRouting":    true,
    "modelExploration":     true,
    "modelScoreUpdates":    true,
    "multiEmbodiment":      true,
    "virtualEmbodiment":    true,
    "autonomousLoop":       true,
    "attentionSalience":    true,
    "safetyLayer":          true,
    "auditLog":             true,
    "rlhfCollection":       true,
    "selfModifyingSkills":  true,
    "harnessOptimization":  true,
    "memoryConsolidation":  true,
    "goalPursuit":          true,
    "subAgentSpawning":     true,
    "selfEvaluation":       true,
    "harnessDiffusion":     false
  }
}
```

---

## 4. Architecture Overview

### 4.1 Execution Flow

```
╔════════════════════════════════════════════════════════╗
║                    AgentLoop.metta                     ║  ← mettaControlPlane
║   tail-recursive MeTTa loop; cap? gates every branch   ║
╠═══════════════════╦════════════════════════════════════╣
║  build-context    ║       SkillDispatcher              ║  ← contextBudgets
║  (MeTTa function) ║  parse S-exprs → JS handlers       ║  ← sExprSkillDispatch
║                   ║  Supports dynamic registration     ║  ← dynamicSkillDiscovery
║                   ║  via discover-skills grounded op   ║
╠═══════════════════╩════════════════════════════════════╣
║               ModelRouter                               ║  ← multiModelRouting
║   NAL-scored task-type routing over AIClient.js         ║
╠════════════════════════╦═══════════════════════════════╣
║  LLM providers         ║  Skill handlers               ║
║  (via AIClient.js)     ║  remember/query/pin/forget     ║  ← semanticMemory
║                        ║  send / send-to / search       ║  ← multiEmbodiment, webSearch
║                        ║  read-file / write-file        ║  ← fileReadSkill, fileWriteSkill
║                        ║  shell                         ║  ← shellSkill
║                        ║  metta / think                 ║  (always on)
║                        ║  set-goal / add-skill          ║  ← goalPursuit, selfModifying
╠════════════════════════╩═══════════════════════════════╣
║               SemanticMemory                            ║  ← semanticMemory
║   PersistentSpace + HNSW + Embedder                     ║
╠════════════════════════════════════════════════════════╣
║               HookOrchestrator  [optional]              ║  ← executionHooks
║   pre-skill / post-skill hooks configured in hooks.metta ║
╠════════════════════════════════════════════════════════╣
║               SafetyLayer  [optional]                   ║  ← safetyLayer / auditLog
╠════════════════════════════════════════════════════════╣
║               IntrospectionOps  [always available]      ║  ← runtimeIntrospection
║   (manifest) (skill-inventory) (subsystems) (agent-state) ║
║   Generate runtime agent-manifest.metta for self-query   ║
╠════════════════════════════════════════════════════════╣
║               EmbodimentBus                             ║  ← multiEmbodiment
║   IRC │ Nostr │ CLI │ WebUI │ API │ VirtualInternal      ║  ← virtualEmbodiment
╚════════════════════════════════════════════════════════╝
```

### 4.2 The Control Plane Inversion

**Current `agent/`:** JS event loop → JS prompt builder → LLM → JSON tool calls → JS handlers. MeTTa is a sidecar.

**Target:** MeTTa loop → MeTTa context builder → LLM as grounded skill → S-expression output → MeTTa dispatches to JS. The existing `CognitiveArchitecture.cognitiveCycle()` becomes callable as `(cognitive-cycle $stimulus)` — one skill among many, not the outer container. `MeTTaReasoner.js` (currently a regex-based JS heuristic) is replaced by actual `metta/` evaluation.

### 4.3 Control Plane State Variables

All loop state lives as atoms in a `StateSpace` backed by `StateOps.js`:

```metta
(= &budget        50)          ; remaining iterations; agent can extend this
(= &prevmsg       ())          ; last received message
(= &lastresults   ())          ; last skill execution results
(= &lastsend      "")          ; last outbound content (send deduplication)
(= &error         ())          ; parse error feedback for next cycle
(= &current-model "auto")      ; specific model override, or "auto" for routing
(= &current-goal  ())          ; highest-priority active goal
(= &loop-mode     "reactive")  ; "reactive" | "autonomous" | "paused"
(= &cycle-count   0)           ; lifetime cycle counter; never resets
(= &wm            ())          ; working memory register — see §11.2
```

Each cycle, the loop decrements TTLs in `&wm` and drops expired entries before building context. Items enter `&wm` via the `(attend content priority)` skill or automatically from `check-embodiment-bus` for high-salience inputs.

---

## 5. Component Specifications

### 5.1 AgentLoop.metta

**Location:** `agent/src/metta/AgentLoop.metta`
**Governed by:** `mettaControlPlane`

```metta
(= (agent-start)
   (do (agent-init)
       (agent-loop (get-state &budget))))

(= (agent-loop $k)
   (if (== $k 0)
     (if (cap? autonomousLoop)
       (agent-loop (reset-budget))
       (agent-halt))
     (let*
       (($msg    (next-input))
        ($k2     (if (new-message? $msg) (reset-budget) (- $k 1)))
        ($_      (tick-wm))                    ; decrement &wm TTLs, drop expired
        ($ctx    (build-context $msg))         ; &wm contents included in WM_REGISTER slot
        ($resp   (llm-invoke $ctx))
        ($cmds   (parse-response $resp))
        ($result (execute-commands $cmds))
        ($_      (when (cap? persistentHistory) (append-history $msg $resp $result)))
        ($_      (when (cap? auditLog)          (emit-cycle-audit $msg $resp $result)))
        ($_      (sleep-cycle)))
       (agent-loop $k2))))

(= (next-input)
   (if (cap? autonomousLoop)
     (or (check-embodiment-bus) (generate-self-task))
     (check-embodiment-bus)))
```

`build-context` is a MeTTa function that assembles the context string from named slots, calling into JS for data retrieval. This makes context assembly inspectable via `(metta (build-context ...))` and modifiable by the experimental tier — without requiring it to be in MeTTa on day one (see Phase 1 note in §6).

`execute-commands` dispatches up to `maxSkillsPerCycle` calls (default 3). Each call routes through `SafetyLayer` if `safetyLayer` enabled, then calls the JS handler, then emits an audit event if `auditLog` enabled.

### 5.2 skills.metta

**Location:** `agent/src/metta/skills.metta`
**Governed by:** living document, agent-writable if `selfModifyingSkills`

```metta
;; (skill name arg-types capability-gate tier description)

(skill remember      (String)         semanticMemory    :memory      "Store to long-term memory with embedding")
(skill query         (String)         semanticMemory    :memory      "Recall top-K semantically similar memories")
(skill pin           (String)         semanticMemory    :memory      "Add to pinned context (always in prompt)")
(skill forget        (String)         semanticMemory    :memory      "Remove memories matching query")
(skill send          (String)         mettaControlPlane :network     "Send to current primary embodiment")
(skill send-to       (Chan String)    multiEmbodiment   :network     "Send to a specific named embodiment")
(skill search        (String)         webSearchSkill    :network     "Web search, return top results")
(skill read-file     (Path)           fileReadSkill     :local-read  "Read file within workdir")
(skill write-file    (Path String)    fileWriteSkill    :local-write "Write file within memory/")
(skill append-file   (Path String)    fileWriteSkill    :local-write "Append to file within memory/")
(skill shell         (String)         shellSkill        :system      "Execute allowlisted OS command")
(skill metta         (SExpr)          mettaControlPlane :reflect     "Evaluate MeTTa expression, return results")
(skill think            (String)         mettaControlPlane :reflect     "Internal monologue; not sent to any embodiment")
(skill cognitive-cycle  (SExpr)          mettaControlPlane :reflect     "Invoke full LIDA CognitiveArchitecture.cognitiveCycle() on a stimulus atom")
(skill attend           (String Float)   mettaControlPlane :reflect     "Add item to working memory register with priority 0–1; default TTL applies")
(skill dismiss       (String)         mettaControlPlane :reflect     "Remove matching item from working memory register immediately")
(skill set-goal      (String Float)   goalPursuit       :meta        "Set current goal with priority 0.0–1.0")
(skill set-model     (String)         multiModelRouting :meta        "Override active model for next N cycles")
(skill eval-model    (String TaskType) modelExploration :meta        "Benchmark a model on a task type")
(skill add-skill     (SExpr)          selfModifyingSkills :meta      "Register new skill definition")
(skill consolidate   ()               memoryConsolidation :meta      "Trigger memory consolidation immediately")
(skill spawn-agent   (String Int)     subAgentSpawning  :meta        "Spawn sub-agent with task + cycle budget")
```

#### 5.2.1 Dynamic Skill Discovery

When `dynamicSkillDiscovery` is enabled, `SkillDispatcher` performs two discovery passes at startup and on `selfModifyingSkills` changes:

1. **Filesystem scan**: Recursively scan `memory/skills/**/*.metta` for `(skill ...)` declarations. Validate syntax via `metta/Parser.js`; skip malformed entries with audit warning.

2. **SKILL.md parsing**: Parse markdown files matching `**/SKILL.md` using this schema:
   ```markdown
   ## Skill: skill-name
   **Args**: `(arg1 Type1) (arg2 Type2)`
   **Capability**: `capability-flag`
   **Tier**: `:memory` | `:network` | `:meta`
   **Description**: One-line summary
   **Implementation**: `path/to/handler.js` or `inline-metta`
   ```
   Convert valid entries to `(skill ...)` atoms and register.

3. **Auto-reload**: When `selfModifyingSkills` writes to `memory/skills/`, trigger re-scan without full restart.

**Grounded op**: Register `(discover-skills)` as a grounded op that manually triggers re-scan. Agent can invoke `(metta (discover-skills))` after adding skills.

**Integration with existing**: Extends `SkillDispatcher.register()`; does not replace static `skills.metta` declarations. Static declarations take precedence; dynamic discoveries are additive.

### 5.3 SkillDispatcher.js

**Location:** `agent/src/skills/SkillDispatcher.js`
**Governed by:** `sExprSkillDispatch`

Owns both registration and dispatch — no separate registry file. When `sExprSkillDispatch` is false, falls back to the existing `ToolAdapter.js` JSON tool-call path.

**Integration with existing primitives:** `agent/src/metta/ChannelExtension.js` already registers grounded ops (`send-message`, `join-channel`, `web-search`, `read-file`, `write-file`) as direct JS bindings on the interpreter. `SkillDispatcher` does not replace these — it adds the S-expression parsing layer and capability gates on top. The `send`, `search`, `read-file`, and `write-file` skill handlers delegate to the same underlying JS functions that `ChannelExtension` wires.

Responsibilities:
- Parse the LLM's S-expression response via `metta/Parser.js` (with MeTTaClaw-style parenthesis balancing; on failure, populates `&error` and returns empty commands)
- Look up each parsed `(skill arg...)` call against registered handlers
- Gate on capability flags (disabled-skill call produces an audit warning, not an exception)
- If `safetyLayer` enabled: pass through `SafetyLayer.check()` before calling handler
- If `auditLog` enabled: emit `(audit-event :type :skill-invoked ...)` after each call
- Return results array to `AgentLoop` for `&lastresults`

#### 5.3.1 HookOrchestrator Integration

When `executionHooks` is enabled, `SkillDispatcher.execute()` routes each skill call through `HookOrchestrator` before and after handler execution:

```javascript
// Pseudocode for SkillDispatcher.execute()
async execute(parsedCmds) {
  for (const cmd of parsedCmds) {
    // PRE-HOOK PHASE
    if (config.capabilities.executionHooks) {
      const hookResult = await HookOrchestrator.runPreHooks(cmd);
      if (hookResult.action === 'deny') {
        emitAudit({ type: 'skill-blocked', reason: hookResult.reason });
        continue;
      }
      if (hookResult.action === 'rewrite') {
        cmd.args = hookResult.newArgs; // mutated args
      }
    }

    // SAFETY LAYER (existing)
    if (config.capabilities.safetyLayer) {
      const safety = await SafetyLayer.check(cmd.name, cmd.args);
      if (!safety.cleared) { /* ...existing handling... */ }
    }

    // HANDLER EXECUTION (existing)
    const result = await handler(cmd.args);

    // POST-HOOK PHASE
    if (config.capabilities.executionHooks) {
      await HookOrchestrator.runPostHooks(cmd, result);
    }

    // AUDIT (existing)
    if (config.capabilities.auditLog) { /* ... */ }
  }
}
```

**Hook definition format** (`hooks.metta`):
```metta
;; Pre-hook: deny shell commands containing forbidden patterns
(hook pre (shell $cmd)
      (if (contains-forbidden? $cmd)
        (deny "Command contains forbidden pattern")
        (allow)))

;; Post-hook: audit all write-file operations
(hook post (write-file $p $c)
      (audit (emit :file-written :path $p :size (string-length $c))))

;; Pre-hook: mutate search queries to add safe-search flag
(hook pre (search $q) (rewrite (search (string-append $q " safe_search=active"))))
```

**HookOrchestrator API** (new file `agent/src/skills/HookOrchestrator.js`):
```javascript
class HookOrchestrator {
  static async runPreHooks(skillCall)   // returns { action: 'allow'|'deny'|'rewrite', newArgs?, reason? }
  static async runPostHooks(skillCall, result)  // returns void; may emit audit events
  static loadHooksFromFile(path)       // parse hooks.metta, register in memory
}
```

**Phase 1 refinement note**: Since Phase 1 already implements `SkillDispatcher`, extend the existing `execute()` method with the hook orchestration logic above. No new class needed for Phase 1—inline the hook checks conditionally on `config.capabilities.executionHooks`.

### 5.4 SemanticMemory.js

**Location:** `agent/src/memory/SemanticMemory.js`
**Governed by:** `semanticMemory`

Built on `metta/src/extensions/PersistentSpace.js` (Merkle hash integrity, CRDT vector clocks, Node.js FS + IndexedDB backends — already implemented).

**Relationship to existing `Memory.js`:** `core/src/memory/Memory.js` provides concept-based NARS-style memory (pattern-matched atoms, no embeddings). `SemanticMemory.js` is an additional layer — it does not replace `Memory.js`. The existing `agent/src/metta/MemoryExtension.js` registers `remember`/`recall` bindings against `Memory.js`; those are used by the NARS cognitive architecture. In Phase 2, `SkillDispatcher` registers new `remember`/`query`/`pin`/`forget` handlers against `SemanticMemory.js`, which supersede the `MemoryExtension.js` bindings for LLM-facing skill calls. The two systems run in parallel: `Memory.js` for NARS concept reasoning; `SemanticMemory.js` for embedding-based recall. Embeddings are an index overlay on the atom store — not a replacement for the underlying concept memory.

```
SemanticMemory
├── AtomStore  — PersistentSpace (atoms + metadata as MeTTa triplets)
├── VectorIndex (private) — HNSW via hnswlib-node; brute-force fallback for < 1000 items
└── Embedder   — lazy-loaded @huggingface/transformers Xenova/all-MiniLM-L6-v2 (384-dim)
                 fallback: OpenAI embeddings API (config-selectable)
```

`VectorIndex` is a private class within `SemanticMemory.js`. It is not a public interface — it is an implementation detail that may change. Wrapping it separately would create an abstraction boundary with nothing on the other side.

**Atom format:**

```metta
(memory-atom
  :id        "mem_1743432000_abc"
  :timestamp 1743432000000
  :content   "User prefers terse explanations without preamble"
  :source    "irc:##metta:user42"
  :type      :semantic              ; :semantic | :episodic | :procedural | :pinned
  :truth     (stv 0.9 0.8)
  :tags      ("preference" "style")
  ; embedding stored in memory.vec sidecar, indexed by :id
)
```

Restore on startup: `PersistentSpace.restore()` rehydrates atoms; HNSW index rebuilt from sidecar. First embedding call lazy-loads the ONNX model.

**Budget configuration:**

```json
"memory": {
  "maxRecallItems":    20,
  "maxRecallChars":    8000,
  "maxHistoryChars":   12000,
  "maxFeedbackChars":  6000,
  "pinnedMaxChars":    3000,
  "embedder":          "Xenova/all-MiniLM-L6-v2",
  "vectorDimensions":  384,
  "beliefDecay":       0.001,
  "pruneThreshold":    0.2,
  "consolidationInterval": 100
}
```

### 5.5 ModelRouter.js

**Location:** `agent/src/models/ModelRouter.js`
**Governed by:** `multiModelRouting`

When `multiModelRouting` is false, `invoke()` routes directly to the configured fallback model via `AIClient.js`. When true, it scores models by task type using NAL truth values stored as `model-score` atoms in SemanticMemory — no separate preferences store needed.

Model scoring atoms live in SemanticMemory with `:type :procedural`:

```metta
(model-score "gpt-4o"            :reasoning     (stv 0.85 0.72))
(model-score "claude-sonnet-4-6" :introspection (stv 0.91 0.82))
(model-score "qwen2.5-coder"     :code          (stv 0.82 0.65))
```

NAL expectation for selection: `E(stv(f,c)) = f + c*(0.5 - f)` — penalizes low-confidence scores without overvaluing untested models.

When `modelScoreUpdates` enabled, each invocation records a `model-invocation` atom and applies `Truth_Revision` to the relevant `model-score` atom. When `modelExploration` enabled, epsilon-greedy selection occasionally routes to the model with the lowest confidence score (fewest samples).

Latency and token tracking are captured inline per call — three lines, not a class.

Task type classification is a lightweight heuristic (keyword + pattern matching; no LLM call). The classifier is itself a `read-file`-able JS function the agent can inspect.

**Task types (extensible):** `:reasoning` `:code` `:creative` `:retrieval` `:tool-use` `:introspection` `:social`

### 5.6 EmbodimentBus.js + VirtualEmbodiment.js

**Location:** `agent/src/io/EmbodimentBus.js`, `agent/src/io/VirtualEmbodiment.js`
**Governed by:** `multiEmbodiment`, `virtualEmbodiment`

When `multiEmbodiment` is false, `EmbodimentBus` wraps a single channel — same interface, no routing complexity. This means `AgentLoop.metta` always uses `check-embodiment-bus`; whether that routes through one or many embodiments is an infrastructure detail.

Existing `IRCChannel`, `NostrChannel`, `CLIChannel` adopt the `Embodiment` interface (connect/disconnect/send/receive/profile/salience). `MatrixChannel` likewise.

`VirtualEmbodiment` is always present when `virtualEmbodiment` enabled. It provides:
- Self-task injection during idle autonomous cycles
- Goal-pursuit task generation when `goalPursuit` enabled
- Scoped sub-agent context when `subAgentSpawning` enabled

When `attentionSalience` is false, `getNextMessage()` is FIFO across embodiments.

### 5.7 SafetyLayer.js + AuditSpace.js

**Location:** `agent/src/safety/SafetyLayer.js`, `agent/src/safety/AuditSpace.js`
**Governed by:** `safetyLayer`, `auditLog`

`SafetyLayer` and `AuditSpace` are independent — audit logging works without the safety layer and vice versa.

`SafetyLayer.check(skillName, args)` runs a time-bounded (default 50ms) MeTTa forward-inference pass using `safety.metta` rules. Fail-closed: inference timeout = blocked. Returns `{ cleared, reason, consequences }`.

`AuditSpace` is an append-only `PersistentSpace`. The agent can read its own audit log via `(metta (get-atoms &audit-space))`. This is the diagnostic substrate for `HarnessOptimizer`.

### 5.8 HarnessOptimizer.js

**Location:** `agent/src/harness/HarnessOptimizer.js`
**Governed by:** `harnessOptimization`

Runs as a self-task on `VirtualEmbodiment` every `harnessEvalInterval` cycles (default 200). Analyzes failure audit atoms, proposes ONE targeted change to `memory/harness/prompt.metta`, replays on a sample of recent tasks, applies if improved.

**Version history is git.** `memory/` is a git-tracked directory. Every harness write commits with message `harness-update: cycle {N}`. Rollback: `git revert` or `git checkout`. No custom versioning scheme.

#### 5.8.1 Verification Loop Integration

When `runtimeIntrospection` and `auditLog` are enabled, `HarnessOptimizer` runs a verification sub-cycle after proposing harness changes:

```
1. Apply candidate diff to prompt.candidate.metta
2. Run (manifest) and (skill-inventory) to capture pre-change state
3. Replay sampled tasks with candidate harness
4. Run (manifest) and (skill-inventory) post-replay
5. Compare skill invocation patterns, error rates, audit event counts
6. Only install candidate if:
   - No new skill-blocked audit events
   - Error rate unchanged or improved
   - Manifest shows expected capability changes
```

This turns harness optimization into a *verified* self-modification process, reducing risk of regressions.

### 5.9 capabilities.js (module, not class)

**Location:** `agent/src/config/capabilities.js`

Two exports:

```javascript
export function isEnabled(config, flag) {
  return config.capabilities[flag] ?? DEFAULTS[flag] ?? false;
}

export function validateDeps(config) {
  // Checks DEPENDENCY_TABLE against resolved capabilities
  // Throws with clear message on unsatisfied deps
}
```

The `cap?` MeTTa grounded op is registered as:
```javascript
interp.registerOp('cap?', (flag) => isEnabled(agentConfig, flag))
```

No class, no instance, no state. Capability state lives in `agent.json`.

### 5.10 IntrospectionOps.js — Runtime Self-Description

**Location:** `agent/src/introspection/IntrospectionOps.js`
**Governed by:** `runtimeIntrospection` (but grounded ops always register; capability gates output content)

**Purpose:** Provide always-available grounded ops that generate structured self-descriptions for agent self-query and external tooling.

**Registered grounded ops** (via `AgentBuilder.buildMeTTaLoop()`):
```javascript
interp.registerOp('manifest',        () => IntrospectionOps.generateManifest(config))
interp.registerOp('skill-inventory', () => IntrospectionOps.listSkills(dispatcher, config))
interp.registerOp('subsystems',      () => IntrospectionOps.describeSubsystems())
interp.registerOp('agent-state',     (key) => IntrospectionOps.getState(key))
```

**Output format** (MeTTa atoms, agent-readable):
```metta
;; (manifest) output
(agent-manifest
  :version "0.1.0"
  :profile "evolved"
  :capabilities ((mettaControlPlane true) (semanticMemory true) ...)
  :active-skills ((remember (String) :memory) (query (String) :memory) ...)
  :embodiments ((irc:##metta :active true) (cli :active true))
  :model-scores ((gpt-4o :reasoning (stv 0.85 0.72)) ...)
  :cycle-count 142
  :wm-entries-count 3)

;; (skill-inventory) output
(skill-inventory
  (skill-entry :name remember :args (String) :tier :memory :enabled true)
  (skill-entry :name query :args (String) :tier :memory :enabled true)
  ...)

;; (agent-state "&budget") → 47
;; (agent-state "&wm") → ((wm-entry :content "..." :priority 0.8 :ttl 7) ...)
```

**Implementation notes:**
- `generateManifest()` aggregates data from `config`, `SkillDispatcher.getActiveSkillDefs()`, `EmbodimentBus.getActiveChannels()`, `ModelRouter.getScores()`, and loop state variables.
- Output is cached for 5 cycles to avoid regeneration overhead; invalidated on capability changes.
- When `runtimeIntrospection` is false, ops return minimal stub: `(manifest :restricted true)`.

**Phase 1 refinement note**: Since Phase 1 already registers grounded ops in `AgentBuilder.buildMeTTaLoop()`, add the four introspection ops to that registration block. Implement `IntrospectionOps` as a simple module with static methods—no class instantiation needed for Phase 1.

---

## 6. Phase Plan

Each phase is a self-contained working increment. Later phases do not block on earlier phases being "perfect."

### Phase 1 — MeTTa Control Plane

**Deliverable:** MeTTa loop drives the agent; existing channels and LLM providers work unchanged.

1. Create directory structure (see §12), including `agent/src/config/` and `agent/workspace/`.
2. Create `agent/workspace/agent.json` with default `"profile": "parity"` config (schema: §13.1). Implement `capabilities.js` — `isEnabled()`, `validateDeps()`, profile resolution. These two are required before any capability-gated code can run.
3. Extend `AgentBuilder.js` with `buildMeTTaLoop()` — wires `MeTTaInterpreter`, registers all grounded ops (`check-embodiment-bus`, `llm-invoke`, `parse-response`, `execute-commands`, `cap?`, etc.), loads `AgentLoop.metta`. This is startup wiring code, not a new class.
4. Implement `AgentLoop.metta` and `skills.metta` (parity-tier skills only).
5. Implement `SkillDispatcher.js` with S-expression parse, handler registration, JSON fallback.
6. **Note on `build-context`:** Phase 1 implements it as a JS function registered as a grounded op. It reads slot data from existing sources (history file, `&lastresults`, `&error`, `&wm`) and assembles a string. Promoting it to a full MeTTa function happens when context modification becomes useful in Phase 6.
7. Implement `tick-wm` grounded op — decrements TTLs in `&wm`, drops expired entries, called at the top of each loop cycle before context assembly.
8. Register `attend` and `dismiss` skill handlers; wire `autoAttendThreshold` check into `check-embodiment-bus` (high-salience inputs auto-attend).
9. Add `"controlPlane"` check to `Agent.js` startup: `"mettaControlPlane": true` routes to `buildMeTTaLoop()`; false uses existing LIDA path.
10. **Test:** `profile: parity` (minus `semanticMemory`) runs 3 cycles with mock LLM; `(attend ...)` item persists across cycles; expires at TTL 0; correct skill dispatch; graceful malformed-output recovery.

**Phase 1 Refinements** (when extending with new Evolution-tier capabilities):
11. **Extend `SkillDispatcher.js`**: Add conditional hook orchestration logic (§5.3.1) gated on `config.capabilities.executionHooks`. When disabled, bypass with zero overhead.
12. **Add dynamic discovery stub**: Implement `discover-skills` grounded op that scans `memory/skills/*.metta` (filesystem only, no SKILL.md parsing yet). Register discovered skills with existing `register()` method.
13. **Register introspection ops**: Add `manifest`, `skill-inventory`, `subsystems`, `agent-state` grounded ops to `AgentBuilder.buildMeTTaLoop()`. Implement minimal stub output that respects `runtimeIntrospection` capability flag.
14. **Update `agent.json` schema** (§13.1): Add `dynamicSkillDiscovery`, `executionHooks`, `runtimeIntrospection` flags with defaults `false`.
15. **Test:** With new flags disabled, existing Phase 1 behavior unchanged. With flags enabled: dynamic skill file loaded on startup; `(manifest)` returns structured output; pre-hook can block a skill call.

### Phase 2 — Semantic Memory

**Deliverable:** Cross-session embedding memory; RECALL and PINNED slots populated in context.

1. Add `hnswlib-node` to `agent/package.json`; add `vectra` as a pure-JS fallback for environments that cannot compile native bindings. Neither is currently present.
2. Implement `Embedder.js` — lazy ONNX load; OpenAI API fallback.
3. Implement `SemanticMemory.js` with private `VectorIndex`, `PersistentSpace` backing, `restore()` on startup.
4. Register `remember`, `query`, `pin`, `forget` handlers in `SkillDispatcher`; these supersede the `MemoryExtension.js` bindings for LLM-facing skill calls (see §5.4).
5. Wire RECALL and PINNED slots into the JS `build-context` function.
6. Supersede `PersistenceManager.js` — existing persisted state migrated to atom format.
7. **Test:** 200 items stored; query returns correct top-5 by cosine; survives restart; RECALL slot populated.

### Phase 3 — Multi-Model Intelligence

**Deliverable:** ModelRouter routes by task type; model preferences learned and persisted.

1. Implement `ModelRouter.js` — NAL expectation scoring from `model-score` atoms in SemanticMemory; `AIClient.js` is the LLM provider (no adapter wrapper); inline latency/token tracking.
2. Implement `ModelBenchmark.js` — micro-task evaluator (5 canonical tasks per type, auto-scored).
3. Register `eval-model` and `set-model` skill handlers.
4. Wire `modelScoreUpdates` path: post-invocation `Truth_Revision` on the relevant `model-score` atom.
5. **Test:** Two providers configured; router selects correct model after 10 observations per task type.

### Phase 4 — Safety & Accountability

**Deliverable:** Tier-gated skill execution; audit trail; shell guard.

1. Implement `safety.metta` with **direct rules only** — one `(consequence-of skill consequence risk)` fact per skill. No chaining in this phase.
2. Implement `SafetyLayer.js` — tier lookup, 50ms-budgeted MeTTa inference, fail-closed on timeout.
3. Implement `AuditSpace.js` — append-only `PersistentSpace`; `emitEvent(type, data)` API.
4. Implement `ShellGuard` (inline in shell skill handler, ~30 lines) — allowlist check, `child_process.spawn` with `shell: false`.
5. Wire `SafetyLayer` into `SkillDispatcher`.
6. **Test:** Blocked skills produce audit atoms with zero overhead when `safetyLayer: false`.

**Phase 4 Extension** (when adding hook system):
7. **Promote `SafetyLayer` to hook substrate**: Refactor `SafetyLayer.check()` to become the *first* pre-skill hook in the `HookOrchestrator` pipeline. Existing safety rules migrate to `hooks.metta` format:
   ```metta
   ;; Old safety.metta
   (consequence-of (shell $cmd) (system-state-change :unknown) :high)

   ;; New hooks.metta equivalent
   (hook pre (shell $cmd)
         (if (high-risk? $cmd)
           (deny "High-risk shell command")
           (allow)))
   ```
8. **Backward compatibility**: When `executionHooks` is false but `safetyLayer` is true, run legacy `SafetyLayer.check()` path. When both enabled, safety rules run as first pre-hook.

### Phase 4.5 — Execution Hooks & Runtime Introspection

**Deliverable:** Declarative hook system; structured self-description primitives.

1. Implement `HookOrchestrator.js` with pre/post hook execution, mutation/deny/audit actions.
2. Create `hooks.metta` with example rules for common patterns (audit logging, input sanitization, permission checks).
3. Complete `IntrospectionOps.js` with full manifest generation, skill inventory, subsystem description.
4. Wire `(manifest)` output into `build-context`'s new `AGENT_MANIFEST` slot (between `PINNED` and `RECALL`).
5. **Test:** Pre-hook blocks forbidden skill; post-hook emits audit event; `(manifest)` returns structured atom; agent can `(metta (query "what skills do I have?"))` using introspection output.

### Phase 5 — Embodiment Abstraction

**Deliverable:** Channel-agnostic I/O; multi-embodiment; internal self-directed channel.

1. Define `Embodiment` interface (connect/disconnect/send/receive/profile/salience).
2. Implement `EmbodimentBus.js` — registration, FIFO or salience-ordered `getNextMessage()`, broadcast.
3. Implement `VirtualEmbodiment.js` — task queue, self-task generation, sub-agent scoping.
4. Update `IRCChannel`, `NostrChannel`, `CLIChannel` to implement `Embodiment`.
5. Replace `ChannelManager.js` with `EmbodimentBus` — `ChannelManager` is superseded.
6. Register `send-to` and `spawn-agent` skill handlers.
7. **Test:** Two embodiments active; `getNextMessage()` FIFO and salience-ordered modes both work.

### Phase 6 — Meta-Harness & Self-Improvement

**Deliverable:** Agent improves its own prompts and skills.

1. Implement `HarnessOptimizer.js` — failure sampling, diff proposal via `:introspection` model, candidate replay, conditional install, git commit.
2. Promote `build-context` from JS function to `ContextBuilder.metta` — makes context assembly a MeTTa program the agent can read and reason about.
3. Implement `add-skill` handler — appends to `skills.metta` via `&add-rule` + file write; requires `SafetyLayer` gate.
4. Implement `memoryConsolidation` self-task — NAL revision over near-duplicate atoms, decay, prune, generalize episodic→procedural.
5. Wire `RLFPLearner.js` output into `ModelRouter` — `rlfp_training_data.jsonl` preference entries update `model-score` atoms.
6. Implement `selfEvaluation` self-task — agent scores recent outputs against stored preference atoms.
7. **Test:** Harness modification cycle runs end-to-end; version committed to git; `git log memory/harness/` shows history.

**Phase 6 Extensions** (when integrating verification and dynamic reload):
8. **Integrate verification loop**: Extend `HarnessOptimizer` to use introspection primitives for pre/post-change validation (§5.8.1).
9. **Dynamic skill reload**: When `selfModifyingSkills` writes to `memory/skills/`, trigger `discover-skills` re-scan; validate new skill via `SafetyLayer` before registration.

---

## 7. Safety & Accountability

### 7.1 Capability Tiers

```metta
;; Stored as atoms; inspectable by agent; not self-modifiable
(capability-grant :tier :reflect     :granted true  :reason "Always available")
(capability-grant :tier :memory      :granted true  :reason "Conditional on semanticMemory flag")
(capability-grant :tier :local-read  :granted true  :reason "Read within cwd")
(capability-grant :tier :network     :granted true  :reason "Send and search")
(capability-grant :tier :local-write :granted false :reason "Disabled by default")
(capability-grant :tier :system      :granted false :reason "Shell disabled by default")
(capability-grant :tier :meta        :granted false :reason "Self-modification disabled by default")
```

Grants derive from `agent.json`. The agent can read them; changing them requires editing `agent.json` and restarting.

### 7.2 safety.metta — Phase 4 (Direct Rules)

Phase 4 ships with one fact per skill. No consequence chaining — that complexity is earned, not assumed.

```metta
;; (consequence-of skill-call consequence risk-level)
(= (consequence-of (shell $cmd)         (system-state-change :unknown)   :high))
(= (consequence-of (write-file $p $_)   (file-modified $p)               :medium))
(= (consequence-of (append-file $p $_)  (file-modified $p)               :medium))
(= (consequence-of (send $msg)          (message-delivered :external)    :medium))
(= (consequence-of (send-to $c $msg)    (message-delivered :external $c) :medium))
(= (consequence-of (remember $s)        (memory-updated :local)          :low))
(= (consequence-of (search $q)          (network-request :outbound)      :low))
(= (consequence-of (add-skill $def)     (skills-modified)                :high))
(= (consequence-of (write-file "memory/harness/prompt.metta" $_)
                   (system-prompt-modified) :critical))
```

Consequence chaining (A→B→C inference) is a Phase 6+ extension when the direct rules have been observed in practice.

**Migration note**: When `executionHooks` is enabled, `safety.metta` rules are automatically wrapped as pre-skill hooks by `HookOrchestrator`. Authors may migrate rules to `hooks.metta` for finer control (mutation, conditional denial, post-execution audit). Both formats coexist; `hooks.metta` takes precedence for skills with defined hooks.

### 7.3 Shell Guard

`shellSkill` is `false` by default. When enabled:

```json
"shell": {
  "allowlist": ["git status", "git log --oneline", "npm test", "node --version"],
  "allowedPrefixes": ["git "],
  "forbiddenPatterns": ["rm", "sudo", "curl", "wget", ">", "|", ";", "&&", "`", "$(", "eval"]
}
```

Execution always uses `child_process.spawn` with `shell: false` and pre-split argument array. Never `exec` with a raw string.

### 7.4 Audit Events

```metta
(audit-event
  :id        "aud_1743432001_xyz"
  :timestamp 1743432001000
  :type      :skill-blocked         ; :skill-invoked | :skill-blocked | :llm-call | :memory-write | :harness-modified
  :skill     (write-file "/etc/passwd" "...")
  :reason    "Path traversal outside workdir"
  :cycle     42
  :model     "gpt-4o"
)
```

The agent reads its own audit log via `(metta (get-atoms &audit-space))`. This is the diagnostic substrate for `HarnessOptimizer`.

### 7.5 Declarative Hook Rules (`hooks.metta`)

**Location:** `agent/src/metta/hooks.metta`
**Governed by:** `executionHooks`

**Rule format**:
```metta
(hook <phase> <skill-pattern> <hook-body>)
```

Where:
- `<phase>`: `pre` or `post`
- `<skill-pattern>`: S-expression pattern matching skill name and args, e.g., `(shell $cmd)`, `(write-file $p $_)`
- `<hook-body>`: MeTTa expression that returns one of:
  - `(allow)` — proceed with original/modified args
  - `(deny reason-string)` — block execution, emit audit event
  - `(rewrite new-args)` — mutate arguments before handler execution (pre-hook only)
  - `(audit event-atom)` — append to audit log (post-hook only)

**Built-in predicates** (available in hook bodies):
- `(contains-forbidden? $str)` — checks against `agent.json` `shell.forbiddenPatterns`
- `(path-within? $path $base)` — validates file paths are within allowed directory
- `(capability-enabled? $flag)` — checks if capability flag is active
- `(audit-emit $atom)` — appends atom to `&audit-space`

**Example rules**:
```metta
;; Block shell commands with forbidden patterns
(hook pre (shell $cmd)
      (if (contains-forbidden? $cmd)
        (deny "Forbidden pattern in shell command")
        (allow)))

;; Auto-audit all file writes
(hook post (write-file $p $c)
      (audit-emit (audit-event :type :file-write :path $p :size (string-length $c))))

;; Sanitize search queries
(hook pre (search $q)
      (rewrite (search (string-append $q " safe_search=active"))))
```

**Execution order**: Hooks execute in declaration order. First `(deny)` stops the chain; `(rewrite)` mutations accumulate.

---

## 8. Multi-Model Intelligence

### 8.1 Philosophy

Every model is broken. "Which one is least wrong for this task, right now?" is the empirical question. NAL truth values are the answer format: frequency encodes success rate, confidence encodes sample size.

### 8.2 NAL Scoring

```metta
(model-score "gpt-4o"            :reasoning     (stv 0.85 0.72))  ; 72% confident
(model-score "claude-sonnet-4-6" :introspection (stv 0.91 0.82))
(model-score "llama3.2"          :code          (stv 0.60 0.45))  ; few samples
```

Selection uses NAL expectation `E = f + c*(0.5 - f)` — a model with `stv(0.8, 0.1)` (high frequency, low confidence) scores lower than `stv(0.75, 0.9)` (slightly lower frequency, well-established). This prevents overconfident routing on thin evidence.

Post-invocation update (when `modelScoreUpdates`):
- Success: `Truth_Revision(current, stv(1.0, 0.9))`
- Failure: `Truth_Revision(current, stv(0.0, 0.9))`

### 8.3 The Fine-Tuning Trajectory

The architecture makes this trajectory possible without architecture changes:

1. `rlhfCollection` collects labeled traces → `rlfp_training_data.jsonl` (already implemented in `RLFPLearner.js`)
2. `HarnessOptimizer` curates high/low scoring pairs per task type
3. Pairs → Ollama fine-tuning workflow → local model checkpoint
4. New model registered in `agent.json` providers; `eval-model` benchmarks it
5. `ModelRouter` picks it up when NAL scores justify it

### 8.4 Configuration

```json
"models": {
  "fallback":          "gpt-4o-mini",
  "explorationRate":   0.2,
  "providers": {
    "openai":    { "enabled": true,  "models": ["gpt-4o", "gpt-4o-mini"] },
    "anthropic": { "enabled": true,  "models": ["claude-sonnet-4-6"] },
    "ollama":    { "enabled": true,  "models": ["llama3.2", "qwen2.5-coder"] }
  }
}
```

---

## 9. Embodiment Abstraction

### 9.1 Principle

The agent does not exist _in_ IRC. It exists, and its existence has embodiments. Each embodiment is a named, typed I/O interface. Agent identity and reasoning are independent of embodiment.

When `multiEmbodiment` is false, `EmbodimentBus` wraps a single channel. The agent loop never needs to know the difference.

### 9.2 Embodiment Interface

```javascript
class Embodiment extends EventEmitter {
  get id()     {}  // "irc-quakenet", "nostr-main", "cli", "virtual-self"
  get type()   {}  // "irc" | "nostr" | "matrix" | "cli" | "api" | "virtual"

  async connect()           {}
  async disconnect()        {}
  async send(message, opts) {}  // opts: { target, format, replyTo }
  async receive()           {}  // returns Message | null (non-blocking)

  get profile()  {}  // { displayName, context, users }
  get salience() {}  // float 0–1: urgency of input from this embodiment right now
}
```

### 9.3 VirtualEmbodiment

Always present when `virtualEmbodiment` enabled. Powers:
- **Self-tasks:** Idle autonomous cycles inject tasks into its queue (consolidate memory, eval-model, analyze traces).
- **Goal pursuit:** Active goals spawn sub-tasks via `goalPursuit`.
- **Sub-agents:** `spawn-agent` creates a new VirtualEmbodiment instance with isolated context, runs N cycles, returns result.

### 9.4 EmbodimentBus.getNextMessage()

Returns the highest-salience pending message across all active embodiments. When `attentionSalience` is false: FIFO. When enabled: uses `Message.salience` (set by each embodiment based on mention detection, user history, channel priority).

---

## 10. Meta-Harness: Self-Improving Prompts

### 10.1 Inspiration

From [Lee (2025), "Meta-Harness"](https://yoonholee.com/meta-harness/): give the optimizer direct access to raw execution traces rather than summaries. Results: cross-model transfer, 10× sample efficiency over program-search, +7.7 points on classification benchmarks.

Here the agent _is_ the optimizer — no external process. The same agent loop that acts also improves itself during autonomous idle cycles.

### 10.2 What "Harness" Means Here

| File | Writable by Agent | Governing Flag |
|---|---|---|
| `memory/harness/prompt.metta` | Yes | `harnessOptimization` |
| `agent/src/metta/skills.metta` | Yes | `selfModifyingSkills` |
| `agent/src/metta/ContextBuilder.metta` | Yes (Phase 6+) | `harnessOptimization` |

### 10.3 Optimization Cycle

Runs as a `VirtualEmbodiment` self-task every `harnessEvalInterval` cycles (default 200):

```
1. Sample 20 recent audit atoms where skill failed, parse error occurred,
   or self-evaluation scored output below preference threshold

2. Read current harness files

3. Invoke with :introspection task type:
   "Given these failures, propose ONE targeted change to the system prompt
    as a unified diff."

4. Apply diff to memory/harness/prompt.candidate.metta

5. Replay 10 sampled recent tasks with candidate harness; score outputs

6. If score > current + threshold:
     git commit -m "harness-update: cycle N, +Δ score" memory/harness/prompt.metta
   Else:
     discard candidate

7. Emit (audit-event :type :harness-modified :result :improved/:rejected :delta Δ)
```

**Version history is git.** `memory/` is committed to the repo. `git log memory/harness/` shows the full modification history. `git revert` is the rollback. No custom versioning scheme is needed or built.

### 10.4 Trace Storage

```
memory/
├── traces/YYYY-MM-DD/cycle_{N}.jsonl  — context, response, skills, results per cycle
├── harness/prompt.metta               — current system prompt
├── history.metta                      — append-only conversation/action history
└── audit.metta                        — append-only audit atoms
```

The agent can `(shell "grep parse-error memory/traces/$(date +%F)/*.jsonl")` to diagnose failure patterns — filesystem-based diagnosis as the Meta-Harness paper advocates, available as a skill.

---

## 11. Memory Architecture

The design has three distinct temporal layers with different persistence characteristics and decay mechanisms. Understanding each one prevents confusing them.

### 11.1 Three-Tier Temporal Model

| Layer | Storage | Decay Mechanism | Purpose |
|---|---|---|---|
| **Working Memory Register** (`&wm`) | RAM (state var) | TTL countdown per cycle | "Keep this in mind" without persisting; survives across cycles by design |
| **Context Window** | Assembled per cycle | Budget truncation (oldest first) | Current cognitive workspace; history slot provides recency gradient |
| **Long-term Memory** | PersistentSpace + HNSW | `beliefDecay` on truth confidence per cycle | Survives restarts; indexed for semantic recall |

These are not redundant. They serve different temporal scales and different failure modes.

### 11.2 Working Memory Register (`&wm`)

The register is a small in-RAM ordered list of `(content, priority, ttl-remaining)` tuples. Default TTL is 10 cycles. It is **not** a LIDA working memory system — no capacity constraint, no competitive slot selection, no complex attention algorithm. It is the simplest structure that preserves the key temporal property: **the ability to hold something in mind across multiple cycles without writing it to long-term memory and without relying on the history slot to keep it visible.**

```metta
;; &wm entry format
(wm-entry :content "ping Alice when task is complete"
          :priority 0.8
          :ttl      7        ; 3 cycles have elapsed since this was attended to
          :source   "user42"
          :cycle-added 5)
```

**Lifecycle:**
- `(attend content priority)` skill adds an entry with default TTL from config
- `(dismiss content)` removes a matching entry immediately
- `tick-wm` (called at the top of each cycle, before context assembly) decrements all TTLs and drops any that reach 0
- High-salience inputs from `check-embodiment-bus` automatically call `attend` (threshold configurable)
- When an item expires, it is NOT automatically written to long-term memory — the agent must have explicitly `(remember ...)`-ed it if it wanted persistence

**WM_REGISTER context slot** (between PINNED and RECALL in context assembly):
```
WM_REGISTER     — 1,500 chars  — current &wm entries, sorted by priority
AGENT_MANIFEST  — 2,000 chars  — condensed output of (manifest) when runtimeIntrospection enabled
```

This ensures the LLM sees "things currently held in mind" separately from recalled long-term memories and scrolling history — a meaningful epistemic distinction. The AGENT_MANIFEST slot provides structured self-knowledge in-context without needing to invoke `(metta (manifest))` explicitly.

**Why not use the context window alone?** Two scenarios where `&wm` adds value the context window cannot provide:
1. **Instruction across many cycles:** "Check on that deployment in 20 minutes" — with a 50-cycle budget at 2s sleep, that's 600s. The instruction needs to persist in a dedicated register, not compete with history budget.
2. **Priority tagging:** Items in `&wm` have explicit priorities the agent set. History is flat. The LLM can reason about what the agent chose to "keep in mind" vs. what just happened to flow through.

**Configuration:**
```json
"workingMemory": {
  "defaultTtl":           10,
  "autoAttendThreshold":  0.7,
  "maxEntries":           20
}
```

`maxEntries` is a soft cap — if exceeded, lowest-priority entry is dropped. Unlike LIDA's fixed-7 model, this is a practical limit, not a cognitive theory claim.

### 11.3 Persistent Memory Atom Types

| Type | Description | Governed by |
|---|---|---|
| `:episodic` | Conversation events with timestamps | `semanticMemory` |
| `:semantic` | Declarative facts and relationships | `semanticMemory` |
| `:procedural` | Skills, learned patterns, generalizations | `semanticMemory` + `memoryConsolidation` |
| `:pinned` | High-priority; always included in context | `semanticMemory` |

No atom types for sensory or working memory — those are transient and managed as state variables, not as stored atoms.

### 11.4 Temporal Reasoning Capabilities Summary

| Capability | Mechanism |
|---|---|
| "Keep X in mind for N cycles" | `(attend X priority)` → `&wm` with TTL |
| "Forget X immediately" | `(dismiss X)` removes from `&wm`; `(forget X)` removes from SemanticMemory |
| Recency gradient in context | HISTORY slot truncates oldest-first by budget |
| Long-term belief decay | `beliefDecay` multiplier per cycle on `:truth` confidence (via `memoryConsolidation`) |
| Temporal distance in NAL inference | Timestamp on every atom; truth revision weights recency |
| Full LIDA cognitive cycle | `(cognitive-cycle $stimulus)` invokes `CognitiveArchitecture.js` as a skill |

### 11.5 Embedder Strategy

| Config | Model | Dim | Cost |
|---|---|---|---|
| Default | `Xenova/all-MiniLM-L6-v2` | 384 | Free, local |
| Higher quality | `Xenova/all-mpnet-base-v2` | 768 | Free, local |
| API | OpenAI `text-embedding-3-small` | 1536 | Per-token |

Lazy-initialized on first `remember` call. 50k items at 384 dim ≈ 75MB in the `.vec` sidecar.

### 11.6 Consolidation (when `memoryConsolidation` enabled)

Runs every `consolidationInterval` cycles (default 100) as a VirtualEmbodiment self-task:
- NAL `Truth_Revision` over atoms with cosine similarity > 0.95 (merge near-duplicates)
- Multiply `:truth` confidence by `(1 - beliefDecay)` per cycle
- Prune atoms with confidence below `pruneThreshold` (default 0.2)
- Generalize clusters of `:episodic` patterns into `:procedural` atoms

When `executionHooks` is enabled, consolidation self-task emits `(audit-event :type :memory-consolidation :pruned N :merged M)` via post-hook, making memory management observable.

---

## 12. File Structure

15 new files. No existing files deleted (except `MeTTaReasoner.js` is superseded — its regex heuristics replaced by actual `metta/` evaluation via the loop).

```
agent/src/
├── metta/
│   ├── AgentLoop.metta          ← control plane loop (Phase 1)
│   ├── skills.metta             ← skill declarations, living document (Phase 1)
│   ├── safety.metta             ← consequence rules (Phase 4)
│   ├── hooks.metta              ← declarative hook rules (Phase 4.5)
│   └── ContextBuilder.metta     ← context assembly as MeTTa program (Phase 6)
│
├── skills/
│   ├── SkillDispatcher.js       ← S-expr parse + dispatch + registry (Phase 1)
│   └── HookOrchestrator.js      ← pre/post hook execution engine (Phase 4.5)
│
├── introspection/
│   └── IntrospectionOps.js      ← manifest/skill-inventory/subsystems grounded ops (Phase 4.5)
│
├── memory/
│   ├── SemanticMemory.js        ← PersistentSpace + HNSW + Embedder (Phase 2)
│   └── Embedder.js              ← @huggingface/transformers wrapper (Phase 2)
│
├── models/
│   ├── ModelRouter.js           ← task-type routing + NAL scoring (Phase 3)
│   └── ModelBenchmark.js        ← micro-task evaluator (Phase 3)
│
├── io/
│   ├── Embodiment.js            ← abstract interface; implemented by all channels (Phase 5)
│   ├── EmbodimentBus.js         ← I/O router (Phase 5)
│   └── VirtualEmbodiment.js     ← internal self-directed channel (Phase 5)
│   (IRCChannel, NostrChannel, CLIChannel adopt Embodiment interface)
│
├── safety/
│   ├── SafetyLayer.js           ← consequence analysis + tier gates (Phase 4)
│   └── AuditSpace.js            ← append-only PersistentSpace (Phase 4)
│
├── harness/
│   └── HarnessOptimizer.js      ← meta-harness optimization (Phase 6)
│
└── config/
    └── capabilities.js          ← isEnabled() + validateDeps() (Phase 1)

agent/workspace/
└── agent.json                   ← capability flags, profile, model config (Phase 1)

memory/                          ← runtime memory, git-tracked
├── skills/                      ← dynamic skill definitions directory (Phase 1 refinement)
│   └── *.metta                  ← agent-writable skill files (when dynamicSkillDiscovery)
├── harness/
│   └── prompt.metta             ← current system prompt (agent-writable)
├── traces/YYYY-MM-DD/           ← execution traces
├── history.metta                ← append-only conversation history
└── audit.metta                  ← append-only audit atoms
```

**Files superseded (not deleted immediately; replaced when their phase lands):**

| Old File | Superseded By | Phase |
|---|---|---|
| `cognitive/MeTTaReasoner.js` | AgentLoop.metta + metta/ interpreter | 1 |
| `io/ChannelManager.js` | EmbodimentBus.js | 5 |
| `io/PersistenceManager.js` | SemanticMemory.js | 2 |
| `metta/MemoryExtension.js` (LLM-facing bindings only) | SkillDispatcher SemanticMemory handlers | 2 |
| *(none)* | `HookOrchestrator.js` | 4.5 |
| *(none)* | `IntrospectionOps.js` | 4.5 |

---

## 13. Key Interfaces

### 13.1 agent.json Schema

```json
{
  "profile": "parity",

  "capabilities": { },

  "loop": {
    "budget":            50,
    "sleepMs":           2000,
    "maxSkillsPerCycle": 3,
    "maxParseRetries":   3
  },

  "memory": {
    "maxRecallItems":    20,
    "maxRecallChars":    8000,
    "maxHistoryChars":   12000,
    "maxFeedbackChars":  6000,
    "pinnedMaxChars":    3000,
    "wmRegisterChars":   1500,
    "embedder":          "Xenova/all-MiniLM-L6-v2",
    "vectorDimensions":  384,
    "beliefDecay":       0.001,
    "pruneThreshold":    0.2,
    "consolidationInterval": 100
  },

  "workingMemory": {
    "defaultTtl":          10,
    "autoAttendThreshold": 0.7,
    "maxEntries":          20
  },

  "models": {
    "fallback":          "gpt-4o-mini",
    "explorationRate":   0.2,
    "providers": {
      "openai":    { "enabled": true,  "models": ["gpt-4o", "gpt-4o-mini"] },
      "anthropic": { "enabled": true,  "models": ["claude-sonnet-4-6"] },
      "ollama":    { "enabled": true,  "models": ["llama3.2", "qwen2.5-coder"] }
    }
  },

  "shell": {
    "allowlist":         ["git status", "git log --oneline", "npm test"],
    "allowedPrefixes":   ["git "],
    "forbiddenPatterns": ["rm", "sudo", "curl", "wget", ">", "|", ";", "&&", "`", "$(", "eval"]
  },

  "harness": {
    "harnessEvalInterval":  200,
    "minScoreImprovement":  0.05,
    "replayTaskSampleSize": 10
  },

  "safety": {
    "timeoutMs":  50,
    "failClosed": true
  }
}
```

### 13.2 SkillDispatcher API

```javascript
class SkillDispatcher {
  register(name, handler, capFlag, tier)  // Register a JS handler for a skill
  async execute(parsedCmds)               // [{ name, args }] → [{ skill, result, error }]
  getActiveSkillDefs()                    // S-expr strings for skills visible with current capabilities
  hasSkill(name)                          // boolean
}
```

### 13.3 SemanticMemory API

```javascript
class SemanticMemory {
  async remember(content, source, type, tags)   // embed + store atom
  async query(text, k)                           // top-K similar atoms
  async pin(content, source)                     // remember with :type :pinned
  async forget(queryText)                        // remove matching atoms
  async queryByType(type)                        // get atoms of specific type
  async restore()                                // load from disk on startup
  async forceCheckpoint()                        // flush to disk immediately
}
```

### 13.4 ModelRouter API

```javascript
class ModelRouter {
  async invoke(contextStr, opts = {})      // opts: { taskType, forceModel }
                                           // returns { response, model, latency, tokens }
  async benchmark(modelId, taskType, n)    // run micro-tasks, update scores
  getScores(taskType)                      // [{ modelId, truth: {f, c} }] from SemanticMemory
}
```

### 13.5 AgentBuilder extension (Phase 1 addition)

```javascript
// Extends existing AgentBuilder.js
buildMeTTaLoop(config) {
  const interp = new MeTTaInterpreter();
  loadNALStdlib(interp);

  const dispatcher = new SkillDispatcher();
  this._registerAllSkills(dispatcher, config);  // one registration per skill

  const caps = (flag) => isEnabled(config, flag);

  interp.registerOp('check-embodiment-bus',  () => this.channelManager.getNext());
  interp.registerOp('generate-self-task',    () => this.virtualEmbodiment?.generateTask());
  interp.registerOp('llm-invoke',            (ctx) => this.modelRouter.invoke(ctx));
  interp.registerOp('parse-response',        (s) => dispatcher.parse(s));
  interp.registerOp('execute-commands',      (cmds) => dispatcher.execute(cmds));
  interp.registerOp('build-context',         (msg) => this.contextBuilder.build(msg));
  interp.registerOp('append-history',        (...a) => this.history.append(...a));
  interp.registerOp('emit-cycle-audit',      (...a) => this.auditSpace?.emit(...a));
  interp.registerOp('sleep-cycle',           () => sleep(config.loop.sleepMs));
  interp.registerOp('cap?',                  (flag) => caps(flag));
  interp.registerOp('reset-budget',          () => config.loop.budget);
  interp.registerOp('get-state',             (k) => interp.getState(k));
  interp.registerOp('new-message?',          (m) => m !== null && m !== interp.getState('&prevmsg'));
  interp.registerOp('no-input?',             (m) => m === null);

  interp.loadFile('agent/src/metta/AgentLoop.metta');
  return () => interp.run('(agent-start)');
}
```

**Phase 1 execution model note:** The MeTTa interpreter's `runAsync` doesn't yet propagate through async grounded ops mid-reduction. The JS loop in `_buildMeTTaLoop` mirrors `AgentLoop.metta` semantics exactly as a transitional shim. When the interpreter gains proper async grounded-op support, `_buildMeTTaLoop` returns `() => interp.runAsync('!(agent-start)')` and the JS loop is dropped — no other changes needed. The MeTTa files are loaded, rules are in the space for introspection and future execution.

---

## 14. Design Decisions & Rationale

### 14.1 S-Expressions Over JSON Tool Calls

1. **Provider-agnostic.** Any model that can follow text formatting instructions can output `((remember "foo") (send "hello"))`. JSON function calling is a provider-specific protocol.
2. **MeTTa alignment.** The LLM output _is_ a MeTTa program. `parse-response` + interpreter execute it directly.
3. **Fallback preserved.** `sExprSkillDispatch: false` reverts to `ToolAdapter.js` JSON path. Weak models that cannot follow S-expression format still work.

### 14.2 No New Abstraction Classes for Thin Wrappers

`LLMAdapter`, `ModelPreferences`, `VectorIndex`, `CapabilityManager`, `SkillRegistry`, `AgentMeTTaBridge` were all removed as separate files. In each case:
- The behavior is 5–30 lines in a more natural home (`ModelRouter`, `SemanticMemory`, `SkillDispatcher`, `capabilities.js`, `AgentBuilder`).
- The "abstraction" didn't add a meaningful interface boundary — just indirection.

The rule applied: a file justifies its existence when it owns a distinct contract. A file that only wraps another file's methods doesn't own a contract.

### 14.3 Working Memory: Simplified, Not Eliminated

The full LIDA working memory model (7-slot capacity constraint, competitive slot selection, complex salience-based attention) was removed — those specifics are human cognitive constraints that don't apply to LLM context windows.

What was preserved is the key temporal property: the `&wm` register with TTL countdown. This gives the agent a "keep in mind" mechanism that operates on a cycle timescale distinct from both the per-cycle context window and the persistent long-term memory. The difference matters in practice: "check on that deployment in 20 minutes" cannot be handled by context window alone if history budget is tight, and explicit `(remember ...)` is the wrong granularity for transient intent.

The three-tier model (register / context / long-term) maps to three distinct temporal scales: seconds-to-minutes (`&wm`), current session window (history slot), and persistent across restarts (SemanticMemory). Each tier has its own decay mechanism appropriate to its scale.

### 14.4 Git is the Harness Version History

A custom versioning scheme (`prompt.v001.metta`, `prompt.v002.metta`) is strictly worse than git: less queryable, no diff support, no merge support, manual numbering. `memory/` is already inside a git repo. `git log memory/harness/`, `git show`, `git revert` are the version history tools.

### 14.5 Safety Consequence Chaining is Earned, Not Assumed

Phase 4 ships direct rules only. Chaining (`A→B, B→C ⟹ A→C`) adds significant MeTTa inference complexity. It is only valuable once the direct rules have proven too coarse. Implementing it speculatively would mean debugging complex inference behavior before the simpler behavior is even validated.

### 14.6 PersistentSpace as the Memory Substrate

`metta/src/extensions/PersistentSpace.js` already provides Merkle hash integrity, CRDT vector clocks, and both FS and IndexedDB backends. Using it for `SemanticMemory` and `AuditSpace` means the memory architecture benefits from CRDT merge semantics — which `harnessDiffusion` (Phase 7+) will need.

### 14.7 Declarative Hooks Over Imperative Middleware

The `executionHooks` capability implements a *declarative* hook system (`hooks.metta`) rather than imperative middleware for three reasons:

1. **Agent-readable**: Hooks are MeTTa atoms the agent can query, reason about, and (when gated) modify. Imperative JS middleware would be opaque.
2. **Composable**: Multiple hooks can match the same skill; execution order is explicit in the file. Middleware chains often have implicit ordering.
3. **Testable**: Hook rules can be unit-tested in isolation via `(metta (hook pre ...))` evaluation. Middleware requires full request/response mocking.

The tradeoff: hook evaluation adds ~5-10ms overhead per skill call. This is acceptable because hooks only execute when `executionHooks` is enabled (Evolution tier), and the safety/audit benefits outweigh the latency for high-risk skills.

### 14.8 Dynamic Skill Discovery: Safety vs. Flexibility

`dynamicSkillDiscovery` enables agent-extensible skill registration but introduces risk of loading malformed or malicious definitions. Mitigations:

1. **Parsing gate**: All discovered files pass through `metta/Parser.js`; syntax errors produce audit warnings, not crashes.
2. **Capability gate**: Dynamically discovered skills inherit the capability flag specified in their `(skill ...)` declaration. A skill requiring `shellSkill` cannot execute if that flag is disabled.
3. **SafetyLayer integration**: When both `dynamicSkillDiscovery` and `safetyLayer` are enabled, newly discovered skills are validated against `safety.metta`/`hooks.metta` before registration.
4. **Audit trail**: Every dynamic registration emits `(audit-event :type :skill-registered :source $file :skill $name)`.

The design prioritizes *inspectability*: the agent can `(metta (query "skills registered from dynamic discovery"))` to audit its own extensions.

### 14.9 Runtime Introspection Enables Self-Verification

Exposing `manifest`, `skill-inventory`, etc. as always-available grounded ops (gated by `runtimeIntrospection` for content richness) serves two purposes:

1. **Agent self-knowledge**: The LLM can query `(metta (manifest))` to get structured capability state, reducing prompt engineering overhead for "what can I do?" questions.
2. **External tooling**: CLI wrappers, monitoring dashboards, and verification scripts can invoke `(metta (manifest))` to audit agent state without parsing logs.

The minimal-overhead implementation (5-cycle cache, conditional output) ensures introspection is available even on resource-constrained deployments.

### 14.10 Transitional JS Loop Shim

Phase 1 implements the agent loop twice: once in `AgentLoop.metta` (canonical semantics) and once in JS (`_buildMeTTaLoop`). This duplication is intentional and temporary:

1. **JS shim now**: The MeTTa interpreter's `runAsync` doesn't yet propagate through async grounded ops mid-reduction. The JS loop provides the async orchestration needed for LLM calls, skill execution, and sleep cycles.
2. **Pure MeTTa later**: When the interpreter gains proper async grounded-op support, the JS loop is dropped. `_buildMeTTaLoop` returns `() => interp.runAsync('!(agent-start)')` — no other changes needed.

The JS shim mirrors `AgentLoop.metta` semantics exactly. This ensures the migration path is a simple switch, not a refactor. The MeTTa files are always loaded; rules are in the space for introspection and future execution even while the JS loop drives the cycle.

---

## 15. References

### Codebase Anchors

| File | Role |
|---|---|
| `agent/src/cognitive/MeTTaReasoner.js` | Superseded; replace with real `metta/` evaluation |
| `agent/src/rlfp/RLFPLearner.js` | Feed `rlfp_training_data.jsonl` into `ModelRouter` NAL scoring |
| `agent/src/cognitive/CognitiveArchitecture.js` | Preserved; becomes `(cognitive-cycle $stimulus)` skill |
| `agent/src/ai/AIClient.js` | Called directly by `ModelRouter`; not wrapped |
| `agent/src/ai/ToolAdapter.js` | Retained as JSON tool-call fallback when `sExprSkillDispatch: false` |
| `agent/src/io/ChannelManager.js` | Superseded by `EmbodimentBus`; channels adopt `Embodiment` interface |
| `agent/src/io/PersistenceManager.js` | Superseded by `SemanticMemory`; state migrated to atom format |
| `metta/src/extensions/PersistentSpace.js` | Backing store for `SemanticMemory` and `AuditSpace` |
| `metta/src/kernel/StateOps.js` | MeTTa mutable state ops for loop state variables |
| `metta/src/kernel/ops/MetaprogrammingOps.js` | `&add-rule` / `&remove-rule` for `selfModifyingSkills` |
| `agent/src/metta/ChannelExtension.js` | Existing grounded ops (`send-message`, `web-search`, `read-file`, etc.); `SkillDispatcher` wraps these with capability gates |
| `agent/src/metta/MemoryExtension.js` | Existing `remember`/`recall` bindings against `Memory.js`; superseded for LLM skill calls by Phase 2 `SemanticMemory` handlers |
| `metta/src/nal/stdlib/truth.metta` | NAL truth functions for `ModelRouter` NAL scoring |
| `metta/src/MeTTaInterpreter.js` | Execution engine for `AgentLoop.metta` |
| `mettaclaw/src/loop.metta` | Reference: loop counter, state vars, context structure |
| `mettaclaw/src/skills.metta` | Reference: parity skill set |
| `agent/src/skills/HookOrchestrator.js` | Pre/post-skill hook execution engine; integrates with SafetyLayer |
| `agent/src/introspection/IntrospectionOps.js` | Runtime manifest/skill-inventory generation for agent self-query |
| `agent/src/metta/hooks.metta` | Declarative hook rules; agent-readable safety/audit logic |
| `memory/skills/` | Directory for dynamically discovered skill definitions |

### External

- **Meta-Harness:** Lee (2025). https://yoonholee.com/meta-harness/ — filesystem-based traces, diagnostic context, cross-model transfer, 10× sample efficiency.
- **MeTTa:** https://wiki.opencog.org/w/MeTTa — atom spaces, pattern matching, grounded operations.
- **NAL:** Wang (2006). _Rigid Flexibility: The Logic of Intelligence._ Springer. — NAL truth functions for belief revision and model scoring.
- **RLHF:** Christiano et al. (2017). "Deep Reinforcement Learning from Human Preferences." — preference data format used by `RLFPLearner.js`.
- **HNSW:** Malkov & Yashunin (2018). "Efficient and Robust Approximate Nearest Neighbor Search." — vector index algorithm inside `SemanticMemory`.
- **HuggingFace Transformers.js:** https://huggingface.co/docs/transformers.js — local ONNX embeddings in Node.js.
- **hnswlib-node:** https://github.com/yoshoku/hnswlib-node — HNSW Node.js bindings.
- **vectra:** https://github.com/Stevenic/vectra — pure JS fallback vector store.

---

*Generated: 2026-03-31. This document is itself a candidate for agent-managed evolution once Phase 6 is operational.*
