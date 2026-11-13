import { memory } from "#/abi/mod.ts";
import { fail } from "#/compiler/runtime.ts";
import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { get, queued } from "./layout.ts";

const maxAddress = 0xffff_ffff;
const maxScratchBytes = 0x8000_0000 - queued.size;
const pageShift = Math.log2(memory.pageBytes);
const pageRounding = memory.pageBytes - 1;
const initialCapacity = 128;
const growthThreshold = initialCapacity / 2;

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
      (local $requiredEnd i64) (local $memoryBytes i64) (local $newAddress i32)
      (local.set $requiredEnd (i64.add (local.get $end) (i64.extend_i32_u (local.get $capacity))))
      (if (i64.gt_u (local.get $requiredEnd) (i64.const ${maxAddress})) (then (call ${fail})))
      (if (i64.gt_u (local.get $requiredEnd) (global.get ${required}))
        (then (global.set ${required} (local.get $requiredEnd))))

      (local.set $memoryBytes (i64.shl (i64.extend_i32_u (memory.size)) (i64.const ${pageShift})))
      (if (i64.gt_u (local.get $requiredEnd) (local.get $memoryBytes))
        (then
          (if
            (i32.eq
              (memory.grow
                (i32.wrap_i64
                  (i64.shr_u
                    (i64.add (i64.sub (local.get $requiredEnd) (local.get $memoryBytes)) (i64.const ${pageRounding}))
                    (i64.const ${pageShift}))))
              (i32.const -1))
            (then (call ${fail})))))

      (local.set $newAddress
        (i32.wrap_i64
          (i64.sub
            (i64.shl (i64.extend_i32_u (memory.size)) (i64.const ${pageShift}))
            (i64.extend_i32_u (local.get $capacity)))))
      (if
        (i32.and
          (i32.ne (global.get ${used}) (i32.const 0))
          (i32.ne (local.get $newAddress) (global.get ${address})))
        (then
          (call ${charge} (i64.extend_i32_u (global.get ${used})))
          (memory.copy (local.get $newAddress) (global.get ${address}) (global.get ${used}))))
      (global.set ${address} (local.get $newAddress))
      (global.set ${capacity} (local.get $capacity))`,
  );
  const append = func(
    "paragraphAppend",
    () => wat`
      (param $out i32) (param $end i32) (param $style i32)
      (local $requiredBytes i64) (local $entry i32)
      (call ${charge} (i64.const 1))
      (if (global.get ${used})
        (then
          (local.set $entry
            (i32.add
              (global.get ${address})
              (i32.sub (global.get ${used}) (i32.const ${queued.size}))))
          (if (i32.eq ${queued.get(get("entry"), "style")} (local.get $style))
            (then ${queued.set(get("entry"), "end", get("end"))}
              (return)))))

      (local.set $requiredBytes (i64.add (i64.extend_i32_u (global.get ${used})) (i64.const ${queued.size})))
      (if (i64.gt_u (local.get $requiredBytes) (i64.const ${maxScratchBytes})) (then (call ${fail})))
      (if (i64.gt_u (local.get $requiredBytes) (i64.extend_i32_u (global.get ${capacity})))
        (then
          (call ${resize}
            (i32.wrap_i64
              (if (result i64) (i64.lt_u (local.get $requiredBytes) (i64.const ${growthThreshold}))
                (then (i64.const ${initialCapacity}))
                (else (i64.mul (local.get $requiredBytes) (i64.const 2)))))
            (i64.extend_i32_u (local.get $out)))))
      (local.set $entry (i32.add (global.get ${address}) (global.get ${used})))
      ${queued.set(get("entry"), "end", get("end"))}
      ${queued.set(get("entry"), "style", get("style"))}
      (global.set ${used} (i32.wrap_i64 (local.get $requiredBytes)))`,
  );
  const reserve = func(
    "paragraphReserve",
    () => wat`
      (param $bytes i64) (param $out i32) (result i32)
      (local $start i32) (local $requiredBytes i64) (local $capacity i64)
      (local.set $start (global.get ${used}))
      (local.set $requiredBytes (i64.add (i64.extend_i32_u (local.get $start)) (local.get $bytes)))
      (if (i64.gt_u (local.get $requiredBytes) (i64.const ${maxScratchBytes})) (then (call ${fail})))
      (if (i64.gt_u (local.get $requiredBytes) (i64.extend_i32_u (global.get ${capacity})))
        (then
          (local.set $capacity (i64.mul (local.get $requiredBytes) (i64.const 2)))
          (if (i64.gt_u (local.get $capacity) (i64.const ${maxScratchBytes}))
            (then (local.set $capacity (local.get $requiredBytes))))
          (if (i64.lt_u (local.get $capacity) (i64.const ${initialCapacity}))
            (then (local.set $capacity (i64.const ${initialCapacity}))))
          (call ${resize} (i32.wrap_i64 (local.get $capacity)) (i64.extend_i32_u (local.get $out)))))
      (global.set ${used} (i32.wrap_i64 (local.get $requiredBytes)))
      (local.get $start)`,
  );
  const reserveExact = func(
    "paragraphReserveExact",
    () => wat`
      (param $bytes i64) (param $out i32) (result i32)
      (local $start i32) (local $requiredBytes i64)
      (local.set $start (global.get ${used}))
      (local.set $requiredBytes (i64.add (i64.extend_i32_u (local.get $start)) (local.get $bytes)))
      (if (i64.gt_u (local.get $requiredBytes) (i64.const ${maxScratchBytes})) (then (call ${fail})))
      (if (i64.gt_u (local.get $requiredBytes) (i64.extend_i32_u (global.get ${capacity})))
        (then (call ${resize} (i32.wrap_i64 (local.get $requiredBytes)) (i64.extend_i32_u (local.get $out)))))
      (global.set ${used} (i32.wrap_i64 (local.get $requiredBytes)))
      (local.get $start)`,
  );
  return { address, capacity, used, required, resize, append, reserve, reserveExact };
}
