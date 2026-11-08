import { bytesOf, type ByteSet, type Matcher } from "#/grammar/mod.ts";
import { columnValueMask } from "./column.ts";
import { splat, v128Or } from "./idioms.ts";

const vectorBytes = 16;
const byteMax = 0xff;
const nibbleBits = 4;
const nibbleValues = 1 << nibbleBits;
const nibbleMask = nibbleValues - 1;
const bitsPerByte = 8;
const byteBitMask = bitsPerByte - 1;
const highNibbleHalfShift = 7;
const highNibbleHalfBits = 3;
const vectorLaneMask = (1 << vectorBytes) - 1;
/** Space through tilde: the bytes that always advance the column by exactly one. */
const printableAscii = { first: 0x20, count: 0x7f - 0x20 };
/** Below this bound, counting against the run's start is as cheap as clamping its end. */
const clampedBoundMinimum = 4;

type Literal = Extract<Matcher, { kind: "literal" }>;
type One = Extract<Matcher, { kind: "one" }>;
type Run = Extract<Matcher, { kind: "run" }>;
type Member = (byte: string, set: ByteSet) => string;

export function lowerLiteral(m: Literal, fail: string): string {
  const bytes = [...new TextEncoder().encode(m.text)];
  const loads: string[] = [];
  for (let at = 0; at < bytes.length;) {
    const width = bytes.length - at >= 4 ? 4 : bytes.length - at >= 2 ? 2 : 1;
    const value = bytes.slice(at, at + width).reduceRight((v, b) => v * 256 + b, 0) | 0;
    const load = width === 4 ? "i32.load" : width === 2 ? "i32.load16_u" : "i32.load8_u";
    const offset = `offset=${at}`;
    loads.push(
      `(br_if ${fail}
        (i32.ne
          (${load} ${offset} (i32.add (local.get $input) (local.get $matchCursor)))
          (i32.const ${value})))`,
    );
    at += width;
  }
  const length = bytes.length;
  const comparisons = loads.join("\n");
  return `(br_if ${fail}
      (i32.lt_u (i32.sub (local.get $limit) (local.get $matchCursor)) (i32.const ${length})))
    ${comparisons}
    (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const ${length})))`;
}

export function lowerOne(m: One, fail: string, member: Member): string {
  const isMember = member("(local.get $matchByte)", m.set);
  return `(br_if ${fail} (i32.ge_u (local.get $matchCursor) (local.get $limit)))
    (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
    (br_if ${fail} (i32.eqz ${isMember}))
    (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))`;
}

export function lowerCharacter(fail: string): string {
  return `(br_if ${fail} (i32.ge_u (local.get $matchCursor) (local.get $limit)))
    (local.set $matchCursor (call $charEnd (local.get $input) (local.get $matchCursor) (local.get $limit)))`;
}

export function lowerRun(
  m: Run,
  fail: string,
  context: {
    member: Member;
    fresh: (hint: string) => string;
    save: () => string;
    rangesOf: (bytes: number[]) => [number, number][];
    runFunctions: Map<string, { name: string; code: string }>;
    runCounts: Map<string, number>;
  },
): string {
  const { member, fresh, save, rangesOf, runFunctions, runCounts } = context;
  const { min, max } = m;
  const bytes = bytesOf(m.set);
  const key = bytes.join(",");
  if (m.untilColumn !== undefined) {
    const start = save();
    const done = fresh("columnRun");
    const more = `${done}_more`;
    const maximum =
      max === undefined
        ? ""
        : `(br_if ${done} (i32.ge_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${max})))`;
    const minimum = min
      ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${min})))`
      : "";
    const isMember = member("(local.get $matchByte)", m.set);
    const columnLimit = m.untilColumn;
    // Printable ASCII is one column wide, so only other bytes need the full column step.
    const isPrintableAscii = `(i32.lt_u (i32.sub (local.get $matchByte) (i32.const ${printableAscii.first})) (i32.const ${printableAscii.count}))`;
    return `(local.set ${start} (local.get $matchCursor))
      (local.set $matchColumn
        (call $advanceColumn (local.get $input) (local.get $pos) (local.get $matchCursor) (local.get $column)))
      (block ${done} (loop ${more}
        (br_if ${done} (i32.ge_u (local.get $matchCursor) (local.get $limit)))
        ${maximum}
        (br_if ${done}
          (i64.ge_u
            (i64.and (local.get $matchColumn) (i64.const ${columnValueMask}))
            (i64.const ${columnLimit})))
        (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
        (br_if ${done} (i32.eqz ${isMember}))
        (local.set $matchColumn
          (if (result i64) ${isPrintableAscii}
            (then (i64.add (i64.and (local.get $matchColumn) (i64.const ${columnValueMask})) (i64.const 1)))
            (else
              (call $advanceColumn
                (local.get $input)
                (local.get $matchCursor)
                (i32.add (local.get $matchCursor) (i32.const 1))
                (local.get $matchColumn)))))
        (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
        (br ${more})))
      ${minimum}`;
  }
  // An empty byte set cannot benefit from a vector scan.
  if ((max === undefined || max >= vectorBytes) && bytes.some((b) => b <= byteMax)) {
    const vectorKey = `simd:${key}`;
    let fn = runFunctions.get(vectorKey);
    if (!fn) {
      const name = `$run${runFunctions.size}`;
      const eligibleBytes = bytes.filter((b) => b <= byteMax);
      const vector =
        eligibleBytes.length <= 8
          ? v128Or(eligibleBytes.map((b) => `(i8x16.eq (local.get $chunk) ${splat(b)})`))
          : (() => {
              const low = [Array(nibbleValues).fill(0), Array(nibbleValues).fill(0)];
              for (const byte of eligibleBytes) {
                const half = byte >> highNibbleHalfShift;
                const lowNibble = byte & nibbleMask;
                const highBit = (byte >> nibbleBits) & byteBitMask;
                low[half]![lowNibble] |= 1 << highBit;
              }
              const high = [Array(nibbleValues).fill(0), Array(nibbleValues).fill(0)];
              for (let nibble = 0; nibble < nibbleValues; nibble++) {
                high[nibble >> highNibbleHalfBits]![nibble] = 1 << (nibble & byteBitMask);
              }
              const part = (i: number) => {
                const lowTable = low[i]!.join(" ");
                const highTable = high[i]!.join(" ");
                return `(v128.and
                  (i8x16.swizzle (v128.const i8x16 ${lowTable}) (local.get $lo))
                  (i8x16.swizzle (v128.const i8x16 ${highTable}) (local.get $hi)))`;
              };
              const lowHalf = part(0);
              const highHalf = part(1);
              return `(i8x16.ne (v128.or ${lowHalf} ${highHalf}) ${splat(0)})`;
            })();
      const isMember = member("(local.get $matchByte)", m.set);
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $matchCursor i32) (param $limit i32) (result i32)
          (local $matchByte i32) (local $mask i32) (local $chunk v128) (local $lo v128) (local $hi v128)
          (block $done
            (block $tail (loop $vectors
              (br_if $tail (i32.lt_u (i32.sub (local.get $limit) (local.get $matchCursor)) (i32.const ${vectorBytes})))
              (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $matchCursor))))
              (local.set $lo (v128.and (local.get $chunk) ${splat(nibbleMask)}))
              (local.set $hi
                (v128.and
                  (i16x8.shr_u (local.get $chunk) (i32.const ${nibbleBits}))
                  ${splat(nibbleMask)}))
              (local.set $mask (i32.xor (i8x16.bitmask ${vector}) (i32.const ${vectorLaneMask})))
              (if (local.get $mask)
                (then
                  (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.ctz (local.get $mask))))
                  (br $done)))
              (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const ${vectorBytes})))
              (br $vectors)))
            (loop $scalar
              (br_if $done (i32.ge_u (local.get $matchCursor) (local.get $limit)))
              (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
              (br_if $done (i32.eqz ${isMember}))
              (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
              (br $scalar)))
          (local.get $matchCursor))`,
      };
      runFunctions.set(vectorKey, fn);
    }
    const start = min ? save() : undefined;
    const end =
      max === undefined
        ? "(local.get $limit)"
        : `(if (result i32)
          (i32.lt_u (i32.sub (local.get $limit) (local.get $matchCursor)) (i32.const ${max}))
          (then (local.get $limit))
          (else (i32.add (local.get $matchCursor) (i32.const ${max}))))`;
    const saveStart = start ? `(local.set ${start} (local.get $matchCursor))` : "";
    const minimum = min;
    const checkMinimum = start
      ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${minimum})))`
      : "";
    const name = fn.name;
    return `${saveStart}
      (local.set $matchCursor (call ${name} (local.get $input) (local.get $matchCursor) ${end}))
      ${checkMinimum}`;
  }
  // Nix size experiment: share reused multi-range runs, leaving simple classes inline.
  if (max === undefined && (runCounts.get(key) ?? 0) >= 2 && rangesOf(bytesOf(m.set)).length >= 4) {
    let fn = runFunctions.get(key);
    if (!fn) {
      const name = `$run${runFunctions.size}`;
      const isMember = member("(local.get $matchByte)", m.set);
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $matchCursor i32) (param $limit i32) (result i32)
          (local $matchByte i32)
          (block $done (loop $more
            (br_if $done (i32.ge_u (local.get $matchCursor) (local.get $limit)))
            (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
            (br_if $done (i32.eqz ${isMember}))
            (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
            (br $more)))
          (local.get $matchCursor))`,
      };
      runFunctions.set(key, fn);
    }
    const start = min ? save() : undefined;
    const saveStart = start ? `(local.set ${start} (local.get $matchCursor))` : "";
    const minimum = min;
    const checkMinimum = start
      ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${minimum})))`
      : "";
    const name = fn.name;
    return `${saveStart}
      (local.set $matchCursor (call ${name} (local.get $input) (local.get $matchCursor) (local.get $limit)))
      ${checkMinimum}`;
  }
  const start = save();
  const done = fresh("run");
  const more = `${done}_more`;
  // A long bound is clamped to the limit once, so the loop tests a single end per byte.
  const clampedEnd = max !== undefined && max >= clampedBoundMinimum ? save() : undefined;
  const clampEnd = clampedEnd
    ? `(local.set ${clampedEnd}
        (if (result i32) (i32.gt_u (i32.add (local.get $matchCursor) (i32.const ${max})) (local.get $limit))
          (then (local.get $limit))
          (else (i32.add (local.get $matchCursor) (i32.const ${max})))))`
    : "";
  const end = clampedEnd ?? "$limit";
  const maximum =
    max === undefined || clampedEnd
      ? ""
      : `(br_if ${done} (i32.ge_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${max})))`;
  const minimum = min
    ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $matchCursor) (local.get ${start})) (i32.const ${min})))`
    : "";
  const isMember = member("(local.get $matchByte)", m.set);
  return `(local.set ${start} (local.get $matchCursor))
    ${clampEnd}
    (block ${done} (loop ${more}
      (br_if ${done} (i32.ge_u (local.get $matchCursor) (local.get ${end})))
      ${maximum}
      (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
      (br_if ${done} (i32.eqz ${isMember}))
      (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
      (br ${more})))
    ${minimum}`;
}
