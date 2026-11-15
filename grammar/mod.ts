import { bytesOf, byteSet, type ByteSet } from "./bytes.ts";
import {
  byte,
  literal,
  group,
  captured,
  queueHas,
  queueText,
  queueFooter,
  type Matcher,
} from "./matchers.ts";
import {
  paint,
  captureAppend,
  captureMark,
  captureReset,
  queueEnter,
  queueLeave,
  queueSave,
  queueShift,
  queueOpen,
  type Effect,
} from "./effects.ts";
import type { Style } from "./styles.ts";
import { checkArm, checkGrammar, isEffect } from "./check.ts";

export {
  bytesOf,
  byteSet,
  range,
  ascii,
  utf8Bytes,
  union,
  intersection,
  except,
  type ByteSet,
  type CharRanges,
} from "./bytes.ts";
export {
  slot,
  maxDepth,
  maxTransitions,
  maxCounter,
  captureLimit,
  type RunSlot,
  type CounterSlot,
  type RangeSlot,
  type ColumnSlot,
  type RunRelation,
  type FooterIndent,
} from "./slots.ts";
export {
  literal,
  byte,
  character,
  bytes,
  separatedRun,
  baseState,
  notNext,
  previousNotIn,
  previousCharIn,
  previousCharNotIn,
  lineStart,
  lineEnd,
  columnAtLeast,
  seq,
  choice,
  optional,
  repeat,
  lookahead,
  notLookahead,
  cachedPrefix,
  matchRun,
  indentTo,
  counterZero,
  counterPositive,
  type Matcher,
  type SeparatedRun,
  type ToColumn,
} from "./matchers.ts";
export {
  paint,
  markRecord,
  patchRecord,
  wrap,
  classify,
  pushState,
  popState,
  setState,
  resource,
  speculate,
  abandon,
  saveRun,
  saveColumn,
  counterReset,
  counterIncrement,
  counterDecrement,
  clearRange,
  saveRange,
  openInjection,
  hostPrefix,
  closeInjection,
  type Effect,
  type WordEffect,
} from "./effects.ts";

/**
 * A byte arm: tried when the byte at `pos` is in `on`. Its matchers run from `pos`
 * (the dispatch byte is not consumed implicitly); if any fails, the byte's next arm is
 * tried from the same `pos`. Consuming arms paint and fail on a zero-length match.
 * Explicit redispatch arms apply permitted zero-width effects and retry the same byte;
 * queue predicates and zero-width assertions are allowed. More than
 * 16 + 4 × 128 consecutive transitions fail with a resource error.
 * A word classification is the sole effect of its arm; its selected branch must paint
 * exactly once and may perform stack effects. Classification sees only the bytes matched
 * by this arm, so a segment boundary ends a word for classification purposes.
 */
export type Arm = {
  readonly on: ByteSet;
  readonly match: readonly Matcher[];
  readonly then: readonly Effect[];
  readonly redispatch?: true;
};

/**
 * A lexer state. Without `otherwise`, bytes that start no arm are skipped (SIMD)
 * and painted with `style`; a byte whose arms all fail is painted as one UTF-8
 * character. A string `otherwise` replaces the state after painting that character;
 * an effect list instead retries the byte with nonempty stack effects, subject to the
 * transition limit.
 */
export type State = {
  readonly style: Style;
  readonly arms: readonly Arm[];
  readonly slots?: "shared";
  readonly captureFallback?: boolean;
  readonly prefix?: {
    readonly match: readonly Matcher[];
    readonly style: Style;
    readonly lazy?: { readonly top: readonly string[]; readonly unless: readonly Matcher[] };
  };
  readonly otherwise?: string | readonly Effect[];
};

/** A whole grammar. Each document starts in the named initial state. */
export type Grammar<Name extends string = string> = {
  readonly name: string;
  readonly initial: NoInfer<Name>;
  readonly aliases?: readonly string[];
  readonly extensions?: readonly string[];
  readonly filenames?: readonly string[];
  readonly tabStop?: 4 | 8;
  readonly queueSweep?: {
    readonly footer: string;
    readonly footerStyle: Style;
    readonly tabStyle: Style;
  };
  readonly states: { readonly [name in Name]: State };
};

export function on(set: ByteSet, ...steps: (Matcher | Effect)[]): Arm {
  return buildArm(set, steps, "consume");
}

export function redispatch(set: ByteSet, ...steps: (Matcher | Effect)[]): Arm {
  return buildArm(set, steps, "redispatch");
}

function buildArm(set: ByteSet, steps: (Matcher | Effect)[], mode: "consume" | "redispatch"): Arm {
  const split = steps.findIndex(isEffect);
  const match = (split < 0 ? steps : steps.slice(0, split)) as Matcher[];
  const then = (split < 0 ? [] : steps.slice(split)) as Effect[];
  if (then.some((step) => !isEffect(step)))
    throw new Error("An arm's matchers must precede its effects");
  const arm: Arm =
    mode === "redispatch" ? { on: set, match, then, redispatch: true } : { on: set, match, then };
  checkArm(arm);
  return arm;
}

type OneOf = { readonly kind: "oneOf"; readonly set: ByteSet };

export function oneOf(set: ByteSet): OneOf {
  bytesOf(set);
  return { kind: "oneOf", set };
}

export function token(pattern: string | OneOf, style: Style, ...effects: Effect[]): Arm {
  if (typeof pattern !== "string")
    return on(pattern.set, byte(pattern.set), paint(style), ...effects);
  const firstByte = new TextEncoder().encode(pattern)[0];
  if (firstByte === undefined) throw new Error("A token cannot be empty");
  const dispatch =
    firstByte < 128 ? String.fromCharCode(firstByte) : byteSet({ bytes: [firstByte] });
  return on(dispatch, literal(pattern), paint(style), ...effects);
}

export function keywordTable(
  words: readonly string[],
  style: Style,
  effects: (word: string) => readonly Effect[] = () => [],
): { text: string; then: Effect[] }[] {
  return words.map((text) => ({ text, then: [paint(style), ...effects(text)] }));
}

export const shell = {
  group,
  captured,
  captureAppend,
  captureMark,
  captureReset,
  queueEnter,
  queueLeave,
  queueSave,
  queueShift,
  queueOpen,
  queueHas,
  queueText,
  queueFooter,
};

export function defineGrammar<Name extends string>(grammar: Grammar<Name>): Grammar<Name> {
  checkGrammar(grammar);
  return grammar;
}
