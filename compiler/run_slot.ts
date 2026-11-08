import type { Matcher } from "#/grammar/mod.ts";
import type { RunRelation } from "#/grammar/run_slot.ts";
import type { LowerContext } from "./matcher.ts";
import type { ArmEffectLowering } from "./arm_effect.ts";

function byteBefore(cursor: string): string {
  return `(i32.load8_u (i32.add (local.get $input) (i32.sub ${cursor} (i32.const 1))))`;
}

export const lowerCaptureRun: ArmEffectLowering<"captureRun"> = (effect, context) => {
  context.captures.push(captureRunCode(context.runSlots.get(effect.slot.name)!));
};
/** Lower capture to a backward scan within the already-matched token. */
export function captureRunCode(index: number): string {
  const byte = `$runByte${index}`;
  const length = `$runLength${index}`;
  const lastByte = byteBefore("(local.get $matchCursor)");
  const previousByte = byteBefore("(local.get $runAt)");
  return `(local.set ${byte} ${lastByte})
    (local.set $runAt (i32.sub (local.get $matchCursor) (i32.const 1)))
    (block $runScanDone (loop $scanPreviousByte
      (br_if $runScanDone (i32.le_u (local.get $runAt) (local.get $pos)))
      (br_if $runScanDone
        (i32.ne
          ${previousByte}
          (local.get ${byte})))
      (local.set $runAt (i32.sub (local.get $runAt) (i32.const 1)))
      (br $scanPreviousByte)))
    (local.set ${length} (i32.sub (local.get $matchCursor) (local.get $runAt)))`;
}

/** Lower a saved run match to a bounded byte loop and length comparison. */
export function matchRunCode(
  index: number,
  fail: string,
  start: string,
  done: string,
  relation: RunRelation = "atLeast",
): string {
  const byte = `$runByte${index}`;
  const length = `$runLength${index}`;
  const more = `${done}_more`;
  const matchedLength = `(i32.sub (local.get $matchCursor) (local.get ${start}))`;
  const prefixLimit =
    relation === "prefix"
      ? `(br_if ${done}
        (i32.ge_u ${matchedLength} (local.get ${length})))`
      : "";
  const comparison = relation === "exact" ? "i32.ne" : "i32.lt_u";
  return `(br_if ${fail} (i32.eqz (local.get ${length})))
    (local.set ${start} (local.get $matchCursor))
    (block ${done} (loop ${more} ${prefixLimit}
      (br_if ${done} (i32.ge_u (local.get $matchCursor) (local.get $limit)))
      (br_if ${done}
        (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))) (local.get ${byte})))
      (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
      (br ${more})))
    (br_if ${fail}
      (${comparison} ${matchedLength} (local.get ${length})))`;
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
