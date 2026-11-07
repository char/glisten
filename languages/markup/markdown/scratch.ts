import { fail } from "#/compiler/runtime.ts";
import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { get, queued } from "./layout.ts";

export function paragraphScratch(charge: Def) {
  const address = global("paragraphScratch", () => wat`(mut i32) (i32.const 0)`);
  const capacity = global("paragraphCapacity", () => wat`(mut i32) (i32.const 0)`);
  const used = global("paragraphUsed", () => wat`(mut i32) (i32.const 0)`);
  const required = global(
    "scratchRequired",
    () => wat`(export "scratchRequired") (mut i64) (i64.const 0)`,
  );
  const resize = func(
    "paragraphResize",
    () => wat`
    (param $capacity i32) (param $end i64)
    (local $need i64) (local $available i64) (local $next i32)
    (local.set $need (i64.add (local.get $end) (i64.extend_i32_u (local.get $capacity))))
    (if (i64.gt_u (local.get $need) (i64.const 4294967295)) (then (call ${fail})))
    (if (i64.gt_u (local.get $need) (global.get ${required})) (then (global.set ${required} (local.get $need))))
    (local.set $available (i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16)))
    (if (i64.gt_u (local.get $need) (local.get $available)) (then
      (if (i32.eq (memory.grow (i32.wrap_i64 (i64.shr_u
        (i64.add (i64.sub (local.get $need) (local.get $available)) (i64.const 65535)) (i64.const 16)))) (i32.const -1))
        (then (call ${fail})))))
    (local.set $next (i32.wrap_i64 (i64.sub (i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16))
      (i64.extend_i32_u (local.get $capacity)))))
    (if (i32.and (i32.ne (global.get ${used}) (i32.const 0)) (i32.ne (local.get $next) (global.get ${address}))) (then
      (call ${charge} (i64.extend_i32_u (global.get ${used})))
      (memory.copy (local.get $next) (global.get ${address}) (global.get ${used}))))
    (global.set ${address} (local.get $next))
    (global.set ${capacity} (local.get $capacity))`,
  );
  const append = func(
    "paragraphAppend",
    () => wat`
    (param $out i32) (param $end i32) (param $style i32)
    (local $next i64) (local $at i32)
    (call ${charge} (i64.const 1))
    (if (global.get ${used}) (then
      (local.set $at (i32.add (global.get ${address}) (i32.sub (global.get ${used}) (i32.const ${queued.size}))))
      (if (i32.eq ${queued.get(get("at"), "style")} (local.get $style)) (then
        ${queued.set(get("at"), "end", get("end"))} (return)))))
    (local.set $next (i64.add (i64.extend_i32_u (global.get ${used})) (i64.const ${queued.size})))
    (if (i64.gt_u (local.get $next) (i64.const 2147483640)) (then (call ${fail})))
    (if (i64.gt_u (local.get $next) (i64.extend_i32_u (global.get ${capacity}))) (then
      (call ${resize} (i32.wrap_i64 (if (result i64) (i64.lt_u (local.get $next) (i64.const 64))
        (then (i64.const 128)) (else (i64.mul (local.get $next) (i64.const 2))))) (i64.extend_i32_u (local.get $out)))))
    (local.set $at (i32.add (global.get ${address}) (global.get ${used})))
    ${queued.set(get("at"), "end", get("end"))}
    ${queued.set(get("at"), "style", get("style"))}
    (global.set ${used} (i32.wrap_i64 (local.get $next)))`,
  );
  const reserve = func(
    "paragraphReserve",
    () => wat`
    (param $bytes i64) (param $out i32) (result i32)
    (local $start i32) (local $need i64) (local $capacity i64)
    (local.set $start (global.get ${used}))
    (local.set $need (i64.add (i64.extend_i32_u (local.get $start)) (local.get $bytes)))
    (if (i64.gt_u (local.get $need) (i64.const 2147483640)) (then (call ${fail})))
    (if (i64.gt_u (local.get $need) (i64.extend_i32_u (global.get ${capacity}))) (then
      (local.set $capacity (i64.mul (local.get $need) (i64.const 2)))
      (if (i64.gt_u (local.get $capacity) (i64.const 2147483640)) (then (local.set $capacity (local.get $need))))
      (if (i64.lt_u (local.get $capacity) (i64.const 128)) (then (local.set $capacity (i64.const 128))))
      (call ${resize} (i32.wrap_i64 (local.get $capacity)) (i64.extend_i32_u (local.get $out)))))
    (global.set ${used} (i32.wrap_i64 (local.get $need)))
    (local.get $start)`,
  );
  const reserveExact = func(
    "paragraphReserveExact",
    () => wat`
    (param $bytes i64) (param $out i32) (result i32)
    (local $start i32) (local $need i64)
    (local.set $start (global.get ${used}))
    (local.set $need (i64.add (i64.extend_i32_u (local.get $start)) (local.get $bytes)))
    (if (i64.gt_u (local.get $need) (i64.const 2147483640)) (then (call ${fail})))
    (if (i64.gt_u (local.get $need) (i64.extend_i32_u (global.get ${capacity}))) (then
      (call ${resize} (i32.wrap_i64 (local.get $need)) (i64.extend_i32_u (local.get $out)))))
    (global.set ${used} (i32.wrap_i64 (local.get $need)))
    (local.get $start)`,
  );
  return { address, capacity, used, required, resize, append, reserve, reserveExact };
}
