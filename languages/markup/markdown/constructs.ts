import { func, raw } from "#/testing/wat/mod.ts";

const charCode = (character: string) => character.charCodeAt(0);
const maxConstructIndent = 3;
const minimumFenceLength = 3;
const minimumThematicMarks = 3;
const tabWidth = 4;
const indentedCodeColumns = 4;

export function fenceRun() {
  return func("fenceRun", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (result i64)
      (local $start i32) (local $byte i32)
      (block $indented (loop $indent
        (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $indented
          (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode(" ")})))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $indent)))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i64.const -1))))
      (local.set $start (local.get $pos))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if
        (i32.and
          (i32.ne (local.get $byte) (i32.const ${charCode("`")}))
          (i32.ne (local.get $byte) (i32.const ${charCode("~")})))
        (then (return (i64.const -1))))
      (block $endRun (loop $run
        (br_if $endRun (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $endRun
          (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (local.get $byte)))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $run)))
      (if (i32.lt_u (i32.sub (local.get $pos) (local.get $start)) (i32.const ${minimumFenceLength}))
        (then (return (i64.const -1))))
      (i64.or
        (i64.shl (i64.extend_i32_u (local.get $start)) (i64.const 32))
        (i64.extend_i32_u (local.get $pos)))`),
  );
}

export function lineMark() {
  return func("lineMark", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (param $virtual i32) (result i32)
      (local $start i32) (local $limit i32) (local $byte i32)
      ;; The line's first non-space byte while it is indented under four columns, and zero when it
      ;; can only be indented code, is blank, or over: no construct below can start with a zero
      ;; mark. A tab is reported as itself, since it may still reach four columns.
      (local.set $start (local.get $pos))
      (local.set $limit (i32.sub (i32.const ${maxConstructIndent}) (local.get $virtual)))
      (if (i32.lt_s (local.get $limit) (i32.const 0)) (then (return (i32.const 0))))
      (block $done (loop $more
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $done
          (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode(" ")})))
        (br_if $done (i32.ge_u (i32.sub (local.get $pos) (local.get $start)) (local.get $limit)))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $more)))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")})) (then (return (i32.const 0))))
      (local.get $byte)`),
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
        (if (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
          (then (return (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))
        (if
          (i32.and
            (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
            (i32.ne (local.get $byte) (i32.const ${charCode("\t")})))
          (then (return (i32.const 0))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $more)))
      (i32.const 1)`),
  );
}

export function thematicBreak() {
  return func("thematicBreak", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (param $paragraph i32)
      (param $virtual i32) (result i32)
      (local $start i32) (local $mark i32) (local $byte i32) (local $count i32)
      (local.set $start (local.get $pos))
      (block $indented (loop $indent
        (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $indented
          (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode(" ")})))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $indent)))
      (if
        (i32.or
          (i32.gt_u
            (i32.add (local.get $virtual) (i32.sub (local.get $pos) (local.get $start)))
            (i32.const ${maxConstructIndent}))
          (i32.ge_u (local.get $pos) (local.get $end)))
        (then (return (i32.const 0))))
      (local.set $mark (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if
        (i32.and
          (i32.ne (local.get $mark) (i32.const ${charCode("*")}))
          (i32.and
            (i32.ne (local.get $mark) (i32.const ${charCode("_")}))
            (i32.ne (local.get $mark) (i32.const ${charCode("-")}))))
        (then (return (i32.const 0))))
      (block $done (loop $more
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (local.get $mark))
          (then (local.set $count (i32.add (local.get $count) (i32.const 1))))
          (else
            (if (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
              (then
                (if (i32.ne (i32.add (local.get $pos) (i32.const 1)) (local.get $end))
                  (then (return (i32.const 0)))))
              (else
                (if
                  (i32.and
                    (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
                    (i32.ne (local.get $byte) (i32.const ${charCode("\t")})))
                  (then (return (i32.const 0))))))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $more)))
      (i32.ge_u (local.get $count) (i32.const ${minimumThematicMarks}))`),
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
        (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
          (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
          (else
            (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
              (then
                (local.set $column
                  (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
              (else (br $done)))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $more)))
      (i32.and
        (i32.ge_u (local.get $column) (i32.const ${indentedCodeColumns}))
        (i32.lt_u (local.get $pos) (local.get $end)))`),
  );
}
