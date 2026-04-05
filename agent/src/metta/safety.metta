;; safety.metta — Unified safety rules for the Symbolic Core
;;
;; This file is the SINGLE SOURCE OF TRUTH for skill safety classification.
;; It replaces the previous split between safety.metta (consequence rules)
;; and hooks.metta (pre/post hooks). The HookOrchestrator loads this file
;; and auto-generates pre-hooks from consequence rules.
;;
;; Format: (safety skill-pattern risk-level consequence-description)
;;
;; Risk levels: :low | :medium | :high | :critical
;;
;; Auto-generated pre-hooks:
;;   - :critical → deny unless harnessOptimization enabled
;;   - :high     → deny unless capability gate explicitly allows
;;   - :medium   → allow with audit
;;   - :low      → allow
;;
;; Custom hooks (pre/post) may still be defined below for fine-grained control.

;; ── Tier 1: System (:critical / :high) ────────────────────────────

(safety (shell $cmd) :high (system-execution :unknown-command))
(safety (add-skill $def) :high (skills-modified :self-alteration))
(safety (write-file "memory/harness/prompt.metta" $_) :critical (system-prompt-modified))
(safety (metta $expr) :high (arbitrary-evaluation :untrusted-code))
(safety (spawn-agent $task $cycles) :high (subagent-spawned :resource-allocation))
(safety (nar-deserialize $path) :high (state-restored :full-overwrite))

;; ── Tier 2: Local Write (:medium) ─────────────────────────────────

(safety (write-file $path $_) :medium (file-modified $path))
(safety (append-file $path $_) :medium (file-modified $path))
(safety (send $msg) :medium (message-delivered :external))
(safety (send-to $channel $msg) :medium (message-delivered $channel :external))
(safety (set-goal $desc $priority) :medium (goal-created))
(safety (set-model $model) :medium (model-overridden))
(safety (eval-model $model $taskType) :medium (model-benchmark))
(safety (consolidate) :medium (memory-consolidation))
(safety (nar-goal-complete $term) :medium (goal-removed))
(safety (nar-revision $term $evidence) :medium (belief-revised))

;; ── Tier 3: Read / Reflective (:low) ──────────────────────────────

(safety (remember $content) :low (memory-updated :local))
(safety (query $q) :low (memory-read :local))
(safety (pin $id) :low (memory-pinned :local))
(safety (forget $q) :low (memory-deleted :local))
(safety (search $query) :low (network-request :outbound))
(safety (think $content) :low (internal-monologue))
(safety (cognitive-cycle $stimulus) :low (cognitive-cycle :internal))
(safety (attend $content $priority) :low (attention-updated :internal))
(safety (dismiss $content) :low (attention-removed :internal))
(safety (nar-goal-add $desc $pri) :low (goal-created))

;; ── Custom Pre-Hooks (fine-grained overrides) ─────────────────────

;; Path traversal protection for file operations
(hook pre (write-file $path $_)
      (if (path-within? $path "memory")
        (allow)
        (deny "Path traversal outside memory/ directory")))

(hook pre (append-file $path $_)
      (if (path-within? $path "memory")
        (allow)
        (deny "Path traversal outside memory/ directory")))

;; Block harness prompt modification unless harnessOptimization enabled
(hook pre (write-file "memory/harness/prompt.metta" $_)
      (if (capability-enabled? harnessOptimization)
        (allow)
        (deny "harnessOptimization not enabled")))

;; Sanitize search queries
(hook pre (search $query)
      (rewrite (search (string-append $query " safe_search=active"))))

;; Block send-to unknown embodiments
(hook pre (send-to $embodiment $_)
      (if $embodiment
        (allow)
        (deny "Unknown embodiment")))

;; ── Post-Hooks (audit logging) ────────────────────────────────────

(hook post (write-file $path $content)
      (audit-emit (audit-event :type :file-write :path $path :size (string-length $content))))

(hook post (append-file $path $content)
      (audit-emit (audit-event :type :file-append :path $path :size (string-length $content))))

(hook post (shell $cmd)
      (audit-emit (audit-event :type :shell-exec :cmd $cmd)))

(hook post (remember $_)
      (audit-emit (audit-event :type :memory-remember)))

(hook post (forget $q)
      (audit-emit (audit-event :type :memory-forget :query $q)))

(hook post (pin $id)
      (audit-emit (audit-event :type :memory-pin :id $id)))

(hook post (send $msg)
      (audit-emit (audit-event :type :network-send :msg-length (string-length $msg))))

(hook post (send-to $embodiment $msg)
      (audit-emit (audit-event :type :network-send-to :embodiment $embodiment :msg-length (string-length $msg))))

(hook post (search $query)
      (audit-emit (audit-event :type :network-search :query $query)))

(hook post (add-skill $def)
      (audit-emit (audit-event :type :skill-add)))

(hook post (set-goal $desc $priority)
      (audit-emit (audit-event :type :goal-set :desc $desc :priority $priority)))

(hook post (set-model $model)
      (audit-emit (audit-event :type :model-override :model $model)))

(hook post (spawn-agent $_ $cycles)
      (audit-emit (audit-event :type :subagent-spawn :cycles $cycles)))
