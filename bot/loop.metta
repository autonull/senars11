;; loop.metta — SeNARS Bot 2.0 Agent Loop
;;
;; Cognitive cycle in MeTTa. JS wrapper manages budget loop,
;; event emission, error recovery, and LLM warmup.
;;
;; Two paths: bot-process (message → full cognitive pipeline)
;;            bot-idle (no message → sleep + recurse)

;; ── Combinator (not in stdlib) ────────────────────────────────────
;; when: delegate to grounded &which reduces the condition before dispatching
(= (when $cond $expr) (^ &when $cond $expr))

;; ── Initialization ────────────────────────────────────────────────
(= (bot-init)
   (seq
     (when (cap? persistentHistory) (nar-deserialize))
     (when (cap? goalPursuit)
       (let $goals (nar-goals :active)
            (when (not (== $goals ()))
              (attend (to-string $goals) 0.85))))))

;; ── Active cycle: full cognitive pipeline ────────────────────────
(= (bot-process)
   (let* (($msg   (check-embodiment-bus))
          ($ctx   (build-context $msg))
          ($resp  (llm-invoke $ctx))
          ($cmds  (parse-response $resp))
          ($_     (execute-commands $cmds))
          ($_     (when (cap? persistentHistory)
                    (append-history $msg $resp $cmds)))
          ($_     (inc-cycle-count!))
          ($_     (sleep-cycle)))
     ()))

;; ── Idle cycle: sleep only ───────────────────────────────────────
(= (bot-idle)
   (seq
     (inc-cycle-count!)
     (sleep-cycle)))

;; ── Halt ──────────────────────────────────────────────────────────
(= (bot-halt) agent-halted)
