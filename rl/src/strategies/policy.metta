; Neural Policy defined in MeTTa using Tensor Primitives

; Initialize parameters lazily (they are stateful in the primitive)
; Input: 4 (e.g. CartPole), Hidden: 16, Output: 2 (Left/Right)

(= (get-w1) (&param "w1" (4 16)))
(= (get-b1) (&param "b1" (16)))
(= (get-w2) (&param "w2" (16 2)))
(= (get-b2) (&param "b2" (2)))

; Forward pass: input -> hidden -> output
(= (forward $x)
   (let* (
      ($h (&relu (&add (&matmul $x (get-w1)) (get-b1))))
      ($out (&add (&matmul $h (get-w2)) (get-b2)))
   ) $out)
)

; Select action: argmax of output
(= (get-action $obs)
   (let* (
      ($x (&tensor $obs))
      ($logits (forward $x))
   ) (&argmax $logits))
)

; Training step
; Performs one step of SGD on the MSE loss between prediction and target
(= (update-policy $obs $target)
   (let* (
      ($x (&tensor $obs))
      ($y (&tensor $target))
      ($pred (forward $x))
      ($loss (&mse $pred $y))
      ($_ (&backward $loss))
      ($_1 (&sgd_step (get-w1) 0.01))
      ($_2 (&sgd_step (get-b1) 0.01))
      ($_3 (&sgd_step (get-w2) 0.01))
      ($_4 (&sgd_step (get-b2) 0.01))
      ($_5 (&zero_grad (get-w1)))
      ($_6 (&zero_grad (get-b1)))
      ($_7 (&zero_grad (get-w2)))
      ($_8 (&zero_grad (get-b2)))
   ) $loss)
)
