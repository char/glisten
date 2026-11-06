import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import type { ByteSet } from "#/grammar/mod.ts";
import type { SeparatedRun } from "#/grammar/separated_run.ts";

export function separatedRunFunctions() {
  return new Map<string, { name: string; code: string }>();
}

export function separatedRunFunction(
  name: string,
  matcher: SeparatedRun,
  member: (byte: string, set: ByteSet) => string,
): string {
  return `(func ${name} (param $input i32) (param $p i32) (param $limit i32) (result i32)
            (local $selected i32) (local $b i32) (local $count i32)
            (if (i32.ge_u (local.get $p) (local.get $limit)) (then (return (i32.const -1))))
            (local.set $selected (i32.load8_u (i32.add (local.get $input) (local.get $p))))
            (if (i32.eqz ${member("(local.get $selected)", matcher.set)}) (then (return (i32.const -1))))
            (block $done (loop $next
              (br_if $done (i32.ge_u (local.get $p) (local.get $limit)))
              (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
              (if (i32.eq (local.get $b) (local.get $selected))
                (then (local.set $count (i32.add (local.get $count) (i32.const 1))))
                (else (br_if $done (i32.eqz ${member("(local.get $b)", matcher.separators)}))))
              (local.set $p (i32.add (local.get $p) (i32.const 1)))
              (br $next)))
            (if (i32.lt_u (local.get $count) (i32.const ${matcher.min})) (then (return (i32.const -1))))
            (local.get $p))`;
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
  return `(local.set $p (call ${entry.name} (local.get $input) (local.get $p) (local.get $limit)))
          (br_if ${fail} (i32.eq (local.get $p) (i32.const -1)))`;
}
