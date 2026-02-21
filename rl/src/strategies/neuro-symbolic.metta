
; Neuro-Symbolic Agent
; Uses Model-Based reasoning: Learning the transition model and planning
; Rules: (==> (state action) next-state)

; Discrete actions 0-3
(= (actions) (0 1 2 3))

; Model Learning
(= (agent-learn $s $a $r $ns $d)
   (add-atom &self (= (transition $s $a) $ns))
   (add-atom &self (= (reward $s $a) $r)))

; Planning (1-step lookahead for now, can be deepened)
(= (agent-act $s)
   (argmax-action $s (actions)))

(= (argmax-action $s $actions)
   (car-pair (find-best-action $s $actions (-1 -99999))))

(= (find-best-action $s $actions $best)
   (if (== $actions ())
       $best
       (if (== (get-metatype $actions) Expression)
           (let $h (car-atom $actions)
             (let $t (cdr-atom $actions)
               (let $curr (pair $h (eval-action $s $h))
                 (find-best-action $s $t (max-pair $curr $best)))))
           (let $curr (pair $actions (eval-action $s $actions))
             (max-pair $curr $best)))))

(= (eval-action $s $a)
   (let $ns (get-next-state $s $a)
     (let $r (get-reward $s $a)
       (+ $r (value $ns)))))

(= (get-next-state $s $a)
   (let $res (match &self (= (transition $s $a) $x) $x)
     (if (== $res ()) $s (car-atom $res)))) ; Default stay if unknown

(= (get-reward $s $a)
    (let $res (match &self (= (reward $s $a) $x) $x)
      (if (== $res ()) 0.0 (car-atom $res))))

; Value estimation (heuristic or recursive)
(= (value $s) 0.0) ; Placeholder

; Helpers
(= (pair $a $b) ($a $b))
(= (car-pair ($a $b)) $a)
(= (cdr-pair ($a $b)) $b)

(= (max-pair $p1 $p2)
   (if (> (cdr-pair $p1) (cdr-pair $p2)) $p1 $p2))
