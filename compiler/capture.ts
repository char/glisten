import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import { captureLimit } from "#/grammar/capture.ts";
import type { ShapeLowering } from "./effect.ts";

export const lowerCaptureReset: ShapeLowering<"captureReset"> = () => `(call $captureReset)`;
export const lowerCaptureAppend: ShapeLowering<"captureAppend"> = ({ skip }) =>
  `(call $captureAppend (local.get $input) (local.get $pos) (local.get $next) (i32.const ${skip}))`;
export const lowerCaptureMark: ShapeLowering<"captureMark"> = ({ flags }) =>
  `(call $captureMark (i32.const ${flags}))`;

const captureDataOffset = 8;
const captureFlagsOffset = captureDataOffset + captureLimit;
export const captureLayout = {
  length: 0,
  overflow: 4,
  data: captureDataOffset,
  flags: captureFlagsOffset,
  bytes: captureFlagsOffset + 4,
} as const;
export const captureBytes = captureLayout.bytes;
export const captureAreaBytes = (enabled: boolean): number => (enabled ? captureBytes : 0);

/** Lower reset to stores, append to a bounded memory.copy, and match to a bounded byte loop. */
export function captureWat(offset: number): string {
  const lengthOffset = `offset=${offset + captureLayout.length}`;
  const overflowOffset = `offset=${offset + captureLayout.overflow}`;
  const dataOffset = offset + captureLayout.data;
  const dataLoadOffset = `offset=${dataOffset}`;
  const flagsOffset = `offset=${offset + captureLayout.flags}`;
  return `(func $captureReset
      (i64.store ${lengthOffset} (global.get $base) (i64.const 0))
      (i32.store ${flagsOffset} (global.get $base) (i32.const 0)))
    (func $captureMark (param $flags i32)
      (i32.store ${flagsOffset}
        (global.get $base)
        (i32.or (i32.load ${flagsOffset} (global.get $base)) (local.get $flags))))
    (func $captureAppend (param $input i32) (param $start i32) (param $end i32) (param $skip i32)
      (local $length i32) (local $remaining i32) (local $previousLength i32)
      (if (i32.load ${overflowOffset} (global.get $base)) (then (return)))
      (if (i32.gt_u (local.get $skip) (i32.sub (local.get $end) (local.get $start)))
        (then (local.set $skip (i32.sub (local.get $end) (local.get $start)))))
      (local.set $start (i32.add (local.get $start) (local.get $skip)))
      (local.set $length (i32.sub (local.get $end) (local.get $start)))
      (local.set $previousLength (i32.load ${lengthOffset} (global.get $base)))
      (local.set $remaining (i32.sub (i32.const ${captureLimit}) (local.get $previousLength)))
      (if (i32.gt_u (local.get $length) (local.get $remaining))
        (then
          (i32.store ${overflowOffset} (global.get $base) (i32.const 1))
          (local.set $length (local.get $remaining))))
      (memory.copy
        (i32.add (i32.add (global.get $base) (i32.const ${dataOffset})) (local.get $previousLength))
        (i32.add (local.get $input) (local.get $start))
        (local.get $length))
      (i32.store ${lengthOffset} (global.get $base) (i32.add (local.get $previousLength) (local.get $length))))
    (func $captureMatch (param $input i32) (param $pos i32) (param $end i32) (result i32)
      (local $length i32) (local $index i32)
      (if (i32.load ${overflowOffset} (global.get $base)) (then (return (i32.const -1))))
      (local.set $length (i32.load ${lengthOffset} (global.get $base)))
      (if (i32.gt_u (local.get $length) (i32.sub (local.get $end) (local.get $pos)))
        (then (return (i32.const -1))))
      (block $matched (loop $compareBytes
        (br_if $matched (i32.ge_u (local.get $index) (local.get $length)))
        (if
          (i32.ne
            (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $index))))
            (i32.load8_u ${dataLoadOffset} (i32.add (global.get $base) (local.get $index))))
          (then (return (i32.const -1))))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $compareBytes)))
      (i32.add (local.get $pos) (local.get $length)))`;
}

export function lowerCaptured(
  m: Extract<Matcher, { kind: "captured" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $matchCursor (call $captureMatch (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}
