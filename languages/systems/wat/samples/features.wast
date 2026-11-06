(module
  (type $pair (struct (field (mut i32)) (field externref)))
  (func $example (param $p (ref null $pair)) (result v128)
    (drop (ref.is_null (local.get $p)))
    (v128.const i32x4 1 2 3 4))
  (func (param i32) (result i32)
    (i32.load offset=8 align=4 (local.get 0))))
(assert_return (invoke "add" (i32.const 1) (i32.const 2)) (i32.const 3))
(assert_return (invoke "float-result") (f32.const nan:canonical))
