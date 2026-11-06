import { maxDepth } from "#/grammar/limits.ts";

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
  snapshotOffset: number;
}) {
  const i32 = [
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
  const i64 = options.tracksColumn
    ? ["column", ...Array.from({ length: options.columns }, (_, i) => `columnSlot${i}`)]
    : [];
  const fields = [
    ...i32.map((name, i) => ({ name, type: "i32", offset: i * 4 })),
    ...i64.map((name, i) => ({ name, type: "i64", offset: i32.length * 4 + i * 8 })),
  ];
  const injectionOffset = i32.length * 4 + i64.length * 8;
  const groupsOffset = injectionOffset + 4;
  const outputOffset = groupsOffset + (options.groups ? 4 : 0);
  const bytes = Math.ceil((outputOffset + (options.injections ? 40 : 0)) / 8) * 8;
  const addr = (index: string) =>
    `(i32.add (i32.add (global.get $base) (i32.const ${options.snapshotOffset})) (i32.mul ${index} (i32.const ${bytes})))`;
  const top = addr(`(i32.sub (local.get $specOpen) (i32.const 1))`);
  const outer = addr(`(i32.const 0)`);
  const save = `(local.set $specAddress ${addr(`(local.get $specOpen)`)})
    ${fields.map(({ name, type, offset }) => `(${type}.store offset=${offset} (local.get $specAddress) (local.get $${name}))`).join("\n")}
    (i32.store offset=${injectionOffset} (local.get $specAddress) (global.get $injections))
    ${options.groups ? `(i32.store offset=${groupsOffset} (local.get $specAddress) (global.get $groups))` : ""}
    ${options.injections ? `(call $specSaveOutput (i32.add (local.get $specAddress) (i32.const ${outputOffset})) (local.get $pendingAddress) (local.get $hostCurrent) (local.get $hostLast))` : ""}
    (local.set $specOpen (i32.add (local.get $specOpen) (i32.const 1)))`;
  const rewind = `(if (i32.eqz (local.get $specOpen)) (then (call $fail)))
    (local.set $specAddress ${top})
    (call $specAbandon (i32.load ${outer}) (i32.load (local.get $specAddress)) (local.get $pos)
      (i64.extend_i32_u (i32.sub (local.get $pos) (local.get $docStart)))
      (local.get $specFrontier) (local.get $specRewound))
    (local.set $specRewound) (local.set $specFrontier) (local.set $specChosen)
    (if (i32.ne (local.get $specChosen) (i32.load (local.get $specAddress))) (then
      (local.set $specOpen (i32.const 1)) (local.set $specAddress ${outer})))
    (local.set $specGroup (i32.load offset=${fields.find((field) => field.name === "specGroup")!.offset} (local.get $specAddress)))
    (call $specDisable (call $specGroupBits (local.get $specGroup)) (call $specGroupTags (local.get $specGroup)) (local.get $specEpoch) (local.get $specChosen) (local.get $pos))
    ${options.injections ? `(call $specRestoreOutput (i32.add (local.get $specAddress) (i32.const ${outputOffset})))` : ""}
    ${fields.map(({ name, type, offset }) => `(local.set $${name} (${type}.load offset=${offset} (local.get $specAddress)))`).join("\n")}
    (global.set $injections (i32.load offset=${injectionOffset} (local.get $specAddress)))
    ${options.groups ? `(global.set $groups (i32.load offset=${groupsOffset} (local.get $specAddress)))` : ""}
    (local.set $specOpen (i32.sub (local.get $specOpen) (i32.const 1)))`;
  const pass = `(if (local.get $specOpen) (then
    (local.set $specAddress ${top})
    (if (i32.eq (local.get $depth) (i32.add (i32.load offset=${fields.find((field) => field.name === "depth")!.offset} (local.get $specAddress)) (i32.const 1)))
      (then (local.set $specOpen (i32.sub (local.get $specOpen) (i32.const 1)))))))`;
  return {
    bytes,
    outerField(name: string): string {
      const field = fields.find((item) => item.name === name);
      if (!field) throw new Error(`Unknown speculative field ${name}`);
      return `(${field.type}.load offset=${field.offset} ${outer})`;
    },
    locals: `(local $specOpen i32) (local $specAddress i32) (local $specEpoch i32) (local $specChosen i32) (local $specGroup i32)
      (local $specFrontier i64) (local $specRewound i64)`,
    save,
    rewind,
    pass,
  };
}
