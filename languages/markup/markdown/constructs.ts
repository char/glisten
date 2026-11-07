import { func, raw } from "#/testing/wat/mod.ts";

export function fenceRun() {
  return func("fenceRun", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (result i64)
    (local $start i32) (local $byte i32)
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $indent)))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i64.const -1))))
    (local.set $start (local.get $pos))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.and (i32.ne (local.get $byte) (i32.const 96)) (i32.ne (local.get $byte) (i32.const 126)))
      (then (return (i64.const -1))))
    (block $endRun (loop $run
      (br_if $endRun (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $endRun (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (local.get $byte)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $run)))
    (if (i32.lt_u (i32.sub (local.get $pos) (local.get $start)) (i32.const 3)) (then (return (i64.const -1))))
    (i64.or (i64.shl (i64.extend_i32_u (local.get $start)) (i64.const 32)) (i64.extend_i32_u (local.get $pos)))`),
  );
}

export function blankLine() {
  return func("blankLine", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $byte i32)
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 13))
        (then (return (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))
      (if (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9)))
        (then (return (i32.const 0))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $more)))
    (i32.const 1)`),
  );
}

export function thematicBreak() {
  return func("thematicBreak", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $paragraph i32) (param $virtual i32) (result i32)
    (local $start i32) (local $mark i32) (local $byte i32) (local $count i32)
    (local.set $start (local.get $pos))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $indent)))
    (if (i32.or (i32.gt_u (i32.add (local.get $virtual) (i32.sub (local.get $pos) (local.get $start))) (i32.const 3))
      (i32.ge_u (local.get $pos) (local.get $end))) (then (return (i32.const 0))))
    (local.set $mark (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.and (i32.ne (local.get $mark) (i32.const 42))
      (i32.and (i32.ne (local.get $mark) (i32.const 95)) (i32.ne (local.get $mark) (i32.const 45))))
      (then (return (i32.const 0))))
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (local.get $mark)) (then (local.set $count (i32.add (local.get $count) (i32.const 1))))
        (else (if (i32.eq (local.get $byte) (i32.const 13)) (then
          (if (i32.ne (i32.add (local.get $pos) (i32.const 1)) (local.get $end)) (then (return (i32.const 0)))))
          (else (if (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9)))
            (then (return (i32.const 0))))))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $more)))
    (i32.ge_u (local.get $count) (i32.const 3))`),
  );
}

export function indentedCode() {
  return func("indentedCode", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $initial i32) (result i32)
    (local $column i32) (local $byte i32)
    (local.set $column (local.get $initial))
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 32))
        (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
        (else (if (i32.eq (local.get $byte) (i32.const 9))
          (then (local.set $column (i32.and (i32.add (local.get $column) (i32.const 4)) (i32.const -4))))
          (else (br $done)))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $more)))
    (i32.and (i32.ge_u (local.get $column) (i32.const 4)) (i32.lt_u (local.get $pos) (local.get $end)))`),
  );
}
