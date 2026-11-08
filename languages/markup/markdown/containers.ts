import { func, raw } from "#/testing/wat/mod.ts";

const charCode = (character: string) => character.charCodeAt(0);
const tabWidth = 4;
const maxConstructIndent = 3;
const maxListPadding = 4;
const maxOrderedMarkerDigits = 9;
const decimalDigitSpan = charCode("9") - charCode("0");
const blockquoteTag = 1n << 32n;

export function columns() {
  return func("columns", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (param $column i32) (result i32)
      (block $done (loop $more
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode("\t")}))
          (then (local.set $column (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
          (else (local.set $column (i32.add (local.get $column) (i32.const 1)))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $more)))
      (local.get $column)`),
  );
}

export function containerOpen() {
  return func("containerOpen", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (param $column i32) (param $interrupt i32)
      (result i64)
      (local $initialColumn i32) (local $byte i32) (local $markerEnd i32) (local $markerCol i32)
      (local $oneEnd i32) (local $number i32) (local $digits i32) (local $blank i32)
      (local.set $initialColumn (local.get $column))
      (block $indented (loop $indent
        (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
          (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
          (else
            (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
              (then
                (local.set $column (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
              (else (br $indented)))))
        (if (i32.gt_u (i32.sub (local.get $column) (local.get $initialColumn)) (i32.const ${maxConstructIndent}))
          (then (return (i64.const -1))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $indent)))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i64.const -1))))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $byte) (i32.const ${charCode(">")}))
        (then
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (if (i32.lt_u (local.get $pos) (local.get $end))
            (then
              (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
              (if
                (i32.or
                  (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
                  (i32.eq (local.get $byte) (i32.const ${charCode("\t")})))
                (then (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))))
          (return (i64.or (i64.const ${blockquoteTag}) (i64.extend_i32_u (local.get $pos))))))
      (if
        (i32.or
          (i32.eq (local.get $byte) (i32.const ${charCode("-")}))
          (i32.or
            (i32.eq (local.get $byte) (i32.const ${charCode("+")}))
            (i32.eq (local.get $byte) (i32.const ${charCode("*")}))))
        (then
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (local.set $column (i32.add (local.get $column) (i32.const 1))))
        (else
          (block $digitsDone (loop $moreDigits
            (br_if $digitsDone (i32.ge_u (local.get $pos) (local.get $end)))
            (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
            (br_if $digitsDone (i32.gt_u (i32.sub (local.get $byte) (i32.const ${charCode("0")})) (i32.const ${decimalDigitSpan})))
            (local.set $number
              (i32.add
                (i32.mul (local.get $number) (i32.const 10))
                (i32.sub (local.get $byte) (i32.const ${charCode("0")}))))
            (local.set $digits (i32.add (local.get $digits) (i32.const 1)))
            (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
            (local.set $column (i32.add (local.get $column) (i32.const 1)))
            (br $moreDigits)))
          (if
            (i32.or
              (i32.eqz (local.get $digits))
              (i32.or
                (i32.gt_u (local.get $digits) (i32.const ${maxOrderedMarkerDigits}))
                (i32.ge_u (local.get $pos) (local.get $end))))
            (then (return (i64.const -1))))
          (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
          (if
            (i32.and
              (i32.ne (local.get $byte) (i32.const ${charCode(".")}))
              (i32.ne (local.get $byte) (i32.const ${charCode(")")})))
            (then (return (i64.const -1))))
          (if (i32.and (local.get $interrupt) (i32.ne (local.get $number) (i32.const 1)))
            (then (return (i64.const -1))))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (local.set $column (i32.add (local.get $column) (i32.const 1)))))
      (local.set $markerEnd (local.get $pos))
      (local.set $markerCol (local.get $column))
      (local.set $oneEnd (local.get $pos))
      (block $whitespaceDone (loop $whitespace
        (br_if $whitespaceDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
          (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
          (else
            (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
              (then
                (local.set $column (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
              (else (br $whitespaceDone)))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (if (i32.eq (local.get $oneEnd) (local.get $markerEnd))
          (then (local.set $oneEnd (local.get $pos))))
        (br $whitespace)))
      (local.set $blank
        (i32.or
          (i32.ge_u (local.get $pos) (local.get $end))
          (i32.and
            (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode("\r")}))
            (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))))
      (if (i32.and (local.get $interrupt) (local.get $blank)) (then (return (i64.const -1))))
      (if (i32.and (i32.eq (local.get $oneEnd) (local.get $markerEnd)) (i32.eqz (local.get $blank)))
        (then (return (i64.const -1))))
      (if (local.get $blank)
        (then (local.set $column (i32.add (local.get $markerCol) (i32.const 1))))
        (else
          (if (i32.gt_u (i32.sub (local.get $column) (local.get $markerCol)) (i32.const ${maxListPadding}))
            (then
              (local.set $pos (local.get $oneEnd))
              (local.set $column (i32.add (local.get $markerCol) (i32.const 1)))))))
      (i64.or
        (i64.shl
          (i64.extend_i32_u (i32.shl (i32.sub (local.get $column) (local.get $initialColumn)) (i32.const 1)))
          (i64.const 32))
        (i64.extend_i32_u (local.get $pos)))`),
  );
}

export function containerContinue() {
  return func("containerContinue", () =>
    raw(`
      (param $input i32) (param $pos i32) (param $end i32) (param $column i32) (param $frame i32)
      (param $virtual i32) (result i64)
      (local $initialColumn i32) (local $byte i32)
      (local.set $initialColumn (local.get $column))
      (if (i32.eq (local.get $frame) (i32.const 1))
        (then
          (block $indented (loop $indent
            (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
            (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
            (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
              (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
              (else
                (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
                  (then
                    (local.set $column
                      (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
                  (else (br $indented)))))
            (if
              (i32.gt_u
                (i32.add (local.get $virtual) (i32.sub (local.get $column) (local.get $initialColumn)))
                (i32.const 3))
              (then (return (i64.const -1))))
            (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
            (br $indent)))
          (if
            (i32.or
              (i32.ge_u (local.get $pos) (local.get $end))
              (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${charCode(">")})))
            (then (return (i64.const -1))))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (local.set $column (i32.add (local.get $column) (i32.const 1)))
          (if (i32.lt_u (local.get $pos) (local.get $end))
            (then
              (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
              (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
                (then
                  (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
                  (local.set $column (i32.add (local.get $column) (i32.const 1))))
                (else
                  (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
                    (then
                      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
                      (local.set $column
                        (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth})))))))))
          (return
            (i64.or
              (i64.shl (i64.extend_i32_u (local.get $column)) (i64.const 32))
              (i64.extend_i32_u (local.get $pos))))))
      (block $indented (loop $indent
        (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $indented
          (i32.ge_u
            (i32.add (local.get $virtual) (i32.sub (local.get $column) (local.get $initialColumn)))
            (i32.shr_u (local.get $frame) (i32.const 1))))
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode(" ")}))
          (then (local.set $column (i32.add (local.get $column) (i32.const 1))))
          (else
            (if (i32.eq (local.get $byte) (i32.const ${charCode("\t")}))
              (then
                (local.set $column (i32.and (i32.add (local.get $column) (i32.const ${tabWidth})) (i32.const ${-tabWidth}))))
              (else (br $indented)))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $indent)))
      (if
        (i32.lt_u
          (i32.add (local.get $virtual) (i32.sub (local.get $column) (local.get $initialColumn)))
          (i32.shr_u (local.get $frame) (i32.const 1)))
        (then (return (i64.const -1))))
      (i64.or
        (i64.shl (i64.extend_i32_u (local.get $column)) (i64.const 32))
        (i64.extend_i32_u (local.get $pos)))`),
  );
}
