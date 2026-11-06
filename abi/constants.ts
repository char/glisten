/** Version of the module/host contract (docs/abi.md). */
export const ABI = 4;

/** Return and trap status codes (docs/abi.md). */
export const status = { ok: 0, resource: 1 } as const;

/** Symbolic name of a status code. */
export type Status = keyof typeof status;

/** Shared-memory alignment and padding requirements (docs/abi.md). */
export const memory = { align: 16, padding: 16, pageBytes: 65536 } as const;

/** A module's input: one contiguous document per entry (docs/abi.md). */
export const document = { bytes: 8, start: 0, end: 4 } as const;

/** The host's segments of a document, flagged at its first and last (docs/abi.md). */
export const segment = { bytes: 12, start: 0, end: 4, flags: 8, starts: 1, ends: 2 } as const;

/** Exclusive upper bound for host style IDs (docs/abi.md). */
export const styleIdLimit = 0x1_0000;

/** Output record layout and kind bits (docs/abi.md). */
export const record = {
  bytes: 8,
  a: 0,
  word: 4,
  kindShift: 29,
  kind: {
    span: 0b0,
    group: 0b010,
    segment: 0b100,
    segmentCloses: 0b101,
    opensStatic: 0b110,
    opensNamed: 0b111,
  },
  styleMask: 0x1fff_ffff,
  injectionMask: 0x1fff_ffff,
} as const;

/** Names of the manifest section and WebAssembly imports and exports (docs/abi.md). */
export const names = {
  section: "glisten",
  imports: { module: "env", memory: "memory", base: "base" },
  exports: {
    highlight: "highlight",
    records: "records",
    injections: "injections",
    groups: "groups",
    status: "status",
  },
} as const;
