# BOT.md — SeNARS/MeTTa Cognitive Bot

## Architecture

```
                    ┌──────────────────────────────────┐
                    │       Embodiment Bus             │  ← IRC, Nostr, WebUI, CLI
                    └────────────────┬─────────────────┘
                                     │ messages in, responses out
                    ┌────────────────▼─────────────────┐
                    │       IntelligentMessageProcessor│
                    │                                  │
                    │  1. Classify message             │
                    │  2. Build context (query stores) │
                    │  3. Call LLM                     │
                    │  4. Parse / dispatch response    │
                    │  5. Store memory atoms           │
                    │  6. Emit audit events            │
                    └──┬──────┬─────────┬──────┬───────┘
                       │      │         │      │
              ┌────────▼┐ ┌──▼──┐ ┌────▼────┐ │
              │Semantic │ │NARS │ │ MeTTa   │ │
              │Memory   │ │     │ │ Store   │ │
              │(HNSW)   │ │     │ │(atoms)  │ │
              └─────────┘ └─────┘ └─────────┘ │
                                               │
                    ┌──────────────────────────▼─┐
                    │       SkillDispatcher      │  ← If LLM produces S-expressions
                    │                            │
                    │  1. Parse S-expressions    │
                    │  2. Capability gate check  │
                    │  3. SafetyLayer (optional) │
                    │  4. HookOrchestrator (opt) │
                    │  5. Execute JS handler     │
                    │  6. Audit emit             │
                    └────────────────────────────┘
```

One pipeline. One entry point (`IntelligentMessageProcessor.processMessage`). All cognitive components are queried by it, not owned by it.

---

## Phase 1: Context Assembly from Existing Stores

**Problem:** Currently the bot builds context from a flat `context.messages` array (last N messages). It ignores SemanticMemory, NARS beliefs, and MeTTa atoms entirely.

**Solution:** Query the existing stores before calling LLM. No new stores.

### 1.1 — Context Assembly

`IntelligentMessageProcessor._buildContext(content, context)` queries:

```
RECALL    ← SemanticMemory.query(content, top 5)    // semantic similarity
BELIEFS   ← nar.getBeliefs() filtered by keywords   // what NARS knows
WM        ← working memory entries (new, in-process) // active concepts
HISTORY   ← context.messages (last 30, 1hr window)  // recent conversation
FEEDBACK  ← AuditSpace recent errors                // last cycle problems
SKILLS    ← active skill declarations               // what the bot can do
INPUT     ← current user message
```

Each slot is a view over existing data. No new storage layer. No `MemoryStore.js`.

### 1.2 — Prompt Format

```
RECALL:
  [conversation] ##metta sseehh "what's 2+2?" "4" (relevance: 0.82)

BELIEFS:
  <("##metta" -- "sseehh") --> heard>.

HISTORY:
  sseehh: hi SeNARchy
  SeNARchy: Hello sseehh!

INPUT:
  SeNARchy: what's 2+2?
```

Only populated slots appear. Empty slots omitted.

### 1.3 — `!context` Debug Command

Dumps all 7 slots as currently assembled. Shows what the LLM will see.

**Smoketest:** `scripts/smoke-chatbot.js` verifies full prompt construction. Bot answers "what math question did I ask?" by finding it in RECALL.

---

## Phase 2: Skill Dispatch

**Problem:** LLM output goes straight to IRC. No parsing, no capability gates, no safety, no audit.

**Solution:** Route LLM text through `SkillDispatcher` when the model can produce S-expressions. When it can't, fall back to direct text (but still audit).

### 2.1 — Dual Path

```
LLM output
    │
    ├─ Can parse S-expressions? ──► SkillDispatcher ──► capability gate ──► handler ──► audit
    │
    └─ Parse fails ──────────────► Direct text response ─────────────────► audit
```

With compact models, the fallback path is primary. With capable models (OpenAI-compatible endpoint), the skill path works. Both produce audit events. No functionality lost in either case.

### 2.2 — Skills

```metta
(skill respond   (String)  mettaControlPlane :reflect "Reply to user")
(skill send      (String)  mettaControlPlane :network "Send to current channel")
(skill send-to   (Chan String) multiEmbodiment :network "Send to specific channel")
(skill think     (String)  mettaControlPlane :reflect "Internal reasoning")
```

JS handlers already exist for send (IRC channelManager). `respond` wraps it for current channel.

### 2.3 — LLM Prompt (when skill dispatch active)

```
Available skills:
(respond "text")     — reply to the user
(send "channel" "text") — send to a specific channel
(think "text")       — internal reasoning, not sent to user

Respond with skill calls. Example: (respond "The answer is 4.")
```

When skill dispatch is disabled (compact model), prompt omits skill list and requests direct text.

### 2.4 — Audit

Every exchange produces events regardless of path:
- `message-received` — user input
- `llm-call` — model, sizes, latency
- `skill-invoked` — if skill path taken
- `response-sent` — text that went to user

**Smoketest:** Audit log shows complete trail. Bot responds via skill when model supports it.

---

## Phase 3: Session Protocol

**Problem:** Bot has no memory across restarts. No startup orientation. No context reset.

**Solution:** Checkpoint state, restore on startup, reset when context exhausted.

### 3.1 — Startup Orient

On first message after start:
1. Load recent HISTORY atoms from MeTTa store
2. Load recent FEEDBACK from AuditSpace
3. Inject as `STARTUP_ORIENT` slot (before all others, first message only)

### 3.2 — Context Reset

When context window exhausted (30 messages / 1 hour):
1. Save active entries to MeTTa atoms (they persist)
2. Clear context.messages array
3. Continue with fresh context — atoms still available via RECALL query

No file-based checkpoint. Everything is atoms in existing stores.

### 3.3 — Persistent History

`(conversation ...)` atoms survive restarts. On startup, recent ones load into HISTORY.

**Smoketest:** Restart mid-conversation. Ask "what were we talking about?" — recalls from atoms.

---

## Optional Branches

### Branch A: Safety + Hooks

**Requires:** Phase 2

SafetyLayer and HookOrchestrator into the skill path. Pre-hooks for rate limits, PII. Post-hooks for audit, context updates. Rules from `safety.metta` and `hooks.metta`.

### Branch B: Autonomous Loop

**Requires:** Phase 3

When idle, generate self-tasks. Task list as MeTTa atoms: `(task :id "t1" :description "..." :status :pending)`. One at a time. `TASKS` slot in context.

### Branch C: Multi-Model Routing

**Requires:** Phase 2

ModelRouter scores models per task type. Epsilon-greedy exploration. `(set-model)` skill overrides.

### Branch D: Self-Improvement

**Requires:** Branch A + Branch B

HarnessOptimizer analyzes failures, proposes prompt changes. `(add-skill)` writes `skills.metta`. Memory consolidation merges duplicates.

---

## Execution Order

```
Critical Path:          Optional (any order after Phase 2):
  Phase 1 ──► Phase 2 ──► Phase 3     ╭──► Branch A: Safety + Hooks
                                      ├──► Branch B: Autonomous Loop
                                      ├──► Branch C: Multi-Model Routing
                                      ╰──► Branch D: Self-Improvement
                                           (requires A + B)
```

---

## Component Map

| Component | File | Phase | Status |
|---|---|---|---|
| IntelligentMessageProcessor | `agent/src/ai/IntelligentMessageProcessor.js` | 1, 2 | Active, needs context assembly |
| SemanticMemory | `agent/src/memory/SemanticMemory.js` | 1 | Implemented, not queried |
| NARS beliefs | `agent/src/Agent.js` → `nar.getBeliefs()` | 1 | Implemented, not queried |
| AuditSpace | `agent/src/memory/AuditSpace.js` | 2 | Implemented, not called |
| SkillDispatcher | `agent/src/skills/SkillDispatcher.js` | 2 | Implemented, not wired |
| SafetyLayer | `agent/src/safety/SafetyLayer.js` | Branch A | Implemented |
| HookOrchestrator | `agent/src/skills/HookOrchestrator.js` | Branch A | Implemented |
| ModelRouter | `agent/src/models/ModelRouter.js` | Branch C | Implemented |
| HarnessOptimizer | `agent/src/harness/HarnessOptimizer.js` | Branch D | Implemented |
| MeTTa Interpreter | `metta/src/MeTTaInterpreter.js` | 1, 2 | Implemented |
| AgentLoop.metta | `agent/src/metta/AgentLoop.metta` | Phase 3 | Spec only |
| skills.metta | `agent/src/metta/skills.metta` | Phase 2 | Spec only |

No new files for Phase 1. Only modifications to `IntelligentMessageProcessor.js`.

---

## Verification Protocol

Each phase:

1. **Smoketest** — `scripts/smoke-chatbot.js` tests full call chain offline
2. **IRC test** — live interaction with `!context` dumps
3. **Audit log** — `memory/audit/events.metta` shows complete trail
4. **Memory atoms** — atoms accumulating and being recalled
