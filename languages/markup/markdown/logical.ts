import { func, wat, type Def } from "#/testing/wat/mod.ts";
import { cursorIndex, cursorPosition, packCursor } from "./cursor.ts";
import { isScannableInlineStyle } from "./inline_scan.ts";
import { get, queued } from "./layout.ts";

export function logicalRanges(address: Def, charge?: Def) {
  const work = charge ? wat`(call ${charge} (i64.const 1))` : wat``;
  const cursor = wat`(local.get $cursor)`;
  const cursorQueueOffset = cursorIndex(cursor);
  const position = cursorPosition(cursor);
  const cursorAtEnd = wat`(i32.ge_u ${cursorQueueOffset} (local.get $queueLimit))`;
  const normalizedCursor = packCursor(wat`(local.get $queueOffset)`, wat`(local.get $position)`);
  const scannable = isScannableInlineStyle(queued.get(get("entry"), "style"));
  const normalize = func(
    "logicalNormalize",
    () => wat`
      (param $cursor i64) (param $queueLimit i32) (result i64)
      (local $queueOffset i32) (local $position i32) (local $entry i32) (local $end i32)
      (local.set $queueOffset ${cursorQueueOffset})
      (local.set $position ${position})
      (block $done (loop $more ${work}
        (br_if $done (i32.ge_u (local.get $queueOffset) (local.get $queueLimit)))
        (local.set $entry (i32.add (global.get ${address}) (local.get $queueOffset)))
        (local.set $end ${queued.get(get("entry"), "end")})
        (if (i32.ge_u (local.get $position) (local.get $end))
          (then
            (local.set $queueOffset (i32.add (local.get $queueOffset) (i32.const ${queued.size})))
            (br $more)))
        (br_if $done ${scannable})
        (local.set $position (local.get $end))
        (local.set $queueOffset (i32.add (local.get $queueOffset) (i32.const ${queued.size})))
        (br $more)))
      ${normalizedCursor}`,
  );
  const peek = func(
    "logicalPeek",
    () => wat`
      (param $input i32) (param $cursor i64) (param $queueLimit i32) (result i32)
      ${work}
      (if ${cursorAtEnd}
        (then (return (i32.const -1))))
      (i32.load8_u (i32.add (local.get $input) ${position}))`,
  );
  const advance = func(
    "logicalAdvance",
    () => wat`
      (param $cursor i64) (param $queueLimit i32) (result i64)
      ${work}
      (if ${cursorAtEnd}
        (then (return (local.get $cursor))))
      (call ${normalize} (i64.add (local.get $cursor) (i64.const 1)) (local.get $queueLimit))`,
  );
  return { normalize, peek, advance };
}
