;; Count leaves in a tree.
(define (leaf-count tree)
  (cond ((null? tree) 0)
        ((pair? tree) (+ (leaf-count (car tree))
                         (leaf-count (cdr tree))))
        (else 1)))

(let* ((tree '(a (b c) d))
       (total (leaf-count tree)))
  (display "Leaves: ")
  (write total)
  (newline))
