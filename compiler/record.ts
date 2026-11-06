import type { ArmEffectLowering } from "./arm_effect.ts";
import type { Style } from "#/grammar/styles.ts";

export function lowerStyle(chosen: Style | undefined, styles: Style[]): string {
  return `(local.set $style (i32.const ${styles.indexOf(chosen ?? "plain")}))`;
}

export function lowerRecordUpdate(
  patch: Style | undefined,
  mark: boolean,
  styles: Style[],
): { patch: string; mark: string } {
  return {
    patch: patch !== undefined ? `(local.set $patch (i32.const ${styles.indexOf(patch)}))` : "",
    mark: mark ? "(local.set $mark (i32.const 1))" : "",
  };
}

export const lowerPaint: ArmEffectLowering<"paint"> = (effect, context) => {
  context.chosen ??= effect.style;
};
export const lowerMark: ArmEffectLowering<"markRecord"> = (_effect, context) => {
  context.mark = true;
};
export const lowerPatch: ArmEffectLowering<"patchRecord"> = (effect, context) => {
  context.patch ??= effect.style;
};
