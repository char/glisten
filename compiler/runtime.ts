import { memory, record, status as statusCode } from "#/abi/mod.ts";
import { func, global, raw, wat, type Def, type Fragment, type Local } from "#/testing/wat/mod.ts";
import { byteInRange, i32Or, injectionAction, splat, utf8, v128Or } from "./idioms.ts";

const recordWordOffset = raw(`offset=${record.word}`);
const pageShift = Math.log2(memory.pageBytes);
const pageRounding = memory.pageBytes - 1;
const maxAddress = 0xffff_ffff;
const injectionLimit = 1 << record.kindShift;
const lastSegmentFlag = (record.kind.segmentCloses ^ record.kind.segment) << record.kindShift;
const namedInjectionKind = record.kind.opensNamed << record.kindShift;
const staticInjectionKind = record.kind.opensStatic << record.kindShift;
const segmentKind = record.kind.segment << record.kindShift;
const groupKind = record.kind.group << record.kindShift;

function hostStyle(base: Fragment, style: Fragment): Fragment {
  return wat`(i32.load16_u (i32.add ${base} (i32.shl ${style} (i32.const 1))))`;
}

// Callable definitions.

/** Exported resource status and the trap path that sets it. */
export const status = global("status", () => wat`(export "status") (mut i32) (i32.const 0)`);
export const fail = func(
  "fail",
  () => wat`(global.set ${status} (i32.const ${statusCode.resource})) (unreachable)`,
);

/**
 * Checked record writes. The caller owns the base address and the room above it, and refreshes
 * `limit` at the start of each call (`init`), after any growth of its own.
 */
export function recordWriters(options: {
  base: Fragment;
  fail: Def;
  /** The last address at which a record may start; by default, the end of memory. */
  writable?: Fragment;
  reserveOutput?: (end: Fragment) => Fragment;
  /**
   * Run `reserveOutput` only when a write reaches the limit, so it may do nothing but make room.
   * Otherwise it runs before every write, and may also charge for the write.
   */
  lazyReserve?: boolean;
}): { emit: Def; emitRaw: Def; limit: Def; grow: Def; init: Fragment } {
  const { base, fail: failDef, reserveOutput, lazyReserve } = options;
  const limit = global("outLimit", () => wat`(mut i32) (i32.const 0)`);
  const memoryBytes = wat`(i64.shl (i64.extend_i32_u (memory.size)) (i64.const ${pageShift}))`;
  const writable =
    options.writable ?? wat`(i32.sub (i32.wrap_i64 ${memoryBytes}) (i32.const ${record.bytes}))`;
  const refreshLimit = wat`(global.set ${limit} ${writable})`;
  const reserve = reserveOutput?.(wat`(local.get $requiredEnd)`) ?? wat``;
  const pagesToGrow = wat`(i32.wrap_i64
    (i64.shr_u
      (i64.add (i64.sub (local.get $requiredEnd) (local.get $memoryBytes))
        (i64.const ${pageRounding}))
      (i64.const ${pageShift})))`;
  const grow = func(
    "growOutput",
    () => wat`(param $requiredEnd i64)
      (local $memoryBytes i64)
      (if (i64.gt_u (local.get $requiredEnd) (i64.const ${maxAddress})) (then (call ${failDef})))
      ${reserve}
      (local.set $memoryBytes ${memoryBytes})
      (if (i64.gt_u (local.get $requiredEnd) (local.get $memoryBytes))
        (then
          (if (i32.eq (memory.grow ${pagesToGrow}) (i32.const -1))
            (then (call ${failDef})))))
      ${refreshLimit}`,
  );
  const growForRecord = wat`(call ${grow}
    (i64.add (i64.extend_i32_u (local.get $output)) (i64.const ${record.bytes})))`;
  const makeRoom = lazyReserve
    ? wat`(if (i32.ge_u (local.get $output) (global.get ${limit})) (then ${growForRecord}))`
    : growForRecord;
  const body = (styleEncoding: "raw" | "mapped") => {
    const style =
      styleEncoding === "raw" ? wat`(local.get $style)` : hostStyle(base, wat`(local.get $style)`);
    return wat`
      (param $output i32) (param $end i32) (param $style i32) (result i32)
      ${makeRoom}
      (i32.store (local.get $output) (local.get $end))
      (i32.store ${recordWordOffset} (local.get $output) ${style})
      (i32.add (local.get $output) (i32.const ${record.bytes}))`;
  };
  return {
    emit: func("emit", () => body("mapped")),
    emitRaw: func("emitRaw", () => body("raw")),
    limit,
    grow,
    init: refreshLimit,
  };
}

/** Mark an emitted injection segment as the last one, unless its address is -1. */
export const sealHost = func(
  "sealHost",
  () => wat`(param $last i32)
    (if (i32.ne (local.get $last) (i32.const -1))
      (then
        (i32.store ${recordWordOffset}
          (local.get $last)
          (i32.or (i32.load ${recordWordOffset} (local.get $last)) (i32.const ${lastSegmentFlag})))))`,
);

/** Inclusive runs of consecutive bytes. */
export function rangesOf(bytes: readonly number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const byte of bytes) {
    const last = ranges.at(-1);
    if (last && last[1] === byte - 1) last[1] = byte;
    else ranges.push([byte, byte]);
  }
  return ranges;
}

/** Advance over the UTF-8 sequence at start, stopping at limit or the first invalid continuation. */
export const charEnd = func("charEnd", () => {
  const lead = "(local.get $leadByte)";
  const twoByteLead = byteInRange(lead, ...utf8.lead.two);
  const threeByteLead = byteInRange(lead, ...utf8.lead.three);
  const fourByteLead = byteInRange(lead, ...utf8.lead.four);
  const nextByte = "(i32.load8_u (i32.add (local.get $input) (local.get $end)))";
  const [continuationStart, continuationEnd] = utf8.continuation;
  const continuationRangeWidth = continuationEnd - continuationStart;
  const invalidContinuation = `(i32.gt_u
    (i32.sub ${nextByte} (i32.const ${continuationStart}))
    (i32.const ${continuationRangeWidth}))`;
  return raw(`(param $input i32) (param $start i32) (param $limit i32) (result i32)
    (local $leadByte i32) (local $width i32) (local $end i32)
    (local.set $leadByte (i32.load8_u (i32.add (local.get $input) (local.get $start))))
    (local.set $width
      (if (result i32) ${twoByteLead}
        (then (i32.const 2))
        (else
          (if (result i32) ${threeByteLead}
            (then (i32.const 3))
            (else
              (if (result i32) ${fourByteLead}
                (then (i32.const 4))
                (else (i32.const 1))))))))
    (local.set $end (i32.add (local.get $start) (i32.const 1)))
    (block $done (loop $more
      (br_if $done
        (i32.or
          (i32.ge_u (local.get $end) (local.get $limit))
          (i32.ge_u (i32.sub (local.get $end) (local.get $start)) (local.get $width))))
      (br_if $done ${invalidContinuation})
      (local.set $end (i32.add (local.get $end) (i32.const 1)))
      (br $more)))
    (local.get $end)`);
});

/** Scan [pos, end) for sorted, distinct ASCII stops and, optionally, any high byte. */
export function stopScan(name: string, bytes: readonly number[], high: boolean): Def {
  if (
    (!bytes.length && !high) ||
    bytes.some(
      (byte, i) =>
        !Number.isInteger(byte) || byte < 0 || byte >= 128 || (i > 0 && byte <= bytes[i - 1]!),
    )
  )
    throw new Error(
      "Scan stops must be sorted, distinct ASCII bytes; an empty set requires high-byte stops",
    );
  let asciiVector = "";
  if (bytes.length > 0 && bytes.length <= 8) {
    const comparisons = bytes.map((byte) => `(i8x16.eq (local.get $chunk) ${splat(byte)})`);
    asciiVector = v128Or(comparisons);
  } else if (bytes.length > 8) {
    const lowNibbles = Array<number>(16).fill(0);
    const highNibbles = Array<number>(16).fill(0);
    for (const byte of bytes) {
      const low = byte & 15;
      const high = byte >> 4;
      lowNibbles[low] = lowNibbles[low]! | (1 << high);
      highNibbles[high] = 1 << high;
    }
    const lowTable = lowNibbles.join(" ");
    const highTable = highNibbles.join(" ");
    asciiVector = `(i8x16.ne
      (v128.and
        (i8x16.swizzle
          (v128.const i8x16 ${lowTable})
          (v128.and (local.get $chunk) ${splat(15)}))
        (i8x16.swizzle
          (v128.const i8x16 ${highTable})
          (v128.and
            (i16x8.shr_u (local.get $chunk) (i32.const 4))
            ${splat(15)})))
      ${splat(0)})`;
  }

  const scalarTests = rangesOf(bytes).map(([first, last]) =>
    first === last
      ? `(i32.eq (local.get $byte) (i32.const ${first}))`
      : byteInRange("(local.get $byte)", first, last),
  );
  let scalar = i32Or(scalarTests);
  let vector = asciiVector;
  if (high) {
    const highByteVector = `(i8x16.lt_s (local.get $chunk) ${splat(0)})`;
    const highByteScalar = `(i32.ge_u (local.get $byte) (i32.const 128))`;
    vector = v128Or(asciiVector ? [asciiVector, highByteVector] : [highByteVector]);
    scalar = i32Or(scalar ? [scalar, highByteScalar] : [highByteScalar]);
  }
  return func(name, () =>
    raw(`(param $input i32) (param $pos i32) (param $end i32) (result i32)
      (local $chunk v128) (local $mask i32) (local $byte i32)
      (block $done
        (block $tail (loop $vectors
          (br_if $tail (i32.lt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const 16)))
          (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $pos))))
          (local.set $mask (i8x16.bitmask ${vector}))
          (if (local.get $mask)
            (then
              (local.set $pos (i32.add (local.get $pos) (i32.ctz (local.get $mask))))
              (br $done)))
          (local.set $pos (i32.add (local.get $pos) (i32.const 16)))
          (br $vectors)))
        (loop $scalar
          (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
          (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
          (br_if $done ${scalar})
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (br $scalar)))
      (local.get $pos)`),
  );
}

// Inline templates. The caller owns and initializes all locals and globals.

export type PendingSpan = {
  out: Local;
  pendingStyle: Local;
  pendingEnd: Local;
} & ({ pendingAddress: Local } | { pendingAddress?: never });

type InjectedSpan = PendingSpan & { pendingAddress: Local };

/** Write the pending span; the caller guarantees that it is present and unflushed. */
export function emitPending(span: PendingSpan, emit: Def): Fragment {
  const { out, pendingEnd, pendingStyle } = span;
  return wat`(local.set ${out}
    (call ${emit} (local.get ${out}) (local.get ${pendingEnd}) (local.get ${pendingStyle})))`;
}

/** Flush an unflushed pending span without clearing the pending state. */
export function flushSpan(span: PendingSpan, emit: Def): Fragment {
  const { pendingAddress, pendingStyle } = span;
  const pending = pendingAddress
    ? wat`(i32.and
      (i32.ge_s (local.get ${pendingStyle}) (i32.const 0))
      (i32.eq (local.get ${pendingAddress}) (i32.const -1)))`
    : wat`(i32.ge_s (local.get ${pendingStyle}) (i32.const 0))`;
  const write = emitPending(span, emit);
  return wat`(if ${pending} (then ${write}))`;
}

/** Coalesce a span with the current pending span, flushing when its style changes. */
export function coalesce(span: PendingSpan, end: Local, style: Local, emit: Def): Fragment {
  const { pendingAddress, pendingStyle, pendingEnd } = span;
  const clearAddress = pendingAddress ? wat`(local.set ${pendingAddress} (i32.const -1))` : wat``;
  const updateAddress = pendingAddress
    ? wat`(if (i32.ne (local.get ${pendingAddress}) (i32.const -1))
      (then (i32.store (local.get ${pendingAddress}) (local.get ${end}))))`
    : wat``;
  const flush = flushSpan(span, emit);
  return wat`(if (i32.ne (local.get ${pendingStyle}) (local.get ${style}))
      (then ${flush} ${clearAddress}
        (local.set ${pendingStyle} (local.get ${style}))))
    (local.set ${pendingEnd} (local.get ${end}))
    ${updateAddress}`;
}

export type InjectionState = {
  span: InjectedSpan;
  host: Local;
  hostId: Local;
  hostDepth: Local;
  hostLast: Local;
  hostCurrent: Local;
  depth: Local;
  openAction: Local;
  openStart: Local;
  openEnd: Local;
};

/** Open the staged named (action 1) or static (action 2) injection. */
export function openInjection(
  state: InjectionState,
  defs: { emit: Def; emitRaw: Def; fail: Def; injections: Def },
): Fragment {
  const {
    span,
    host,
    hostId,
    hostDepth,
    hostLast,
    hostCurrent,
    depth,
    openAction,
    openStart,
    openEnd,
  } = state;
  const { out, pendingStyle, pendingAddress } = span;
  const { emit, emitRaw, fail: failDef, injections } = defs;
  const writePending = emitPending(span, emit);
  return wat`(if (local.get ${host}) (then (call ${failDef})))
    (if (i32.ge_u (global.get ${injections}) (i32.const ${injectionLimit})) (then (call ${failDef})))
    (if
      (i32.and
        (i32.ge_s (local.get ${pendingStyle}) (i32.const 0))
        (i32.eq (local.get ${pendingAddress}) (i32.const -1)))
      (then
        (local.set ${pendingAddress} (local.get ${out}))
        ${writePending}))
    (local.set ${hostId} (global.get ${injections}))
    (global.set ${injections} (i32.add (global.get ${injections}) (i32.const 1)))
    (if (i32.eq (local.get ${openAction}) (i32.const ${injectionAction.named}))
      (then
        (local.set ${out}
          (call ${emitRaw}
            (local.get ${out})
            (i32.const 0)
            (i32.or (i32.const ${namedInjectionKind}) (local.get ${hostId}))))
        (local.set ${out}
          (call ${emitRaw} (local.get ${out}) (local.get ${openStart}) (local.get ${openEnd}))))
      (else
        (local.set ${out}
          (call ${emitRaw}
            (local.get ${out})
            (local.get ${openStart})
            (i32.or (i32.const ${staticInjectionKind}) (local.get ${hostId}))))))
    (local.set ${host} (i32.const 1))
    (local.set ${hostDepth} (local.get ${depth}))
    (local.set ${hostLast} (i32.const -1))
    (local.set ${hostCurrent} (i32.const -1))
    (local.set ${openAction} (i32.const ${injectionAction.none}))`;
}

/** Extend the current injection segment, or write a new one after flushing text. */
export function emitSegment(
  state: { span: InjectedSpan; hostId: Local; hostLast: Local; hostCurrent: Local },
  end: Local,
  defs: { emit: Def; emitRaw: Def },
): Fragment {
  const { span, hostId, hostLast, hostCurrent } = state;
  const { out, pendingStyle, pendingAddress } = span;
  const { emit, emitRaw } = defs;
  const flush = flushSpan(span, emit);
  return wat`${flush}
    (local.set ${pendingStyle} (i32.const -1))
    (local.set ${pendingAddress} (i32.const -1))
    (if (i32.ne (local.get ${hostCurrent}) (i32.const -1))
      (then (i32.store (local.get ${hostCurrent}) (local.get ${end})))
      (else
        (local.set ${hostCurrent} (local.get ${out}))
        (local.set ${hostLast} (local.get ${out}))
        (local.set ${out}
          (call ${emitRaw}
            (local.get ${out})
            (local.get ${end})
            (i32.or (i32.const ${segmentKind}) (local.get ${hostId}))))))`;
}

/** Emit a nonempty group and clear the pending span and current segment. */
export function emitGroup(
  state: { span: PendingSpan; wrapStyle: Local; wrapStart: Local } & (
    | { hostCurrent: Local; span: InjectedSpan }
    | { hostCurrent?: never; span: PendingSpan & { pendingAddress?: never } }
  ),
  end: Local,
  base: Fragment,
  defs: { emit: Def; emitRaw: Def; groups: Def },
): Fragment {
  const { span, wrapStyle, wrapStart, hostCurrent } = state;
  const { out, pendingStyle, pendingAddress } = span;
  const { emit, emitRaw, groups } = defs;
  const flush = flushSpan(span, emit);
  const mappedStyle = hostStyle(base, wat`(local.get ${wrapStyle})`);
  const clearHost =
    hostCurrent && pendingAddress
      ? wat`(local.set ${pendingAddress} (i32.const -1)) (local.set ${hostCurrent} (i32.const -1))`
      : wat``;
  return wat`(if
    (i32.and
      (i32.ge_s (local.get ${wrapStyle}) (i32.const 0))
      (i32.lt_u (local.get ${wrapStart}) (local.get ${end})))
    (then ${flush}
      (local.set ${pendingStyle} (i32.const -1))
      ${clearHost}
      (local.set ${out}
        (call ${emitRaw}
          (local.get ${out})
          (local.get ${wrapStart})
          (i32.or
            (i32.const ${groupKind})
            ${mappedStyle})))
      (global.set ${groups} (i32.add (global.get ${groups}) (i32.const 1)))))`;
}
