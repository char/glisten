import type { Effect } from "./mod.ts";
import type { Style } from "./styles.ts";

export function checkRecordEffects(effects: readonly Effect[]) {
  if (!effects.some((effect) => effect.kind === "markRecord" || effect.kind === "patchRecord"))
    return;
  const paintPositions = effects.flatMap((effect, index) =>
    effect.kind === "paint" ? [index] : [],
  );
  if (
    paintPositions.length !== 1 ||
    effects.filter((effect) => effect.kind === "markRecord").length > 1 ||
    effects.filter((effect) => effect.kind === "patchRecord").length > 1 ||
    effects.some((effect, index) =>
      effect.kind === "markRecord"
        ? index < paintPositions[0]!
        : effect.kind === "patchRecord" && index > paintPositions[0]!,
    )
  )
    throw new Error("Record patch must precede the single paint and mark must follow it");
}

export type RecordEffect =
  | { readonly kind: "paint"; readonly style: Style }
  | { readonly kind: "markRecord" }
  | { readonly kind: "patchRecord"; readonly style: Style }
  | { readonly kind: "wrap"; readonly style: Style; readonly from: "frame" | "arm" };

/** Paint from the token start to `pos`; the token then starts at `pos`. */
export const paint = (style: Style): Effect => ({ kind: "paint", style });
/** Mark the output record painted by this arm, including a pending record. */
export const markRecord = (): Effect => ({ kind: "markRecord" });
/** Change the marked record's style, including across segments; no mark is a no-op. */
export const patchRecord = (style: Style): Effect => ({ kind: "patchRecord", style });

/** Wrap the complete arm or the frame opened by its pushing arm. */
export const wrap = (style: Style, options: { from?: "arm" } = {}): Effect => ({
  kind: "wrap",
  style,
  from: options.from ?? "frame",
});
