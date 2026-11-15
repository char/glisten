import { record, memory } from "#/abi/mod.ts";
import { maxDepth } from "#/grammar/mod.ts";

const bitmapByteShift = 3;
const bitmapByteBits = 1 << bitmapByteShift;
const bitmapBitMask = bitmapByteBits - 1;
const epochTagShift = 2;
const rewindFrontierFactor = 4;
const rewindAllowance = 256;

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

const pendingAddressOffset = 0;
const currentAddressOffset = pendingAddressOffset + 4;
const lastAddressOffset = currentAddressOffset + 4;
const pendingRecordOffset = Math.ceil((lastAddressOffset + 4) / record.bytes) * record.bytes;
const currentRecordOffset = pendingRecordOffset + record.bytes;
const lastRecordOffset = currentRecordOffset + record.bytes;
const speculationOutputBytes = lastRecordOffset + record.bytes;

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

const i32Bytes = 4;
const i64Bytes = 8;

export const speculationAreaBytes = (enabled: boolean, bytes: number): number =>
  enabled ? bytes * maxDepth : 0;

/** Generate bounded speculative snapshots in the module area. */
export function speculationCode(options: {
  runs: number;
  counters: number;
  ranges: number;
  columns: number;
  tracksColumn: boolean;
  injections: boolean;
  transitions: boolean;
  containers: boolean;
  groups: boolean;
  zeroWidth: boolean;
  snapshotOffset: number;
}) {
  const i32Fields = [
    "pos",
    "specGroup",
    "state",
    "depth",
    "out",
    "pending",
    "pendingEnd",
    ...Array.from({ length: options.runs }, (_, i) => [`runByte${i}`, `runLength${i}`]).flat(),
    ...Array.from({ length: options.counters }, (_, i) => `counter${i}`),
    ...Array.from({ length: options.ranges }, (_, i) => [`rangeStart${i}`, `rangeEnd${i}`]).flat(),
    ...(options.injections
      ? [
          "host",
          "hostId",
          "hostLast",
          "hostCurrent",
          "parentPaint",
          "pendingAddress",
          "openAction",
          "openStart",
          "openEnd",
        ]
      : []),
    ...(options.transitions ? ["transitions"] : []),
    ...(options.containers ? ["containerLine", "containerNext", "containerOpen"] : []),
  ];
  const i64Fields = options.tracksColumn
    ? ["column", ...Array.from({ length: options.columns }, (_, i) => `columnSlot${i}`)]
    : [];
  const fields = [
    ...i32Fields.map((name, i) => ({ name, type: "i32", offset: i * i32Bytes })),
    ...i64Fields.map((name, i) => ({
      name,
      type: "i64",
      offset: i32Fields.length * i32Bytes + i * i64Bytes,
    })),
  ];
  const injectionOffset = i32Fields.length * i32Bytes + i64Fields.length * i64Bytes;
  const groupsOffset = injectionOffset + i32Bytes;
  const outputOffset = groupsOffset + (options.groups ? i32Bytes : 0);
  const unalignedBytes = outputOffset + (options.injections ? speculationOutputBytes : 0);
  const bytes = Math.ceil(unalignedBytes / i64Bytes) * i64Bytes;
  const snapshotOffset = options.snapshotOffset;
  const snapshotAddress = (index: string) => `(i32.add
    (i32.add (global.get $base) (i32.const ${snapshotOffset}))
    (i32.mul ${index} (i32.const ${bytes})))`;
  const top = snapshotAddress("(i32.sub (local.get $specOpen) (i32.const 1))");
  const outer = snapshotAddress("(i32.const 0)");
  const next = snapshotAddress("(local.get $specOpen)");
  const injectionField = `offset=${injectionOffset}`;
  const groupsField = `offset=${groupsOffset}`;
  const groupField = `offset=${fields.find((field) => field.name === "specGroup")!.offset}`;
  const depthField = `offset=${fields.find((field) => field.name === "depth")!.offset}`;
  const outputAddress = `(i32.add (local.get $specAddress) (i32.const ${outputOffset}))`;
  const saveFields = fields
    .map(({ name, type, offset }) => {
      const instruction = `${type}.store`;
      const field = `offset=${offset}`;
      const local = `$${name}`;
      return `(${instruction} ${field} (local.get $specAddress) (local.get ${local}))`;
    })
    .join("\n");
  const restoreFields = fields
    .map(({ name, type, offset }) => {
      const instruction = `${type}.load`;
      const field = `offset=${offset}`;
      const local = `$${name}`;
      return `(local.set ${local} (${instruction} ${field} (local.get $specAddress)))`;
    })
    .join("\n");
  const saveGroups = options.groups
    ? `(i32.store ${groupsField} (local.get $specAddress) (global.get $groups))`
    : "";
  const restoreGroups = options.groups
    ? `(global.set $groups (i32.load ${groupsField} (local.get $specAddress)))`
    : "";
  const saveOutput = options.injections
    ? `(call $specSaveOutput ${outputAddress} (local.get $pendingAddress) (local.get $hostCurrent) (local.get $hostLast))`
    : "";
  const restoreOutput = options.injections ? `(call $specRestoreOutput ${outputAddress})` : "";
  const save = `(local.set $specAddress ${next})
    ${saveFields}
    (i32.store ${injectionField} (local.get $specAddress) (global.get $injections))
    ${saveGroups}
    ${saveOutput}
    (local.set $specOpen (i32.add (local.get $specOpen) (i32.const 1)))`;

  const logicalEnd = `(i64.extend_i32_u (i32.sub (local.get $pos) (local.get $docStart)))`;
  const furthest = `(if (result i64) (i64.gt_u ${logicalEnd} (local.get $specFrontier))
    (then ${logicalEnd}) (else (local.get $specFrontier)))`;
  const rewindBudget = `(i64.add (i64.mul (i64.const ${rewindFrontierFactor}) ${furthest}) (i64.const ${rewindAllowance}))`;
  const zeroWidthAbandon = options.zeroWidth
    ? `(local.set $next (i64.gt_u
      (i64.add (local.get $specRewound) (i64.extend_i32_u (i32.sub (local.get $pos) (i32.load (local.get $specAddress)))))
      ${rewindBudget}))`
    : "";
  const abandonOuter = options.zeroWidth
    ? "(local.get $next)"
    : "(i32.ne (local.get $specChosen) (i32.load (local.get $specAddress)))";
  const disableEnd = options.zeroWidth
    ? `(if (result i32) (i32.eq (local.get $specChosen) (local.get $pos))
      (then (i32.add (local.get $pos) (i32.const 1))) (else (local.get $pos)))`
    : "(local.get $pos)";
  const rewind = `(if (i32.eqz (local.get $specOpen)) (then (call $fail)))
    (local.set $specAddress ${top})
    ${zeroWidthAbandon}
    (call $specAbandon
      (i32.load ${outer})
      (i32.load (local.get $specAddress))
      (local.get $pos)
      ${logicalEnd}
      (local.get $specFrontier)
      (local.get $specRewound))
    (local.set $specRewound)
    (local.set $specFrontier)
    (local.set $specChosen)
    (if ${abandonOuter}
      (then
        (local.set $specOpen (i32.const 1))
        (local.set $specAddress ${outer})))
    (local.set $specGroup (i32.load ${groupField} (local.get $specAddress)))
    (call $specDisable
      (call $specGroupBits (local.get $specGroup))
      (call $specGroupTags (local.get $specGroup))
      (local.get $specEpoch)
      (local.get $specChosen)
      ${disableEnd})
    ${restoreOutput}
    ${restoreFields}
    (global.set $injections (i32.load ${injectionField} (local.get $specAddress)))
    ${restoreGroups}
    (local.set $specOpen (i32.sub (local.get $specOpen) (i32.const 1)))`;
  const pass = `(if (local.get $specOpen)
    (then
      (local.set $specAddress ${top})
      (if (i32.eq (local.get $depth)
        (i32.add (i32.load ${depthField} (local.get $specAddress)) (i32.const 1)))
        (then (local.set $specOpen (i32.sub (local.get $specOpen) (i32.const 1)))))))`;
  return {
    bytes,
    outerField(name: string): string {
      const field = fields.find((item) => item.name === name);
      if (!field) throw new Error(`Unknown speculative field ${name}`);
      const instruction = `${field.type}.load`;
      const offset = `offset=${field.offset}`;
      return `(${instruction} ${offset} ${outer})`;
    },
    locals: `(local $specOpen i32) (local $specAddress i32) (local $specEpoch i32) (local $specChosen i32) (local $specGroup i32)
      (local $specFrontier i64) (local $specRewound i64)`,
    save,
    rewind,
    pass,
  };
}

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
