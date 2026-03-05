;; imagination.metta - Ergonomic API for the Mind's Eye Canvas Extension

;; Canvas Management
(= (canvas-create $w $h)
   (&canvas-create $w $h))

(= (canvas-clear)
   (&canvas-clear))

;; Drawing Primitives
(= (draw-rect $x $y $w $h)
   (&canvas-draw-rect $x $y $w $h fill))

(= (stroke-rect $x $y $w $h)
   (&canvas-draw-rect $x $y $w $h stroke))

(= (draw-circle $x $y $r)
   (&canvas-draw-circle $x $y $r fill))

(= (stroke-circle $x $y $r)
   (&canvas-draw-circle $x $y $r stroke))

(= (set-color $color)
   (&canvas-set-color $color))

(= (set-font $font)
   (&canvas-set-font $font))

(= (draw-text $text $x $y)
   (&canvas-draw-text $text $x $y fill))

(= (stroke-text $text $x $y)
   (&canvas-draw-text $text $x $y stroke))

;; Image Capture
(= (save-image $filename)
   (&canvas-save-image $filename))

;; Video Recording (Key-framed)
(= (video-start $filename $delay $repeat)
   (&video-start $filename $delay $repeat))

(= (video-add-frame)
   (&video-add-frame))

(= (video-finish)
   (&video-finish))
