import { bytesOf, type ByteSet, type Matcher, type SeparatedRun } from "#/grammar/mod.ts";
import { columnValueMask } from "./slots.ts";
import { splat, v128Or, byteInRange, i32Or, utf8 } from "./runtime.ts";
import type { LowerContext } from "./matchers.ts";
import { visitMatchers } from "#/grammar/analysis.ts";

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

export type ByteStep = { byte: number; mask: number };

type One = Extract<Matcher, { kind: "one" }>;
type Run = Extract<Matcher, { kind: "run" }>;
type Member = (byte: string, set: ByteSet) => string;

export function byteStepsOf(matcher: Matcher): ByteStep[] | undefined {
  if (matcher.kind === "literal") {
    return [...new TextEncoder().encode(matcher.text)].map((byte) => ({ byte, mask: 0 }));
  }
  if (matcher.kind === "one") {
    const members = bytesOf(matcher.set);
    if (members.length === 1) return [{ byte: members[0]!, mask: 0 }];
    if (members.length === 2) {
      const diff = members[0]! ^ members[1]!;
      if ((diff & (diff - 1)) === 0) return [{ byte: members[1]!, mask: diff }];
    }
  }
  return undefined;
}

export function lowerByteSteps(steps: readonly ByteStep[], fail: string): string {
  if (steps.length === 0) return "";
  const bounds =
    steps.length === 1
      ? `(i32.ge_u (local.get $matchCursor) (local.get $limit))`
      : `(i32.lt_u (i32.sub (local.get $limit) (local.get $matchCursor)) (i32.const ${steps.length}))`;
  const loads: string[] = [];
  for (let at = 0; at < steps.length;) {
    const width = steps.length - at >= 4 ? 4 : steps.length - at >= 2 ? 2 : 1;
    let expected = 0;
    let mask = 0;
    for (let i = 0; i < width; i++) {
      expected |= steps[at + i]!.byte << (i * 8);
      mask |= steps[at + i]!.mask << (i * 8);
    }
    const load = width === 4 ? "i32.load" : width === 2 ? "i32.load16_u" : "i32.load8_u";
    const loaded = `(${load} offset=${at} (i32.add (local.get $input) (local.get $matchCursor)))`;
    const actual = mask ? `(i32.or ${loaded} (i32.const ${mask}))` : loaded;
    loads.push(`(br_if ${fail} (i32.ne ${actual} (i32.const ${expected})))`);
    at += width;
  }
  return `(br_if ${fail} ${bounds})
    ${loads.join("\n")}
    (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const ${steps.length})))`;
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

function separatedRunFunction(
  name: string,
  matcher: SeparatedRun,
  member: (byte: string, set: ByteSet) => string,
): string {
  const selectedMember = member("(local.get $selected)", matcher.set);
  const separatorMember = member("(local.get $byte)", matcher.separators);
  const minimum = matcher.min;
  return `(func ${name} (param $input i32) (param $cursor i32) (param $limit i32) (result i32)
    (local $selected i32) (local $byte i32) (local $count i32)
    (if (i32.ge_u (local.get $cursor) (local.get $limit)) (then (return (i32.const -1))))
    (local.set $selected (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if (i32.eqz ${selectedMember}) (then (return (i32.const -1))))
    (block $runDone (loop $scanRun
      (br_if $runDone (i32.ge_u (local.get $cursor) (local.get $limit)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (if (i32.eq (local.get $byte) (local.get $selected))
        (then (local.set $count (i32.add (local.get $count) (i32.const 1))))
        (else (br_if $runDone (i32.eqz ${separatorMember}))))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
      (br $scanRun)))
    (if (i32.lt_u (local.get $count) (i32.const ${minimum})) (then (return (i32.const -1))))
    (local.get $cursor))`;
}

export function lowerSeparatedRun(
  m: Extract<Matcher, { kind: "separatedRun" }>,
  fail: string,
  member: Member,
  separatedFunctions: Map<string, { name: string; code: string }>,
): string {
  const key = JSON.stringify(m);
  let entry = separatedFunctions.get(key);
  if (!entry) {
    const name = `$separatedRun${separatedFunctions.size}`;
    const code = separatedRunFunction(name, m, member);
    separatedFunctions.set(key, (entry = { name, code }));
  }
  const name = entry.name;
  return `(local.set $matchCursor (call ${name} (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.eq (local.get $matchCursor) (i32.const -1)))`;
}

const newlineByte = "\n".charCodeAt(0);
const continuationPrefix = 0x80;
const continuationPrefixMask = 0xc0;
const continuationPayloadMask = 0x3f;
const asciiLimit = 0x80;
const asciiPayloadMask = 0x7f;
const minThreeByteScalar = 0x800;
const minFourByteScalar = 0x10000;
const surrogateStart = 0xd800;
const surrogateRangeWidth = 0x7ff;
const maxScalar = 0x10ffff;

const leadByte = "(local.get $leadByte)";
const twoByteLead = byteInRange(leadByte, ...utf8.scalarLead.two);
const threeByteLead = byteInRange(leadByte, ...utf8.scalarLead.three);
const fourByteLead = byteInRange(leadByte, ...utf8.scalarLead.four);

export function lowerBaseState(
  m: Extract<Matcher, { kind: "baseState" }>,
  fail: string,
  names: string[],
  hasSpeculation: boolean,
  outerField: () => string,
): string {
  const outer = hasSpeculation ? outerField() : "";
  const current = hasSpeculation
    ? `(if (result i32) (local.get $specOpen) (then ${outer}) (else (local.get $state)))`
    : "(local.get $state)";
  const tests = m.states.map((name) => {
    const index = names.indexOf(name);
    return `(i32.eq ${current} (i32.const ${index}))`;
  });
  const matched = i32Or(tests, "(i32.const 0)");
  return `(br_if ${fail} (i32.eqz ${matched}))`;
}

export function lowerNotNext(
  m: Extract<Matcher, { kind: "notNext" }>,
  fail: string,
  member: Member,
): string {
  const test = member("(local.get $matchByte)", m.set);
  return `(if (i32.lt_u (local.get $matchCursor) (local.get $limit))
    (then
      (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
      (br_if ${fail} ${test})))`;
}

export function lowerLineEnd(fail: string): string {
  return `(if (i32.lt_u (local.get $matchCursor) (local.get $limit))
    (then
      (br_if ${fail}
        (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))) (i32.const ${newlineByte})))))`;
}

export function lowerPreviousChar(
  m: Extract<Matcher, { kind: "previousChar" }>,
  fail: string,
): string {
  const tests = m.ranges.map(([lo, hi]) => {
    return lo === hi
      ? `(i32.eq (local.get $matchByte) (i32.const ${lo}))`
      : byteInRange("(local.get $matchByte)", lo, hi);
  });
  while (tests.length > 1) {
    const next = [];
    for (let i = 0; i < tests.length; i += 2) {
      const left = tests[i]!;
      const right = tests[i + 1];
      next.push(right === undefined ? left : `(i32.or ${left} ${right})`);
    }
    tests.splice(0, tests.length, ...next);
  }
  const member = tests[0] ?? "(i32.const 0)";
  const rejected = m.invert ? member : `(i32.eqz ${member})`;
  return `(local.set $matchByte
      (call $previousChar (local.get $input) (local.get $matchCursor) (local.get $docStart)))
    (br_if ${fail} ${rejected})`;
}

export const previousCharFunction = `(func $previousChar (param $input i32) (param $end i32)
  (param $start i32) (result i32)
  (local $cursor i32) (local $leadByte i32) (local $width i32) (local $scalar i32) (local $byte i32)
  (if (i32.le_u (local.get $end) (local.get $start)) (then (return (i32.const ${newlineByte}))))
  (local.set $cursor (i32.sub (local.get $end) (i32.const 1)))
  (block $found (loop $back
    (br_if $found (i32.le_u (local.get $cursor) (local.get $start)))
    (br_if $found (i32.gt_u (i32.sub (local.get $end) (local.get $cursor)) (i32.const 3)))
    (br_if $found
      (i32.ne
        (i32.and (i32.load8_u (i32.add (local.get $input) (local.get $cursor))) (i32.const ${continuationPrefixMask}))
        (i32.const ${continuationPrefix})))
    (local.set $cursor (i32.sub (local.get $cursor) (i32.const 1)))
    (br $back)))
  (local.set $leadByte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
  (local.set $width
    (if (result i32) (i32.lt_u (local.get $leadByte) (i32.const ${asciiLimit}))
      (then (i32.const 1))
      (else
        (if (result i32) ${twoByteLead}
          (then (i32.const 2))
          (else
            (if (result i32) ${threeByteLead}
              (then (i32.const 3))
              (else
                (if (result i32)
                  ${fourByteLead}
                  (then (i32.const 4))
                  (else (i32.const 0))))))))))
  (if (i32.ne (local.get $width) (i32.sub (local.get $end) (local.get $cursor)))
    (then (return (i32.const -1))))
  (local.set $scalar
    (i32.and
      (local.get $leadByte)
      (i32.shr_u
        (i32.const ${asciiPayloadMask})
        (if (result i32) (i32.eq (local.get $width) (i32.const 1))
          (then (i32.const 0))
          (else (local.get $width))))))
  (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $cursor) (local.get $end)))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if (i32.ne (i32.and (local.get $byte) (i32.const ${continuationPrefixMask})) (i32.const ${continuationPrefix}))
      (then (return (i32.const -1))))
    (local.set $scalar
      (i32.or (i32.shl (local.get $scalar) (i32.const 6)) (i32.and (local.get $byte) (i32.const ${continuationPayloadMask}))))
    (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
    (br $more)))
  (if
    (i32.or
      (i32.or
        (i32.and
          (i32.eq (local.get $width) (i32.const 2))
          (i32.lt_u (local.get $scalar) (i32.const ${asciiLimit})))
        (i32.and
          (i32.eq (local.get $width) (i32.const 3))
          (i32.lt_u (local.get $scalar) (i32.const ${minThreeByteScalar}))))
      (i32.or
        (i32.and
          (i32.eq (local.get $width) (i32.const 4))
          (i32.lt_u (local.get $scalar) (i32.const ${minFourByteScalar})))
        (i32.or
          (i32.le_u (i32.sub (local.get $scalar) (i32.const ${surrogateStart})) (i32.const ${surrogateRangeWidth}))
          (i32.gt_u (local.get $scalar) (i32.const ${maxScalar})))))
    (then (return (i32.const -1))))
  (local.get $scalar))`;

export function lowerNotBehind(
  m: Extract<Matcher, { kind: "notBehind" }>,
  fail: string,
  member: Member,
): string {
  const test = member("(local.get $matchByte)", m.set);
  return `(local.set $matchByte
      (if (result i32) (i32.gt_u (local.get $matchCursor) (local.get $docStart))
        (then (i32.load8_u (i32.sub (i32.add (local.get $input) (local.get $matchCursor)) (i32.const 1))))
        (else (i32.const ${newlineByte}))))
    (br_if ${fail} ${test})`;
}

type Shape = { consumes: boolean; newline: boolean; crosses: boolean };
const empty: Shape = { consumes: false, newline: false, crosses: false };
const unknown: Shape = { consumes: true, newline: true, crosses: true };

/** Conservatively determine whether a consuming matcher sequence can cross a physical line. */
function mayCrossLine(matchers: readonly Matcher[]): boolean {
  const shapes = new Map<Matcher, Shape>();
  function join(left: Shape, right: Shape): Shape {
    return {
      consumes: left.consumes || right.consumes,
      newline: left.newline || right.newline,
      crosses: left.crosses || right.crosses || (left.newline && right.consumes),
    };
  }
  function sequence(items: readonly Matcher[]): Shape {
    return items.reduce((left, item) => join(left, shapes.get(item)!), empty);
  }
  function shape(item: Matcher): Shape {
    switch (item.kind) {
      case "literal": {
        const bytes = new TextEncoder().encode(item.text);
        return {
          consumes: bytes.length > 0,
          newline: bytes.includes(newlineByte),
          crosses: bytes.subarray(0, Math.max(0, bytes.length - 1)).includes(newlineByte),
        };
      }
      case "one":
        return { consumes: true, newline: bytesOf(item.set).includes(newlineByte), crosses: false };
      case "character":
        return { consumes: true, newline: true, crosses: false };
      case "run": {
        const consumes = item.max !== 0;
        const newline = consumes && bytesOf(item.set).includes(newlineByte);
        return { consumes, newline, crosses: newline && (item.max === undefined || item.max > 1) };
      }
      case "toColumn":
        return { consumes: true, newline: false, crosses: false };
      case "either": {
        const alternatives = item.alternatives.map(sequence);
        return {
          consumes: alternatives.some((s) => s.consumes),
          newline: alternatives.some((s) => s.newline),
          crosses: alternatives.some((s) => s.crosses),
        };
      }
      case "opt":
        return sequence(item.matchers);
      case "repeat": {
        const inner = sequence(item.matchers);
        return { ...inner, crosses: inner.crosses || (inner.newline && inner.consumes) };
      }
      case "cachedPrefix": {
        const first: Shape = {
          consumes: true,
          newline: bytesOf(item.first).includes(newlineByte),
          crosses: false,
        };
        const newline = bytesOf(item.rest).includes(newlineByte);
        const rest: Shape = { consumes: true, newline, crosses: newline };
        const suffix = sequence(item.suffix);
        return join(join(first, rest), suffix);
      }
      case "separatedRun": {
        const newline =
          bytesOf(item.set).includes(newlineByte) || bytesOf(item.separators).includes(newlineByte);
        return { consumes: true, newline, crosses: newline };
      }
      case "sameRun":
      case "captured":
      case "queueText":
      case "queueFooter":
      case "group":
        return unknown;
      case "baseState":
      case "counterZero":
      case "counterPositive":
      case "ahead":
      case "notAhead":
      case "notNext":
      case "notBehind":
      case "previousChar":
      case "lineEnd":
      case "columnAtLeast":
      case "queueHas":
        return empty;
    }
  }
  visitMatchers(
    matchers,
    (item) => item.kind !== "ahead" && item.kind !== "notAhead",
    (item) => shapes.set(item, shape(item)),
  );
  return sequence(matchers).crosses;
}

/** Check the bytes before the last consumed byte for a newline. */
export const crossesLineFunction = `(func $crossesLine (param $input i32) (param $cursor i32)
  (param $end i32) (result i32)
  (block $done (loop $scanNext
    (br_if $done (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
    (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $cursor))) (i32.const ${newlineByte}))
      (then (return (i32.const 1))))
    (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
    (br $scanNext)))
  (i32.const 0))`;

/** Emit a branch only when the match cannot be proved line-local. */
export function lineBoundaryCheck(matchers: readonly Matcher[], failure: string): string {
  return mayCrossLine(matchers)
    ? `(br_if ${failure} (call $crossesLine (local.get $input) (local.get $pos) (local.get $matchCursor)))`
    : "";
}
