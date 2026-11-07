import { func, wat, type Def } from "#/testing/wat/mod.ts";

/** Find the next unescaped cell divider, or the end of the row. */
export function tableCellEnd(charge: Def) {
  return func(
    "tableCellEnd",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $byte i32) (local $next i32)
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (call ${charge} (i64.const 1))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (br_if $done (i32.eq (local.get $byte) (i32.const 124)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (if (i32.and (i32.eq (local.get $byte) (i32.const 92)) (i32.lt_u (local.get $pos) (local.get $end))) (then
        (local.set $next (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.or (i32.eq (local.get $next) (i32.const 92)) (i32.eq (local.get $next) (i32.const 124))) (then
          (call ${charge} (i64.const 1))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))))
      (br $more)))
    (local.get $pos)`,
  );
}

/** Count header cells after the block prefix, or return zero for an invalid header. */
export function tableHeader(charge: Def) {
  return func(
    "tableHeader",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $byte i32) (local $next i32) (local $seen i32) (local $parts i32) (local $cells i32)
    (call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
    (if (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 124)) (then
      (local.set $seen (i32.const 1)) (local.set $parts (i32.const 1))))
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.or (i32.eq (local.get $byte) (i32.const 32)) (i32.eq (local.get $byte) (i32.const 9))) (then
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $more)))
      (local.set $parts (i32.add (local.get $parts) (i32.const 1)))
      (if (local.get $seen) (then
        (local.set $seen (i32.const 0)) (local.set $cells (i32.add (local.get $cells) (i32.const 1)))))
      (if (i32.eq (local.get $byte) (i32.const 124)) (then
        (local.set $seen (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $more)))
      (block $dataDone (loop $data
        (br_if $dataDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $dataDone (i32.or (i32.eq (local.get $byte) (i32.const 124))
          (i32.or (i32.eq (local.get $byte) (i32.const 32)) (i32.eq (local.get $byte) (i32.const 9)))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (if (i32.and (i32.eq (local.get $byte) (i32.const 92)) (i32.lt_u (local.get $pos) (local.get $end))) (then
          (local.set $next (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
          (if (i32.or (i32.eq (local.get $next) (i32.const 92)) (i32.eq (local.get $next) (i32.const 124))) (then
            (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))))
        (br $data)))
      (br $more)))
    (if (i32.le_u (local.get $parts) (i32.const 1)) (then (return (i32.const 0))))
    (local.get $cells)`,
  );
}

/** Count delimiter cells after the block prefix, or return zero for an invalid row. */
export function tableDelimiter(charge: Def) {
  return func(
    "tableDelimiter",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $byte i32) (local $seen i32) (local $cells i32)
    (call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
    (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 124)) (then
      (local.set $seen (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (block $leadingDone (loop $leading
        (br_if $leadingDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $leadingDone (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $leading)))))
    (block $done (loop $cell
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const 58)) (then
        (local.set $seen (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
      (if (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 45))
        (then (return (i32.const 0))))
      (local.set $cells (i32.add (local.get $cells) (i32.const 1)))
      (block $fillerDone (loop $filler
        (br_if $fillerDone (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $fillerDone (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 45)))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $filler)))
      (if (i32.lt_u (local.get $pos) (local.get $end)) (then
        (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 58)) (then
          (local.set $seen (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))))
      (block $spaceDone (loop $space
        (br_if $spaceDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $spaceDone (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $space)))
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (if (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 124))
        (then (return (i32.const 0))))
      (local.set $seen (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (block $betweenDone (loop $between
        (br_if $betweenDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $betweenDone (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $between)))
      (br $cell)))
    (if (i32.eqz (local.get $seen)) (then (return (i32.const 0))))
    (local.get $cells)`,
  );
}
