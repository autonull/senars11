;; safety.metta — Consequence rules for SafetyLayer
;;
;; Format: (consequence-of skill-call consequence risk-level)
;;
;; Risk levels: :low | :medium | :high | :critical
;;
;; Phase 4 ships with direct rules only — one fact per skill.
;; No consequence chaining (A→B→C inference) in this phase.
;;
;; These rules are loaded by SafetyLayer.js and evaluated via MeTTa
;; inference before side-effecting skills execute. Fail-closed on timeout.
;;
;; Migration note: When executionHooks is enabled, these rules are
;; automatically wrapped as pre-skill hooks by HookOrchestrator.
;; Authors may migrate rules to hooks.metta for finer control.

;; ── System tier (:high / :critical) ───────────────────────────────

(consequence-of (shell $cmd) (system-state-change :unknown) :high)

(consequence-of (add-skill $def) (skills-modified) :high)

(consequence-of (write-file "memory/harness/prompt.metta" $_)
                (system-prompt-modified) :critical)

;; ── Local write tier (:medium) ────────────────────────────────────

(consequence-of (write-file $path $_) (file-modified $path) :medium)

(consequence-of (append-file $path $_) (file-modified $path) :medium)

;; ── Network tier (:medium) ────────────────────────────────────────

(consequence-of (send $msg) (message-delivered :external) :medium)

(consequence-of (send-to $channel $msg) (message-delivered :external $channel) :medium)

;; ── Memory tier (:low) ────────────────────────────────────────────

(consequence-of (remember $content) (memory-updated :local) :low)

(consequence-of (query $q) (memory-read :local) :low)

(consequence-of (pin $id) (memory-pinned :local) :low)

(consequence-of (forget $q) (memory-deleted :local) :low)

;; ── Network read tier (:low) ──────────────────────────────────────

(consequence-of (search $query) (network-request :outbound) :low)

;; ── Reflective tier (:low) — always permitted ─────────────────────

(consequence-of (think $content) (internal-monologue :internal) :low)

(consequence-of (cognitive-cycle $stimulus) (cognitive-cycle :internal) :low)

(consequence-of (attend $content $priority) (attention-updated :internal) :low)

(consequence-of (dismiss $content) (attention-removed :internal) :low)

;; ── Meta tier (:medium / :high) ───────────────────────────────────

(consequence-of (set-goal $desc $priority) (goal-set :internal) :medium)

(consequence-of (set-model $model) (model-overridden) :medium)

(consequence-of (eval-model $model $taskType) (model-benchmark :internal) :medium)

(consequence-of (consolidate) (memory-consolidation :internal) :medium)

(consequence-of (spawn-agent $task $cycles) (subagent-spawned) :high)

;; ── NARS state protection ───────────────────────────────────────

(consequence-of (nar-deserialize $path) (state-restored) :high)
(consequence-of (nar-goal-add $desc $pri) (goal-created) :low)
(consequence-of (nar-goal-complete $term) (goal-removed) :medium)
(consequence-of (nar-revision $term $evidence) (belief-revised) :medium)

;; Metta skill security gap fix
(consequence-of (metta $expr) (arbitrary-evaluation) :high)
