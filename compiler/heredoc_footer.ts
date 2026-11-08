import { splat } from "./vector.ts";

/** Lower a footer comparison to bounded SIMD equality and a scalar tail. */
export function heredocFooterWat(vector = true): string {
  return `(func $heredocFooter (param $input i32) (param $pos i32) (param $end i32)
    (param $delimiter i32) (param $len i32) (result i32)
    (local $i i32) ${vector ? "(local $chunk v128)" : ""}
    (if (i32.or (i32.lt_s (local.get $len) (i32.const 0))
      (i32.gt_u (local.get $len) (i32.sub (local.get $end) (local.get $pos)))) (then (return (i32.const 0))))
    (if (i32.ne (i32.add (local.get $pos) (local.get $len)) (local.get $end))
      (then (if (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $len)))) (i32.const 10))
        (then (return (i32.const 0))))))
    ${
      vector
        ? `(block $tail (loop $vector
      (br_if $tail (i32.lt_u (i32.sub (local.get $len) (local.get $i)) (i32.const 16)))
      (local.set $chunk (v128.load (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $i)))))
      (if (i8x16.bitmask (v128.or (i8x16.eq (local.get $chunk) ${splat(10)})
        (i8x16.ne (local.get $chunk) (v128.load (i32.add (local.get $delimiter) (local.get $i))))))
        (then (return (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 16))) (br $vector)))`
        : ""
    }
    (block $done (loop $scalar
      (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
      (if (i32.or (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $i)))) (i32.const 10))
        (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $i))))
          (i32.load8_u (i32.add (local.get $delimiter) (local.get $i))))) (then (return (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $scalar)))
    (i32.const 1))`;
}
