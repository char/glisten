import { func, wat, type Def } from "#/testing/wat/mod.ts";
import { cursorIndex, cursorPosition, packCursor } from "./cursor.ts";
import { get, queued } from "./layout.ts";
import { isScannableInlineStyle } from "./inline_scan.ts";
import { logicalRanges } from "./logical.ts";

export function logicalUtf8(ranges: ReturnType<typeof logicalRanges>, address: Def, charge: Def) {
  const asciiLimit = 0x80;
  const continuationMask = 0xc0;
  const continuationPrefix = 0x80;
  const continuationPayloadMask = 0x3f;
  const replacementCharacter = 0xfffd;
  const maximumCodepoint = 0x10ffff;
  const surrogateStart = 0xd800;
  const surrogateRangeWidth = 0x7ff;
  const byteInRange = (first: number, last: number) =>
    wat`(i32.le_u (i32.sub (local.get $byte) (i32.const ${first})) (i32.const ${last - first}))`;
  const twoByteLead = byteInRange(0xc2, 0xdf);
  const threeByteLead = byteInRange(0xe0, 0xef);
  const fourByteLead = byteInRange(0xf0, 0xf4);
  const continuationByte = wat`(i32.and (local.get $byte) (i32.const ${continuationMask}))`;
  const rangeIndex = cursorIndex(get("cursor"));
  const firstRangeIndex = cursorIndex(get("start"));
  const position = cursorPosition(get("cursor"));
  const startPosition = cursorPosition(get("start"));
  const previousCursor = packCursor(get("index"), wat`(i32.sub (local.get $pos) (i32.const 1))`);
  const isInlineText = isScannableInlineStyle(queued.get(get("entry"), "style"));
  const previousEnd = queued.get(
    wat`(i32.sub (local.get $entry) (i32.const ${queued.size}))`,
    "end",
  );
  const currentEnd = queued.get(wat`(i32.add (global.get ${address}) (local.get $index))`, "end");
  const previous = func(
    "logicalPrevious",
    () => wat`
      (param $cursor i64) (param $start i64) (param $limit i32) (result i64)
      (local $index i32) (local $first i32) (local $pos i32) (local $begin i32) (local $entry i32)
      (local.set $index ${rangeIndex})
      (local.set $first ${firstRangeIndex})
      (local.set $pos ${position})
      (if (i32.ge_u (local.get $index) (local.get $limit))
        (then
          (if (i32.eqz (local.get $index)) (then (return (i64.const -1))))
          (local.set $index (i32.sub (local.get $index) (i32.const ${queued.size})))))
      (block $done (loop $more
        (call ${charge} (i64.const 1))
        (br_if $done (i32.lt_u (local.get $index) (local.get $first)))
        (local.set $entry (i32.add (global.get ${address}) (local.get $index)))
        (local.set $begin
          (if (result i32) (i32.eq (local.get $index) (local.get $first))
            (then ${startPosition})
            (else ${previousEnd})))
        (if
          (i32.and
            ${isInlineText}
            (i32.gt_u (local.get $pos) (local.get $begin)))
          (then
            (return
              ${previousCursor})))
        (br_if $done (i32.eq (local.get $index) (local.get $first)))
        (local.set $index (i32.sub (local.get $index) (i32.const ${queued.size})))
        (local.set $pos ${currentEnd})
        (br $more)))
      (i64.const -1)`,
  );
  const decode = func(
    "logicalCodepoint",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
      (local $byte i32) (local $value i32) (local $remaining i32) (local $minimum i32)
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i32.const -1))))
      (if (i32.lt_u (local.get $byte) (i32.const ${asciiLimit})) (then (return (local.get $byte))))
      (if ${twoByteLead}
        (then
          (local.set $value (i32.and (local.get $byte) (i32.const 31)))
          (local.set $remaining (i32.const 1))
          (local.set $minimum (i32.const 128)))
        (else
          (if ${threeByteLead}
            (then
              (local.set $value (i32.and (local.get $byte) (i32.const 15)))
              (local.set $remaining (i32.const 2))
              (local.set $minimum (i32.const 2048)))
            (else
              (if ${fourByteLead}
                (then
                  (local.set $value (i32.and (local.get $byte) (i32.const 7)))
                  (local.set $remaining (i32.const 3))
                  (local.set $minimum (i32.const 65536)))
                (else (return (i32.const ${replacementCharacter}))))))))
      (block $done (loop $more
        (br_if $done (i32.eqz (local.get $remaining)))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.ne ${continuationByte} (i32.const ${continuationPrefix}))
          (then (return (i32.const ${replacementCharacter}))))
        (local.set $value
          (i32.or
            (i32.shl (local.get $value) (i32.const 6))
            (i32.and (local.get $byte) (i32.const ${continuationPayloadMask}))))
        (local.set $remaining (i32.sub (local.get $remaining) (i32.const 1)))
        (br $more)))
      (if
        (i32.or
          (i32.lt_u (local.get $value) (local.get $minimum))
          (i32.or
            (i32.gt_u (local.get $value) (i32.const ${maximumCodepoint}))
            (i32.le_u (i32.sub (local.get $value) (i32.const ${surrogateStart})) (i32.const ${surrogateRangeWidth}))))
        (then (return (i32.const ${replacementCharacter}))))
      (local.get $value)`,
  );
  const before = func(
    "logicalCodepointBefore",
    () => wat`
      (param $input i32) (param $cursor i64) (param $start i64) (param $limit i32) (result i32)
      (local $at i64) (local $byte i32) (local $count i32) (local $length i32)
      (local.set $at (call ${previous} (local.get $cursor) (local.get $start) (local.get $limit)))
      (if (i64.eq (local.get $at) (i64.const -1)) (then (return (i32.const -1))))
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $at) (local.get $limit)))
      (if (i32.lt_u (local.get $byte) (i32.const ${asciiLimit})) (then (return (local.get $byte))))
      (local.set $count (i32.const 1))
      (block $lead (loop $more
        (br_if $lead (i32.ne ${continuationByte} (i32.const ${continuationPrefix})))
        (if (i32.ge_u (local.get $count) (i32.const 4)) (then (return (i32.const ${replacementCharacter}))))
        (local.set $at (call ${previous} (local.get $at) (local.get $start) (local.get $limit)))
        (if (i64.eq (local.get $at) (i64.const -1)) (then (return (i32.const ${replacementCharacter}))))
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $at) (local.get $limit)))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (br $more)))
      (local.set $length
        (if (result i32) ${twoByteLead}
          (then (i32.const 2))
          (else
            (if (result i32) ${threeByteLead}
              (then (i32.const 3))
              (else
                (if (result i32)
                  ${fourByteLead}
                  (then (i32.const 4))
                  (else (i32.const 0))))))))
      (if (i32.ne (local.get $length) (local.get $count)) (then (return (i32.const ${replacementCharacter}))))
      (call ${decode} (local.get $input) (local.get $at) (local.get $limit))`,
  );
  return { previous, decode, before };
}
