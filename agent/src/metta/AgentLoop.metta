;; AgentLoop.metta — SeNARS Agent Control Plane
;;
;; "MeTTa is the operating system. LLMs are peripherals."
;;
;; This file defines the authoritative loop specification. The JS driver
;; in MeTTaLoopBuilder.js mirrors it exactly. As the MeTTa interpreter
;; gains robust async grounded-op support, execution migrates here.
;;
;; ── Grounded ops (registered by MeTTaOpRegistrar + NarsOps) ────────
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
;;     llm-invoke ctx        → String   (async, via LLMInvoker)
;;     parse-response resp   → GroundedCmds
;;     execute-commands cmds → GroundedResults  (async)
;;
;;   NAL INFERENCE (via NarsOps)
;;     |- premises           → NAL conclusions
;;     nar-beliefs term      → beliefs matching term
;;     nar-add sentence      → add belief/goal to NARS
;;     nar-truth term        → current truth value
;;
;;   HISTORY / AUDIT
;;     append-history m r rs → ok
;;     emit-cycle-audit m r rs → ok
;;
;;   TIMING
;;     sleep-cycle           → ok  (async)
;;
;;   INTROSPECTION
;;     manifest              → JSON manifest
;;     skill-inventory       → list of registered skills
;;     subsystems            → subsystem descriptions
;;     agent-state key       → value of loop state key

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
