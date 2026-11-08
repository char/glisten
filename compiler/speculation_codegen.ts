import { maxDepth } from "#/grammar/limits.ts";
import { rewindAllowance, rewindFrontierFactor } from "./speculation.ts";
import { speculationOutputBytes } from "./speculation_output.ts";

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
