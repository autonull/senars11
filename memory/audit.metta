;; audit.metta — Append-only audit trail
;;
;; Format:
;;   (audit-event
;;     :id        String
;;     :timestamp Number
;;     :type      Symbol  ; :skill-invoked | :skill-blocked | :llm-call | :memory-write | :harness-modified
;;     :cycle     Number
;;     :details   SExpr
;;   )
;;
;; Managed by Agent.js when auditLog capability is enabled.
;; This file is git-tracked in memory/ directory.

;; Audit events are appended at runtime. Initial file is empty.
