import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import { captureLimit } from "#/grammar/capture.ts";
import type { ShapeLowering } from "./effect.ts";

export const lowerCaptureReset: ShapeLowering<"captureReset"> = () => `(call $captureReset)`;
export const lowerCaptureAppend: ShapeLowering<"captureAppend"> = (op) =>
  `(call $captureAppend (local.get $input) (local.get $pos) (local.get $next) (i32.const ${op.skip}))`;
export const lowerCaptureMark: ShapeLowering<"captureMark"> = (op) =>
  `(call $captureMark (i32.const ${op.flags}))`;

/** Length, overflow, 256 bytes, then flags. */
export const captureBytes = 12 + captureLimit;
export const captureAreaBytes = (enabled: boolean): number => (enabled ? captureBytes : 0);

/** Lower reset to stores, append to a bounded memory.copy, and match to a bounded byte loop. */
export function captureWat(offset: number): string {
  return `(func $captureReset
    (i64.store offset=${offset} (global.get $base) (i64.const 0))
    (i32.store offset=${offset + 8 + captureLimit} (global.get $base) (i32.const 0)))
  (func $captureMark (param $flags i32)
    (i32.store offset=${offset + 8 + captureLimit} (global.get $base)
      (i32.or (i32.load offset=${offset + 8 + captureLimit} (global.get $base)) (local.get $flags))))
  (func $captureAppend (param $input i32) (param $start i32) (param $end i32) (param $skip i32)
    (local $length i32) (local $remaining i32) (local $old i32)
    (if (i32.load offset=${offset + 4} (global.get $base)) (then (return)))
    (if (i32.gt_u (local.get $skip) (i32.sub (local.get $end) (local.get $start)))
      (then (local.set $skip (i32.sub (local.get $end) (local.get $start)))))
    (local.set $start (i32.add (local.get $start) (local.get $skip)))
    (local.set $length (i32.sub (local.get $end) (local.get $start)))
    (local.set $old (i32.load offset=${offset} (global.get $base)))
    (local.set $remaining (i32.sub (i32.const ${captureLimit}) (local.get $old)))
    (if (i32.gt_u (local.get $length) (local.get $remaining)) (then
      (i32.store offset=${offset + 4} (global.get $base) (i32.const 1))
      (local.set $length (local.get $remaining))))
    (memory.copy (i32.add (i32.add (global.get $base) (i32.const ${offset + 8})) (local.get $old))
      (i32.add (local.get $input) (local.get $start)) (local.get $length))
    (i32.store offset=${offset} (global.get $base) (i32.add (local.get $old) (local.get $length))))
  (func $captureMatch (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $length i32) (local $i i32)
    (if (i32.load offset=${offset + 4} (global.get $base)) (then (return (i32.const -1))))
    (local.set $length (i32.load offset=${offset} (global.get $base)))
    (if (i32.gt_u (local.get $length) (i32.sub (local.get $end) (local.get $pos))) (then (return (i32.const -1))))
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $i) (local.get $length)))
      (if (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $i))))
        (i32.load8_u offset=${offset + 8} (i32.add (global.get $base) (local.get $i)))) (then (return (i32.const -1))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $more)))
    (i32.add (local.get $pos) (local.get $length)))`;
}

export function lowerCaptured(
  m: Extract<Matcher, { kind: "captured" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $p (call $captureMatch (local.get $input) (local.get $p) (local.get $limit)))
          (br_if ${fail} (i32.lt_s (local.get $p) (i32.const 0)))`;
}
