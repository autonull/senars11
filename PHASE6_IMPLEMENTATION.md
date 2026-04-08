# Phase 6 Implementation Summary — Meta-Harness Self-Improvement

**Date:** 2026-04-02  
**Status:** ✅ Complete

## Overview

Phase 6 implements the **Meta-Harness** self-improvement system as specified in METTACLAW.md §5.8 and §10. The agent can now analyze its own failure traces, propose targeted improvements to the system prompt, test candidates via replay scoring, and apply improvements with git version history.

---

## Files Created

### Core Implementation

| File | Purpose | Lines |
|------|---------|-------|
| `agent/src/harness/HarnessOptimizer.js` | Meta-harness optimization engine | ~350 |
| `agent/src/memory/ContextBuilder.js` | MeTTa-driven context assembly | ~250 |
| `agent/src/metta/ContextBuilder.metta` | Context assembly specification | ~120 |
| `memory/harness/prompt.metta` | Initial system prompt template | ~80 |

### Tests

| File | Purpose |
|------|---------|
| `tests/unit/agent/phase6-harness-optimizer.test.js` | HarnessOptimizer unit tests |
| `tests/unit/agent/phase6-context-builder.test.js` | ContextBuilder unit tests |

### Configuration

| File | Changes |
|------|---------|
| `agent/workspace/agent.json` | Added `harness` configuration section |
| `agent/src/Agent.js` | Integrated HarnessOptimizer and ContextBuilder |

---

## Key Features Implemented

### 1. HarnessOptimizer (`agent/src/harness/HarnessOptimizer.js`)

**Purpose:** Analyzes failure traces and proposes prompt improvements.

**Key Methods:**
- `shouldOptimize(cycleCount)` — Checks if optimization cycle is due
- `runOptimizationCycle()` — Full optimization pipeline
- `_sampleFailures()` — Queries audit log and trace files for failures
- `_proposeChange(failures, prompt)` — Invokes LLM with `:introspection` task type
- `_applyDiff(currentPrompt, diff)` — Applies unified diff to prompt
- `_replayTasks(failures, candidatePrompt)` — Scores candidate vs baseline
- `_applyCandidate(score)` — Commits improvement to git

**Configuration:**
```json
{
  "harness": {
    "harnessEvalInterval": 200,
    "minScoreImprovement": 0.05,
    "replayTaskSampleSize": 10
  }
}
```

**Optimization Cycle:**
```
1. Sample recent failures from audit log / trace files
2. Read current prompt from memory/harness/prompt.metta
3. Invoke LLM: "Given these failures, propose ONE targeted change"
4. Apply diff to memory/harness/prompt.candidate.metta
5. Replay sampled tasks with candidate; score results
6. If score improvement ≥ threshold: commit to git
7. Else: discard candidate
```

### 2. ContextBuilder (`agent/src/memory/ContextBuilder.js`)

**Purpose:** Provides MeTTa-grounded ops for context assembly.

**Context Slots (assembled in order):**
1. `SYSTEM_PROMPT` — Loaded from memory/harness/prompt.metta
2. `CAPABILITIES` — Active capability flags
3. `SKILLS` — S-expression skill declarations
4. `PINNED` — Pinned memories (always included)
5. `WM_REGISTER` — Working memory register entries
6. `AGENT_MANIFEST` — Runtime self-description
7. `RECALL` — Semantically recalled memories
8. `HISTORY` — Recent conversation/action history
9. `FEEDBACK` — Last cycle feedback/errors
10. `INPUT` — Current input message

**Grounded Ops Registered:**
- `(context-init)` — Initialization
- `(context-concat &rest)` — Concatenate sections
- `(load-harness-prompt)` — Load prompt.metta
- `(default-system-prompt)` — Fallback prompt
- `(filter-capabilities mode)` — List enabled capabilities
- `(get-active-skills)` — Get skill declarations
- `(get-pinned-memories)` — Query pinned memories
- `(get-wm-entries)` — Get working memory entries
- `(generate-manifest)` — Generate self-description
- `(query-memories msg k)` — Semantic recall
- `(get-history)` — Get conversation history
- `(get-feedback)` — Get last cycle feedback
- `(format-input msg)` — Format input message
- `(get-budget key)` — Get budget configuration

### 3. ContextBuilder.metta (`agent/src/metta/ContextBuilder.metta`)

**Purpose:** Declarative specification of context assembly logic.

**Entry Point:**
```metta
(= (build-context $msg)
   (seq
     (context-init)
     (let*
       (($system   (slot-system))
        ($caps     (slot-capabilities))
        ...
        ($input    (slot-input $msg)))
       (context-concat
         $system $caps ... $input))))
```

**Note:** Phase 1 uses JS implementation; MeTTa file serves as specification and for future MeTTa execution.

### 4. System Prompt Template (`memory/harness/prompt.metta`)

**Purpose:** Initial system prompt for the agent.

**Sections:**
- Identity & Role
- Communication Style
- Skill Invocation Format
- Example Skill Calls
- Cycle Behavior
- Error Handling
- Autonomous Mode
- Safety & Constraints
- Self-Improvement
- Metacognition

**Version History:** Tracked by git. Every harness update commits with message:
```
harness-update: cycle {N}, score={score}
```

---

## Integration Points

### Agent.js Integration

**Location:** `agent/src/Agent.js` — `_buildMeTTaLoop()` method

**ContextBuilder Initialization:**
```javascript
if (isEnabled(agentCfg, 'contextBudgets')) {
  const ContextBuilder = await loadContextBuilder();
  contextBuilder = new ContextBuilder(...);
  contextBuilder.registerGroundedOps(interp);
}
```

**HarnessOptimizer Initialization:**
```javascript
if (isEnabled(agentCfg, 'harnessOptimization')) {
  const HarnessOptimizer = await loadHarnessOptimizer();
  harnessOptimizer = new HarnessOptimizer(...);
}
```

**Loop Integration:**
```javascript
// Use ContextBuilder if available
const ctx = contextBuilder
  ? await contextBuilder.build(msg)
  : await buildContextFn(msg);

// Run HarnessOptimizer periodically
if (harnessOptimizer && harnessOptimizer.shouldOptimize(loopState.cycleCount)) {
  const result = await harnessOptimizer.runOptimizationCycle();
  Logger.info(`[HarnessOptimizer] Result: ${result.reason}`);
}
```

---

## Capability Dependencies

From `agent/src/config/capabilities.js`:

```javascript
harnessOptimization: ['selfModifyingSkills', 'auditLog', 'persistentHistory']
```

**Rationale:**
- `selfModifyingSkills` — Agent must be able to modify skill/prompt definitions
- `auditLog` — Failure traces required for analysis
- `persistentHistory` — Conversation history needed for replay

---

## Testing

### Unit Tests

**HarnessOptimizer Tests:**
- `shouldOptimize()` — Cycle timing logic
- `runOptimizationCycle()` — Full pipeline with mocked components
- `_sampleFailures()` — Audit log querying
- `_applyDiff()` — Unified diff parsing
- `_scoreResponse()` — Response quality scoring
- `generateDiff()` — Candidate diff generation
- Singleton pattern — `getHarnessOptimizer()` / `resetHarnessOptimizer()`

**ContextBuilder Tests:**
- Constructor — Budget initialization
- `registerGroundedOps()` — Op registration
- `build()` — Context assembly
- `recordFeedback()` — Feedback management
- Slot builders — `_loadHarnessPrompt()`, `_filterCapabilities()`, etc.
- Utilities — `_truncate()`, `_formatInput()`

### Running Tests

```bash
pnpm test -- tests/unit/agent/phase6-*.test.js
```

---

## Usage

### Enable Harness Optimization

Edit `agent/workspace/agent.json`:

```json
{
  "profile": "full",
  "capabilities": {
    "harnessOptimization": true,
    "selfModifyingSkills": true,
    "auditLog": true,
    "persistentHistory": true
  },
  "harness": {
    "harnessEvalInterval": 200,
    "minScoreImprovement": 0.05,
    "replayTaskSampleSize": 10
  }
}
```

### Monitor Optimization

```bash
# View harness update history
git log memory/harness/prompt.metta

# View recent commits
git log --oneline -10 memory/harness/

# Revert a bad update
git revert <commit-hash> memory/harness/prompt.metta
```

### Manual Trigger (Future Enhancement)

```metta
(metta (consolidate-harness))
```

---

## Design Decisions

### 1. Git as Version History

**Decision:** Use git for prompt versioning, not custom versioning scheme.

**Rationale:**
- Git already tracks `memory/` directory
- `git log`, `git show`, `git revert` are standard tools
- No need to reinvent versioning

### 2. Unified Diff Format

**Decision:** LLM proposes changes as unified diffs.

**Rationale:**
- Compact representation of changes
- Easy to validate before applying
- Standard format for patches
- Enables "ONE targeted change" constraint

### 3. Replay Scoring

**Decision:** Test candidate prompts on sampled failures before applying.

**Rationale:**
- Prevents regressions
- Empirical validation of improvements
- Configurable threshold prevents overfitting

### 4. Simple Scoring Heuristics

**Decision:** Use rule-based scoring (length, structure, error indicators).

**Rationale:**
- No LLM call overhead for scoring
- Deterministic and explainable
- Sufficient for initial implementation

**Future Enhancement:** Train scoring model on human preferences (RLHF).

### 5. Transitional JS Implementation

**Decision:** Context assembly implemented in JS, MeTTa file is specification.

**Rationale:**
- MeTTa interpreter async grounded op support still maturing
- JS provides robust implementation now
- MeTTa file ensures semantics are documented
- Future migration path: swap JS for MeTTa execution

---

## Future Enhancements (Phase 6+)

1. **SKILL.md Parsing** — Parse markdown skill definitions per §5.2.1
2. **Verification Loop** — Run `(manifest)` and `(skill-inventory)` before/after harness changes
3. **CRDT Harness Diffusion** — Propagate harness changes across agent instances (§5.8, Phase 7)
4. **Learned Scoring Model** — Replace heuristics with RLHF-trained scorer
5. **Multi-Diff Proposals** — Allow LLM to propose multiple independent changes
6. **A/B Testing** — Run candidate prompts on subset of cycles before full deployment

---

## Known Limitations

1. **No SKILL.md Parsing Yet** — Only filesystem scan for `.metta` files
2. **Simplistic Diff Application** — Line-based patching; may fail on complex diffs
3. **No Cross-Agent Diffusion** — Harness changes are local to this agent instance
4. **Scoring Heuristics** — Not as nuanced as human evaluation

---

## References

- **METTACLAW.md §5.8** — HarnessOptimizer specification
- **METTACLAW.md §10** — Meta-Harness design rationale
- **Lee (2025)** — Meta-Harness paper: https://yoonholee.com/meta-harness/
- **Phase 6 Unit Tests** — `tests/unit/agent/phase6-*.test.js`

---

## Checklist

- [x] HarnessOptimizer.js implementation
- [x] ContextBuilder.js implementation
- [x] ContextBuilder.metta specification
- [x] memory/harness/prompt.metta template
- [x] Agent.js integration
- [x] agent.json harness configuration
- [x] Unit tests for HarnessOptimizer
- [x] Unit tests for ContextBuilder
- [x] Syntax validation (node --check)
- [ ] Integration testing with live agent loop
- [ ] Documentation in README files

---

**Phase 6 Status:** ✅ **Complete** — Ready for integration testing
