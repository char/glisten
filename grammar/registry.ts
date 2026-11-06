import type { Effect, Matcher } from "./mod.ts";
import { checkBaseState, checkCharRanges } from "./boundary.ts";
import { checkCachedPrefix } from "./combinator.ts";
import { checkStateEffect } from "./state.ts";
import { checkQueueOpen } from "./queue.ts";
import { bytesOf, checkColumn, checkRunBounds } from "./bytes.ts";
import { checkSeparatedRunMinimum } from "./separated_run.ts";
import { indentTo } from "./column.ts";

type ValidationContext = { names: Set<string>; grammar: string; caches: Map<string, string> };
export type EffectValidationContext = {
  names: Set<string>;
  grammar: string;
  state: string;
  speculativeStates: Set<string>;
  hasQueueSweep: boolean;
};
type EffectRule<K extends Effect["kind"]> = {
  role: "effect";
  validate: (effect: Extract<Effect, { kind: K }>, context: EffectValidationContext) => void;
};
type MatcherRule<K extends Matcher["kind"]> = {
  role: "matcher";
  validate: (matcher: Extract<Matcher, { kind: K }>, context: ValidationContext) => void;
};
const noValidation = () => {};

const registry = {
  literal: { role: "matcher", validate: noValidation },
  one: {
    role: "matcher",
    validate: (matcher) => {
      bytesOf(matcher.set);
    },
  },
  character: { role: "matcher", validate: noValidation },
  baseState: {
    role: "matcher",
    validate: (matcher, context) => checkBaseState(matcher, context.names, context.grammar),
  },
  run: {
    role: "matcher",
    validate: (matcher) => {
      bytesOf(matcher.set);
      checkRunBounds(matcher.min, matcher.max);
      if (matcher.untilColumn !== undefined) checkColumn(matcher.untilColumn);
    },
  },
  either: { role: "matcher", validate: noValidation },
  opt: { role: "matcher", validate: noValidation },
  ahead: { role: "matcher", validate: noValidation },
  notAhead: { role: "matcher", validate: noValidation },
  cachedPrefix: {
    role: "matcher",
    validate: (matcher, context) => checkCachedPrefix(matcher, context.caches),
  },
  notNext: {
    role: "matcher",
    validate: (matcher) => {
      bytesOf(matcher.set);
    },
  },
  notBehind: {
    role: "matcher",
    validate: (matcher) => {
      bytesOf(matcher.set);
    },
  },
  previousChar: {
    role: "matcher",
    validate: (matcher) => {
      checkCharRanges(matcher.ranges);
      if (typeof matcher.invert !== "boolean")
        throw new TypeError("Invalid previous character polarity");
    },
  },
  lineEnd: { role: "matcher", validate: noValidation },
  columnAtLeast: { role: "matcher", validate: (matcher) => checkColumn(matcher.column) },
  repeat: { role: "matcher", validate: noValidation },
  sameRun: { role: "matcher", validate: noValidation },
  counterZero: { role: "matcher", validate: noValidation },
  counterPositive: { role: "matcher", validate: noValidation },
  separatedRun: {
    role: "matcher",
    validate: (matcher) => {
      bytesOf(matcher.set);
      bytesOf(matcher.separators);
      checkSeparatedRunMinimum(matcher.min);
    },
  },
  toColumn: {
    role: "matcher",
    validate: (matcher) => {
      indentTo(matcher.slot, { ancestor: matcher.ancestor });
    },
  },
  captured: { role: "matcher", validate: noValidation },
  queueHas: { role: "matcher", validate: noValidation },
  queueText: { role: "matcher", validate: noValidation },
  queueFooter: { role: "matcher", validate: noValidation },
  group: { role: "matcher", validate: noValidation },
  paint: { role: "effect", validate: noValidation },
  markRecord: { role: "effect", validate: noValidation },
  patchRecord: { role: "effect", validate: noValidation },
  wrap: { role: "effect", validate: noValidation },
  push: { role: "effect", validate: checkStateEffect },
  pop: { role: "effect", validate: checkStateEffect },
  goto: { role: "effect", validate: checkStateEffect },
  resource: { role: "effect", validate: noValidation },
  captureRun: { role: "effect", validate: noValidation },
  counterReset: { role: "effect", validate: noValidation },
  counterIncrement: { role: "effect", validate: noValidation },
  counterDecrement: { role: "effect", validate: noValidation },
  captureColumn: { role: "effect", validate: noValidation },
  saveRange: { role: "effect", validate: noValidation },
  clearRange: { role: "effect", validate: noValidation },
  openNamed: { role: "effect", validate: noValidation },
  openStatic: { role: "effect", validate: noValidation },
  hostPrefix: { role: "effect", validate: noValidation },
  closeInjection: { role: "effect", validate: noValidation },
  speculate: { role: "effect", validate: checkStateEffect },
  abandon: { role: "effect", validate: checkStateEffect },
  word: { role: "effect", validate: noValidation },
  captureReset: { role: "effect", validate: noValidation },
  captureAppend: { role: "effect", validate: noValidation },
  captureMark: { role: "effect", validate: noValidation },
  queueEnter: { role: "effect", validate: noValidation },
  queueLeave: { role: "effect", validate: noValidation },
  queueSave: { role: "effect", validate: noValidation },
  queueShift: { role: "effect", validate: noValidation },
  queueOpen: { role: "effect", validate: checkQueueOpen },
} satisfies { [K in Matcher["kind"]]: MatcherRule<K> } & {
  [K in Effect["kind"]]: EffectRule<K>;
};

export function isEffect(step: Matcher | Effect): step is Effect {
  return registry[step.kind]?.role === "effect";
}

export function checkMatcher(matcher: Matcher, context: ValidationContext): void {
  // The registry key and the handler argument share the same discriminant.
  const validate = registry[matcher.kind].validate as (
    matcher: Matcher,
    context: ValidationContext,
  ) => void;
  validate(matcher, context);
}

export function checkEffect(effect: Effect, context: EffectValidationContext): void {
  // The registry key and the handler argument share the same discriminant.
  const validate = registry[effect.kind].validate as (
    effect: Effect,
    context: EffectValidationContext,
  ) => void;
  validate(effect, context);
}
