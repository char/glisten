import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";

export function lowerBaseState(
  m: Extract<Matcher, { kind: "baseState" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { names, hasSpeculation, outerField } = context;
  const current = hasSpeculation
    ? `(if (result i32) (local.get $specOpen) (then ${outerField()}) (else (local.get $state)))`
    : "(local.get $state)";
  const matched = m.states
    .map((name) => `(i32.eq ${current} (i32.const ${names.indexOf(name)}))`)
    .reduce((a, b) => `(i32.or ${a} ${b})`, "(i32.const 0)");
  return `(br_if ${fail} (i32.eqz ${matched}))`;
}

export function lowerNotNext(
  m: Extract<Matcher, { kind: "notNext" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { member } = context;
  return `(if (i32.lt_u (local.get $p) (local.get $limit)) (then
          (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
          (br_if ${fail} ${member("(local.get $b)", m.set)})))`;
}

export function lowerLineEnd(
  m: Extract<Matcher, { kind: "lineEnd" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(if (i32.lt_u (local.get $p) (local.get $limit))
          (then (br_if ${fail} (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $p))) (i32.const 10)))))`;
}

export function lowerPreviousChar(
  m: Extract<Matcher, { kind: "previousChar" }>,
  fail: string,
): string {
  const tests = m.ranges.map(([lo, hi]) =>
    lo === hi
      ? `(i32.eq (local.get $b) (i32.const ${lo}))`
      : `(i32.le_u (i32.sub (local.get $b) (i32.const ${lo})) (i32.const ${hi - lo}))`,
  );
  while (tests.length > 1) {
    const next = [];
    for (let i = 0; i < tests.length; i += 2)
      next.push(i + 1 < tests.length ? `(i32.or ${tests[i]} ${tests[i + 1]})` : tests[i]!);
    tests.splice(0, tests.length, ...next);
  }
  const member = tests[0] ?? "(i32.const 0)";
  return `(local.set $b (call $previousChar (local.get $input) (local.get $p) (local.get $docStart)))
    (br_if ${fail} ${m.invert ? member : `(i32.eqz ${member})`})`;
}

export const previousCharFunction = `(func $previousChar (param $input i32) (param $pos i32) (param $start i32) (result i32)
  (local $at i32) (local $first i32) (local $width i32) (local $scalar i32) (local $b i32)
  (if (i32.le_u (local.get $pos) (local.get $start)) (then (return (i32.const 10))))
  (local.set $at (i32.sub (local.get $pos) (i32.const 1)))
  (block $found (loop $back
    (br_if $found (i32.le_u (local.get $at) (local.get $start)))
    (br_if $found (i32.gt_u (i32.sub (local.get $pos) (local.get $at)) (i32.const 3)))
    (br_if $found (i32.ne (i32.and (i32.load8_u (i32.add (local.get $input) (local.get $at))) (i32.const 192)) (i32.const 128)))
    (local.set $at (i32.sub (local.get $at) (i32.const 1)))
    (br $back)))
  (local.set $first (i32.load8_u (i32.add (local.get $input) (local.get $at))))
  (local.set $width (if (result i32) (i32.lt_u (local.get $first) (i32.const 128)) (then (i32.const 1))
    (else (if (result i32) (i32.le_u (i32.sub (local.get $first) (i32.const 194)) (i32.const 29)) (then (i32.const 2))
    (else (if (result i32) (i32.le_u (i32.sub (local.get $first) (i32.const 224)) (i32.const 15)) (then (i32.const 3))
    (else (if (result i32) (i32.le_u (i32.sub (local.get $first) (i32.const 240)) (i32.const 4)) (then (i32.const 4)) (else (i32.const 0))))))))))
  (if (i32.ne (local.get $width) (i32.sub (local.get $pos) (local.get $at))) (then (return (i32.const -1))))
  (local.set $scalar (i32.and (local.get $first) (i32.shr_u (i32.const 127) (if (result i32) (i32.eq (local.get $width) (i32.const 1)) (then (i32.const 0)) (else (local.get $width))))))
  (local.set $at (i32.add (local.get $at) (i32.const 1)))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $at) (local.get $pos)))
    (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $at))))
    (if (i32.ne (i32.and (local.get $b) (i32.const 192)) (i32.const 128)) (then (return (i32.const -1))))
    (local.set $scalar (i32.or (i32.shl (local.get $scalar) (i32.const 6)) (i32.and (local.get $b) (i32.const 63))))
    (local.set $at (i32.add (local.get $at) (i32.const 1)))
    (br $more)))
  (if (i32.or
      (i32.or (i32.and (i32.eq (local.get $width) (i32.const 2)) (i32.lt_u (local.get $scalar) (i32.const 128)))
              (i32.and (i32.eq (local.get $width) (i32.const 3)) (i32.lt_u (local.get $scalar) (i32.const 2048))))
      (i32.or (i32.and (i32.eq (local.get $width) (i32.const 4)) (i32.lt_u (local.get $scalar) (i32.const 65536)))
              (i32.or (i32.le_u (i32.sub (local.get $scalar) (i32.const 55296)) (i32.const 2047)) (i32.gt_u (local.get $scalar) (i32.const 1114111)))))
    (then (return (i32.const -1))))
  (local.get $scalar))`;

export function lowerNotBehind(
  m: Extract<Matcher, { kind: "notBehind" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { member } = context;
  return `(local.set $b (if (result i32) (i32.gt_u (local.get $p) (local.get $docStart))
            (then (i32.load8_u (i32.sub (i32.add (local.get $input) (local.get $p)) (i32.const 1))))
            (else (i32.const 10))))
          (br_if ${fail} ${member("(local.get $b)", m.set)})`;
}
