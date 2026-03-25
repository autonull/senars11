; MeTTa Standard Library - Core Module
; Basic control flow, binding, and lambda functions

; ===== Conditional Branching =====

; if: conditional evaluation
; (if True $then $else) → $then
; (if False $then $else) → $else
; Mapping to grounded &if for robust evaluation
(= (if $cond $then $else) (^ &if $cond $then $else))

; ===== Variable Binding =====

; let: bind a value to a variable in a body expression
; (let $x $value $body) → evaluate $body with $x bound to $value
; Implementation: Convert to lambda application
(= (let $x $v $b) (^ &let $x $v $b))

; Sequential let bindings (let*)
; (let* (($x $v1) ($y $v2)) $body) → nested lets
(= (let* $bindings $body) (^ &let* $bindings $body))

; ===== Lambda (Anonymous Functions) =====

; Lambda application: ((λ $x $body) $value)
; Use &subst grounded op to perform substitution  
; IMPORTANT: Pattern uses $param/$val to avoid variable name collision with lambda body
(= ((λ $param $body) $val) (^ &subst $param $val $body))
(= ((lambda $param $body) $val) (^ &subst $param $val $body))

; Multiple argument lambda (curried)
; (λ ($x $y) $body) → (λ $x (λ $y $body))
; Rules moved to ReductionEngine.js to avoid variable unification issues

; Ensure &subst triggers reduction on its result
(= (^ &subst $p $v $b) (let $p $v $b))

; ===== Sequencing =====

; Sequential evaluation - evaluate expressions in order, return last
; (seq $a $b) → evaluate $a, then return $b
(= (seq $a $b) (let $_ $a $b))

; Multiple sequence
(= (seq* $a) $a)
(= (seq* $a $b $rest) (seq $a (seq* $b $rest)))

; ===== Basic Logic =====

; Boolean constants (these are atoms, defined here for reference)
; True - boolean true
; False - boolean false

; not: logical negation
(= (not True) False)
(= (not False) True)

; and: logical conjunction
(= (and True False) False)
(= (and False True) False)

; or: logical disjunction
(= (or True $_) True)
(= (or False $x) $x)

; ===== Utility Functions =====

; identity: return the value unchanged
(= (id $x) $x)

; const: return first argument, ignore second
(= (const $x $_) $x)

; compose: function composition
; (compose $f $g $x) → ($f ($g $x))
(= (compose $f $g $x) ($f ($g $x)))

; ===== Grounded Operations Mapping =====
; Map standard operators to grounded functions
(= (+ $a $b) (^ &+ $a $b))
(= (+ $a $b $c) (^ &+ $a $b $c))
(= (- $a $b) (^ &- $a $b))
(= (- $a) (^ &- $a))
(= (* $a $b) (^ &* $a $b))
(= (* $a $b $c) (^ &* $a $b $c))
(= (/ $a $b) (^ &/ $a $b))
(= (< $a $b) (^ &< $a $b))
(= (> $a $b) (^ &> $a $b))
(= (== $a $b) (^ &== $a $b))
(= (% $a $b) (^ &% $a $b))

; Explicit grounded aliases (with & prefix)
(= (&+ $a $b) (^ &+ $a $b))
(= (&- $a $b) (^ &- $a $b))
(= (&* $a $b) (^ &* $a $b))
(= (&/ $a $b) (^ &/ $a $b))
(= (and $a $b) (^ &and $a $b))
(= (or $a $b) (^ &or $a $b))
(= (not $a) (^ &not $a))
(= (get-atoms $s) (^ &get-atoms $s))
(= (add-atom $x) (^ &add-atom $x))
(= (rm-atom $x) (^ &rm-atom $x))

; Expression Operations
(= (cons-atom $h $t) (^ &cons-atom $h $t))
(= (decons-atom $e) (^ &decons-atom $e))
(= (car-atom $e) (^ &car-atom $e))
(= (cdr-atom $e) (^ &cdr-atom $e))
(= (size-atom $e) (^ &size-atom $e))
(= (index-atom $e $i) (^ &index-atom $e $i))

; Type Operations
(= (get-metatype $a) (^ &get-metatype $a))
(= (get-type $a) (^ &get-type $a))
(= (is-function $t) (^ &is-function $t))
