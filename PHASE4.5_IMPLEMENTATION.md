# Phase 4.5 Implementation Summary — Execution Hooks & Runtime Introspection

**Date:** 2026-04-02  
**Status:** ✅ Complete

## Overview

Phase 4.5 implements the **declarative hook system** and **runtime introspection primitives** as specified in METTACLAW.md §5.3.1 and §5.10. The agent can now intercept skill execution with pre/post hooks and query its own state via structured self-description.

---

## Files Created

### Core Implementation

| File | Purpose | Lines |
|------|---------|-------|
| `agent/src/skills/HookOrchestrator.js` | Pre/post hook execution engine | ~280 |
| `agent/src/metta/hooks.metta` | Declarative hook rules | ~130 |
| `agent/src/introspection/IntrospectionOps.js` | Runtime self-description primitives | ~280 |

### Tests

| File | Purpose |
|------|---------|
| `tests/unit/agent/phase4-5-hooks-introspection.test.js` | HookOrchestrator & IntrospectionOps unit tests |

### Files Modified

| File | Changes |
|------|---------|
| `agent/src/skills/SkillDispatcher.js` | Integrated HookOrchestrator into `_dispatch()` |
| `agent/src/Agent.js` | Updated introspection ops to use IntrospectionOps class |

---

## Key Features Implemented

### 1. HookOrchestrator (`agent/src/skills/HookOrchestrator.js`)

**Purpose:** Declarative hook system for skill execution interception.

**Hook Actions:**
- `(allow)` — Proceed with original/modified args
- `(deny reason)` — Block execution, emit audit event
- `(rewrite new-args)` — Mutate arguments before handler (pre-hook only)
- `(audit-emit event)` — Append to audit log (post-hook only)

**Key Methods:**
- `loadHooksFromFile(path)` — Load hooks from hooks.metta
- `runPreHooks(skillCall)` — Execute pre-skill hooks, returns `{ action, newArgs?, reason? }`
- `runPostHooks(skillCall, result)` — Execute post-skill hooks
- `registerHook(phase, pattern, body)` — Programmatically register hooks
- `_matchPattern(pattern, name, args)` — Match skill calls against patterns
- `_evaluateHook(body, bindings)` — Evaluate hook body expressions

**Built-in Predicates:**
- `(contains-forbidden? $str)` — Check against shell.forbiddenPatterns
- `(path-within? $path $base)` — Validate path is within base directory
- `(capability-enabled? $flag)` — Check if capability flag is active
- `(audit-emit $atom)` — Append atom to audit space

**Hook Definition Format:**
```metta
(hook <phase> <skill-pattern> <hook-body>)
```

Where:
- `<phase>`: `pre` or `post`
- `<skill-pattern>`: S-expression pattern like `(shell $cmd)`
- `<hook-body>`: Expression returning allow/deny/rewrite/audit-emit

### 2. hooks.metta (`agent/src/metta/hooks.metta`)

**Purpose:** Declarative hook rules for common patterns.

**Pre-Hook Rules:**
- Block shell commands with forbidden patterns
- Require shellSkill capability for shell commands
- Block file writes outside memory/ directory
- Block harness prompt modification unless harnessOptimization enabled
- Sanitize search queries to add safe search
- Block add-skill unless selfModifyingSkills enabled
- Block spawn-agent unless subAgentSpawning enabled

**Post-Hook Rules:**
- Audit all file writes (path, size)
- Audit shell command execution
- Audit memory operations (remember, forget, pin)
- Audit network operations (send, send-to, search)
- Audit skill modification (add-skill)
- Audit meta operations (set-goal, set-model, spawn-agent)

**Example Rules:**
```metta
;; Block shell commands with forbidden patterns
(hook pre (shell $cmd)
      (if (contains-forbidden? $cmd)
        (deny "Forbidden pattern in shell command")
        (allow)))

;; Audit all file writes
(hook post (write-file $path $content)
      (audit-emit (audit-event :type :file-write :path $p :size (string-length $c))))

;; Sanitize search queries
(hook pre (search $query)
      (rewrite (search (string-append $query " safe_search=active"))))
```

### 3. IntrospectionOps (`agent/src/introspection/IntrospectionOps.js`)

**Purpose:** Runtime self-description primitives for agent self-query and external tooling.

**Registered Grounded Ops:**
- `(manifest)` — Generate agent manifest with capabilities, skills, state
- `(skill-inventory)` — List all registered skills
- `(subsystems)` — Describe active subsystems
- `(agent-state key)` — Query loop state variables

**Output Format (MeTTa atoms):**
```metta
;; (manifest) output
(agent-manifest
  :version "0.2.0"
  :profile "parity"
  :capabilities ((mettaControlPlane true) (semanticMemory true) ...)
  :active-skills ((send ...) (remember ...) ...)
  :embodiments ((:id "irc-quakenet" :type "irc" :status "connected") ...)
  :model-scores ((:model "gpt-4o" :truth (:f 0.85 :c 0.72)) ...)
  :cycle-count 142
  :wm-entries-count 3
  :budget 47)

;; (skill-inventory) output
(skill-inventory
  (skill-entry :name "send" :enabled true)
  (skill-entry :name "remember" :enabled true)
  ...)

;; (agent-state "&budget") → 47
;; (agent-state "&wm") → ((wm-entry :content "..." :priority 0.8 :ttl 7) ...)
```

**State Keys Supported:**
- `&wm` — Working memory entries
- `&budget` — Remaining loop iterations
- `&cycle-count` — Total cycles executed
- `&error` — Last cycle error
- `&prevmsg` — Previous input message
- `&lastresults` — Last skill execution results
- `&lastsend` — Last sent message
- `&model-override` — Active model override

**Caching:** Manifest cached for 5 cycles to avoid regeneration overhead.

---

## Integration Points

### SkillDispatcher Integration

**Location:** `agent/src/skills/SkillDispatcher.js` — `_dispatch()` method

**Execution Order:**
```
1. Capability gate check
2. Pre-hooks (HookOrchestrator) — may deny or rewrite
3. Safety layer check (SafetyLayer)
4. Skill handler execution
5. Post-hooks (HookOrchestrator) — may emit audit events
6. Audit logging (AuditSpace)
```

**Code:**
```javascript
async _dispatch({ name, args }) {
  // ... capability check ...
  
  // Phase 4.5: Hook orchestration (before safety layer)
  let currentArgs = args;
  if (this._config.capabilities?.executionHooks) {
    const hookOrchestrator = getHookOrchestrator(this._config, this._auditSpace);
    const preHookResult = await hookOrchestrator.runPreHooks({ name, args: currentArgs });
    
    if (preHookResult.action === 'deny') {
      return { skill: name, result: null, error: `hook-deny: ${preHookResult.reason}` };
    }
    if (preHookResult.action === 'rewrite') {
      currentArgs = preHookResult.newArgs || currentArgs;
    }
  }
  
  // ... safety layer, handler execution ...
  
  // Phase 4.5: Post-hook execution
  if (this._config.capabilities?.executionHooks) {
    const hookOrchestrator = getHookOrchestrator(this._config, this._auditSpace);
    await hookOrchestrator.runPostHooks({ name, args: currentArgs }, result ?? error);
  }
  
  // ... audit logging ...
}
```

### Agent.js Integration

**Location:** `agent/src/Agent.js` — `_buildMeTTaLoop()` method

**Introspection Ops Registration:**
```javascript
const { IntrospectionOps } = await import('./introspection/IntrospectionOps.js');
const introspectionOps = new IntrospectionOps(
    agentCfg,
    dispatcher,
    this.embodimentBus,
    this._modelRouter,
    loopState
);

g.register('manifest', () => {
    return Term.grounded(introspectionOps.generateManifest());
});

g.register('skill-inventory', () => {
    return Term.grounded(introspectionOps.listSkills());
});

g.register('subsystems', () => {
    return Term.grounded(introspectionOps.describeSubsystems());
});

g.register('agent-state', (keyAtom) => {
    const key = keyAtom?.name ?? String(keyAtom ?? '');
    return Term.grounded(introspectionOps.getState(key));
});
```

---

## Capability Dependencies

From `agent/src/config/capabilities.js`:

```javascript
executionHooks: ['safetyLayer', 'auditLog']
runtimeIntrospection: []  // No dependencies
```

**Rationale:**
- `executionHooks` requires `safetyLayer` — hooks build on safety infrastructure
- `executionHooks` requires `auditLog` — hooks emit audit events
- `runtimeIntrospection` — standalone, no dependencies

---

## Testing

### Unit Tests

**HookOrchestrator Tests:**
- `loadHooksFromFile()` — File loading and parsing
- `runPreHooks()` — Pre-hook execution with allow/deny/rewrite
- `runPostHooks()` — Post-hook execution with audit events
- Pattern matching — Skill pattern matching with variable bindings
- Singleton pattern — `getHookOrchestrator()` / `resetHookOrchestrator()`

**IntrospectionOps Tests:**
- `generateManifest()` — Full manifest generation with caching
- `listSkills()` — Skill inventory listing
- `describeSubsystems()` — Subsystem description
- `getState()` — State variable queries for all supported keys
- Static methods — Convenience static method variants

### Running Tests

```bash
pnpm test -- tests/unit/agent/phase4-5-hooks-introspection.test.js
```

---

## Usage

### Enable Execution Hooks

Edit `agent/workspace/agent.json`:

```json
{
  "profile": "full",
  "capabilities": {
    "executionHooks": true,
    "safetyLayer": true,
    "auditLog": true
  }
}
```

### Enable Runtime Introspection

```json
{
  "capabilities": {
    "runtimeIntrospection": true
  }
}
```

### Query Agent State

```metta
;; Get full manifest
(metta (manifest))

;; List skills
(metta (skill-inventory))

;; Query working memory
(metta (agent-state "&wm"))

;; Check budget
(metta (agent-state "&budget"))
```

### Add Custom Hooks

Edit `agent/src/metta/hooks.metta`:

```metta
;; Custom pre-hook: log all skill invocations
(hook pre (send $msg)
      (audit-emit (audit-event :type :pre-send :msg-length (string-length $msg))))

;; Custom post-hook: validate file writes
(hook post (write-file $path $content)
      (if (> (string-length $content) 10000)
        (audit-emit (audit-event :type :large-write :path $path :size (string-length $content)))
        (allow)))
```

---

## Design Decisions

### 1. Hooks Before Safety Layer

**Decision:** Pre-hooks execute before safety layer checks.

**Rationale:**
- Hooks can deny obviously bad calls before expensive safety inference
- Hooks can rewrite args to make them safe (e.g., add safe_search)
- Safety layer remains the final gate for consequence analysis

### 2. Declarative vs Imperative

**Decision:** Hooks defined in MeTTa (hooks.metta), not JS middleware.

**Rationale:**
- Agent-readable: hooks are MeTTa atoms the agent can query
- Composable: multiple hooks can match; execution order is explicit
- Testable: hook rules can be unit-tested via MeTTa evaluation
- Modifiable: agent can potentially modify hooks (when gated)

### 3. Pattern Matching

**Decision:** Simple structural pattern matching, not full unification.

**Rationale:**
- Sufficient for skill name + argument matching
- Lower complexity than full logic programming
- Easier to debug and reason about
- Variable bindings ($var) provide necessary flexibility

### 4. Manifest Caching

**Decision:** Cache manifest for 5 cycles.

**Rationale:**
- Manifest generation aggregates from multiple sources (expensive)
- State doesn't change every cycle
- 5-cycle validity balances freshness vs performance
- Invalidated on capability changes (future enhancement)

### 5. Static Method Variants

**Decision:** Provide both instance and static methods for IntrospectionOps.

**Rationale:**
- Instance methods for full integration (Agent.js)
- Static methods for simple one-off queries
- Consistent API regardless of usage pattern

---

## Known Limitations

1. **No Hook Chaining** — First deny stops chain; rewrite mutations don't accumulate across multiple matching hooks
2. **Limited Predicates** — Only contains-forbidden?, path-within?, capability-enabled? implemented
3. **No Dynamic Hook Registration** — Hooks loaded at startup; no runtime add-hook skill yet
4. **Simple Pattern Matching** — No nested patterns or complex guards
5. **No Hook Priorities** — Execution order is declaration order only

---

## Future Enhancements (Phase 4.5+)

1. **Hook Priorities** — Allow explicit ordering via priority annotations
2. **Dynamic Hook Registration** — Add `(add-hook phase pattern body)` skill
3. **More Predicates** — Expand built-in predicate library
4. **Hook Profiling** — Track hook execution time, deny rates
5. **Hook Testing Mode** — Dry-run hooks without enforcement
6. **Nested Patterns** — Support complex pattern matching

---

## References

- **METTACLAW.md §5.3.1** — HookOrchestrator integration specification
- **METTACLAW.md §5.10** — IntrospectionOps specification
- **Phase 4.5 Unit Tests** — `tests/unit/agent/phase4-5-hooks-introspection.test.js`

---

## Checklist

- [x] HookOrchestrator.js implementation
- [x] hooks.metta declarative rules
- [x] IntrospectionOps.js implementation
- [x] SkillDispatcher.js integration
- [x] Agent.js integration
- [x] Unit tests
- [x] Syntax validation (node --check)
- [ ] Integration testing with live agent loop
- [ ] Documentation in README files

---

**Phase 4.5 Status:** ✅ **Complete** — Ready for integration testing
