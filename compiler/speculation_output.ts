/**
 * Wasm lowering: 40 bytes at $checkpoint, three optional record addresses followed
 * by their 8-byte contents. An address of -1 means that no record is present.
 */
export const speculationOutputFunctions = `
  (func $specSaveOutput (param $checkpoint i32) (param $pending i32) (param $current i32) (param $last i32)
    (i32.store (local.get $checkpoint) (local.get $pending))
    (i32.store offset=4 (local.get $checkpoint) (local.get $current))
    (i32.store offset=8 (local.get $checkpoint) (local.get $last))
    (if (i32.ne (local.get $pending) (i32.const -1)) (then
      (i64.store offset=16 (local.get $checkpoint) (i64.load (local.get $pending)))))
    (if (i32.ne (local.get $current) (i32.const -1)) (then
      (i64.store offset=24 (local.get $checkpoint) (i64.load (local.get $current)))))
    (if (i32.ne (local.get $last) (i32.const -1)) (then
      (i64.store offset=32 (local.get $checkpoint) (i64.load (local.get $last))))))
  (func $specRestoreOutput (param $checkpoint i32)
    (local $address i32)
    (local.set $address (i32.load (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1)) (then
      (i64.store (local.get $address) (i64.load offset=16 (local.get $checkpoint)))))
    (local.set $address (i32.load offset=4 (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1)) (then
      (i64.store (local.get $address) (i64.load offset=24 (local.get $checkpoint)))))
    (local.set $address (i32.load offset=8 (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1)) (then
      (i64.store (local.get $address) (i64.load offset=32 (local.get $checkpoint))))))`;
