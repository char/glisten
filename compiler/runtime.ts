import { func, global, raw, wat, type Def, type Fragment, type Local } from "#/testing/wat/mod.ts";

// Callable definitions.

/** Exported resource status and the trap path that sets it. */
export const status = global("status", () => wat`(export "status") (mut i32) (i32.const 0)`);
export const fail = func("fail", () => wat`(global.set ${status} (i32.const 1)) (unreachable)`);

/** Checked record writes. The caller owns the base address and any overlapping scratch. */
export function recordWriters(options: {
  base: Fragment;
  fail: Def;
  reserveOutput?: (end: Fragment) => Fragment;
}): { emit: Def; emitRaw: Def } {
  const reserve = options.reserveOutput?.(wat`(local.get $need)`) ?? wat``;
  const body = (rawStyle: boolean) => wat`
    (param $out i32) (param $end i32) (param $style i32) (result i32)
    (local $need i64) (local $available i64)
    (local.set $need (i64.add (i64.extend_i32_u (local.get $out)) (i64.const 8)))
    (if (i64.gt_u (local.get $need) (i64.const 4294967295)) (then (call ${options.fail})))
    ${reserve}
    (local.set $available (i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16)))
    (if (i64.gt_u (local.get $need) (local.get $available)) (then
      (if (i32.eq (memory.grow (i32.wrap_i64 (i64.shr_u (i64.add (i64.sub (local.get $need) (local.get $available)) (i64.const 65535)) (i64.const 16)))) (i32.const -1))
        (then (call ${options.fail})))))
    (i32.store (local.get $out) (local.get $end))
    (i32.store offset=4 (local.get $out) ${rawStyle ? wat`(local.get $style)` : wat`(i32.load16_u (i32.add ${options.base} (i32.shl (local.get $style) (i32.const 1))))`})
    (i32.add (local.get $out) (i32.const 8))`;
  return {
    emit: func("emit", () => body(false)),
    emitRaw: func("emitRaw", () => body(true)),
  };
}

/** Mark an emitted injection segment as the last one, unless its address is -1. */
export const sealHost = func(
  "sealHost",
  () => wat`(param $last i32)
    (if (i32.ne (local.get $last) (i32.const -1)) (then
      (i32.store offset=4 (local.get $last) (i32.or (i32.load offset=4 (local.get $last)) (i32.const 536870912)))))`,
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

/** Advance over the UTF-8 sequence at p, stopping at limit or the first invalid continuation. */
export const charEnd = func("charEnd", () =>
  raw(`(param $input i32) (param $p i32) (param $limit i32) (result i32)
    (local $b i32) (local $width i32) (local $end i32)
    (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
    (local.set $width (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 192)) (i32.const 31)) (then (i32.const 2))
      (else (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 224)) (i32.const 15)) (then (i32.const 3))
      (else (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 240)) (i32.const 7)) (then (i32.const 4)) (else (i32.const 1))))))))
    (local.set $end (i32.add (local.get $p) (i32.const 1)))
    (block $done (loop $more
      (br_if $done (i32.or (i32.ge_u (local.get $end) (local.get $limit)) (i32.ge_u (i32.sub (local.get $end) (local.get $p)) (local.get $width))))
      (br_if $done (i32.gt_u (i32.sub (i32.load8_u (i32.add (local.get $input) (local.get $end))) (i32.const 128)) (i32.const 63)))
      (local.set $end (i32.add (local.get $end) (i32.const 1))) (br $more)))
    (local.get $end)`),
);

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
  // lowerings-scan: splat compares up to eight stop bytes, nibble tables beyond.
  const asciiVector =
    bytes.length === 0
      ? ""
      : bytes.length <= 8
        ? bytes
            .map((b) => `(i8x16.eq (local.get $chunk) (i8x16.splat (i32.const ${b})))`)
            .reduce((a, b) => `(v128.or ${a} ${b})`)
        : (() => {
            const lo = Array(16).fill(0);
            const hi = Array(16).fill(0);
            for (const b of bytes) {
              lo[b & 15] |= 1 << (b >> 4);
              hi[b >> 4] = 1 << (b >> 4);
            }
            return `(i8x16.ne (v128.and
            (i8x16.swizzle (v128.const i8x16 ${lo.join(" ")}) (v128.and (local.get $chunk) (i8x16.splat (i32.const 15))))
            (i8x16.swizzle (v128.const i8x16 ${hi.join(" ")}) (v128.and (i16x8.shr_u (local.get $chunk) (i32.const 4)) (i8x16.splat (i32.const 15)))))
            (i8x16.splat (i32.const 0)))`;
          })();
  const asciiScalar = rangesOf(bytes)
    .map(([lo, hi]) =>
      lo === hi
        ? `(i32.eq (local.get $b) (i32.const ${lo}))`
        : `(i32.le_u (i32.sub (local.get $b) (i32.const ${lo})) (i32.const ${hi - lo}))`,
    )
    .reduce((a, b) => (a ? `(i32.or ${a} ${b})` : b), "");
  const vectorHigh = `(i8x16.lt_s (local.get $chunk) (i8x16.splat (i32.const 0)))`;
  const vector = high
    ? asciiVector
      ? `(v128.or ${asciiVector} ${vectorHigh})`
      : vectorHigh
    : asciiVector;
  const scalarHigh = `(i32.ge_u (local.get $b) (i32.const 128))`;
  const scalar = high
    ? asciiScalar
      ? `(i32.or ${asciiScalar} ${scalarHigh})`
      : scalarHigh
    : asciiScalar;
  return func(name, () =>
    raw(`(param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $chunk v128) (local $mask i32) (local $b i32)
    (block $done
      (block $tail (loop $vectors
        (br_if $tail (i32.lt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const 16)))
        (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $pos))))
        (local.set $mask (i8x16.bitmask ${vector}))
        (if (local.get $mask) (then (local.set $pos (i32.add (local.get $pos) (i32.ctz (local.get $mask)))) (br $done)))
        (local.set $pos (i32.add (local.get $pos) (i32.const 16)))
        (br $vectors)))
      (loop $scalar
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
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
  return wat`(local.set ${span.out} (call ${emit} (local.get ${span.out}) (local.get ${span.pendingEnd}) (local.get ${span.pendingStyle})))`;
}

/** Flush an unflushed pending span without clearing the pending state. */
export function flushSpan(span: PendingSpan, emit: Def): Fragment {
  const pending = span.pendingAddress
    ? wat`(i32.and (i32.ge_s (local.get ${span.pendingStyle}) (i32.const 0)) (i32.eq (local.get ${span.pendingAddress}) (i32.const -1)))`
    : wat`(i32.ge_s (local.get ${span.pendingStyle}) (i32.const 0))`;
  return wat`(if ${pending} (then ${emitPending(span, emit)}))`;
}

/** Coalesce a span with the current pending span, flushing when its style changes. */
export function coalesce(span: PendingSpan, end: Local, style: Local, emit: Def): Fragment {
  return wat`(if (i32.ne (local.get ${span.pendingStyle}) (local.get ${style})) (then
    ${flushSpan(span, emit)}
    ${span.pendingAddress ? wat`(local.set ${span.pendingAddress} (i32.const -1))` : wat``}
    (local.set ${span.pendingStyle} (local.get ${style}))))
    (local.set ${span.pendingEnd} (local.get ${end}))
    ${
      span.pendingAddress
        ? wat`(if (i32.ne (local.get ${span.pendingAddress}) (i32.const -1)) (then
      (i32.store (local.get ${span.pendingAddress}) (local.get ${end}))))`
        : wat``
    }`;
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
  return wat`(if (local.get ${host}) (then (call ${defs.fail})))
    (if (i32.ge_u (global.get ${defs.injections}) (i32.const 536870912)) (then (call ${defs.fail})))
    (if (i32.and (i32.ge_s (local.get ${span.pendingStyle}) (i32.const 0)) (i32.eq (local.get ${span.pendingAddress}) (i32.const -1))) (then
      (local.set ${span.pendingAddress} (local.get ${span.out}))
      ${emitPending(span, defs.emit)}))
    (local.set ${hostId} (global.get ${defs.injections}))
    (global.set ${defs.injections} (i32.add (global.get ${defs.injections}) (i32.const 1)))
    (if (i32.eq (local.get ${openAction}) (i32.const 1))
      (then
        (local.set ${span.out} (call ${defs.emitRaw} (local.get ${span.out}) (i32.const 0) (i32.or (i32.const -536870912) (local.get ${hostId}))))
        (local.set ${span.out} (call ${defs.emitRaw} (local.get ${span.out}) (local.get ${openStart}) (local.get ${openEnd}))))
      (else
        (local.set ${span.out} (call ${defs.emitRaw} (local.get ${span.out}) (local.get ${openStart}) (i32.or (i32.const -1073741824) (local.get ${hostId}))))))
    (local.set ${host} (i32.const 1))
    (local.set ${hostDepth} (local.get ${depth}))
    (local.set ${hostLast} (i32.const -1))
    (local.set ${hostCurrent} (i32.const -1))
    (local.set ${openAction} (i32.const 0))`;
}

/** Extend the current injection segment, or write a new one after flushing text. */
export function emitSegment(
  state: { span: InjectedSpan; hostId: Local; hostLast: Local; hostCurrent: Local },
  end: Local,
  defs: { emit: Def; emitRaw: Def },
): Fragment {
  const { span, hostId, hostLast, hostCurrent } = state;
  return wat`${flushSpan(span, defs.emit)}
    (local.set ${span.pendingStyle} (i32.const -1))
    (local.set ${span.pendingAddress} (i32.const -1))
    (if (i32.ne (local.get ${hostCurrent}) (i32.const -1))
      (then (i32.store (local.get ${hostCurrent}) (local.get ${end})))
      (else
        (local.set ${hostCurrent} (local.get ${span.out}))
        (local.set ${hostLast} (local.get ${span.out}))
        (local.set ${span.out} (call ${defs.emitRaw} (local.get ${span.out}) (local.get ${end}) (i32.or (i32.const -2147483648) (local.get ${hostId}))))))`;
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
  return wat`(if (i32.and (i32.ge_s (local.get ${wrapStyle}) (i32.const 0)) (i32.lt_u (local.get ${wrapStart}) (local.get ${end}))) (then
    ${flushSpan(span, defs.emit)}
    (local.set ${span.pendingStyle} (i32.const -1))
    ${hostCurrent && span.pendingAddress ? wat`(local.set ${span.pendingAddress} (i32.const -1)) (local.set ${hostCurrent} (i32.const -1))` : wat``}
    (local.set ${span.out} (call ${defs.emitRaw} (local.get ${span.out}) (local.get ${wrapStart})
      (i32.or (i32.const 1073741824) (i32.load16_u (i32.add ${base} (i32.shl (local.get ${wrapStyle}) (i32.const 1)))))))
    (global.set ${defs.groups} (i32.add (global.get ${defs.groups}) (i32.const 1)))))`;
}
