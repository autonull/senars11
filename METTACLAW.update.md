# Instructions: Update METTACLAW.md with Enhanced Modularity, Hooks & Introspection

> **Scope**: Integrate high-value harness-engineering patterns (dynamic skill discovery, pre/post-execution hooks, runtime introspection primitives, verification workflow patterns) into the existing METTACLAW development plan.  
> **Exclusions**: Do not reference external project names, Rust implementation details, or parity-auditing functionality.  
> **Phase 1 Note**: Phase 1 is already implemented. Where instructions reference Phase 1 components, specify *extension* or *refinement* of existing code, not ground-up implementation.

---

## 1. Update §2 Capability Matrix

### 1.1 Add New Capabilities (Evolution Tier)

Insert these rows into the **Evolution Tier** table (§2.2):

| Flag | Default | What It Does | Risk If Enabled |
|------|---------|-------------|-----------------|
| `dynamicSkillDiscovery` | `false` | Scans `memory/skills/*.metta` and `SKILL.md` files at startup/reload; auto-registers valid skill definitions with `SkillDispatcher` | Agent may load malformed skill definitions; requires `safetyLayer` gate for `add-skill` path |
| `executionHooks` | `false` | Enables declarative `pre-skill-hook` / `post-skill-hook` atoms in `hooks.metta`; hooks execute before/after skill handlers with mutation/deny/audit capabilities | Hook logic errors can block legitimate skill execution; requires careful rule authoring |
| `runtimeIntrospection` | `false` | Exposes `manifest`, `skill-inventory`, `subsystems`, `agent-state` as always-available grounded ops; generates `agent-manifest.metta` with active capabilities, registered skills, model scores | Minor overhead for manifest generation; introspection output may reveal internal structure |

### 1.2 Update Capability Dependencies (§2.4)

Append to the dependency table:

```
dynamicSkillDiscovery → selfModifyingSkills, semanticMemory
executionHooks        → safetyLayer, auditLog
runtimeIntrospection  → mettaControlPlane
```

---

## 2. Update §4 Architecture Overview

### 2.1 Execution Flow Diagram (§4.1)

Insert a new layer between `SkillDispatcher` and `SafetyLayer`:

```
╠════════════════════════════════════════════════════════╣
║               HookOrchestrator  [optional]              ║  ← executionHooks
║   pre-skill / post-skill hooks configured in hooks.metta ║
╠════════════════════════════════════════════════════════╣
```

Add annotation to `SkillDispatcher` row:
> *Supports dynamic registration via `discover-skills` grounded op; scans `memory/skills/` and `SKILL.md` when `dynamicSkillDiscovery` enabled*

### 2.2 Add Introspection Primitives (§4.1, bottom)

Append to the component list:

```
║               IntrospectionOps  [always available]      ║  ← runtimeIntrospection
║   (manifest) (skill-inventory) (subsystems) (agent-state) ║
║   Generate runtime agent-manifest.metta for self-query   ║
```

---

## 3. Update §5 Component Specifications

### 3.1 §5.2 skills.metta — Add Dynamic Discovery Spec

Append this subsection:

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

### 3.2 §5.3 SkillDispatcher.js — Add Hook System Integration

Append this subsection:

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

### 3.3 Add New §5.10 IntrospectionOps.js

Insert after §5.9:

#### 5.10 IntrospectionOps.js — Runtime Self-Description

**Location**: `agent/src/introspection/IntrospectionOps.js`  
**Governed by**: `runtimeIntrospection` (but grounded ops always register; capability gates output content)

**Purpose**: Provide always-available grounded ops that generate structured self-descriptions for agent self-query and external tooling.

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

**Implementation notes**:
- `generateManifest()` aggregates data from `config`, `SkillDispatcher.getActiveSkillDefs()`, `EmbodimentBus.getActiveChannels()`, `ModelRouter.getScores()`, and loop state variables.
- Output is cached for 5 cycles to avoid regeneration overhead; invalidated on capability changes.
- When `runtimeIntrospection` is false, ops return minimal stub: `(manifest :restricted true)`.

**Phase 1 refinement note**: Since Phase 1 already registers grounded ops in `AgentBuilder.buildMeTTaLoop()`, add the four introspection ops to that registration block. Implement `IntrospectionOps` as a simple module with static methods—no class instantiation needed for Phase 1.

### 3.4 §5.8 HarnessOptimizer.js — Add Verification Loop Pattern

Append to §5.8:

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

---

## 4. Update §6 Phase Plan

### 4.1 Phase 1 — MeTTa Control Plane (Refinement Instructions)

Since Phase 1 is already implemented, add these refinement tasks to the existing Phase 1 deliverable:

**Phase 1 Refinements** (append to existing Phase 1 list):
11. **Extend `SkillDispatcher.js`**: Add conditional hook orchestration logic (§5.3.1) gated on `config.capabilities.executionHooks`. When disabled, bypass with zero overhead.
12. **Add dynamic discovery stub**: Implement `discover-skills` grounded op that scans `memory/skills/*.metta` (filesystem only, no SKILL.md parsing yet). Register discovered skills with existing `register()` method.
13. **Register introspection ops**: Add `manifest`, `skill-inventory`, `subsystems`, `agent-state` grounded ops to `AgentBuilder.buildMeTTaLoop()`. Implement minimal stub output that respects `runtimeIntrospection` capability flag.
14. **Update `agent.json` schema** (§13.1): Add `dynamicSkillDiscovery`, `executionHooks`, `runtimeIntrospection` flags with defaults `false`.
15. **Test**: With new flags disabled, existing Phase 1 behavior unchanged. With flags enabled: dynamic skill file loaded on startup; `(manifest)` returns structured output; pre-hook can block a skill call.

### 4.2 Phase 4 — Safety & Accountability (Extension)

Append to Phase 4 deliverable:

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

### 4.3 Add Phase 4.5 — Hook System & Introspection (Optional Interstitial)

Insert between Phase 4 and Phase 5:

### Phase 4.5 — Execution Hooks & Runtime Introspection

**Deliverable**: Declarative hook system; structured self-description primitives.

1. Implement `HookOrchestrator.js` with pre/post hook execution, mutation/deny/audit actions.
2. Create `hooks.metta` with example rules for common patterns (audit logging, input sanitization, permission checks).
3. Complete `IntrospectionOps.js` with full manifest generation, skill inventory, subsystem description.
4. Wire `(manifest)` output into `build-context`'s new `AGENT_MANIFEST` slot (between `PINNED` and `RECALL`).
5. **Test**: Pre-hook blocks forbidden skill; post-hook emits audit event; `(manifest)` returns structured atom; agent can `(metta (query "what skills do I have?"))` using introspection output.

### 4.4 Phase 6 — Meta-Harness & Self-Improvement (Extension)

Append to Phase 6:

8. **Integrate verification loop**: Extend `HarnessOptimizer` to use introspection primitives for pre/post-change validation (§5.8.1).
9. **Dynamic skill reload**: When `selfModifyingSkills` writes to `memory/skills/`, trigger `discover-skills` re-scan; validate new skill via `SafetyLayer` before registration.

---

## 5. Update §7 Safety & Accountability

### 5.1 §7.2 safety.metta — Note Hook Migration Path

Append this note:

> **Migration note**: When `executionHooks` is enabled, `safety.metta` rules are automatically wrapped as pre-skill hooks by `HookOrchestrator`. Authors may migrate rules to `hooks.metta` for finer control (mutation, conditional denial, post-execution audit). Both formats coexist; `hooks.metta` takes precedence for skills with defined hooks.

### 5.2 Add §7.5 hooks.metta Specification

Insert new subsection:

#### 7.5 Declarative Hook Rules (`hooks.metta`)

**Location**: `agent/src/metta/hooks.metta`  
**Governed by**: `executionHooks`

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

## 6. Update §11 Memory Architecture

### 6.1 §11.2 Working Memory Register — Add Introspection Slot

Append to WM_REGISTER context slot description:

```
AGENT_MANIFEST  — 2,000 chars  — condensed output of (manifest) when runtimeIntrospection enabled
```

This ensures the LLM has structured self-knowledge available in-context without needing to invoke `(metta (manifest))` explicitly.

### 6.2 §11.6 Consolidation — Add Hook-Aware Audit

Append to consolidation description:

> When `executionHooks` is enabled, consolidation self-task emits `(audit-event :type :memory-consolidation :pruned N :merged M)` via post-hook, making memory management observable.

---

## 7. Update §12 File Structure

Add these new files to the file tree:

```
agent/src/
├── skills/
│   ├── SkillDispatcher.js       ← extended with hook orchestration, dynamic discovery
│   └── HookOrchestrator.js      ← NEW: pre/post hook execution engine (§5.3.1)
├── introspection/
│   └── IntrospectionOps.js      ← NEW: manifest/skill-inventory/subsystems grounded ops (§5.10)
├── metta/
│   ├── AgentLoop.metta
│   ├── skills.metta
│   ├── safety.metta
│   ├── hooks.metta              ← NEW: declarative hook rules (§7.5)
│   └── ContextBuilder.metta
└── config/
    └── capabilities.js          ← extended with new flags

memory/
├── skills/                      ← NEW: dynamic skill definitions directory
│   └── *.metta                  ← agent-writable skill files (when dynamicSkillDiscovery)
├── harness/
│   └── prompt.metta
├── traces/
├── history.metta
└── audit.metta
```

Update superseded files table (§12):
| Old File | Superseded By | Phase |
|----------|--------------|-------|
| *(none)* | `HookOrchestrator.js` | 4.5 |
| *(none)* | `IntrospectionOps.js` | 4.5 |
| *(none)* | `memory/skills/` directory | 1 (refinement) |

---

## 8. Update §14 Design Decisions & Rationale

### 8.1 Add §14.7 Hook System Design

#### 14.7 Declarative Hooks Over Imperative Middleware

The `executionHooks` capability implements a *declarative* hook system (`hooks.metta`) rather than imperative middleware for three reasons:

1. **Agent-readable**: Hooks are MeTTa atoms the agent can query, reason about, and (when gated) modify. Imperative JS middleware would be opaque.
2. **Composable**: Multiple hooks can match the same skill; execution order is explicit in the file. Middleware chains often have implicit ordering.
3. **Testable**: Hook rules can be unit-tested in isolation via `(metta (hook pre ...))` evaluation. Middleware requires full request/response mocking.

The tradeoff: hook evaluation adds ~5-10ms overhead per skill call. This is acceptable because hooks only execute when `executionHooks` is enabled (Evolution tier), and the safety/audit benefits outweigh the latency for high-risk skills.

### 8.2 Add §14.8 Dynamic Discovery Tradeoffs

#### 14.8 Dynamic Skill Discovery: Safety vs. Flexibility

`dynamicSkillDiscovery` enables agent-extensible skill registration but introduces risk of loading malformed or malicious definitions. Mitigations:

1. **Parsing gate**: All discovered files pass through `metta/Parser.js`; syntax errors produce audit warnings, not crashes.
2. **Capability gate**: Dynamically discovered skills inherit the capability flag specified in their `(skill ...)` declaration. A skill requiring `shellSkill` cannot execute if that flag is disabled.
3. **SafetyLayer integration**: When both `dynamicSkillDiscovery` and `safetyLayer` are enabled, newly discovered skills are validated against `safety.metta`/`hooks.metta` before registration.
4. **Audit trail**: Every dynamic registration emits `(audit-event :type :skill-registered :source $file :skill $name)`.

The design prioritizes *inspectability*: the agent can `(metta (query "skills registered from dynamic discovery"))` to audit its own extensions.

### 8.3 Add §14.9 Introspection as First-Class Primitive

#### 14.9 Runtime Introspection Enables Self-Verification

Exposing `manifest`, `skill-inventory`, etc. as always-available grounded ops (gated by `runtimeIntrospection` for content richness) serves two purposes:

1. **Agent self-knowledge**: The LLM can query `(metta (manifest))` to get structured capability state, reducing prompt engineering overhead for "what can I do?" questions.
2. **External tooling**: CLI wrappers, monitoring dashboards, and verification scripts can invoke `(metta (manifest))` to audit agent state without parsing logs.

The minimal-overhead implementation (5-cycle cache, conditional output) ensures introspection is available even on resource-constrained deployments.

---

## 9. Update §15 References

Add these internal anchors:

| File | Role |
|------|------|
| `agent/src/skills/HookOrchestrator.js` | Pre/post-skill hook execution engine; integrates with SafetyLayer |
| `agent/src/introspection/IntrospectionOps.js` | Runtime manifest/skill-inventory generation for agent self-query |
| `agent/src/metta/hooks.metta` | Declarative hook rules; agent-readable safety/audit logic |
| `memory/skills/` | Directory for dynamically discovered skill definitions |

---

## Implementation Checklist

- [ ] Update §2 Capability Matrix with three new Evolution-tier flags
- [ ] Update §4 Architecture diagrams to show HookOrchestrator and IntrospectionOps
- [ ] Extend §5.2 (skills.metta) with dynamic discovery spec
- [ ] Extend §5.3 (SkillDispatcher.js) with hook orchestration logic
- [ ] Add §5.10 (IntrospectionOps.js) specification
- [ ] Update §6 Phase Plan: Phase 1 refinements, Phase 4.5 new phase, Phase 4/6 extensions
- [ ] Update §7 Safety: hook migration note, new §7.5 hooks.metta spec
- [ ] Update §11 Memory: add AGENT_MANIFEST slot, hook-aware audit
- [ ] Update §12 File Structure with new files/directories
- [ ] Add §14.7-14.9 design rationale sections
- [ ] Update §15 References table

**Phase 1 Priority**: Since Phase 1 is already implemented, focus refinement efforts on:
1. Extending `SkillDispatcher.execute()` with conditional hook orchestration (zero overhead when disabled)
2. Adding `discover-skills` grounded op for filesystem-based skill discovery
3. Registering introspection ops with minimal stub output
4. Updating `agent.json` schema and `capabilities.js` with new flags

These changes are additive and backward-compatible: existing Phase 1 behavior is preserved when new capability flags remain `false`.

