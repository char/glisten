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
