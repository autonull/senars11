;; history.metta — Append-only conversation/action history
;;
;; Format:
;;   (history-entry
;;     :cycle    Number
;;     :timestamp Number
;;     :input    String
;;     :output   String
;;     :results  SExpr
;;   )
;;
;; Managed by Agent.js when persistentHistory capability is enabled.
;; This file is git-tracked in memory/ directory.

;; History is appended at runtime. Initial file is empty.
