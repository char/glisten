import { func, raw } from "#/testing/wat/mod.ts";

export function setextUnderline() {
  return func("setextUnderline", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $virtual i32) (result i32)
    (local $start i32) (local $mark i32) (local $byte i32)
    (local.set $start (local.get $pos))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $indent)))
    (if (i32.or (i32.gt_u (i32.add (local.get $virtual) (i32.sub (local.get $pos) (local.get $start))) (i32.const 3))
      (i32.ge_u (local.get $pos) (local.get $end))) (then (return (i32.const 0))))
    (local.set $mark (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.and (i32.ne (local.get $mark) (i32.const 45)) (i32.ne (local.get $mark) (i32.const 61))) (then (return (i32.const 0))))
    (block $marked (loop $marks
      (br_if $marked (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $marked (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (local.get $mark)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $marks)))
    (block $done (loop $trailing
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 13)) (then
        (return (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))
      (if (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9))) (then (return (i32.const 0))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $trailing)))
    (i32.const 1)`),
  );
}

export function atxHeading() {
  return func("atxHeading", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (param $virtual i32) (result i32)
    (local $start i32) (local $count i32) (local $byte i32)
    (local.set $start (local.get $pos))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $indent)))
    (if (i32.gt_u (i32.add (local.get $virtual) (i32.sub (local.get $pos) (local.get $start))) (i32.const 3)) (then (return (i32.const 0))))
    (block $marked (loop $marks
      (br_if $marked (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $marked (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 35)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (local.set $count (i32.add (local.get $count) (i32.const 1)))
      (br $marks)))
    (if (i32.or (i32.eqz (local.get $count)) (i32.gt_u (local.get $count) (i32.const 6))) (then (return (i32.const 0))))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (i32.or (i32.eq (local.get $byte) (i32.const 32))
      (i32.or (i32.eq (local.get $byte) (i32.const 9))
        (i32.and (i32.eq (local.get $byte) (i32.const 13)) (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))`),
  );
}
