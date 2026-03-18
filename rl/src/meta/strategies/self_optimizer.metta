;; Self-Optimizer Strategy
;; Adjusts hyperparameters based on performance metrics

(= (optimize-hyperparameters $controller)
    (process-metrics
        (&js-get $controller "metrics")
        (&js-get $controller "config")
    )
)

(= (process-metrics $metrics $config)
    (process-values
        (&js-unwrap (&js-get $metrics "modificationsSuccessful"))
        (&js-unwrap (&js-get $metrics "modificationsApplied"))
        $config
    )
)

(= (process-values $success $total $config)
    (log-and-check
        (&js-call (&js-global "console") "log" "METRICS IN METTA:" $success $total)
        $success
        $total
        $config
    )
)

(= (log-and-check $dummy $success $total $config)
    (check-total $total $success $config)
)

(= (check-total $total $success $config)
    (if (> $total 5)
        (check-success-rate $success $total $config)
        "not-enough-data"
    )
)

(= (check-success-rate $success $total $config)
    (check-rate-low (/ $success $total) $config)
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
    (do-increase
        (&js-unwrap (&js-get $config "explorationRate"))
        $config
    )
)

(= (do-increase $current $config)
    (apply-increase
        (+ $current 0.05)
        $config
    )
)

(= (apply-increase $new $config)
    (log-increase
        (&js-set $config "explorationRate" $new)
        $new
    )
)

(= (log-increase $dummy $new)
    (format-log "Increased exploration to " $new)
)

(= (decrease-exploration $config)
    (do-decrease
        (&js-unwrap (&js-get $config "explorationRate"))
        $config
    )
)

(= (do-decrease $current $config)
    (apply-decrease
        (- $current 0.05)
        $config
    )
)

(= (apply-decrease $new $config)
    (log-decrease
        (&js-set $config "explorationRate" $new)
        $new
    )
)

(= (log-decrease $dummy $new)
    (format-log "Decreased exploration to " $new)
)

(= (format-log $msg $val)
    (&js-call (&js-global "console") "log" $msg $val)
)
