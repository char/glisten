(; outer (; inner ;; not a line comment ;) still outer ;)
(module $!#$%&'*+-./:<=>?@\^_`|~
  (@custom "quoted: \" \\ \n \t \ff \u{1f600}")
  (func
    f64.const -0x1.fp-3
    f32.const +nan:0x40_0000
    f64.const -inf
    i64.const 1_234_567
    ;; Parentheses in strings and comments are inert.
    (drop (ref.null func))))
