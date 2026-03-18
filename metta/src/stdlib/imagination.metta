;; imagination.metta - Ergonomic API for the Mind's Eye Canvas Extension using JS Reflection

;; Canvas Management
(= (canvas-create $w $h)
   (&canvas-create $w $h))

(= (canvas-get-context $canvas)
   (&js-call $canvas "getContext" "2d"))

(= (canvas-clear $canvas)
   (let $ctx (canvas-get-context $canvas)
      (&js-call $ctx "clearRect" 0 0 (&js-get $canvas "width") (&js-get $canvas "height"))))

;; Drawing Primitives
(= (draw-rect $ctx $x $y $w $h)
   (&js-call $ctx "fillRect" $x $y $w $h))

(= (stroke-rect $ctx $x $y $w $h)
   (&js-call $ctx "strokeRect" $x $y $w $h))

(= (draw-circle $ctx $x $y $r)
   (let* (
          ($pi (&js-get (&js-global "Math") "PI"))
          ($twoPi (* $pi 2.0)))
     (do
       (&js-call $ctx "beginPath")
       (&js-call $ctx "arc" $x $y $r 0 $twoPi)
       (&js-call $ctx "fill"))))

(= (stroke-circle $ctx $x $y $r)
   (let* (
          ($pi (&js-get (&js-global "Math") "PI"))
          ($twoPi (* $pi 2.0)))
     (do
       (&js-call $ctx "beginPath")
       (&js-call $ctx "arc" $x $y $r 0 $twoPi)
       (&js-call $ctx "stroke"))))

(= (set-color $ctx $color)
   (do
      (&js-set $ctx "fillStyle" $color)
      (&js-set $ctx "strokeStyle" $color)))

(= (set-font $ctx $font)
   (&js-set $ctx "font" $font))

(= (draw-text $ctx $text $x $y)
   (&js-call $ctx "fillText" $text $x $y))

(= (stroke-text $ctx $text $x $y)
   (&js-call $ctx "strokeText" $text $x $y))

;; Image Capture
(= (save-image $canvas $filename)
   (let $buffer (&canvas-to-buffer $canvas)
      (&fs-write-sync $filename $buffer)))

;; Video Recording (Key-framed)
(= (video-encoder-create $w $h)
   (&video-encoder-create $w $h))

(= (video-start $encoder $canvas $filename $delay $repeat)
   (&js-call $encoder "_startRecording" $filename $delay $repeat))

(= (video-add-frame $encoder $ctx)
   (&js-call $encoder "_addFrame" $ctx))

(= (video-finish $encoder)
   (&js-call $encoder "finish"))
