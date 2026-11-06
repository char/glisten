import type { RunSlot } from "./slot.ts";

/** A document-local slot holding the final run of a successful arm's match. */
export type CaptureRun = { readonly kind: "captureRun"; readonly slot: RunSlot };
export type RunRelation = "atLeast" | "exact" | "prefix";
/** Match the saved byte with the requested length relation. */
export type SameRun = {
  readonly kind: "sameRun";
  readonly slot: RunSlot;
  readonly relation: RunRelation;
};

export const saveRun = (slot: RunSlot): CaptureRun => ({ kind: "captureRun", slot });
export const matchRun = (slot: RunSlot, options: { relation?: RunRelation } = {}): SameRun => ({
  kind: "sameRun",
  slot,
  relation: options.relation ?? "atLeast",
});
