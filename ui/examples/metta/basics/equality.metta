; Equality and Logic

! (== 1 1)
! (== 1 2)

; If expression
! (if (== 1 1) "Yes" "No")
! (if (== 1 2) "Yes" "No")

; Logical AND (simulated with if)
! (if (== 1 1) (if (== 2 2) True False) False)

; Boolean types are often just symbols or specific atoms in MeTTa depending on implementation
