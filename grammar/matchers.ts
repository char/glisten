import {
  byteSet,
  bytesOf,
  checkColumn,
  checkRunBounds,
  checkSeparatedRunMinimum,
  checkCharRanges,
  type ByteSet,
  type CharRanges,
} from "./bytes.ts";
import type { RunSlot, RunRelation, CounterSlot, ColumnSlot } from "./slots.ts";

export type ByteMatcher =
  | { readonly kind: "literal"; readonly text: string }
  | { readonly kind: "one"; readonly set: ByteSet }
  | { readonly kind: "character" }
  | {
      readonly kind: "run";
      readonly set: ByteSet;
      readonly min: number;
      readonly max?: number;
      readonly untilColumn?: number;
    };

export const literal = (text: string): Matcher => ({ kind: "literal", text });
export const byte = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "one", set };
};
export const character = (): Matcher => ({ kind: "character" });
export const bytes = (
  set: ByteSet,
  options: { min?: number; max?: number; untilColumn?: number } = {},
): Matcher => {
  const { min = 1, max, untilColumn } = options;
  bytesOf(set);
  checkRunBounds(min, max);
  if (untilColumn !== undefined) checkColumn(untilColumn);
  return {
    kind: "run",
    set,
    min,
    ...(max === undefined ? {} : { max }),
    ...(untilColumn === undefined ? {} : { untilColumn }),
  };
};

export type BoundaryMatcher =
  | { readonly kind: "baseState"; readonly states: readonly string[] }
  | { readonly kind: "notNext"; readonly set: ByteSet }
  | { readonly kind: "notBehind"; readonly set: ByteSet }
  | { readonly kind: "previousChar"; readonly ranges: CharRanges; readonly invert: boolean }
  | { readonly kind: "lineEnd" }
  | { readonly kind: "columnAtLeast"; readonly column: number };

export const notNext = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "notNext", set };
};

const previousChar = (ranges: CharRanges, polarity: "in" | "notIn"): Matcher => {
  checkCharRanges(ranges);
  return {
    kind: "previousChar",
    ranges: ranges.map(([start, end]) => [start, end] as const),
    invert: polarity === "notIn",
  };
};

export const previousCharIn = (ranges: CharRanges): Matcher => previousChar(ranges, "in");
export const previousCharNotIn = (ranges: CharRanges): Matcher => previousChar(ranges, "notIn");

const newline = "\n".charCodeAt(0);
const notNewline = byteSet({
  ranges: [
    [0, newline - 1],
    [newline + 1, 255],
  ],
});

export const lineStart = (): Matcher => previousNotIn(notNewline);

export const columnAtLeast = (column: number): Matcher => {
  checkColumn(column);
  return { kind: "columnAtLeast", column };
};

export const lineEnd = (): Matcher => ({ kind: "lineEnd" });
export const previousNotIn = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "notBehind", set };
};

export const baseState = (...states: readonly string[]): Matcher => ({ kind: "baseState", states });

export type CombinatorMatcher =
  | { readonly kind: "either"; readonly alternatives: readonly (readonly Matcher[])[] }
  | { readonly kind: "opt"; readonly matchers: readonly Matcher[] }
  | { readonly kind: "repeat"; readonly matchers: readonly Matcher[] }
  | { readonly kind: "ahead"; readonly matchers: readonly Matcher[] }
  | { readonly kind: "notAhead"; readonly matchers: readonly Matcher[] }
  | {
      readonly kind: "cachedPrefix";
      readonly name: string;
      readonly first: ByteSet;
      readonly rest: ByteSet;
      readonly suffix: readonly Matcher[];
    };

export const seq = (...matchers: Matcher[]): readonly Matcher[] => matchers;

export const choice = (...alternatives: (readonly Matcher[])[]): Matcher => ({
  kind: "either",
  alternatives,
});
export const optional = (...matchers: Matcher[]): Matcher => ({ kind: "opt", matchers });
export const repeat = (...matchers: Matcher[]): Matcher => ({ kind: "repeat", matchers });
export const notLookahead = (...matchers: Matcher[]): Matcher => ({ kind: "notAhead", matchers });
export const lookahead = (...matchers: Matcher[]): Matcher => ({ kind: "ahead", matchers });

/**
 * Match a run beginning in `first`, continuing in `rest`, then `suffix`.
 * On suffix failure, suppress attempts within that run until the next segment
 * or a later failure replaces the cached range. Every use of a name must have
 * the same first and rest sets and suffix. `first` must be a subset of `rest`.
 * The suffix must have the same result at a fixed input position, independent
 * of earlier matcher attempts.
 */
export const cachedPrefix = (
  name: string,
  first: ByteSet,
  rest: ByteSet,
  ...suffix: Matcher[]
): Matcher => {
  checkPrefixSets(first, rest);
  return { kind: "cachedPrefix", name, first, rest, suffix };
};

export function checkPrefixSets(first: ByteSet, rest: ByteSet): void {
  if (bytesOf(first).some((byte) => !bytesOf(rest).includes(byte)))
    throw new Error("Prefix first set must be a subset of its rest set");
}

export type SeparatedRun = {
  readonly kind: "separatedRun";
  readonly set: ByteSet;
  readonly separators: ByteSet;
  readonly min: number;
};

export const separatedRun = (set: ByteSet, separators: ByteSet, min = 1): SeparatedRun => {
  bytesOf(set);
  bytesOf(separators);
  checkSeparatedRunMinimum(min);
  return { kind: "separatedRun", set, separators, min };
};

export type SameRun = {
  readonly kind: "sameRun";
  readonly slot: RunSlot;
  readonly relation: RunRelation;
};

export const matchRun = (slot: RunSlot, options: { relation?: RunRelation } = {}): SameRun => ({
  kind: "sameRun",
  slot,
  relation: options.relation ?? "atLeast",
});

export type CounterMatcher =
  | { readonly kind: "counterZero"; readonly slot: CounterSlot }
  | { readonly kind: "counterPositive"; readonly slot: CounterSlot };

export const counterZero = (slot: CounterSlot): CounterMatcher => ({ kind: "counterZero", slot });
export const counterPositive = (slot: CounterSlot): CounterMatcher => ({
  kind: "counterPositive",
  slot,
});

export type ToColumn = {
  readonly kind: "toColumn";
  readonly slot: ColumnSlot;
  readonly ancestor?: number;
};

export const indentTo = (slot: ColumnSlot, options: { ancestor?: number } = {}): ToColumn => {
  const { ancestor = 0 } = options;
  if (!Number.isSafeInteger(ancestor) || ancestor < 0 || ancestor > 0x7fffffff)
    throw new RangeError("Invalid ancestor depth");
  return ancestor ? { kind: "toColumn", slot, ancestor } : { kind: "toColumn", slot };
};

export type CaptureMatcher = { readonly kind: "captured" };

export const captured = (): CaptureMatcher => ({ kind: "captured" });

export type QueueMatcher =
  | { readonly kind: "queueHas"; readonly mask: 0 | 1; readonly flags: 0 | 1 }
  | { readonly kind: "queueText" }
  | { readonly kind: "queueFooter" };

export const queueHas = (mask: 0 | 1 = 0, flags: 0 | 1 = 0): QueueMatcher => ({
  kind: "queueHas",
  mask,
  flags,
});
export const queueText = (): QueueMatcher => ({ kind: "queueText" });
export const queueFooter = (): QueueMatcher => ({ kind: "queueFooter" });

export type GroupMatcher = { readonly kind: "group" };

export const group = (): GroupMatcher => ({ kind: "group" });

export type Matcher =
  | ByteMatcher
  | SeparatedRun
  | BoundaryMatcher
  | CombinatorMatcher
  | SameRun
  | CounterMatcher
  | ToColumn
  | CaptureMatcher
  | QueueMatcher
  | GroupMatcher;
