;; AgentLoop.metta — SeNARS Agent Control Plane
;;
;; "MeTTa is the operating system. LLMs are peripherals."
;;
;; PHASE 1 EXECUTION MODEL
;; -----------------------
;; The JS driver in Agent._buildMeTTaLoop() implements this loop semantics
;; directly as an async JS function. MeTTa drives the cycle via grounded
;; op calls for dispatch, context assembly, and rule evaluation.
;;
;; This file defines the authoritative loop specification. The JS driver
;; mirrors it exactly. Future phases migrate execution here as the
;; MeTTa interpreter gains robust async grounded-op support.
;;
;; Grounded ops provided by Agent._buildMeTTaLoop():
;;
;;   CAPABILITY
;;     cap? flag             → True | False
;;
;;   BUDGET
;;     agent-budget          → Number   (current remaining cycles)
;;     reset-budget          → Number   (reset to config.loop.budget)
;;     agent-reset!          → ok
;;     inc-cycle-count!      → ok
;;
;;   I/O  (async in JS driver)
;;     check-embodiment-bus  → String | ()
;;     new-message? msg      → True | False
;;
;;   COGNITIVE
;;     tick-wm               → ok
;;     build-context msg     → String
;;     llm-invoke ctx        → String   (async)
;;     parse-response resp   → GroundedCmds
;;     execute-commands cmds → GroundedResults  (async)
;;
;;   HISTORY / AUDIT
;;     append-history m r rs → ok
;;     emit-cycle-audit m r rs → ok
;;
;;   TIMING
;;     sleep-cycle           → ok  (async)

;; ── Combinators ───────────────────────────────────────────────────
(= (when True  $expr) $expr)
(= (when False $expr) ())

;; ── Entry point ───────────────────────────────────────────────────
;; JS driver calls agent-start semantics directly; these rules serve
;; as specification and as entry points for future MeTTa execution.
(= (agent-start)
   (seq (agent-init)
        (agent-loop (agent-budget))))

;; ── Initialization (runs once before main loop) ───────────────────
(= (agent-init)
   (do
     ;; 1. Orient: manifest confirms active capabilities
     (when (cap? runtimeIntrospection)
       (let $m (manifest)
            (attend (atom->string $m) 0.9)))

     ;; 2. Restore session checkpoint (uses NARS deserialize)
     (when (cap? persistentHistory)
       (let $session (nar-latest-session)
            (if (not (== $session ()))
              (nar-deserialize (string-append "memory/sessions/" $session))
              ())))

     ;; 3. Orient on active goals (from NARS)
     (let $goals (nar-goals :active)
          (if (not (== $goals ()))
            (attend (format-goals $goals) 0.85)
            ()))

     ;; 4. Surface recent derivation failures
     (when (cap? auditLog)
       (let $derivations (nar-recent-derivations 5)
            (if (not (== $derivations ()))
              (attend (format-derivations $derivations) 0.7)
              ())))

     (emit-cycle-audit :startup :complete)))

;; ── Initialization (runs once before main loop) ───────────────────
(= (agent-init)
   (do
     ;; 1. Orient: manifest confirms active capabilities
     (when (cap? runtimeIntrospection)
       (let $m (manifest)
            (attend (atom->string $m) 0.9)))

     ;; 2. Restore session checkpoint (uses NARS deserialize)
     (when (cap? persistentHistory)
       (let $session (nar-latest-session)
            (if (not (== $session ()))
              (nar-deserialize (string-append "memory/sessions/" $session))
              ())))

     ;; 3. Orient on active goals (from NARS)
     (let $goals (nar-goals :active)
          (if (not (== $goals ()))
            (attend (format-goals $goals) 0.85)
            ()))

     ;; 4. Surface recent derivation failures
     (when (cap? auditLog)
       (let $derivations (nar-recent-derivations 5)
            (if (not (== $derivations ()))
              (attend (format-derivations $derivations) 0.7)
              ())))

     (emit-cycle-audit :startup :complete)))

;; ── Main loop (tail-recursive) ────────────────────────────────────
(= (agent-loop $k)
   (if (== $k 0)
     (do
       (when (cap? persistentHistory)
         (nar-serialize))
       (if (cap? autonomousLoop)
         (agent-loop (reset-budget))
         (agent-halt)))
     (let* (($msg     (check-embodiment-bus))
            ($k2      (if (new-message? $msg)
                        (reset-budget)
                        (- $k 1)))
            ($_       (tick-wm))
            ($ctx     (build-context $msg))
            ($resp    (llm-invoke $ctx))
            ($cmds    (parse-response $resp))
            ($result  (execute-commands $cmds))
            ($_       (when (cap? persistentHistory)
                        (append-history $msg $resp $result)))
            ($_       (when (cap? auditLog)
                        (emit-cycle-audit $msg $resp $result)))
            ($_       (inc-cycle-count!))
            ($_       (sleep-cycle)))
       (agent-loop $k2))))

;; ── Halt ──────────────────────────────────────────────────────────
(= (agent-halt) agent-halted)
