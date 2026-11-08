import { splat } from "./idioms.ts";

/** Lower a footer comparison to bounded SIMD equality and a scalar tail. */
export function heredocFooterWat(vector = true): string {
  const newline = "\n".charCodeAt(0);
  const vectorBytes = 16;
  const inputByte = `(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $index))))`;
  const delimiterByte = `(i32.load8_u (i32.add (local.get $delimiter) (local.get $index)))`;
  const vectorLocal = vector ? "(local $chunk v128)" : "";
  const vectorScan = vector
    ? `(block $scalarTail (loop $compareVectors
      (br_if $scalarTail (i32.lt_u (i32.sub (local.get $delimiterLength) (local.get $index)) (i32.const ${vectorBytes})))
      (local.set $chunk
        (v128.load (i32.add (local.get $input) (i32.add (local.get $start) (local.get $index)))))
      (if
        (i8x16.bitmask
          (v128.or
            (i8x16.eq (local.get $chunk) ${splat(newline)})
            (i8x16.ne
              (local.get $chunk)
              (v128.load (i32.add (local.get $delimiter) (local.get $index))))))
        (then (return (i32.const 0))))
      (local.set $index (i32.add (local.get $index) (i32.const ${vectorBytes})))
      (br $compareVectors)))`
    : "";
  return `(func $heredocFooter (param $input i32) (param $start i32) (param $end i32)
    (param $delimiter i32) (param $delimiterLength i32) (result i32)
    (local $index i32)
    ${vectorLocal}
    (if
      (i32.or
        (i32.lt_s (local.get $delimiterLength) (i32.const 0))
        (i32.gt_u (local.get $delimiterLength) (i32.sub (local.get $end) (local.get $start))))
      (then (return (i32.const 0))))
    (if (i32.ne (i32.add (local.get $start) (local.get $delimiterLength)) (local.get $end))
      (then
        (if
          (i32.ne
            (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $delimiterLength))))
            (i32.const ${newline}))
          (then (return (i32.const 0))))))
    ${vectorScan}
    (block $matched (loop $compareBytes
      (br_if $matched (i32.ge_u (local.get $index) (local.get $delimiterLength)))
      (if
        (i32.or
          (i32.eq
            ${inputByte}
            (i32.const ${newline}))
          (i32.ne
            ${inputByte}
            ${delimiterByte}))
        (then (return (i32.const 0))))
      (local.set $index (i32.add (local.get $index) (i32.const 1)))
      (br $compareBytes)))
    (i32.const 1))`;
}
