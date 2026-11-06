;; A small exported function and a memory initializer.
(module $example
  (memory (export "memory") 1)
  (data (i32.const 0) "hello\0a")
  (func $add (export "add") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add))
