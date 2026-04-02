;; hooks.metta — Declarative hook rules for skill execution
;;
;; Governed by: executionHooks capability flag
;;
;; Hook format: (hook <phase> <skill-pattern> <hook-body>)
;;
;; Where:
;;   <phase>        : pre | post
;;   <skill-pattern>: S-expression pattern matching skill name and args
;;   <hook-body>    : Returns (allow), (deny reason), (rewrite args), or (audit-emit event)
;;
;; Execution order: Hooks execute in declaration order.
;; First (deny) stops the chain; (rewrite) mutations accumulate.

;; ================================================================
;; PRE-HOOKS — Execute before skill handler
;; ================================================================

;; ── Shell command safety ──────────────────────────────────────────

;; Block shell commands containing forbidden patterns
(hook pre (shell $cmd)
      (if (contains-forbidden? $cmd)
        (deny "Forbidden pattern in shell command")
        (allow)))

;; Require shell commands to start with allowed prefix
(hook pre (shell $cmd)
      (if (capability-enabled? shellSkill)
        (allow)
        (deny "shellSkill capability not enabled")))

;; ── File operation safety ─────────────────────────────────────────

;; Block file writes outside memory/ directory
(hook pre (write-file $path $content)
      (if (path-within? $path "memory")
        (allow)
        (deny "Path traversal outside memory/ directory")))

(hook pre (append-file $path $content)
      (if (path-within? $path "memory")
        (allow)
        (deny "Path traversal outside memory/ directory")))

;; Block harness prompt modification unless harnessOptimization enabled
(hook pre (write-file "memory/harness/prompt.metta" $content)
      (if (capability-enabled? harnessOptimization)
        (allow)
        (deny "harnessOptimization not enabled")))

;; ── Network operation safety ──────────────────────────────────────

;; Sanitize search queries to add safe search
(hook pre (search $query)
      (rewrite (search (string-append $query " safe_search=active"))))

;; Block send-to unknown embodiments
(hook pre (send-to $embodiment $msg)
      (if $embodiment
        (allow)
        (deny "Unknown embodiment")))

;; ── Skill modification safety ─────────────────────────────────────

;; Block add-skill unless selfModifyingSkills enabled
(hook pre (add-skill $def)
      (if (capability-enabled? selfModifyingSkills)
        (allow)
        (deny "selfModifyingSkills not enabled")))

;; ── Memory operation safety ───────────────────────────────────────

;; Allow all memory operations (low risk)
(hook pre (remember $content) (allow))
(hook pre (query $q) (allow))
(hook pre (pin $id) (allow))
(hook pre (forget $q) (allow))

;; ── Meta operations ───────────────────────────────────────────────

;; Block spawn-agent unless subAgentSpawning enabled
(hook pre (spawn-agent $task $cycles)
      (if (capability-enabled? subAgentSpawning)
        (allow)
        (deny "subAgentSpawning not enabled")))

;; Allow other meta operations
(hook pre (set-goal $desc $priority) (allow))
(hook pre (set-model $model) (allow))
(hook pre (eval-model $model $taskType) (allow))
(hook pre (consolidate) (allow))

;; ── Reflective operations ─────────────────────────────────────────

;; Allow all reflective operations (internal only)
(hook pre (metta $expr) (allow))
(hook pre (think $content) (allow))
(hook pre (cognitive-cycle $stimulus) (allow))
(hook pre (attend $content $priority) (allow))
(hook pre (dismiss $content) (allow))

;; ── Network send operations ───────────────────────────────────────

;; Allow send operations (medium risk, but essential)
(hook pre (send $msg) (allow))

;; ================================================================
;; POST-HOOKS — Execute after skill handler
;; ================================================================

;; ── Audit logging ─────────────────────────────────────────────────

;; Audit all file writes
(hook post (write-file $path $content)
      (audit-emit (audit-event :type :file-write :path $path :size (string-length $content))))

(hook post (append-file $path $content)
      (audit-emit (audit-event :type :file-append :path $path :size (string-length $content))))

;; Audit shell command execution
(hook post (shell $cmd)
      (audit-emit (audit-event :type :shell-exec :cmd $cmd)))

;; Audit memory operations
(hook post (remember $content)
      (audit-emit (audit-event :type :memory-remember :content-hash (string-length $content))))

(hook post (forget $q)
      (audit-emit (audit-event :type :memory-forget :query $q)))

(hook post (pin $id)
      (audit-emit (audit-event :type :memory-pin :id $id)))

;; Audit network operations
(hook post (send $msg)
      (audit-emit (audit-event :type :network-send :msg-length (string-length $msg))))

(hook post (send-to $embodiment $msg)
      (audit-emit (audit-event :type :network-send-to :embodiment $embodiment :msg-length (string-length $msg))))

(hook post (search $query)
      (audit-emit (audit-event :type :network-search :query $query)))

;; Audit skill modification
(hook post (add-skill $def)
      (audit-emit (audit-event :type :skill-add :def-hash "dynamic")))

;; Audit meta operations
(hook post (set-goal $desc $priority)
      (audit-emit (audit-event :type :goal-set :desc $desc :priority $priority)))

(hook post (set-model $model)
      (audit-emit (audit-event :type :model-override :model $model)))

(hook post (spawn-agent $task $cycles)
      (audit-emit (audit-event :type :subagent-spawn :cycles $cycles)))

;; ================================================================
;; Built-in predicates (implemented in HookOrchestrator.js):
;;
;; (contains-forbidden? $str)    — checks shell.forbiddenPatterns
;; (path-within? $path $base)    — validates path is within base directory
;; (capability-enabled? $flag)   — checks if capability flag is active
;; (audit-emit $atom)            — appends atom to audit space
;; ================================================================
