import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import { byteInRange, i32Or, utf8 } from "./idioms.ts";

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
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { names, hasSpeculation, outerField } = context;
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
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const test = context.member("(local.get $matchByte)", m.set);
  return `(if (i32.lt_u (local.get $matchCursor) (local.get $limit))
    (then
      (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
      (br_if ${fail} ${test})))`;
}

export function lowerLineEnd(
  m: Extract<Matcher, { kind: "lineEnd" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
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
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const test = context.member("(local.get $matchByte)", m.set);
  return `(local.set $matchByte
      (if (result i32) (i32.gt_u (local.get $matchCursor) (local.get $docStart))
        (then (i32.load8_u (i32.sub (i32.add (local.get $input) (local.get $matchCursor)) (i32.const 1))))
        (else (i32.const ${newlineByte}))))
    (br_if ${fail} ${test})`;
}
