import type { Grammar } from "./mod.ts";
import { visitGrammar } from "./visit.ts";

export const captureLimit = 256;
export type CaptureEffect =
  | { readonly kind: "captureReset" }
  | { readonly kind: "captureAppend"; readonly skip: 0 | 1 }
  | { readonly kind: "captureMark"; readonly flags: 1 };
export type CaptureMatcher = { readonly kind: "captured" };

/** Reset the document-local capture, including its overflow flag. */
export const captureReset = (): CaptureEffect => ({ kind: "captureReset" });
/** Append the matched arm's bytes, omitting an optional leading byte. */
export const captureAppend = (skip: 0 | 1 = 0): CaptureEffect => ({ kind: "captureAppend", skip });
/** Match the captured bytes at the current segment position; overflow always fails. */
export const captured = (): CaptureMatcher => ({ kind: "captured" });
/** Mark the in-progress capture as quoted. */
export const captureMark = (flags: 1): CaptureEffect => ({ kind: "captureMark", flags });

/** Whether a grammar needs the capture storage and runtime. */
export function usesCapture(grammar: Grammar): boolean {
  let used = false;
  visitGrammar(grammar, {
    state: (state) => {
      if (state.captureFallback) used = true;
    },
    matcher: (matcher) => {
      if (matcher.kind === "captured") used = true;
    },
    effect: (effect) => {
      if (
        effect.kind === "captureReset" ||
        effect.kind === "captureAppend" ||
        effect.kind === "captureMark" ||
        effect.kind === "queueSave"
      )
        used = true;
    },
  });
  return used;
}
