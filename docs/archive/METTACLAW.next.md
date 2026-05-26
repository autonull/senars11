# METTACLAW.next.md — SeNARS Agent: Completion Plan

> **Scope:** Complete the architecture to its ideal, elegant form.  
> **Premise:** METTACLAW.md + METTACLAW.upgrade.md are the complete specification. All components are implemented. The gaps are incomplete wiring.  
> **Version:** 7.0 (April 2026)

---

## 1. The Ideal Architecture

The specified architecture achieves elegance through three principles:

| Principle | Manifestation |
|---|---|
| **Atoms all the way down** (§1.3) | Every fact, skill, preference, belief, audit record survives restart as a MeTTa atom |
| **Single source of truth** (§14.2) | One I/O bus, one config file, one skill registry — no duplicates |
| **Individual capability control** (§1.3) | Every feature independently toggleable; runs cleanly at any point on the spectrum |

The architecture is sound. Three implementation gaps violate these principles:

| Principle Violated | Gap | Symptom |
|---|---|---|
| Single source of truth | `ChannelManager` and `EmbodimentBus` duplicate state | Chatbot examples crash |
| Configuration completeness | `agent.json` missing `lm`, `channels`, `tools` | Subsystems receive undefined |
| Skills as atoms | 25 declared skills have no handlers | Contract broken |

Each fix restores a principle. No new architecture needed.

---

## 2. Fixes

### 2.1 Unify I/O — Restore Single Source of Truth

**Principle:** §15 — `ChannelManager` superseded by `EmbodimentBus`.

**Gap:** Both exist independently. `EmbodimentBus` owns state; `ChannelManager` is orphaned.

**Fix:** `ChannelManager` becomes a thin view over `EmbodimentBus` — registration, message routing, and salience calculation live in one place.

```javascript
// Agent.js
this.channelManager = new ChannelManager(this.config, this.embodimentBus);

// ChannelManager.js
constructor(config, bus) { this.config = config; this.bus = bus; }
register(ch) { this.bus.register(ch); }
async sendMessage(id, target, content, meta) {
    const emb = this.bus.get(id);
    if (emb?.status !== 'connected') throw new Error(`Embodiment ${id} not connected`);
    return emb.sendMessage(target, content, meta);
}
```

**Delta:** ~15 lines in `ChannelManager.js`, ~2 in `Agent.js`.

### 2.2 Complete Configuration — Restore Configuration Completeness

**Principle:** §5.9, §13.1 — `agent.json` is the single configuration file.

**Gap:** `agent.json` has `models.providers` but runtime reads `config.lm`. Channels and tools have no config section.

**Fix:** Add `lm`, `channels`, `tools` sections. Wire `Agent.js` to read them.

```jsonc
{
  "lm": {
    "provider": "openai", "modelName": "gpt-4o-mini",
    "temperature": 0.7, "maxTokens": 512,
    "providers": {
      "openai":    { "enabled": true,  "models": ["gpt-4o", "gpt-4o-mini"] },
      "anthropic": { "enabled": false, "models": ["claude-sonnet-4-6"] },
      "ollama":    { "enabled": true, "baseURL": "http://localhost:11434", "models": ["llama3.2"] }
    }
  },
  "channels": {
    "irc":   { "enabled": false, "host": "irc.quakenet.org", "port": 6667, "nick": "SeNARchy", "channels": ["##metta"], "tls": false },
    "nostr": { "enabled": false, "privateKey": "", "relays": ["wss://relay.damus.io"] }
  },
  "tools": {
    "websearch": { "provider": "mock" }
  }
}
```

**Delta:** ~25 lines in `agent.json`, ~15 in `Agent.js`.

### 2.3 Complete Skill Registration — Restore Skills as Atoms

**Principle:** §5.2 — Skills are atoms declared in `skills.metta`. Each has a handler.

**Gap:** 40+ declared, ~15 registered. 25 declared skills are lies.

**Fix:** Register missing handlers. Each is 3-10 lines delegating to existing subsystems.

| Skill | Handler | Lines |
|---|---|---|
| `nar-goal-add` | `nar.taskManager.addGoal(...)` | 5 |
| `nar-goal-complete` | `nar.taskManager.completeGoal(...)` | 3 |
| `nar-goal-status` | `nar.taskManager.getGoalStatus(...)` | 3 |
| `nar-goals` | `nar.taskManager.findTasksByType('GOAL')` | 3 |
| `nar-focus-create` | `nar.focusSets.create(...)` | 3 |
| `nar-focus-switch` | `nar.focusSets.switch(...)` | 3 |
| `nar-focus-sets` | `nar.focusSets.list()` | 3 |
| `nar-revision` | `nal.revise(...)` | 3 |
| `consolidate` | `semanticMemory.consolidate()` | 5 |
| `add-skill` | append to `skills.metta` via `&add-rule` | 10 |

**Delta:** ~40 lines in `MeTTaLoopBuilder.js`.

### 2.4 Validate at Startup — Enforce Contracts

**Principle:** §5.9 — Invalid configurations should produce clear errors.

**Gap:** `validateDeps()` only checks dependency chains. Profile names, unknown flags, required fields pass silently.

**Fix:** Create `agent/src/config/validate.js`. Run in `Agent.initialize()` before `validateDeps()`.

```javascript
export function validate(config) {
    const errors = [];
    const validProfiles = ['minimal', 'parity', 'evolved', 'full'];
    if (config.profile && !validProfiles.includes(config.profile))
        errors.push(`Unknown profile '${config.profile}'. Valid: ${validProfiles.join(', ')}`);
    for (const key of Object.keys(config.capabilities ?? {}))
        if (!(key in DEFAULTS)) errors.push(`Unknown capability: ${key}`);
    if (config.lm?.provider === 'openai' && !config.lm.apiKey && !process.env.OPENAI_API_KEY)
        errors.push('OpenAI provider selected but no API key configured');
    if (config.channels?.irc?.enabled && !config.channels.irc.host)
        errors.push('IRC channel enabled but no host configured');
    return errors;
}
```

**Delta:** ~40 lines new file.

### 2.5 Surface Errors — No Invisible Failures

**Principle:** §5.1, §1.3(5) — No invisible work. Errors are audit events.

**Gap:** `#invokeLLM()` catches errors and returns `''`. Silent failure.

**Fix:** Log with context, set `&error`, return error atom.

```javascript
catch (err) {
    Logger.error('[MeTTa llm-invoke]', err.message);
    loopState.error = `llm-error: ${err.message}`;
    return `(llm-error "${err.message.slice(0, 200)}")`;
}
```

**Delta:** ~5 lines in `MeTTaLoopBuilder.js`.

### 2.6 CLI Entry Point — Zero-Config Path

**Principle:** §6 Phase 1 step 10 — Test with mock LLM, no external services.

**Gap:** No entry point works without API keys or external services.

**Fix:** Create `agent/src/bin/chat-cli.js`. Uses `CLIChannel` + `--provider dummy`.

```bash
npm run chat:cli              # uses agent.json config
npm run chat:cli -- --provider dummy  # zero-config, works immediately
```

**Delta:** ~80 lines new file, ~1 in `agent/package.json`.

### 2.7 MatrixChannel Lazy Import — Graceful Degradation

**Principle:** §14.2 — No new abstraction classes for thin wrappers. Dependencies should be optional.

**Gap:** Top-level `import 'matrix-js-sdk'` crashes when package not installed.

**Fix:** Lazy import. Warn on first use if missing.

```javascript
async _ensureSDK() {
    if (this._sdk) return this._sdk;
    try { this._sdk = await import('matrix-js-sdk'); }
    catch { throw new Error('MatrixChannel requires matrix-js-sdk: npm install matrix-js-sdk'); }
    return this._sdk;
}
```

**Delta:** ~10 lines in `MatrixChannel.js`.

---

## 3. Capability Dependencies

Append to `capabilities.js` DEPENDENCY_TABLE (from METTACLAW.upgrade.md §2.3):

```
taskList              → goalPursuit, semanticMemory
actionTrace           → auditLog
memorySnapshots       → semanticMemory
separateEvaluator     → subAgentSpawning, taskList
backgroundTriggers    → autonomousLoop, virtualEmbodiment
coordinatorMode       → multiEmbodiment, multiModelRouting
```

**Delta:** ~6 lines in `capabilities.js`.

---

## 4. File Delta

### New (4 files, ~240 lines)

| File | Lines | Purpose |
|---|---|---|
| `agent/src/config/validate.js` | ~40 | Startup validation |
| `agent/src/bin/chat-cli.js` | ~80 | CLI entry point |
| `agent/.env` | ~20 | Documented env vars |
| `agent/docs/capabilities.md` | ~100 | Per-capability enablement guide |

### Modified (5 files, ~125 lines)

| File | Change | Lines |
|---|---|---|
| `agent/src/Agent.js` | `channelManager` facade, config wiring | ~30 |
| `agent/src/io/ChannelManager.js` | Delegate to `embodimentBus` | ~15 |
| `agent/src/io/channels/MatrixChannel.js` | Lazy import | ~10 |
| `agent/src/metta/MeTTaLoopBuilder.js` | Missing skill handlers, error surfacing | ~45 |
| `agent/workspace/agent.json` | `lm`, `channels`, `tools` sections | ~25 |

**Total: ~365 lines across 9 files.**

---

## 5. Verification

| # | Test | Command | Expected |
|---|---|---|---|
| 1 | Zero-config CLI | `npm run chat:cli -- --provider dummy` | Starts, accepts input, produces output |
| 2 | Parity validates | `agent.json` profile `"parity"` | No errors |
| 3 | Invalid rejected | `agent.json` profile `"foo"` | Clear error listing valid profiles |
| 4 | Chatbots start | `run.js`, `run-intelligent-chatbot.js`, `run-cognitive-bot.js` | No `channelManager` crash |
| 5 | All skills work | `(metta (skill-inventory))` | Every declared skill has handler |
| 6 | Errors visible | Configure invalid API key | Error in output, not silent |

---

## 6. Priority

| # | Change | Effort | Unblocks |
|---|---|---|---|
| 1 | Unify I/O | 1h | All entry points |
| 2 | Complete config | 1h | AIClient, channels, tools |
| 3 | Register skills | 2h | Complete skill contract |
| 4 | Validate startup | 1h | Fail-fast on bad config |
| 5 | Surface errors | 30m | Debuggability |
| 6 | CLI entry | 2h | Zero-config path |
| 7 | Matrix lazy import | 30m | No crash on import |
| 8 | Docs | 2h | User self-service |

**First usable agent:** Items 1-5 = ~4 hours.  
**Fully usable:** All items = ~1 day.

---

## 7. What This Plan Does NOT Do

- **Does not re-specify architecture.** METTACLAW.md + METTACLAW.upgrade.md are the spec.
- **Does not add new components.** Every fix uses existing subsystems.
- **Does not change the MeTTa/JS dual loop.** The JS shim is intentional per §14.10.
- **Does not implement Phase 7-9 code.** Those are specified in METTACLAW.upgrade.md. This plan makes the foundation solid so they can be built on it.
