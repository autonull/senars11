;; Q-Learning Strategy for GridWorld
;; Simple pattern matching for agent-act

;; Base case - return action 0
(= (agent-act $x) 0)

;; Learning rule (no-op for now)  
(= (agent-learn $s $a $r $ns $d) success)
