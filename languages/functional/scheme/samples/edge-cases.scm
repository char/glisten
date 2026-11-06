#| outer #| nested |# still outer |#
#; #; (ignored #\) "x") '(also ignored) (define live #t)
#; (one #;(two (three)) "close )" |symbol )| #\) #(4 5))
(define data '#(#u8(1 2 255) #true #false #\space #\x41 #\a))
(define numbers '(#e#x10 #i1/3 -2/7 1.25e-3 2+3i +inf.0 -nan.0))
(define |escaped symbol| "line\nquote: \" and hex: \x41;")
`(a ,(+ 1 2) ,@(list 'b 'c))
;; Radix and exactness may appear in either order; invalid atoms are not numbers.
'#(#b101/10 #o17 #x#iFF #d#e1.25 3s+5 1@-2 -2i 1-i +i
   #b102 #o8 #xg 1abc 1/ 1e+ .5.2 2i)
#;#`(discard #,item #,@items) (define retained #t)
(define wrapped "first\
  second")
#;#1=(cyclic . #1#) (define still-live #t)
