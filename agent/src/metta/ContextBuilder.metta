;; ContextBuilder.metta — Context assembly as MeTTa program
;;
;; Governed by: contextBudgets capability flag
;; 
;; This file defines the authoritative context assembly specification.
;; The JS ContextBuilder class in agent/src/memory/ContextBuilder.js
;; provides the grounded op implementations that this MeTTa code calls.
;;
;; Context slots (assembled in order):
;;   1. SYSTEM_PROMPT   — loaded from memory/harness/prompt.metta
;;   2. CAPABILITIES    — active capability flags
;;   3. SKILLS          — S-expression skill declarations (filtered by capability)
;;   4. STARTUP_ORIENT  — active goals + needs attention, first cycle only
;;   5. TASKS           — all NARS goals with status
;;   6. PINNED          — pinned memories (always included)
;;   7. WM_REGISTER     — working memory register entries
;;   8. AGENT_MANIFEST  — runtime self-description (when runtimeIntrospection enabled)
;;   9. RECALL          — semantically recalled memories
;;   10. HISTORY         — recent conversation/action history
;;   11. FEEDBACK        — last cycle feedback / errors
;;   12. INPUT           — current input message
;;
;; Budget configuration (from agent.json):
;;   memory.maxRecallChars    — default 8000
;;   memory.maxHistoryChars   — default 12000
;;   memory.maxFeedbackChars  — default 6000
;;   memory.pinnedMaxChars    — default 3000
;;   memory.wmRegisterChars   — default 1500
;;   memory.agentManifestChars — default 2000
;;   memory.startupOrientChars — default 2000
;;   memory.tasksChars        — default 1500
;;   memory.startupOrientChars — default 2000
;;   memory.tasksChars        — default 1500

;; ── Entry point ───────────────────────────────────────────────────
;; (build-context $msg) → assembled context string
(= (build-context $msg)
   (seq
     ;; Initialize context builder
     (context-init)
     
     ;; Assemble slots in order
      (let*
        (($system   (slot-system))
         ($caps     (slot-capabilities))
         ($skills   (slot-skills))
         ($orient   (slot-startup-orient))
         ($tasks    (slot-tasks))
         ($pinned   (slot-pinned))
         ($wm       (slot-wm-register))
         ($manifest (slot-agent-manifest))
         ($recall   (slot-recall $msg))
         ($history  (slot-history))
         ($feedback (slot-feedback))
         ($input    (slot-input $msg)))
        
        ;; Concatenate with section headers
        (context-concat
          $system $caps $skills $orient $tasks $pinned $wm $manifest $recall $history $feedback $input))))

;; ── Slot builders ─────────────────────────────────────────────────

;; SYSTEM_PROMPT — loaded from memory/harness/prompt.metta
(= (slot-system)
   (if (cap? harnessOptimization)
     (load-harness-prompt)
     (default-system-prompt)))

;; CAPABILITIES — active capability flags
(= (slot-capabilities)
   (context-section "CAPABILITIES"
     (filter-capabilities active)))

;; SKILLS — S-expression skill declarations
(= (slot-skills)
   (context-section "SKILLS"
     (if (cap? sExprSkillDispatch)
       (get-active-skills)
       "(skill dispatch disabled — using JSON tool calls)")))

;; STARTUP_ORIENT — active goals + needs attention, first cycle only
(= (slot-startup-orient $cycle)
   (if (== $cycle 0)
     (context-section "STARTUP_ORIENT" (get-startup-orient))
     ""))

;; TASKS — all NARS goals with status
(= (slot-tasks)
   (if (cap? goalPursuit)
     (context-section "TASKS" (get-tasks))
     ""))

;; STARTUP_ORIENT — active goals + needs attention, first cycle only
(= (slot-startup-orient $cycle)
   (if (== $cycle 0)
     (context-section "STARTUP_ORIENT" (get-startup-orient))
     ""))

;; TASKS — all NARS goals with status
(= (slot-tasks)
   (if (cap? goalPursuit)
     (context-section "TASKS" (get-tasks))
     ""))

;; PINNED — pinned memories (always included)
(= (slot-pinned)
   (context-section "PINNED"
     (truncate-chars (get-pinned-memories) (budget pinnedMaxChars))))

;; WM_REGISTER — working memory register entries
(= (slot-wm-register)
   (context-section "WM_REGISTER"
     (truncate-chars (get-wm-entries) (budget wmRegisterChars))))

;; AGENT_MANIFEST — runtime self-description
(= (slot-agent-manifest)
   (if (cap? runtimeIntrospection)
     (context-section "AGENT_MANIFEST"
       (truncate-chars (generate-manifest) (budget agentManifestChars)))
     ""))

;; RECALL — semantically recalled memories
(= (slot-recall $msg)
   (context-section "RECALL"
     (if (cap? semanticMemory)
       (truncate-chars
         (query-memories $msg (budget recallItems))
         (budget recallChars))
       "")))

;; HISTORY — recent conversation/action history
(= (slot-history)
   (context-section "HISTORY"
     (if (cap? persistentHistory)
       (truncate-chars (get-history) (budget historyChars))
       "")))

;; FEEDBACK — last cycle feedback / errors
(= (slot-feedback)
   (context-section "FEEDBACK"
     (truncate-chars (get-feedback) (budget feedbackChars))))

;; INPUT — current input message
(= (slot-input $msg)
   (context-section "INPUT"
     (if (or $msg (not (cap? autonomousLoop)))
       (format-input $msg)
       "(autonomous cycle — no external input)")))

;; ── Utility functions ─────────────────────────────────────────────

;; Context section formatter
(= (context-section $name $content)
   (if (or (not $content) (== $content "") (== $content ()))
     ""
     (string-append "═══ " $name " ═══\n" $content "\n\n")))

;; Budget lookup (delegates to JS for config access)
(= (budget $key)
   (get-budget $key))

;; Character truncation utility
(= (truncate-chars $content $max)
   (if (<= (string-length $content) $max)
     $content
     (string-append (substring $content 0 (- $max 100)) "\n... [truncated]")))

;; ── Grounded ops (implemented in JS) ──────────────────────────────
;;
;; These are registered by ContextBuilder.registerGroundedOps():
;;
;;   (context-init)              → ok
;;   (context-concat &rest)      → String
;;   (load-harness-prompt)       → String
;;   (default-system-prompt)     → String
;;   (filter-capabilities mode)  → String
;;   (get-active-skills)         → String
;;   (get-pinned-memories)       → String
;;   (get-wm-entries)            → String
;;   (generate-manifest)         → String
;;   (query-memories msg k)      → String
;;   (get-history)               → String
;;   (get-feedback)              → String
;;   (format-input msg)          → String
;;   (get-budget key)            → Number
;;
;; ── Default system prompt (fallback) ──────────────────────────────

(= (default-system-prompt)
   "You are SeNARchy, a helpful AI assistant.
Respond concisely. Use S-expression skill calls when taking actions.
Example: ((send \"Hello\") (remember \"User prefers concise responses\"))")
