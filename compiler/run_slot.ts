import type { Matcher } from "#/grammar/mod.ts";
import type { RunRelation } from "#/grammar/run_slot.ts";
import type { LowerContext } from "./matcher.ts";
import type { ArmEffectLowering } from "./arm_effect.ts";

export const lowerCaptureRun: ArmEffectLowering<"captureRun"> = (effect, context) => {
  context.captures.push(captureRunCode(context.runSlots.get(effect.slot.name)!));
};
/** Lower capture to a backward scan within the already-matched token. */
export function captureRunCode(index: number): string {
  return `(local.set $runByte${index} (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $p) (i32.const 1)))))
    (local.set $runAt (i32.sub (local.get $p) (i32.const 1)))
    (block $runCaptured (loop $runCapture
      (br_if $runCaptured (i32.le_u (local.get $runAt) (local.get $pos)))
      (br_if $runCaptured (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $runAt) (i32.const 1)))) (local.get $runByte${index})))
      (local.set $runAt (i32.sub (local.get $runAt) (i32.const 1)))
      (br $runCapture)))
    (local.set $runLength${index} (i32.sub (local.get $p) (local.get $runAt)))`;
}

/** Lower a saved run match to a bounded byte loop and length comparison. */
export function matchRunCode(
  index: number,
  fail: string,
  start: string,
  done: string,
  relation: RunRelation = "atLeast",
): string {
  return `(br_if ${fail} (i32.eqz (local.get $runLength${index})))
    (local.set ${start} (local.get $p))
    (block ${done} (loop ${done}_more
      ${relation === "prefix" ? `(br_if ${done} (i32.ge_u (i32.sub (local.get $p) (local.get ${start})) (local.get $runLength${index})))` : ""}
      (br_if ${done} (i32.ge_u (local.get $p) (local.get $limit)))
      (br_if ${done} (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $p))) (local.get $runByte${index})))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (br ${done}_more)))
    (br_if ${fail} (${relation === "exact" ? "i32.ne" : "i32.lt_u"} (i32.sub (local.get $p) (local.get ${start})) (local.get $runLength${index})))`;
}

export function lowerSameRun(
  m: Extract<Matcher, { kind: "sameRun" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, save, runSlots } = context;
  return matchRunCode(runSlots.get(m.slot.name)!, fail, save(), fresh("sameRun"), m.relation);
}
