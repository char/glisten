#| A block comment #| with a nested comment |# continues. |#
#+(and sbcl (not windows))
(defun current-process () sb-thread:*current-thread*)
#-(or sbcl ccl) (defun current-process () nil)
(defparameter *data* #(1 2 #xFF #b101 #o77 #36rZ 3/4 1.25d-3))
(defparameter *bits* #*101010)
(list #\a #\Space #\U+41 #:temporary :keyword pkg:symbol pkg::internal)
(list #'identity #.(+ 1 2) #p"/tmp/a\\b" #2A((1 2) (3 4)))
