import { func, wat } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

export function taskCheck(ranges: ReturnType<typeof logicalRanges>) {
  const openBracket = "[".charCodeAt(0);
  const closeBracket = "]".charCodeAt(0);
  const space = " ".charCodeAt(0);
  const tab = "\t".charCodeAt(0);
  const lineFeed = "\n".charCodeAt(0);
  const carriageReturn = "\r".charCodeAt(0);
  const uppercaseCheck = "X".charCodeAt(0);
  const lowercaseCheck = "x".charCodeAt(0);
  return func(
    "taskCheck",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $byte i32) (local $end i64)
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${openBracket}))
        (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.eqz
          (i32.or
            (i32.or
              (i32.eq (local.get $byte) (i32.const ${space}))
              (i32.eq (local.get $byte) (i32.const ${tab})))
            (i32.or
              (i32.or
                (i32.eq (local.get $byte) (i32.const ${lineFeed}))
                (i32.eq (local.get $byte) (i32.const ${carriageReturn})))
              (i32.or
                (i32.eq (local.get $byte) (i32.const ${uppercaseCheck}))
                (i32.eq (local.get $byte) (i32.const ${lowercaseCheck}))))))
        (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if
        (i32.and
          (i32.eq (local.get $byte) (i32.const ${carriageReturn}))
          (i32.eq
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const ${lineFeed})))
        (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${closeBracket}))
        (then (return (i64.const -1))))
      (local.set $end (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $cursor (local.get $end))
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.eqz
          (i32.or
            (i32.or
              (i32.eq (local.get $byte) (i32.const ${space}))
              (i32.eq (local.get $byte) (i32.const ${tab})))
            (i32.or
              (i32.eq (local.get $byte) (i32.const ${lineFeed}))
              (i32.eq (local.get $byte) (i32.const ${carriageReturn})))))
        (then (return (i64.const -1))))
      (block $checked (loop $spaces
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $checked
          (i32.and
            (i32.ne (local.get $byte) (i32.const ${space}))
            (i32.ne (local.get $byte) (i32.const ${tab}))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $spaces)))
      (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i64.const -1))))
      (if
        (i32.or (i32.eq (local.get $byte) (i32.const ${lineFeed})) (i32.eq (local.get $byte) (i32.const ${carriageReturn})))
        (then
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (if
            (i32.and
              (i32.eq (local.get $byte) (i32.const ${carriageReturn}))
              (i32.eq
                (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
                (i32.const ${lineFeed})))
            (then
              (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
          (if
            (i32.eq
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const -1))
            (then (return (i64.const -1))))))
      (local.get $end)`,
  );
}
