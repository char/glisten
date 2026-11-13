import { memory, record } from "#/abi/mod.ts";
import { bitmapBitMask, bitmapByteShift, epochTagShift } from "./speculation.ts";

const pageShift = Math.log2(memory.pageBytes);
const pageRounding = memory.pageBytes - 1;
const wasm32Bytes = 2 ** 32;
const wasm32MaxAddress = wasm32Bytes - 1;
const emptyScratchBytes = 8;
const tagAlignmentMask = -(1 << epochTagShift);
const tagAlignmentRounding = (1 << epochTagShift) - 1;
const memoryEnd = `(i64.shl (i64.extend_i32_u (memory.size)) (i64.const ${pageShift}))`;
const pagesToReach = (end: string) => `(i32.wrap_i64
  (i64.shr_u
    (i64.add (i64.sub ${end} (local.get $memoryBytes)) (i64.const ${pageRounding}))
    (i64.const ${pageShift})))`;
const minimumPages = pagesToReach("(local.get $requiredEnd)");
const preferredPages = pagesToReach("(local.get $preferredEnd)");

// Copy the region furthest in the direction of travel first so the two regions cannot clobber each other.
const relocateScratch = `(if (i32.ne (local.get $newScratch) (local.get $oldScratch))
      (then
        (if (i32.gt_u (local.get $newScratch) (local.get $oldScratch))
          (then
            (memory.copy (local.get $newQueue) (local.get $oldQueue) (global.get $queueUsed))
            (memory.copy (local.get $newScratch) (local.get $oldScratch) (global.get $specScratchSize)))
          (else
            (memory.copy (local.get $newScratch) (local.get $oldScratch) (global.get $specScratchSize))
            (memory.copy (local.get $newQueue) (local.get $oldQueue) (global.get $queueUsed))))))`;

/** Relocatable scratch shared by speculation's bitmap and the heredoc queue. */
export const speculationScratch = `
  (global $specScratch (mut i32) (i32.const 0))
  (global $specScratchSize (mut i32) (i32.const 0))
  (global $specTagOffset (mut i32) (i32.const 0))
  (global $specBytes (mut i32) (i32.const 0))
  (global $queueCapacity (mut i32) (i32.const 0))
  (global $queueUsed (mut i32) (i32.const 0))
  (global $scratchRequired (export "scratchRequired") (mut i64) (i64.const 0))
  (global $outLimit (mut i32) (i32.const 0))
  (func $scratchResize (param $capacity i32) (param $end i64)
    (local $oldScratch i32) (local $newScratch i32) (local $oldQueue i32) (local $newQueue i32) (local $totalScratchBytes i64)
    (local $requiredEnd i64) (local $memoryBytes i64) (local $preferredEnd i64) (local $preferredPages i32)
    (local $minimumPages i32)
    (local.set $totalScratchBytes
      (i64.add
        (i64.extend_i32_u (global.get $specScratchSize))
        (i64.extend_i32_u (local.get $capacity))))
    (local.set $requiredEnd (i64.add (local.get $end) (local.get $totalScratchBytes)))
    (if (i64.gt_u (local.get $requiredEnd) (i64.const ${wasm32Bytes})) (then (call $fail)))
    (if (i64.gt_u (local.get $requiredEnd) (global.get $scratchRequired))
      (then (global.set $scratchRequired (local.get $requiredEnd))))
    (local.set $memoryBytes ${memoryEnd})
    (local.set $oldScratch (global.get $specScratch))
    (local.set $oldQueue (i32.add (local.get $oldScratch) (global.get $specScratchSize)))
    (if (i64.gt_u (local.get $requiredEnd) (local.get $memoryBytes))
      (then
        (local.set $minimumPages ${minimumPages})
        (local.set $preferredEnd (i64.add (local.get $requiredEnd) (local.get $totalScratchBytes)))
        (if (i64.gt_u (local.get $preferredEnd) (i64.const ${wasm32Bytes}))
          (then (local.set $preferredEnd (i64.const ${wasm32Bytes}))))
        (local.set $preferredPages ${preferredPages})
        (if (i32.eq (memory.grow (local.get $preferredPages)) (i32.const -1))
          (then (if (i32.eq (memory.grow (local.get $minimumPages)) (i32.const -1)) (then (call $fail)))))))
    (local.set $newScratch
      (i32.wrap_i64
        (i64.sub ${memoryEnd} (local.get $totalScratchBytes))))
    (local.set $newQueue (i32.add (local.get $newScratch) (global.get $specScratchSize)))
    ${relocateScratch}
    (global.set $specScratch (local.get $newScratch))
    ;; Records grow up toward the scratch, so their limit moves with it.
    (global.set $outLimit (i32.sub (local.get $newScratch) (i32.const ${record.bytes})))
    (global.set $queueCapacity (local.get $capacity)))
  (func $scratchInit (param $out i32) (param $length i32) (param $spec i32)
    (local $bitmapBytes i64) (local $tagsOffset i64) (local $scratchBytes i64)
    (global.set $queueCapacity (i32.const 0))
    (global.set $queueUsed (i32.const 0))
    (global.set $specScratchSize (i32.const 0))
    (global.set $specTagOffset (i32.const 0))
    (global.set $specScratch
      (i32.wrap_i64 ${memoryEnd}))
    (global.set $scratchRequired (i64.const 0))
    (if (local.get $spec)
      (then
        (local.set $bitmapBytes
          (i64.shr_u (i64.add (i64.extend_i32_u (local.get $length)) (i64.const ${bitmapBitMask})) (i64.const ${bitmapByteShift})))
        (global.set $specBytes (i32.wrap_i64 (local.get $bitmapBytes)))
        (local.set $tagsOffset
          (i64.and
            (i64.add
              (i64.mul (local.get $bitmapBytes) (i64.extend_i32_u (local.get $spec)))
              (i64.const ${tagAlignmentRounding}))
            (i64.const ${tagAlignmentMask})))
        (local.set $scratchBytes
          (i64.add
            (local.get $tagsOffset)
            (i64.shl
              (i64.mul (local.get $bitmapBytes) (i64.extend_i32_u (local.get $spec)))
              (i64.const ${epochTagShift}))))
        (if (i64.eqz (local.get $scratchBytes)) (then (local.set $scratchBytes (i64.const ${emptyScratchBytes}))))
        (if (i64.gt_u (local.get $scratchBytes) (i64.const ${wasm32MaxAddress})) (then (call $fail)))
        (global.set $specTagOffset (i32.wrap_i64 (local.get $tagsOffset)))))
    (call $scratchResize (i32.wrap_i64 (local.get $scratchBytes)) (i64.extend_i32_u (local.get $out)))
    (global.set $specScratchSize (i32.wrap_i64 (local.get $scratchBytes)))
    (global.set $queueCapacity (i32.const 0))
    (memory.fill (global.get $specScratch) (i32.const 0) (global.get $specScratchSize)))
  (func $specScratchInit (param $out i32) (param $length i32)
    (call $scratchInit (local.get $out) (local.get $length) (i32.const 1)))
  (func $specReserveOutput (param $end i64)
    (call $scratchResize (global.get $queueCapacity) (local.get $end)))
  (func $specBits (result i32)
    (global.get $specScratch))
  (func $specTags (result i32)
    (i32.add (global.get $specScratch) (global.get $specTagOffset)))
  (func $specGroupBits (param $group i32) (result i32)
    (i32.add (call $specBits) (i32.mul (local.get $group) (global.get $specBytes))))
  (func $specGroupTags (param $group i32) (result i32)
    (i32.add
      (call $specTags)
      (i32.shl (i32.mul (local.get $group) (global.get $specBytes)) (i32.const ${epochTagShift}))))`;
