export type GroupMatcher = { readonly kind: "group" };
/** A segment-bounded shell delimiter group with at most two nested groups. */
export const group = (): GroupMatcher => ({ kind: "group" });
