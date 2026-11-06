import type { Effect } from "#/grammar/mod.ts";
import type { Style } from "#/grammar/styles.ts";
import { lowerArmEffect, targetAssignment } from "./registry.ts";
import { lowerStyle, lowerRecordUpdate } from "./record.ts";

export function lowerBranch(
  effects: readonly Effect[],
  context: ArmEffectContext,
  options: {
    styles: Style[];
    names: string[];
    speculationGroup: (opener: Extract<Effect, { kind: "speculate" }>) => string;
    speculationSave: string;
    shapeOf: (operations: Effect[]) => string;
    wrapStart: string;
  },
): string {
  for (const effect of effects) lowerArmEffect(effect, context);
  const { chosen, operations, captures, injections, patch, mark, opener, wrap } = context;
  const assignments = operations.flatMap((op, i) => targetAssignment(op, i, options.names));
  const record = lowerRecordUpdate(patch, mark, options.styles);
  return `${opener ? `(local.set $specGroup ${options.speculationGroup(opener)}) ${options.speculationSave}` : ""}
        ${wrap ? `(local.set $wrapStyle (i32.const ${options.styles.indexOf(wrap.style)})) (local.set $wrapStart ${wrap.from === "arm" ? "(local.get $pos)" : options.wrapStart})` : ""}
        ${lowerStyle(chosen, options.styles)}
        ${captures.join(" ")}
        ${injections.join(" ")}
        ${record.patch}
        ${record.mark}
        ${assignments.join(" ")} (br ${operations.length ? options.shapeOf(operations) : "$paint"})`;
}

export type ArmEffectContext = {
  operations: Effect[];
  captures: string[];
  injections: string[];
  chosen?: Style;
  patch?: Style;
  mark: boolean;
  opener?: Extract<Effect, { kind: "speculate" }>;
  wrap?: Extract<Effect, { kind: "wrap" }>;
  runSlots: Map<string, number>;
  rangeSlots: Map<string, number>;
  embeds: string[];
};

export type ArmEffectLowering<K extends Effect["kind"]> = (
  effect: Extract<Effect, { kind: K }>,
  context: ArmEffectContext,
) => void;
