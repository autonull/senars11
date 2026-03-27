; Variables in MeTTa
; Variables start with $

! (let $x 10 $x)

; Variables in expressions
! (let $x 5 (+ $x 2))

; Binding multiple variables (using pattern matching/let)
; Note: MeTTa let works on single expressions or blocks

; Unification with variables
! (match &self ($x is 10) $x)
