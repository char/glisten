import { stopScan } from "#/compiler/runtime.ts";
import { func, wat, type Def, type Fragment, type Part } from "#/testing/wat/mod.ts";
import { cursorIndex, cursorPosition, packCursor } from "./cursor.ts";
import { get } from "./layout.ts";
import type { logicalRanges } from "./logical.ts";
import { kind, styled } from "./styles.ts";

/** Whether a queued style represents text available to inline scanners. */
export function isScannableInlineStyle(style: Part) {
  return wat`(i32.and
    (i32.ne ${style} ${styled("punctuation.special")})
    (i32.ne ${style} (i32.const ${kind.indent})))`;
}

export function inlineScan(
  ranges: ReturnType<typeof logicalRanges>,
  address: Def,
  charge?: Def,
  stops = "\n\r!&*<>@HW[\\]_`hw~",
  name = "inlineScan",
  /** Whether a stop at `$pos` counts; rejected stops resume the scan in place. */
  accept?: Fragment,
) {
  const rangeIndex = cursorIndex(get("cursor"));
  const position = cursorPosition(get("cursor"));
  const nextCursor = packCursor(get("index"), get("pos"));
  const scan = stopScan(
    `${name}Stop`,
    [...stops].map((char) => char.charCodeAt(0)),
    false,
  );
  const scanWindowBytes = 256;
  const chargeScannedBytes = charge
    ? wat`(call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))`
    : wat``;
  const filterRejectedStops = accept
    ? wat`(block $accepted (loop $filter
        (br_if $accepted (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $accepted ${accept})
        (local.set $pos (call ${scan} (local.get $input) (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))
        (br $filter)))`
    : wat``;
  return func(
    name,
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $index i32) (local $pos i32) (local $end i32)
      (block $done (loop $scanRanges
        (local.set $cursor (call ${ranges.normalize} (local.get $cursor) (local.get $limit)))
        (local.set $index ${rangeIndex})
        (br_if $done (i32.ge_u (local.get $index) (local.get $limit)))
        (local.set $pos ${position})
        (local.set $end (i32.load (i32.add (global.get ${address}) (local.get $index))))
        (if (i32.gt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const ${scanWindowBytes}))
          (then (local.set $end (i32.add (local.get $pos) (i32.const ${scanWindowBytes})))))
        ${chargeScannedBytes}
        (local.set $pos (call ${scan} (local.get $input) (local.get $pos) (local.get $end)))
        ${filterRejectedStops}
        (local.set $cursor ${nextCursor})
        (br_if $done (i32.lt_u (local.get $pos) (local.get $end)))
        (br $scanRanges)))
      (local.get $cursor)`,
  );
}
