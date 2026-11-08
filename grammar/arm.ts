import type { Arm, ByteSet, Effect, Matcher } from "./mod.ts";
import { isEffect } from "./registry.ts";
import { checkWordArm } from "./word.ts";
import { checkRecordEffects } from "./record.ts";
import { checkSpeculationArm } from "./speculation.ts";
import { checkInjectionArm } from "./injection.ts";
import { bytesOf } from "./bytes.ts";

/** A consuming arm on the bytes `on`: matchers first, then effects. */
export function on(set: ByteSet, ...steps: (Matcher | Effect)[]): Arm {
  return buildArm(set, steps, false);
}

/** A zero-width transition which retries the current byte. */
export function redispatch(set: ByteSet, ...steps: (Matcher | Effect)[]): Arm {
  return buildArm(set, steps, true);
}

function buildArm(set: ByteSet, steps: (Matcher | Effect)[], transition: boolean): Arm {
  const split = steps.findIndex(isEffect);
  const match = (split < 0 ? steps : steps.slice(0, split)) as Matcher[];
  const then = (split < 0 ? [] : steps.slice(split)) as Effect[];
  if (then.some((step) => !isEffect(step)))
    throw new Error("An arm's matchers must precede its effects");
  const arm: Arm = transition
    ? { on: set, match, then, redispatch: true }
    : { on: set, match, then };
  checkArm(arm);
  return arm;
}

export function checkArm(arm: Arm) {
  bytesOf(arm.on);
  const classification = arm.then.find((effect) => effect.kind === "word");
  const zeroWidthSpeculation =
    arm.redispatch && arm.then.some((effect) => effect.kind === "speculate");
  const paintCount = arm.then.filter((effect) => effect.kind === "paint").length;
  if (paintCount > 1) throw new Error("An arm must have exactly one paint");
  const paints = paintCount !== 0 || classification !== undefined;
  if (arm.redispatch ? paints : !paints)
    throw new Error(
      arm.redispatch ? "A redispatch cannot paint" : "A non-painting arm must use redispatch",
    );
  const hasStackTransition = arm.then.some(
    (effect) => effect.kind === "push" || effect.kind === "pop" || effect.kind === "goto",
  );
  if (classification?.kind === "word") {
    checkWordArm(arm, classification);
  } else if (!paintCount) {
    const zeroWidthMatchers: readonly Matcher["kind"][] = [
      "queueHas",
      "counterZero",
      "counterPositive",
      "ahead",
      "notAhead",
      "notNext",
      "notBehind",
      "previousChar",
      "lineEnd",
      "columnAtLeast",
    ];
    const transitionEffects: readonly Effect["kind"][] = [
      "push",
      "pop",
      "goto",
      "speculate",
      "queueSave",
      "queueOpen",
      "closeInjection",
      "openStatic",
      "openNamed",
      "captureReset",
      "captureMark",
      "abandon",
    ];
    const counterEffects: readonly Effect["kind"][] = [
      "counterReset",
      "counterIncrement",
      "counterDecrement",
    ];
    const requiresStackTransition: readonly Effect["kind"][] = [
      "captureReset",
      "captureMark",
      "openStatic",
      "openNamed",
    ];
    const hasNonAssertion = arm.match.some((matcher) => !zeroWidthMatchers.includes(matcher.kind));
    const hasInvalidEffect = arm.then.some(
      (effect) =>
        !transitionEffects.includes(effect.kind) &&
        !(zeroWidthSpeculation && counterEffects.includes(effect.kind)),
    );
    const missingStackTransition =
      !hasStackTransition &&
      arm.then.some((effect) => requiresStackTransition.includes(effect.kind));
    if (hasNonAssertion || arm.then.length === 0 || hasInvalidEffect || missingStackTransition)
      throw new Error("An arm must paint what it matches or be a zero-width transition");
  }
  if (!classification) checkRecordEffects(arm.then);
  checkSpeculationArm(arm);
  checkInjectionArm(arm);
}
