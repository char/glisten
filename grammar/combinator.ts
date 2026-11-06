import { bytesOf, type ByteSet } from "./bytes.ts";
import type { Matcher } from "./mod.ts";

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

/** Group an ordered sequence of matchers for a nested combinator. */
export const seq = (...matchers: Matcher[]): readonly Matcher[] => matchers;

/** The first alternative that matches whole; no backtracking into it afterwards. */
export const choice = (...alternatives: (readonly Matcher[])[]): Matcher => ({
  kind: "either",
  alternatives,
});
/** The matchers if they all match, else nothing. */
export const optional = (...matchers: Matcher[]): Matcher => ({ kind: "opt", matchers });
/** Possessively repeat a matcher sequence, stopping before a failure or an empty match. */
export const repeat = (...matchers: Matcher[]): Matcher => ({ kind: "repeat", matchers });
/** Succeeds without consuming input if the matcher sequence fails. */
export const notLookahead = (...matchers: Matcher[]): Matcher => ({ kind: "notAhead", matchers });
/** Succeeds without consuming if the sequence matches. */
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
  if (bytesOf(first).some((b) => !bytesOf(rest).includes(b)))
    throw new Error("Prefix first set must be a subset of its rest set");
  return { kind: "cachedPrefix", name, first, rest, suffix };
};

export function checkCachedPrefix(
  matcher: Extract<CombinatorMatcher, { kind: "cachedPrefix" }>,
  caches: Map<string, string>,
): void {
  if (bytesOf(matcher.first).some((b) => !bytesOf(matcher.rest).includes(b)))
    throw new Error("Prefix first set must be a subset of its rest set");
  const key = JSON.stringify([bytesOf(matcher.first), bytesOf(matcher.rest), matcher.suffix]);
  if (caches.has(matcher.name) && caches.get(matcher.name) !== key)
    throw new Error(`Inconsistent cached prefix ${matcher.name}`);
  caches.set(matcher.name, key);
}
