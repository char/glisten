/** Wasm lowering; the caller supplies a bitmap and zeroed i32 epoch tags for its bytes. */
export const speculationFunctions = `
  (func $specNextEpoch (param $tags i32) (param $tagBytes i32) (param $epoch i32) (result i32)
    (local.set $epoch (i32.add (local.get $epoch) (i32.const 1)))
    (if (i32.eqz (local.get $epoch)) (then
      (memory.fill (local.get $tags) (i32.const 0) (local.get $tagBytes))
      (local.set $epoch (i32.const 1))))
    (local.get $epoch))
  (func $specHas (param $base i32) (param $tags i32) (param $epoch i32) (param $pos i32) (result i32)
    (i32.and
      (i32.eq (i32.load (i32.add (local.get $tags) (i32.shl (i32.shr_u (local.get $pos) (i32.const 3)) (i32.const 2)))) (local.get $epoch))
      (i32.ne (i32.and
        (i32.load8_u (i32.add (local.get $base) (i32.shr_u (local.get $pos) (i32.const 3))))
        (i32.shl (i32.const 1) (i32.and (local.get $pos) (i32.const 7)))) (i32.const 0))))
  (func $specDisable (param $base i32) (param $tags i32) (param $epoch i32) (param $from i32) (param $to i32)
    (local $address i32) (local $tag i32) (local $bits i32) (local $count i32) (local $offset i32)
    (block $done (loop $next
      (br_if $done (i32.ge_u (local.get $from) (local.get $to)))
      (local.set $offset (i32.and (local.get $from) (i32.const 7)))
      (local.set $count (i32.sub (i32.const 8) (local.get $offset)))
      (if (i32.lt_u (i32.sub (local.get $to) (local.get $from)) (local.get $count)) (then
        (local.set $count (i32.sub (local.get $to) (local.get $from)))))
      (local.set $address (i32.add (local.get $base) (i32.shr_u (local.get $from) (i32.const 3))))
      (local.set $tag (i32.add (local.get $tags) (i32.shl (i32.shr_u (local.get $from) (i32.const 3)) (i32.const 2))))
      (local.set $bits (i32.shl (i32.sub (i32.shl (i32.const 1) (local.get $count)) (i32.const 1)) (local.get $offset)))
      (if (i32.eq (i32.load (local.get $tag)) (local.get $epoch))
        (then (local.set $bits (i32.or (local.get $bits) (i32.load8_u (local.get $address)))))
        (else (i32.store (local.get $tag) (local.get $epoch))))
      (i32.store8 (local.get $address) (local.get $bits))
      (local.set $from (i32.add (local.get $from) (local.get $count)))
      (br $next))))
  (func $specAbandon (param $outer i32) (param $inner i32) (param $at i32)
    (param $logicalEnd i64) (param $frontier i64) (param $rewound i64) (result i32 i64 i64)
    (local $chosen i32)
    (if (i64.gt_u (local.get $logicalEnd) (local.get $frontier))
      (then (local.set $frontier (local.get $logicalEnd))))
    (local.set $chosen (if (result i32)
      (i64.le_u
        (i64.add (local.get $rewound) (i64.extend_i32_u (i32.sub (local.get $at) (local.get $inner))))
        (i64.add (i64.mul (local.get $frontier) (i64.const 4)) (i64.const 256)))
      (then (local.get $inner)) (else (local.get $outer))))
    (local.get $chosen)
    (local.get $frontier)
    (i64.add (local.get $rewound) (i64.extend_i32_u (i32.sub (local.get $at) (local.get $chosen)))))`;
