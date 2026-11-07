import { func, wat, type Def } from "#/testing/wat/mod.ts";
import { get, queued } from "./layout.ts";
import { logicalRanges } from "./logical.ts";
import { kind, styled } from "./styles.ts";

export function logicalUtf8(ranges: ReturnType<typeof logicalRanges>, address: Def, charge: Def) {
  const previous = func(
    "logicalPrevious",
    () => wat`
    (param $cursor i64) (param $start i64) (param $limit i32) (result i64)
    (local $index i32) (local $first i32) (local $pos i32) (local $begin i32) (local $entry i32)
    (local.set $index (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))))
    (local.set $first (i32.wrap_i64 (i64.shr_u (local.get $start) (i64.const 32))))
    (local.set $pos (i32.wrap_i64 (local.get $cursor)))
    (if (i32.ge_u (local.get $index) (local.get $limit)) (then
      (if (i32.eqz (local.get $index)) (then (return (i64.const -1))))
      (local.set $index (i32.sub (local.get $index) (i32.const ${queued.size})))))
    (block $done (loop $more
      (call ${charge} (i64.const 1))
      (br_if $done (i32.lt_u (local.get $index) (local.get $first)))
      (local.set $entry (i32.add (global.get ${address}) (local.get $index)))
      (local.set $begin (if (result i32) (i32.eq (local.get $index) (local.get $first))
        (then (i32.wrap_i64 (local.get $start)))
        (else ${queued.get(wat`(i32.sub (local.get $entry) (i32.const ${queued.size}))`, "end")})))
      (if (i32.and (i32.and (i32.ne ${queued.get(get("entry"), "style")} ${styled("punctuation.special")})
          (i32.ne ${queued.get(get("entry"), "style")} (i32.const ${kind.indent})))
        (i32.gt_u (local.get $pos) (local.get $begin))) (then
        (return (i64.or (i64.shl (i64.extend_i32_u (local.get $index)) (i64.const 32))
          (i64.extend_i32_u (i32.sub (local.get $pos) (i32.const 1)))))))
      (br_if $done (i32.eq (local.get $index) (local.get $first)))
      (local.set $index (i32.sub (local.get $index) (i32.const ${queued.size})))
      (local.set $pos ${queued.get(wat`(i32.add (global.get ${address}) (local.get $index))`, "end")})
      (br $more)))
    (i64.const -1)`,
  );
  const decode = func(
    "logicalCodepoint",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
    (local $byte i32) (local $value i32) (local $remaining i32) (local $minimum i32)
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i32.const -1))))
    (if (i32.lt_u (local.get $byte) (i32.const 128)) (then (return (local.get $byte))))
    (if (i32.le_u (i32.sub (local.get $byte) (i32.const 194)) (i32.const 29)) (then
      (local.set $value (i32.and (local.get $byte) (i32.const 31)))
      (local.set $remaining (i32.const 1)) (local.set $minimum (i32.const 128)))
      (else (if (i32.le_u (i32.sub (local.get $byte) (i32.const 224)) (i32.const 15)) (then
        (local.set $value (i32.and (local.get $byte) (i32.const 15)))
        (local.set $remaining (i32.const 2)) (local.set $minimum (i32.const 2048)))
        (else (if (i32.le_u (i32.sub (local.get $byte) (i32.const 240)) (i32.const 4)) (then
          (local.set $value (i32.and (local.get $byte) (i32.const 7)))
          (local.set $remaining (i32.const 3)) (local.set $minimum (i32.const 65536)))
          (else (return (i32.const 65533))))))))
    (block $done (loop $more
      (br_if $done (i32.eqz (local.get $remaining)))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.ne (i32.and (local.get $byte) (i32.const 192)) (i32.const 128)) (then (return (i32.const 65533))))
      (local.set $value (i32.or (i32.shl (local.get $value) (i32.const 6)) (i32.and (local.get $byte) (i32.const 63))))
      (local.set $remaining (i32.sub (local.get $remaining) (i32.const 1))) (br $more)))
    (if (i32.or (i32.lt_u (local.get $value) (local.get $minimum))
      (i32.or (i32.gt_u (local.get $value) (i32.const 1114111))
        (i32.le_u (i32.sub (local.get $value) (i32.const 55296)) (i32.const 2047))))
      (then (return (i32.const 65533))))
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
    (if (i32.lt_u (local.get $byte) (i32.const 128)) (then (return (local.get $byte))))
    (local.set $count (i32.const 1))
    (block $lead (loop $more
      (br_if $lead (i32.ne (i32.and (local.get $byte) (i32.const 192)) (i32.const 128)))
      (if (i32.ge_u (local.get $count) (i32.const 4)) (then (return (i32.const 65533))))
      (local.set $at (call ${previous} (local.get $at) (local.get $start) (local.get $limit)))
      (if (i64.eq (local.get $at) (i64.const -1)) (then (return (i32.const 65533))))
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $at) (local.get $limit)))
      (local.set $count (i32.add (local.get $count) (i32.const 1))) (br $more)))
    (local.set $length (if (result i32) (i32.le_u (i32.sub (local.get $byte) (i32.const 194)) (i32.const 29))
      (then (i32.const 2)) (else (if (result i32) (i32.le_u (i32.sub (local.get $byte) (i32.const 224)) (i32.const 15))
        (then (i32.const 3)) (else (if (result i32) (i32.le_u (i32.sub (local.get $byte) (i32.const 240)) (i32.const 4))
          (then (i32.const 4)) (else (i32.const 0))))))))
    (if (i32.ne (local.get $length) (local.get $count)) (then (return (i32.const 65533))))
    (call ${decode} (local.get $input) (local.get $at) (local.get $limit))`,
  );
  return { previous, decode, before };
}
