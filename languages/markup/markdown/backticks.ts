import { fail, stopScan } from "#/compiler/runtime.ts";
import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { cursorIndex, cursorPosition, packCursor } from "./cursor.ts";
import { backtickRun, get } from "./layout.ts";
import { logicalRanges } from "./logical.ts";
import { paragraphScratch } from "./scratch.ts";

export function backtickIndex(
  ranges: ReturnType<typeof logicalRanges>,
  scratch: ReturnType<typeof paragraphScratch>,
  scan: Def,
  charge: Def,
) {
  const rangeIndex = cursorIndex(get("cursor"));
  const position = cursorPosition(get("cursor"));
  const nextCursor = packCursor(get("index"), get("pos"));
  const runPosition = cursorPosition(get("run"));
  const startPosition = cursorPosition(get("start"));
  const backtick = "`".charCodeAt(0);
  const scanWindowBytes = 256;
  const scanTick = stopScan("nearBacktick", [backtick], false);
  const ready = global("backticksReady", () => wat`(mut i32) (i32.const 0)`);
  const current = global("backticksCurrent", () => wat`(mut i32) (i32.const 0)`);
  const limit = global("backticksLimit", () => wat`(mut i32) (i32.const 0)`);
  const near = func(
    "nearBacktickCloser",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (param $length i32) (result i64)
      (local $index i32) (local $pos i32) (local $end i32) (local $count i32)
      (local.set $index ${rangeIndex})
      (if (i32.ge_u (local.get $index) (local.get $limit)) (then (return (i64.const 0))))
      (local.set $pos ${position})
      (local.set $end (i32.load (i32.add (global.get ${scratch.address}) (local.get $index))))
      (if (i32.gt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const ${scanWindowBytes}))
        (then (local.set $end (i32.add (local.get $pos) (i32.const ${scanWindowBytes})))))
      (call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))
      (block $done (loop $more
        (local.set $pos (call ${scanTick} (local.get $input) (local.get $pos) (local.get $end)))
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $count (i32.const 0))
        (block $runDone (loop $run
          (br_if $runDone (i32.ge_u (local.get $pos) (local.get $end)))
          (br_if $runDone
            (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const ${backtick})))
          (local.set $count (i32.add (local.get $count) (i32.const 1)))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (br $run)))
        (br_if $done (i32.eq (local.get $pos) (local.get $end)))
        (if (i32.eq (local.get $count) (local.get $length))
          (then
            (return
              (call ${ranges.normalize}
                ${nextCursor}
                (local.get $limit)))))
        (br $more)))
      (i64.const 0)`,
  );
  const previousRun = wat`(i32.add (global.get ${scratch.address}) (local.get $previous))`;
  const newRun = wat`(i32.add (global.get ${scratch.address}) (local.get $entry))`;
  const linkPrevious = backtickRun.set(previousRun, "closer", get("cursor"));
  const setPosition = backtickRun.set(newRun, "position", runPosition);
  const clearCloser = backtickRun.set(newRun, "closer", wat`(i64.const 0)`);
  const prepare = func(
    "indexBackticks",
    () => wat`
      (param $input i32) (param $start i64) (param $limit i32) (param $table i32)
      (param $capacity i32)
      (local $cursor i64) (local $run i64) (local $count i32) (local $length i32) (local $max i32)
      (local $records i32) (local $entry i32) (local $previous i32) (local $slot i32)
      (local $need i64) (local $bytes i64)
      (local.set $cursor (local.get $start))
      (block $counted (loop $countRuns
        (local.set $cursor (call ${scan} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $counted
          (i32.eq
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const -1)))
        (if
          (i32.ne
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const ${backtick}))
          (then
            (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
            (br $countRuns)))
        (local.set $length (i32.const 0))
        (block $endRun (loop $run
          (br_if $endRun
            (i32.ne
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const ${backtick})))
          (local.set $length (i32.add (local.get $length) (i32.const 1)))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (br $run)))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (if (i32.gt_u (local.get $length) (local.get $max))
          (then (local.set $max (local.get $length))))
        (br $countRuns)))
      (local.set $bytes
        (i64.mul (i64.add (i64.extend_i32_u (local.get $max)) (i64.const 1)) (i64.const 4)))
      (local.set $need
        (i64.add
          (local.get $bytes)
          (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${backtickRun.size}))))
      (if (i64.gt_u (local.get $need) (i64.extend_i32_u (local.get $capacity)))
        (then (call ${fail})))
      (call ${charge} (local.get $bytes))
      (memory.fill
        (i32.add (global.get ${scratch.address}) (local.get $table))
        (i32.const 0)
        (i32.wrap_i64 (local.get $bytes)))
      (local.set $records (i32.add (local.get $table) (i32.wrap_i64 (local.get $bytes))))
      (local.set $entry (local.get $records))
      (local.set $cursor (local.get $start))
      (block $indexed (loop $indexRuns
        (local.set $cursor (call ${scan} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $indexed
          (i32.eq
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const -1)))
        (if
          (i32.ne
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const ${backtick}))
          (then
            (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
            (br $indexRuns)))
        (local.set $run (local.get $cursor))
        (local.set $length (i32.const 0))
        (block $endRun (loop $run
          (br_if $endRun
            (i32.ne
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const ${backtick})))
          (local.set $length (i32.add (local.get $length) (i32.const 1)))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (br $run)))
        (call ${charge} (i64.const ${backtickRun.size}))
        (local.set $slot
          (i32.add
            (global.get ${scratch.address})
            (i32.add (local.get $table) (i32.shl (local.get $length) (i32.const 2)))))
        (local.set $previous (i32.load (local.get $slot)))
        (if (local.get $previous) (then ${linkPrevious}))
        (i32.store (local.get $slot) (local.get $entry))
        ${setPosition}
        ${clearCloser}
        (local.set $entry (i32.add (local.get $entry) (i32.const ${backtickRun.size})))
        (br $indexRuns)))
      (global.set ${current} (local.get $records))
      (global.set ${limit} (local.get $entry))
      (global.set ${ready} (i32.const 1))`,
  );
  const currentRun = wat`(i32.add (global.get ${scratch.address}) (global.get ${current}))`;
  const closer = func(
    "backtickCloser",
    () => wat`
      (param $start i64) (result i64)
      (block $found (loop $more
        (call ${charge} (i64.const 1))
        (br_if $found (i32.ge_u (global.get ${current}) (global.get ${limit})))
        (br_if $found
          (i32.ge_u ${backtickRun.get(currentRun, "position")} ${startPosition}))
        (global.set ${current} (i32.add (global.get ${current}) (i32.const ${backtickRun.size})))
        (br $more)))
      (if (i32.ge_u (global.get ${current}) (global.get ${limit})) (then (call ${fail})))
      (if (i32.ne ${backtickRun.get(currentRun, "position")} ${startPosition})
        (then (call ${fail})))
      ${backtickRun.get(currentRun, "closer")}`,
  );
  return { near, prepare, closer, ready };
}
