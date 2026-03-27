; Lists in MeTTa

; Lists are often represented as nested tuples
! (1 (2 (3 ())))

; Accessing elements (requires helper functions usually)

; Basic list construction
! (cons 1 (cons 2 ()))

; A 'car' function (head)
(= (car ($x $xs)) $x)
! (car (1 2))

; A 'cdr' function (tail)
(= (cdr ($x $xs)) $xs)
! (cdr (1 2))
