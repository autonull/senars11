;; Self-Optimizer Strategy
;; Adjusts hyperparameters based on performance metrics

(= (optimize-hyperparameters $controller)
    (let (
        ($metrics (&js-get $controller "metrics"))
        ($success (&js-unwrap (&js-get $metrics "modificationsSuccessful")))
        ($total (&js-unwrap (&js-get $metrics "modificationsApplied")))
        ($config (&js-get $controller "config"))
        ($dummy (&js-call (&js-global "console") "log" "METRICS IN METTA:" $success $total))
    )
    (check-total $total $success $config)
    )
)

(= (check-total $total $success $config)
    (if (> $total 5)
        (check-success-rate $success $total $config)
        "not-enough-data"
    )
)

(= (check-success-rate $success $total $config)
    (let (
        ($rate (/ $success $total))
    )
    (check-rate-low $rate $config)
    )
)

(= (check-rate-low $rate $config)
    (if (< $rate 0.2)
        (increase-exploration $config)
        (check-rate-high $rate $config)
    )
)

(= (check-rate-high $rate $config)
    (if (> $rate 0.8)
        (decrease-exploration $config)
        "rate-optimal"
    )
)

(= (increase-exploration $config)
    (let (
        ($current (&js-unwrap (&js-get $config "explorationRate")))
        ($new (+ $current 0.05))
        ($dummy (&js-set $config "explorationRate" $new))
    )
    (format-log "Increased exploration to " $new)
    )
)

(= (decrease-exploration $config)
    (let (
        ($current (&js-unwrap (&js-get $config "explorationRate")))
        ($new (- $current 0.05))
        ($dummy (&js-set $config "explorationRate" $new))
    )
    (format-log "Decreased exploration to " $new)
    )
)

(= (format-log $msg $val)
    (&js-call (&js-global "console") "log" $msg $val)
)
