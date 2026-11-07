import { func, raw } from "#/testing/wat/mod.ts";

export function columns() {
  return func("columns", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $col i32) (result i32)
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 9))
        (then (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4))))
        (else (local.set $col (i32.add (local.get $col) (i32.const 1)))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $more)))
    (local.get $col)`),
  );
}

export function containerOpen() {
  return func("containerOpen", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $col i32) (param $interrupt i32) (result i64)
    (local $initial i32) (local $byte i32) (local $markerEnd i32) (local $markerCol i32)
    (local $oneEnd i32) (local $number i32) (local $digits i32) (local $blank i32)
    (local.set $initial (local.get $col))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 32))
        (then (local.set $col (i32.add (local.get $col) (i32.const 1))))
        (else (if (i32.eq (local.get $byte) (i32.const 9))
          (then (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4))))
          (else (br $indented)))))
      (if (i32.gt_u (i32.sub (local.get $col) (local.get $initial)) (i32.const 3)) (then (return (i64.const -1))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $indent)))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i64.const -1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.eq (local.get $byte) (i32.const 62)) (then
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (if (i32.lt_u (local.get $pos) (local.get $end)) (then
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.or (i32.eq (local.get $byte) (i32.const 32)) (i32.eq (local.get $byte) (i32.const 9)))
          (then (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))))
      (return (i64.or (i64.const 4294967296) (i64.extend_i32_u (local.get $pos))))))
    (if (i32.or (i32.eq (local.get $byte) (i32.const 45))
      (i32.or (i32.eq (local.get $byte) (i32.const 43)) (i32.eq (local.get $byte) (i32.const 42))))
      (then (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (local.set $col (i32.add (local.get $col) (i32.const 1))))
      (else
        (block $digitsDone (loop $moreDigits
          (br_if $digitsDone (i32.ge_u (local.get $pos) (local.get $end)))
          (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
          (br_if $digitsDone (i32.gt_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9)))
          (local.set $number (i32.add (i32.mul (local.get $number) (i32.const 10)) (i32.sub (local.get $byte) (i32.const 48))))
          (local.set $digits (i32.add (local.get $digits) (i32.const 1)))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (local.set $col (i32.add (local.get $col) (i32.const 1)))
          (br $moreDigits)))
        (if (i32.or (i32.eqz (local.get $digits)) (i32.or (i32.gt_u (local.get $digits) (i32.const 9))
          (i32.ge_u (local.get $pos) (local.get $end)))) (then (return (i64.const -1))))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.and (i32.ne (local.get $byte) (i32.const 46)) (i32.ne (local.get $byte) (i32.const 41)))
          (then (return (i64.const -1))))
        (if (i32.and (local.get $interrupt) (i32.ne (local.get $number) (i32.const 1))) (then (return (i64.const -1))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (local.set $col (i32.add (local.get $col) (i32.const 1)))))
    (local.set $markerEnd (local.get $pos))
    (local.set $markerCol (local.get $col))
    (local.set $oneEnd (local.get $pos))
    (block $whitespaceDone (loop $whitespace
      (br_if $whitespaceDone (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 32))
        (then (local.set $col (i32.add (local.get $col) (i32.const 1))))
        (else (if (i32.eq (local.get $byte) (i32.const 9))
          (then (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4))))
          (else (br $whitespaceDone)))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (if (i32.eq (local.get $oneEnd) (local.get $markerEnd)) (then
        (local.set $oneEnd (local.get $pos))))
      (br $whitespace)))
    (local.set $blank (i32.or (i32.ge_u (local.get $pos) (local.get $end))
      (i32.and (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 13))
        (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))
    (if (i32.and (local.get $interrupt) (local.get $blank)) (then (return (i64.const -1))))
    (if (i32.and (i32.eq (local.get $oneEnd) (local.get $markerEnd)) (i32.eqz (local.get $blank)))
      (then (return (i64.const -1))))
    (if (local.get $blank) (then
      (local.set $col (i32.add (local.get $markerCol) (i32.const 1))))
      (else (if (i32.gt_u (i32.sub (local.get $col) (local.get $markerCol)) (i32.const 4)) (then
        (local.set $pos (local.get $oneEnd)) (local.set $col (i32.add (local.get $markerCol) (i32.const 1)))))))
    (i64.or (i64.shl (i64.extend_i32_u (i32.shl (i32.sub (local.get $col) (local.get $initial)) (i32.const 1))) (i64.const 32))
      (i64.extend_i32_u (local.get $pos)))`),
  );
}

export function containerContinue() {
  return func("containerContinue", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $col i32) (param $frame i32) (param $virtual i32) (result i64)
    (local $initial i32) (local $byte i32)
    (local.set $initial (local.get $col))
    (if (i32.eq (local.get $frame) (i32.const 1)) (then
      (block $indented (loop $indent
        (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (i32.const 32))
          (then (local.set $col (i32.add (local.get $col) (i32.const 1))))
          (else (if (i32.eq (local.get $byte) (i32.const 9))
            (then (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4))))
            (else (br $indented)))))
        (if (i32.gt_u (i32.add (local.get $virtual) (i32.sub (local.get $col) (local.get $initial))) (i32.const 3)) (then (return (i64.const -1))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $indent)))
      (if (i32.or (i32.ge_u (local.get $pos) (local.get $end))
        (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 62))) (then (return (i64.const -1))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (local.set $col (i32.add (local.get $col) (i32.const 1)))
      (if (i32.lt_u (local.get $pos) (local.get $end)) (then
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (i32.const 32)) (then
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (local.set $col (i32.add (local.get $col) (i32.const 1))))
          (else (if (i32.eq (local.get $byte) (i32.const 9)) (then
            (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
            (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4)))))))))
      (return (i64.or (i64.shl (i64.extend_i32_u (local.get $col)) (i64.const 32)) (i64.extend_i32_u (local.get $pos))))))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ge_u (i32.add (local.get $virtual) (i32.sub (local.get $col) (local.get $initial))) (i32.shr_u (local.get $frame) (i32.const 1))))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 32))
        (then (local.set $col (i32.add (local.get $col) (i32.const 1))))
        (else (if (i32.eq (local.get $byte) (i32.const 9))
          (then (local.set $col (i32.and (i32.add (local.get $col) (i32.const 4)) (i32.const -4))))
          (else (br $indented)))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $indent)))
    (if (i32.lt_u (i32.add (local.get $virtual) (i32.sub (local.get $col) (local.get $initial))) (i32.shr_u (local.get $frame) (i32.const 1)))
      (then (return (i64.const -1))))
    (i64.or (i64.shl (i64.extend_i32_u (local.get $col)) (i64.const 32)) (i64.extend_i32_u (local.get $pos)))`),
  );
}
