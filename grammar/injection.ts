import type { Arm } from "./mod.ts";
import type { RangeSlot } from "./slot.ts";

/** Save or clear a document-local source range. Unset ranges are [0, 0]. */
export type RangeEffect =
  | { readonly kind: "saveRange"; readonly slot: RangeSlot }
  | { readonly kind: "clearRange"; readonly slot: RangeSlot };
/** Open a named host after painting this arm, or close the active host before painting it. */
export type InjectionEffect =
  | { readonly kind: "openNamed"; readonly slot: RangeSlot }
  | { readonly kind: "openStatic"; readonly language: string }
  | { readonly kind: "hostPrefix" }
  | { readonly kind: "closeInjection" };

export const saveRange = (slot: RangeSlot): RangeEffect => ({ kind: "saveRange", slot });
export const clearRange = (slot: RangeSlot): RangeEffect => ({ kind: "clearRange", slot });
export const openInjection = (
  target: { named: RangeSlot; static?: never } | { static: string; named?: never },
): InjectionEffect =>
  target.named !== undefined
    ? { kind: "openNamed", slot: target.named }
    : { kind: "openStatic", language: target.static };
/** Paint this token in the parent while leaving the active host open. */
export const hostPrefix = (): InjectionEffect => ({ kind: "hostPrefix" });
export const closeInjection = (): InjectionEffect => ({ kind: "closeInjection" });

export function checkInjectionArm(arm: Arm): void {
  const classification = arm.then.find((effect) => effect.kind === "word");
  const branches =
    classification?.kind === "word"
      ? [...classification.cases.map(({ then }) => then), classification.otherwise]
      : [arm.then];
  for (const branch of branches) {
    const paintIndex = branch.findIndex((effect) => effect.kind === "paint");
    const injectionEffects = branch.filter(
      (effect) =>
        effect.kind === "openNamed" ||
        effect.kind === "openStatic" ||
        effect.kind === "hostPrefix" ||
        effect.kind === "closeInjection",
    );
    const outOfOrder = branch.some((effect, index) => {
      if (effect.kind === "openNamed" || effect.kind === "openStatic") return index < paintIndex;
      if (effect.kind === "hostPrefix") return index > paintIndex;
      return effect.kind === "closeInjection" && paintIndex >= 0 && index > paintIndex;
    });
    if (injectionEffects.length > 1 || outOfOrder)
      throw new Error("Prefix and close injections before painting; open them after painting");
  }
}
