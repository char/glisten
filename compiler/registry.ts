import type { Effect, Matcher } from "#/grammar/mod.ts";
import { lowerLiteral, lowerOne, lowerCharacter, lowerRun } from "./bytes.ts";
import { lowerGroup } from "./group.ts";
import { lowerQueueHas, lowerQueueFooter, lowerQueueText } from "./queue.ts";
import { lowerCaptured } from "./capture.ts";
import { lowerSeparatedRun } from "./separated_run.ts";
import {
  lowerEither,
  lowerOpt,
  lowerCachedPrefix,
  lowerNotAhead,
  lowerAhead,
  lowerMany,
} from "./combinator.ts";
import {
  lowerBaseState,
  lowerNotNext,
  lowerLineEnd,
  lowerNotBehind,
  lowerPreviousChar,
} from "./boundary.ts";
import { lowerSameRun } from "./run_slot.ts";
import { lowerColumnMatcher } from "./column.ts";
import {
  lowerCounterZero,
  lowerCounterPositive,
  lowerCounterReset,
  lowerCounterIncrement,
  lowerCounterDecrement,
} from "./counter_slot.ts";
import type { LowerContext, MatcherLowering } from "./matcher.ts";
import type { ShapeContext, ShapeLowering } from "./effect.ts";
import { lowerCaptureReset, lowerCaptureAppend, lowerCaptureMark } from "./capture.ts";
import { lowerQueueAction, lowerQueueSave, lowerQueueOpen } from "./queue.ts";
import { lowerColumnAction } from "./column.ts";
import { lowerResource, lowerGoto, lowerPush, lowerPop } from "./state.ts";
import { lowerSpeculationOpener, stateTarget } from "./state.ts";
import { captureRunCode, lowerCaptureRun } from "./run_slot.ts";
import { lowerInjectionEffect } from "./injection.ts";
import { lowerPaint, lowerPatch, lowerMark } from "./record.ts";
import type { ArmEffectContext, ArmEffectLowering } from "./arm_effect.ts";

type EffectRule<K extends Effect["kind"]> = {
  shape: ShapeLowering<K>;
  arm: ArmEffectLowering<K>;
  inShape: boolean;
  target: (effect: Extract<Effect, { kind: K }>) => string | undefined;
};
const noArm = () => {};
const noTarget = () => undefined;

const registry = {
  literal: (m, fail) => lowerLiteral(m, fail),
  one: (m, fail, _known, context) => lowerOne(m, fail, context.member),
  character: (_m, fail) => lowerCharacter(fail),
  run: (m, fail, _known, context) => lowerRun(m, fail, context),
  group: lowerGroup,
  queueHas: lowerQueueHas,
  queueFooter: lowerQueueFooter,
  queueText: lowerQueueText,
  captured: lowerCaptured,
  separatedRun: lowerSeparatedRun,
  either: lowerEither,
  baseState: lowerBaseState,
  sameRun: lowerSameRun,
  counterZero: lowerCounterZero,
  counterPositive: lowerCounterPositive,
  toColumn: lowerColumnMatcher,
  opt: lowerOpt,
  cachedPrefix: lowerCachedPrefix,
  notAhead: lowerNotAhead,
  ahead: lowerAhead,
  repeat: lowerMany,
  notNext: lowerNotNext,
  lineEnd: lowerLineEnd,
  columnAtLeast: (m, fail) =>
    `(br_if ${fail} (i64.lt_u (i64.and (local.get $column) (i64.const 4611686018427387903)) (i64.const ${m.column})))`,
  notBehind: lowerNotBehind,
  previousChar: lowerPreviousChar,
  captureReset: { shape: lowerCaptureReset, arm: noArm, inShape: true, target: noTarget },
  captureAppend: { shape: lowerCaptureAppend, arm: noArm, inShape: true, target: noTarget },
  captureMark: { shape: lowerCaptureMark, arm: noArm, inShape: true, target: noTarget },
  resource: { shape: lowerResource, arm: noArm, inShape: true, target: noTarget },
  queueEnter: { shape: lowerQueueAction, arm: noArm, inShape: true, target: noTarget },
  queueLeave: { shape: lowerQueueAction, arm: noArm, inShape: true, target: noTarget },
  queueShift: { shape: lowerQueueAction, arm: noArm, inShape: true, target: noTarget },
  queueSave: { shape: lowerQueueSave, arm: noArm, inShape: true, target: noTarget },
  queueOpen: { shape: lowerQueueOpen, arm: noArm, inShape: true, target: noTarget },
  goto: { shape: lowerGoto, arm: noArm, inShape: true, target: stateTarget },
  push: { shape: lowerPush, arm: noArm, inShape: true, target: stateTarget },
  speculate: { shape: lowerPush, arm: lowerSpeculationOpener, inShape: true, target: stateTarget },
  pop: { shape: lowerPop, arm: noArm, inShape: true, target: stateTarget },
  captureColumn: { shape: lowerColumnAction, arm: noArm, inShape: true, target: noTarget },
  paint: { shape: () => "", arm: lowerPaint, inShape: false, target: noTarget },
  markRecord: { shape: () => "", arm: lowerMark, inShape: false, target: noTarget },
  patchRecord: { shape: () => "", arm: lowerPatch, inShape: false, target: noTarget },
  wrap: {
    shape: () => "",
    arm: (effect, context) => {
      context.wrap = effect;
    },
    inShape: false,
    target: noTarget,
  },
  captureRun: { shape: () => "", arm: lowerCaptureRun, inShape: false, target: noTarget },
  counterReset: { shape: lowerCounterReset, arm: noArm, inShape: true, target: noTarget },
  counterIncrement: { shape: lowerCounterIncrement, arm: noArm, inShape: true, target: noTarget },
  counterDecrement: { shape: lowerCounterDecrement, arm: noArm, inShape: true, target: noTarget },
  saveRange: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  clearRange: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  openNamed: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  openStatic: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  hostPrefix: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  closeInjection: { shape: () => "", arm: lowerInjectionEffect, inShape: false, target: noTarget },
  abandon: { shape: () => "", arm: noArm, inShape: false, target: noTarget },
  word: { shape: () => "", arm: noArm, inShape: false, target: noTarget },
} satisfies { [K in Matcher["kind"]]: MatcherLowering<K> } & {
  [K in Effect["kind"]]: EffectRule<K>;
};

export function lowerShapeEffect(effect: Effect, index: number, context: ShapeContext): string {
  if (effect.kind === "captureRun" && effect.slot.scope === "frame")
    return captureRunCode(context.runSlots.get(effect.slot.name)!);
  // The registry key and the handler argument share the same discriminant.
  const handler = registry[effect.kind].shape as (
    effect: Effect,
    index: number,
    context: ShapeContext,
  ) => string;
  return handler(effect, index, context);
}

export function lowerMatcher(
  matcher: Matcher,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  // The registry key and the handler argument share the same discriminant.
  const handler = registry[matcher.kind] as (
    matcher: Matcher,
    fail: string,
    knownPrefix: boolean,
    context: LowerContext,
  ) => string;
  return handler(matcher, fail, knownPrefix, context);
}

export function lowerArmEffect(effect: Effect, context: ArmEffectContext): void {
  if (effect.kind === "captureRun" && effect.slot.scope === "frame") {
    context.operations.push(effect);
    return;
  }
  const rule = registry[effect.kind];
  if (rule.inShape) context.operations.push(effect);
  // The registry key and the handler argument share the same discriminant.
  const arm = rule.arm as (effect: Effect, context: ArmEffectContext) => void;
  arm(effect, context);
}

export function targetAssignment(effect: Effect, index: number, names: string[]): string[] {
  const target = registry[effect.kind].target(effect as never);
  return target === undefined
    ? []
    : [`(local.set $t${index} (i32.const ${names.indexOf(target)}))`];
}
