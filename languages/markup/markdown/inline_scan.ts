import { stopScan } from "#/compiler/runtime.ts";
import { func, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

export function inlineScan(
  ranges: ReturnType<typeof logicalRanges>,
  address: Def,
  charge?: Def,
  stops = "\n\r!&*<>@HW[\\]_`hw~",
  name = "inlineScan",
  /** Whether a stop at `$pos` counts; rejected stops resume the scan in place. */
  accept?: Fragment,
) {
  const scan = stopScan(
    `${name}Stop`,
    [...stops].map((char) => char.charCodeAt(0)),
    false,
  );
  const work = charge
    ? wat`(call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))`
    : wat``;
  return func(
    name,
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $index i32) (local $pos i32) (local $end i32)
    (block $done (loop $more
      (local.set $cursor (call ${ranges.normalize} (local.get $cursor) (local.get $limit)))
      (local.set $index (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))))
      (br_if $done (i32.ge_u (local.get $index) (local.get $limit)))
      (local.set $pos (i32.wrap_i64 (local.get $cursor)))
      (local.set $end (i32.load (i32.add (global.get ${address}) (local.get $index))))
      (if (i32.gt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const 256))
        (then (local.set $end (i32.add (local.get $pos) (i32.const 256)))))
      ${work}
      (local.set $pos (call ${scan} (local.get $input) (local.get $pos) (local.get $end)))
      ${
        accept
          ? wat`(block $accepted (loop $filter
        (br_if $accepted (i32.ge_u (local.get $pos) (local.get $end)))
        (br_if $accepted ${accept})
        (local.set $pos (call ${scan} (local.get $input) (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))
        (br $filter)))`
          : wat``
      }
      (local.set $cursor (i64.or (i64.shl (i64.extend_i32_u (local.get $index)) (i64.const 32))
        (i64.extend_i32_u (local.get $pos))))
      (br_if $done (i32.lt_u (local.get $pos) (local.get $end)))
      (br $more)))
    (local.get $cursor)`,
  );
}
