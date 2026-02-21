
; Q-Learning Strategy for Discrete GridWorld
; Uses simple tabular Q-learning stored as atoms

; Initialize epsilon
(= (epsilon) 0.1)
(= (alpha) 0.1)
(= (gamma) 0.9)

; Q-table: (= (q (state) action) value)
; Default Q-value is 0.0
(= (get-q $s $a)
   (let $q (match &self (= (q $s $a) $v) $v)
     (if (== $q ()) 0.0 (car-atom $q))))

; Action Selection (Epsilon-Greedy)
(= (agent-act $obs)
   (let $r (rand-float 0 1)
     (if (< $r (epsilon))
         (rand-int 0 3) ; Random action 0-3
         (best-action $obs))))

; Find best action
(= (best-action $s)
   (argmax-action $s (0 1 2 3)))

(= (argmax-action $s $actions)
   (car-pair (my-foldl (lambda ($acc $a) (check-max $s $acc $a)) (0 -9999) $actions)))

(= (check-max $s $acc $a)
   (let $best-a (car-pair $acc)
     (let $best-v (cdr-pair $acc)
       (let $v (get-q $s $a)
         (if (> $v $best-v) ($a $v) ($best-a $best-v))))))

; Custom foldl for expression lists
(= (my-foldl $f $acc $list)
   (if (== $list ())
       $acc
       (if (== (get-metatype $list) Expression)
           (let $h (car-atom $list)
             (let $t (cdr-atom $list)
               (let $new-acc ($f $acc $h)
                 (my-foldl $f $new-acc $t))))
           ($f $acc $list))))

; Helpers
(= (car-pair ($a $b)) $a)
(= (cdr-pair ($a $b)) $b)

; Update Rule
(= (agent-learn $s $a $r $ns $d)
   (let $max-q-next (if $d 0.0 (max-q $ns))
     (let $current-q (get-q $s $a)
       (let $target (+ $r (* (gamma) $max-q-next))
         (let $new-q (+ $current-q (* (alpha) (- $target $current-q)))
           (update-q $s $a $new-q))))))

(= (max-q $s)
   (let ($a $v) (argmax-action $s (0 1 2 3)) $v))

(= (update-q $s $a $v)
   (add-atom &self (= (q $s $a) $v)))

; Stdlib helpers if not present
; We assume rand-float is available or provided by the environment bindings
; If not, we might need a JS binding for it.
; For now, let's assume &random is not standard but custom.
; The MeTTaInterpreter usually provides some math functions.

(= (rand-float $min $max)
   (+ $min (* (random) (- $max $min))))

(= (rand-int $min $max)
   (floor (+ $min (* (random) (+ 1 (- $max $min))))))
