import type { ByteSet, Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import type { SeparatedRun } from "#/grammar/separated_run.ts";

export function separatedRunFunctions() {
  return new Map<string, { name: string; code: string }>();
}

export function separatedRunFunction(
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
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { member, separatedFunctions } = context;
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
