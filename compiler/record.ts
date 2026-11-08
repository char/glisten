import type { ArmEffectLowering } from "./arm_effect.ts";
import type { Style } from "#/grammar/styles.ts";

export function lowerStyle(chosen: Style | undefined, styles: Style[]): string {
  const index = styles.indexOf(chosen ?? "plain");
  return `(local.set $style (i32.const ${index}))`;
}

export function lowerRecordUpdate(
  patch: Style | undefined,
  mark: boolean,
  styles: Style[],
): { patch: string; mark: string } {
  const index = patch !== undefined ? styles.indexOf(patch) : undefined;
  return {
    patch: index !== undefined ? `(local.set $patch (i32.const ${index}))` : "",
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
