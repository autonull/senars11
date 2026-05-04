;; skills.metta — Action declarations for SeNARS agent
;;
;; Format: (skill name arg-types capability-gate tier description)
;;
;; Actions whose capability-gate flag is disabled are omitted from the
;; ACTIONS context slot — the LLM cannot invoke what it cannot see.
;;
;; This file is read by ActionDispatcher.getActiveActionDefs() which
;; filters by isEnabled(config, capability-gate).
;;
;; Agent-writable when selfModifyingSkills is enabled (Phase 6).

;; ── Parity tier ───────────────────────────────────────────────────

(skill respond       (String)         mettaControlPlane   :network     "Reply to user via the embodiment of the last received message")
(skill remember      (String)         semanticMemory      :memory      "Store to long-term memory with embedding")
(skill query         (String)         semanticMemory      :memory      "Recall top-K semantically similar memories")
(skill pin           (String)         semanticMemory      :memory      "Add to pinned context (always in prompt)")
(skill forget        (String)         semanticMemory      :memory      "Remove memories matching query")

(skill send          (String)         mettaControlPlane   :network     "Send to current primary embodiment")
(skill send-to       (Chan String)    multiEmbodiment     :network     "Send to a specific named embodiment")
(skill search        (String)         webSearchSkill      :network     "Web search, return top results")

(skill read-file     (Path)           fileReadSkill       :local-read  "Read file within workdir")
(skill write-file    (Path String)    fileWriteSkill      :local-write "Write file within memory/")
(skill append-file   (Path String)    fileWriteSkill      :local-write "Append to file within memory/")

(skill shell         (String)         shellSkill          :system      "Execute allowlisted OS command")

(skill metta         (SExpr)          mettaControlPlane   :reflect     "Evaluate MeTTa expression, return results")
(skill think         (String)         mettaControlPlane   :reflect     "Internal monologue; not sent to any embodiment")
(skill cognitive-cycle (SExpr)        mettaControlPlane   :reflect     "Invoke full LIDA CognitiveArchitecture.cognitiveCycle() on stimulus")
(skill attend        (String Float)   mettaControlPlane   :reflect     "Add item to working memory register with priority 0-1; default TTL applies")
(skill dismiss       (String)         mettaControlPlane   :reflect     "Remove matching item from working memory register immediately")

;; ── Evolution tier ────────────────────────────────────────────────

(skill set-goal      (String Float)   goalPursuit         :meta        "Set current goal with priority 0.0-1.0")
(skill set-model     (String)         multiModelRouting   :meta        "Override active model for next N cycles")
(skill eval-model    (String TaskType) modelExploration   :meta        "Benchmark a model on a task type")
(skill add-skill     (SExpr)          selfModifyingSkills :meta        "Register new skill definition")
(skill consolidate   ()               memoryConsolidation :meta        "Trigger memory consolidation immediately")
(skill spawn-agent   (String Int)     subAgentSpawning    :meta        "Spawn sub-agent with task + cycle budget")

;; ── NARS goal management ──────────────────────────────────────
(skill nar-goal-add       (String Float)   goalPursuit         :meta "Add goal to NARS memory")
(skill nar-goal-complete  (String)         goalPursuit         :meta "Mark goal achieved")
(skill nar-goal-status    (String)         goalPursuit         :meta "Query goal status")
(skill nar-goals          (Sym)            goalPursuit         :meta "List goals: :active | :pending | :all")

;; ── NARS state management ─────────────────────────────────────
(skill nar-serialize      ()               persistentHistory   :meta "Serialize full NARS state")
(skill nar-snapshot       (Sym)            memorySnapshots     :meta "Capture belief snapshot")
(skill nar-snapshot-compare (String String Float) memorySnapshots :meta "Compare two snapshots")

;; ── NARS derivation tracing ───────────────────────────────────
(skill nar-stamps          (String)        actionTrace         :meta "Get derivation stamps for a term")
(skill nar-recent-derivations (Int)        actionTrace         :meta "Get recent derivation events")

;; ── NARS focus management ─────────────────────────────────────
(skill nar-focus-sets     ()               coordinatorMode     :meta "List focus sets")
(skill nar-focus-create   (String)         coordinatorMode     :meta "Create named focus set")
(skill nar-focus-switch   (String)         coordinatorMode     :meta "Switch to focus set")

;; ── NAL revision ──────────────────────────────────────────────
(skill nar-revision       (String SExpr)   separateEvaluator   :meta "Input evidence for truth revision")
