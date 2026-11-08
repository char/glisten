export const bitmapByteShift = 3;
export const bitmapByteBits = 1 << bitmapByteShift;
export const bitmapBitMask = bitmapByteBits - 1;
export const epochTagShift = 2;
export const rewindFrontierFactor = 4;
export const rewindAllowance = 256;

const bitmapByteIndex = (position: string) =>
  `(i32.shr_u ${position} (i32.const ${bitmapByteShift}))`;
const bitmapByteAddress = (position: string) => {
  const index = bitmapByteIndex(position);
  return `(i32.add (local.get $base) ${index})`;
};
const epochTagAddress = (position: string) => {
  const index = bitmapByteIndex(position);
  return `(i32.add (local.get $tags) (i32.shl ${index} (i32.const ${epochTagShift})))`;
};
const bitmapBitIndex = (position: string) => `(i32.and ${position} (i32.const ${bitmapBitMask}))`;
const position = "(local.get $pos)";
const rangeStart = "(local.get $from)";
const positionTag = epochTagAddress(position);
const positionByte = bitmapByteAddress(position);
const positionBit = bitmapBitIndex(position);
const rangeTag = epochTagAddress(rangeStart);
const rangeByte = bitmapByteAddress(rangeStart);
const rangeBit = bitmapBitIndex(rangeStart);

/** Wasm lowering; the caller supplies a bitmap and zeroed i32 epoch tags for its bytes. */
export const speculationFunctions = `
  (func $specNextEpoch (param $tags i32) (param $tagBytes i32) (param $epoch i32) (result i32)
    (local.set $epoch (i32.add (local.get $epoch) (i32.const 1)))
    (if (i32.eqz (local.get $epoch))
      (then
        (memory.fill (local.get $tags) (i32.const 0) (local.get $tagBytes))
        (local.set $epoch (i32.const 1))))
    (local.get $epoch))
  (func $specHas (param $base i32) (param $tags i32) (param $epoch i32) (param $pos i32)
    (result i32)
    (i32.and
      (i32.eq
        (i32.load ${positionTag})
        (local.get $epoch))
      (i32.ne
        (i32.and
          (i32.load8_u ${positionByte})
          (i32.shl (i32.const 1) ${positionBit}))
        (i32.const 0))))
  (func $specDisable (param $base i32) (param $tags i32) (param $epoch i32) (param $from i32)
    (param $to i32)
    (local $byteAddress i32) (local $tagAddress i32) (local $newBits i32) (local $bitCount i32) (local $bitOffset i32)
    (block $rangeDone (loop $nextByte
      (br_if $rangeDone (i32.ge_u (local.get $from) (local.get $to)))
      (local.set $bitOffset ${rangeBit})
      (local.set $bitCount (i32.sub (i32.const ${bitmapByteBits}) (local.get $bitOffset)))
      (if (i32.lt_u (i32.sub (local.get $to) (local.get $from)) (local.get $bitCount))
        (then (local.set $bitCount (i32.sub (local.get $to) (local.get $from)))))
      (local.set $byteAddress ${rangeByte})
      (local.set $tagAddress ${rangeTag})
      (local.set $newBits
        (i32.shl
          (i32.sub (i32.shl (i32.const 1) (local.get $bitCount)) (i32.const 1))
          (local.get $bitOffset)))
      (if (i32.eq (i32.load (local.get $tagAddress)) (local.get $epoch))
        (then (local.set $newBits (i32.or (local.get $newBits) (i32.load8_u (local.get $byteAddress)))))
        (else (i32.store (local.get $tagAddress) (local.get $epoch))))
      (i32.store8 (local.get $byteAddress) (local.get $newBits))
      (local.set $from (i32.add (local.get $from) (local.get $bitCount)))
      (br $nextByte))))
  (func $specAbandon (param $outer i32) (param $inner i32) (param $at i32) (param $logicalEnd i64)
    (param $frontier i64) (param $rewound i64) (result i32 i64 i64)
    (local $chosen i32)
    (if (i64.gt_u (local.get $logicalEnd) (local.get $frontier))
      (then (local.set $frontier (local.get $logicalEnd))))
    (local.set $chosen
      (if (result i32)
        (i64.le_u
          (i64.add
            (local.get $rewound)
            (i64.extend_i32_u (i32.sub (local.get $at) (local.get $inner))))
          (i64.add (i64.mul (local.get $frontier) (i64.const ${rewindFrontierFactor})) (i64.const ${rewindAllowance})))
        (then (local.get $inner))
        (else (local.get $outer))))
    (local.get $chosen)
    (local.get $frontier)
    (i64.add (local.get $rewound) (i64.extend_i32_u (i32.sub (local.get $at) (local.get $chosen)))))`;
