import { func, wat, type Def } from "#/testing/wat/mod.ts";
import { get, queued } from "./layout.ts";
import { styled } from "./styles.ts";

export function logicalRanges(address: Def, charge?: Def) {
  const work = charge ? wat`(call ${charge} (i64.const 1))` : wat``;
  const normalize = func(
    "logicalNormalize",
    () => wat`
    (param $cursor i64) (param $limit i32) (result i64)
    (local $index i32) (local $pos i32) (local $entry i32) (local $end i32)
    (local.set $index (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))))
    (local.set $pos (i32.wrap_i64 (local.get $cursor)))
    (block $done (loop $more
      ${work}
      (br_if $done (i32.ge_u (local.get $index) (local.get $limit)))
      (local.set $entry (i32.add (global.get ${address}) (local.get $index)))
      (local.set $end ${queued.get(get("entry"), "end")})
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then
        (local.set $index (i32.add (local.get $index) (i32.const ${queued.size})))
        (br $more)))
      (br_if $done (i32.ne ${queued.get(get("entry"), "style")} ${styled("punctuation.special")}))
      (local.set $pos (local.get $end))
      (local.set $index (i32.add (local.get $index) (i32.const ${queued.size})))
      (br $more)))
    (i64.or (i64.shl (i64.extend_i32_u (local.get $index)) (i64.const 32))
      (i64.extend_i32_u (local.get $pos)))`,
  );
  const peek = func(
    "logicalPeek",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
    ${work}
    (if (i32.ge_u (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))) (local.get $limit))
      (then (return (i32.const -1))))
    (i32.load8_u (i32.add (local.get $input) (i32.wrap_i64 (local.get $cursor))))`,
  );
  const advance = func(
    "logicalAdvance",
    () => wat`
    (param $cursor i64) (param $limit i32) (result i64)
    ${work}
    (if (i32.ge_u (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))) (local.get $limit))
      (then (return (local.get $cursor))))
    (call ${normalize} (i64.add (local.get $cursor) (i64.const 1)) (local.get $limit))`,
  );
  return { normalize, peek, advance };
}
