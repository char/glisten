import { byteSet, bytesOf, type ByteSet } from "./bytes.ts";
import type { Matcher } from "./mod.ts";

export type BoundaryMatcher =
  | { readonly kind: "baseState"; readonly states: readonly string[] }
  | { readonly kind: "notNext"; readonly set: ByteSet }
  | { readonly kind: "notBehind"; readonly set: ByteSet }
  | { readonly kind: "lineEnd" };

/** Succeeds, consuming nothing, unless the next byte in the segment is in the set. */
export const notNext = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "notNext", set };
};
const notNewline = byteSet({
  ranges: [
    [0, 9],
    [11, 255],
  ],
});

/** Succeeds at the physical beginning of a line, including document start. */
export const lineStart = (): Matcher => previousNotIn(notNewline);

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
