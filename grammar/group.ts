import type { Matcher } from "./mod.ts";
import { someMatcher } from "./visit.ts";

export type GroupMatcher = { readonly kind: "group" };
/** A segment-bounded shell delimiter group with at most two nested groups. */
export const group = (): GroupMatcher => ({ kind: "group" });

/** Detect groups inside recursive matcher combinators. */
export function usesGroup(matchers: readonly Matcher[]): boolean {
  return someMatcher(matchers, (matcher) => matcher.kind === "group");
}
