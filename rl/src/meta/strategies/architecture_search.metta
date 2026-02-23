;; Architecture Search Strategy using Reflection
;; Defines (generate-modifications $controller)

(= (generate-modifications $controller)
    (check-flag
        (&js-unwrap (&js-get (&js-get $controller "config") "forceAdd"))
        $controller
    )
)

(= (check-flag $flag $controller)
    (if $flag
        (create-add-operator $controller "reasoning" "causal_reasoner")
        (create-modify-operator $controller "policy" "learningRate" 0.0005)
    )
)

;; Helper to create an 'add' operator
(= (create-add-operator $controller $stage $component-id)
    (chain-add-operator
        (&js-new (&js-global "Object"))
        (&js-new (&js-global "Object"))
        $stage
        $component-id
    )
)

(= (chain-add-operator $op $params $stage $component-id)
    (&js-set
        (&js-set
            (&js-set $op "priority" 1.5)
            "type"
            "add"
        )
        "parameters"
        (&js-set
            (&js-set
                (&js-set $params "componentId" $component-id)
                "stage"
                $stage
            )
            "type"
            "add"
        )
    )
)

;; Helper to create a 'modify' operator
(= (create-modify-operator $controller $component-id $param $value)
    (chain-modify-operator
        (&js-new (&js-global "Object"))
        (&js-new (&js-global "Object"))
        (&js-new (&js-global "Object"))
        $component-id
        $param
        $value
    )
)

(= (chain-modify-operator $op $params $config $component-id $param $value)
    (&js-set
        (&js-set
            (&js-set $op "priority" 1.2)
            "type"
            "modify"
        )
        "parameters"
        (&js-set
            (&js-set $params "componentId" $component-id)
            "config"
            (&js-set $config $param $value)
        )
    )
)
