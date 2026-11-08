import { record } from "#/abi/constants.ts";

const pendingAddressOffset = 0;
const currentAddressOffset = pendingAddressOffset + 4;
const lastAddressOffset = currentAddressOffset + 4;
const pendingRecordOffset = Math.ceil((lastAddressOffset + 4) / record.bytes) * record.bytes;
const currentRecordOffset = pendingRecordOffset + record.bytes;
const lastRecordOffset = currentRecordOffset + record.bytes;
export const speculationOutputBytes = lastRecordOffset + record.bytes;

const currentAddress = `offset=${currentAddressOffset}`;
const lastAddress = `offset=${lastAddressOffset}`;
const pendingRecord = `offset=${pendingRecordOffset}`;
const currentRecord = `offset=${currentRecordOffset}`;
const lastRecord = `offset=${lastRecordOffset}`;

/** Three optional record addresses and their saved contents; -1 denotes an absent record. */
export const speculationOutputFunctions = `
  (func $specSaveOutput (param $checkpoint i32) (param $pending i32) (param $current i32)
    (param $last i32)
    (i32.store (local.get $checkpoint) (local.get $pending))
    (i32.store ${currentAddress} (local.get $checkpoint) (local.get $current))
    (i32.store ${lastAddress} (local.get $checkpoint) (local.get $last))
    (if (i32.ne (local.get $pending) (i32.const -1))
      (then (i64.store ${pendingRecord} (local.get $checkpoint) (i64.load (local.get $pending)))))
    (if (i32.ne (local.get $current) (i32.const -1))
      (then (i64.store ${currentRecord} (local.get $checkpoint) (i64.load (local.get $current)))))
    (if (i32.ne (local.get $last) (i32.const -1))
      (then (i64.store ${lastRecord} (local.get $checkpoint) (i64.load (local.get $last))))))
  (func $specRestoreOutput (param $checkpoint i32)
    (local $address i32)
    (local.set $address (i32.load (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1))
      (then (i64.store (local.get $address) (i64.load ${pendingRecord} (local.get $checkpoint)))))
    (local.set $address (i32.load ${currentAddress} (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1))
      (then (i64.store (local.get $address) (i64.load ${currentRecord} (local.get $checkpoint)))))
    (local.set $address (i32.load ${lastAddress} (local.get $checkpoint)))
    (if (i32.ne (local.get $address) (i32.const -1))
      (then (i64.store (local.get $address) (i64.load ${lastRecord} (local.get $checkpoint))))))`;
