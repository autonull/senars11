; Defining Functions in MeTTa

; Define a simple function 'double'
(= (double $x) (+ $x $x))

; Call the function
! (double 5)

; Recursive function: Factorial
(= (fact $n)
   (if (== $n 0)
       1
       (* $n (fact (- $n 1)))))

; Calculate factorial of 5
! (fact 5)

; Pattern matching function
(= (greet $name) (format-args "Hello, {}!" ($name)))
! (greet "MeTTa")
