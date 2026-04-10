# Bot Architecture Plan — SeNARS Cognitive Assistant v2

## Executive Summary

**Current State:** Three parallel architectures (IMP, MeTTa, LIDA) causing duplicate message processing, slow iteration, and unclear ownership.

**Target State:** Single cognitive pipeline powered by MeTTa/SeNARS. One file (`run.js`), no unnecessary abstractions, real integration tests.

**Principle:** Bots are **disposable**. Don't over-engineer. The intelligence is in MeTTa/SeNARS (agent/), not the bot wrapper.

---

## 1. Problem Analysis

### 1.1 Current Architecture (Broken)

```
bot/
├── run.js                      # Entry point, imports both below
├── run-intelligent-chatbot.js  # IMP + MeTTa (DUPLICATE PROCESSING)
├── run-cognitive-bot.js        # LIDA cycle (unused)
└── bot.config.json             # Invalid JSON (has comments)
```

**Message Flow (IRC Mode - BROKEN):**
```
IRC Message
    ↓
┌──────────────────────────────────┐
│  TWO PARALLEL PROCESSORS:        │
│  1. IMP listens on ircChannel    │ ← DUPLICATE #1
│  2. MeTTa listens on EmbodimentBus│ ← DUPLICATE #2
└──────────────────────────────────┘
    ↓
Both try to respond → User sees no response or duplicate responses
```

**Symptoms:**
- User must type message twice to get response
- Logs show duplicate message entries
- LLM response includes full prompt ("You are SeNARchy...")
- Slow startup (LLM warmup after messages arrive)
- No integration tests catch these issues

### 1.2 Why Development is Difficult

| Problem | Impact | Root Cause |
|---------|--------|------------|
| No embedded IRC tests | Manual testing required | Tests use mocks, not real pipeline |
| Duplicate processors | Messages lost/duplicated | Both IMP and MeTTa active |
| Invalid config file | Bot won't start | JSON with comments |
| Cascade dependencies | Fix one, break three | IMP → ActionDispatcher → SkillDispatcher → ... |
| LLM warmup timing | First messages ignored | Warmup happens after IRC connect |
| Response parsing broken | Echoes system prompt | Returns full LLM output, not just answer |
| Three bot files | Unclear which is "real" | Mode-based forks, not unified |

---

## 2. Target Architecture

### 2.1 Design Principles

1. **One Pipeline** — Every message flows: `Embodiment → EmbodimentBus → MeTTaLoop → Response`
2. **One Bot** — Single entry point (`run.js`), no mode-based forks
3. **VoltAgent Pattern** — Mirror `agent/` architecture for consistency
4. **Test Reality** — Embedded IRC server, real LLM (or realistic mock)
5. **Fast Feedback** — Tests run in <10s, not manual IRC sessions

### 2.2 File Structure (Minimal)

```
bot/
├── run.js                          # Single entry point (no abstractions)
├── bot.config.json                 # Valid JSON (no comments)
├── package.json
│
└── tests/
    ├── e2e/
    │   └── irc-pipeline.test.js    # Full pipeline: send → respond
    └── support/
        ├── embedded-irc.js         # Mock IRC server (reuse existing)
        └── mock-llm.js             # Realistic LLM mock
```

**Why Minimal:**
- Bots are **expendable** - the intelligence is in `agent/` (MeTTa/SeNARS)
- No `src/` directory - bot logic is simple configuration
- No `modes/` directory - mode = config, not code forks
- No `scenarios/` - demos are tests, not separate files

### 2.3 Message Flow (Fixed)

```
IRC Message
    ↓
IRCChannel (embodiment)
    ↓
EmbodimentBus (single queue, deduped)
    ↓
AgentMessageQueue
    ↓
MeTTaLoop (cognitive cycle)
    ├── 1. Classify message (greeting, question, command, statement)
    ├── 2. Build context (memory, beliefs, history, skills)
    ├── 3. Call LLM (with proper prompt/response separation)
    ├── 4. Parse JSON tool calls
    ├── 5. Execute actions (respond, think, remember, etc.)
    └── 6. Log audit trail
    ↓
Response sent via EmbodimentBus → IRCChannel → IRC Server
```

**Key Differences from Current:**
- No IMP listener (removed entirely from bot/)
- Single message path (no branches)
- LLM warmup completes BEFORE accepting messages
- Response parsing extracts ONLY the answer, not system prompt
- Rate limiting on OUTPUT only (input is user-controlled)

### 2.4 VoltAgent Pattern (Simplified)

**agent/** uses complex patterns because it's the cognitive core. **bot/** should be trivial:

```javascript
// bot/run.js - Simple, no abstractions
import { Agent } from '@senars/agent';
import { IRCChannel } from '@senars/agent/io';

const config = loadConfig();
const agent = new Agent({ /* config */ });
await agent.initialize();
await agent.ai.generate('warmup'); // Warm LLM FIRST
if (config.mode === 'irc') {
  const irc = new IRCChannel(config.irc);
  agent.embodimentBus.register(irc);
  await irc.connect();
}
agent.startMeTTaLoop(); // Single pipeline, no duplicates
```

**Key insight:** Bot is a **thin wrapper** around Agent + MeTTa. No BotAgent class needed.

---

## 3. Implementation Plan (Minimal)

### Phase 1: Fix It Today (1 hour)

```bash
# 1. Fix config (remove comments)
cat > bot/bot.config.json << 'EOF'
{"nick":"SeNARchy","profile":"parity","lm":{"provider":"transformers","modelName":"HuggingFaceTB/SmolLM2-135M"}}
EOF

# 2. Delete legacy
rm bot/run-intelligent-chatbot.js bot/run-cognitive-bot.js

# 3. Rewrite run.js (see Section 4)
```

### Phase 2: Test It (2 hours)

```bash
# Create one test that proves it works
cat > bot/tests/e2e/irc-pipeline.test.js << 'EOF'
test('bot responds to message', async () => {
  const { bot, irc } = await setup();
  await irc.send('!ping');
  const resp = await irc.waitForMessage(3000);
  expect(resp).toContain('pong');
});
EOF

# Run it
pnpm run bot:test
```

### Phase 3: Cognitive Features (Week 2, optional)

- Memory persistence (already in MeTTa)
- NARS beliefs (already in agent/)
- Goals (already in MeTTaLoop)

**Nothing new to build** - just enable what exists in agent/.

---

## 4. Why This Works

### 4.1 Simplicity

| Before | After |
|--------|-------|
| 3 bot files | 1 bot file |
| IMP + MeTTa (duplicate) | MeTTa only |
| `src/BotAgent.js` wrapper | Direct Agent usage |
| Manual testing | One test proves it works |

### 4.2 Fast Feedback

```
Change code → pnpm run bot:test (5s) → See result
```

### 4.3 Reality

- Embedded IRC catches real issues
- LLM mock returns valid JSON
- No abstractions to debug

---

## 5. Migration Checklist (Today)

```bash
# 1. Fix config
[ ] bot.config.json is valid JSON (no comments)

# 2. Delete legacy
[ ] rm run-intelligent-chatbot.js
[ ] rm run-cognitive-bot.js

# 3. Rewrite run.js
[ ] No IMP imports
[ ] LLM warmup before messages
[ ] Single MeTTa pipeline

# 4. Test
[ ] pnpm run bot:test passes
[ ] pnpm run bot:irc connects
[ ] pnpm run bot:cli responds
```

**That's it.** No `src/`, no `modes/`, no `scenarios/`.

---

## 6. Risks (Minimal)

| Risk | Reality Check |
|------|---------------|
| LLM not available | Use 135M model (cached) or mock |
| Tests flaky | Use existing MockIRCServer |
| MeTTa slow | Warmup is 1x, not per-message |

---

## 7. Success = Working Bot

- [ ] Single response per message
- [ ] Test runs in 5s
- [ ] One file (`run.js`)
- [ ] No duplicate code

---

## 8. Start Now

```bash
cd /home/me/senars10/bot
# 1. Fix config (remove comments)
# 2. Delete legacy files
# 3. Rewrite run.js (minimal, see Section 4)
# 4. Test: pnpm run bot:test
```

---

## Appendix: Why IMP Must Go

IMP duplicates MeTTa. Keeping it means duplicate bugs and half progress. Remove it.

---

## Appendix B: VoltAgent Pattern

The `agent/` directory uses VoltAgent pattern:

```javascript
// agent/src/Agent.js
export class Agent {
  constructor(config) {
    this.llm = new LLMService(config.lm);
    this.memory = new MemoryService(config.memory);
    this.audit = new AuditService(config.audit);
    this.actions = new ActionService(config.actions);
  }

  async initialize() {
    await this.llm.warmup();
    await this.memory.initialize();
    await this.audit.initialize();
    await this.actions.registerTools();
  }
}
```

**bot/ should mirror:**

```javascript
// bot/src/BotAgent.js
export class BotAgent {
  constructor(config) {
    this.agent = new Agent(config.agent);
    this.mettabLoop = new MeTTaLoopBuilder(this.agent);
  }

  async initialize() {
    await this.agent.initialize();
    await this.mettabLoop.initialize();
    await this._warmupLLM();
  }

  async start() {
    this.agent.startMeTTaLoop();
  }
}
```

Same patterns, clear separation, easy to maintain.

---

**Document Version:** 1.0  
**Created:** 2026-04-06  
**Status:** Ready for implementation  
**Owner:** SeNARS Development Team
