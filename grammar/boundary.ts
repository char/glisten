import { byteSet, bytesOf, checkColumn, type ByteSet } from "./bytes.ts";
import type { Matcher } from "./mod.ts";

export type BoundaryMatcher =
  | { readonly kind: "baseState"; readonly states: readonly string[] }
  | { readonly kind: "notNext"; readonly set: ByteSet }
  | { readonly kind: "notBehind"; readonly set: ByteSet }
  | { readonly kind: "previousChar"; readonly ranges: CharRanges; readonly invert: boolean }
  | { readonly kind: "lineEnd" }
  | { readonly kind: "columnAtLeast"; readonly column: number };

/** Succeeds, consuming nothing, unless the next byte in the segment is in the set. */
export const notNext = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "notNext", set };
};
export type CharRanges = readonly (readonly [number, number])[];

export function checkCharRanges(ranges: CharRanges): void {
  if (!Array.isArray(ranges)) throw new RangeError("Expected Unicode code-point ranges");
  for (const range of ranges) {
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !Number.isInteger(range[0]) ||
      !Number.isInteger(range[1]) ||
      range[0] < 0 ||
      range[0] > range[1] ||
      range[1] > 0x10ffff
    )
      throw new RangeError("Invalid Unicode code-point range");
  }
}

const previousChar = (ranges: CharRanges, invert: boolean): Matcher => {
  checkCharRanges(ranges);
  return {
    kind: "previousChar",
    ranges: ranges.map(([start, end]) => [start, end] as const),
    invert,
  };
};

/** Test the preceding UTF-8 scalar, or LF at document start. Malformed UTF-8 is not in any set. */
export const previousCharIn = (ranges: CharRanges): Matcher => previousChar(ranges, false);
/** The complement of previousCharIn, including malformed UTF-8. */
export const previousCharNotIn = (ranges: CharRanges): Matcher => previousChar(ranges, true);

const notNewline = byteSet({
  ranges: [
    [0, 9],
    [11, 255],
  ],
});

/** Succeeds at the physical beginning of a line, including document start. */
export const lineStart = (): Matcher => previousNotIn(notNewline);

/** Test the physical column at the beginning of an arm. */
export const columnAtLeast = (column: number): Matcher => {
  checkColumn(column);
  return { kind: "columnAtLeast", column };
};

/** Succeeds before a newline or at the end of a document, but not at other segment ends. */
export const lineEnd = (): Matcher => ({ kind: "lineEnd" });
/** Succeeds unless the previous byte (across segments; "\n" at document start) is in the set. */
export const previousNotIn = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "notBehind", set };
};

/** Match the state below the outermost speculative frame, or the current state. */
export const baseState = (...states: readonly string[]): Matcher => ({ kind: "baseState", states });

export function checkBaseState(
  matcher: Extract<BoundaryMatcher, { kind: "baseState" }>,
  names: Set<string>,
  grammar: string,
): void {
  for (const name of matcher.states)
    if (!names.has(name)) throw new Error(`${grammar}: unknown base state ${name}`);
}
