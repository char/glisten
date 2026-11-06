import type { Grammar } from "./mod.ts";
import { visitGrammar } from "./visit.ts";
import type { EffectValidationContext } from "./registry.ts";

export function checkQueueSweep(grammar: Grammar, names: Set<string>): void {
  if (grammar.queueSweep && !names.has(grammar.queueSweep.footer))
    throw new Error(`${grammar.name}: unknown queue footer state ${grammar.queueSweep.footer}`);
}

export function checkQueueOpen(
  _effect: Extract<QueueEffect, { kind: "queueOpen" }>,
  context: EffectValidationContext,
): void {
  if (!context.hasQueueSweep)
    throw new Error(`${context.grammar}.${context.state}: queueOpen needs a queue sweep`);
}

export type FooterIndent = "none" | "tabs" | "whitespace";
export type QueueEffect =
  | { readonly kind: "queueEnter" }
  | { readonly kind: "queueLeave" }
  | { readonly kind: "queueSave"; readonly footerIndent: FooterIndent }
  | { readonly kind: "queueShift" }
  | { readonly kind: "queueOpen" };
export type QueueMatcher =
  | { readonly kind: "queueHas"; readonly mask: 0 | 1; readonly flags: 0 | 1 }
  | { readonly kind: "queueText" }
  | { readonly kind: "queueFooter" };

/** Enter a nested queue owner, initially empty. */
export const queueEnter = (): QueueEffect => ({ kind: "queueEnter" });
/** Leave a nested owner, discarding its remaining entries; root cannot be left. */
export const queueLeave = (): QueueEffect => ({ kind: "queueLeave" });
/** Append a snapshot of the capture and its flags to the current owner's FIFO. */
export const queueSave = (options: { readonly footerIndent?: FooterIndent } = {}): QueueEffect => ({
  kind: "queueSave",
  footerIndent: options.footerIndent ?? "none",
});
/** Remove the current owner's head, if present. */
export const queueShift = (): QueueEffect => ({ kind: "queueShift" });
/** Record a live body at the current state-stack depth. */
export const queueOpen = (): QueueEffect => ({ kind: "queueOpen" });
/** Succeed without consuming if the current owner has a head with these masked flags. */
export const queueHas = (mask: 0 | 1 = 0, flags: 0 | 1 = 0): QueueMatcher => ({
  kind: "queueHas",
  mask,
  flags,
});
/** Match the current owner's head text within the current segment. */
export const queueText = (): QueueMatcher => ({ kind: "queueText" });
/** Match a queued delimiter followed by a segment-local newline or document end. */
export const queueFooter = (): QueueMatcher => ({ kind: "queueFooter" });

export function usesQueue(grammar: Grammar): boolean {
  let used = !!grammar.queueSweep;
  visitGrammar(grammar, {
    matcher: (matcher) => {
      if (
        matcher.kind === "queueHas" ||
        matcher.kind === "queueText" ||
        matcher.kind === "queueFooter"
      )
        used = true;
    },
    effect: (effect) => {
      if (
        effect.kind === "queueEnter" ||
        effect.kind === "queueLeave" ||
        effect.kind === "queueSave" ||
        effect.kind === "queueShift" ||
        effect.kind === "queueOpen"
      )
        used = true;
    },
  });
  return used;
}
