(define-library (example geometry)
  (export square area)
  (import (scheme base))
  (begin
    (define (square x) (* x x))
    (define (area radius) (* 3.14159 (square radius)))
    (define-syntax twice
      (syntax-rules () ((_ x) (+ x x))))))
