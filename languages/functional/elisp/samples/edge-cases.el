;;;###autoload
(cl-defun escaped-name (&key x)
  "Escapes: \C-x, \M-\C-a, \^A, \N{LATIN CAPITAL LETTER A}, \u0041."
  (list 'symbol\ with\ spaces :keyword nil t x))
(defun marker-tests ()
  ;; The following marker is shown; byte-counted payload skipping is not modeled.
  #@4abcd (list #2r1 #36rZ #b102 123abc))
[?\[ ?\] ?\s ?\^A "text \"quote\"" ; vector comment
 (when t (message "done"))]
(defun escaped\ name () :key\ name)
#@00
ignored (until end of file)
