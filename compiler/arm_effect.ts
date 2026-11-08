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
  const group = opener ? options.speculationGroup(opener) : undefined;
  const speculationSave = options.speculationSave;
  const speculation =
    group !== undefined ? `(local.set $specGroup ${group}) ${speculationSave}` : "";
  const wrapStart = wrap?.from === "arm" ? "(local.get $pos)" : options.wrapStart;
  const wrapStyle = wrap ? options.styles.indexOf(wrap.style) : undefined;
  const wrapping =
    wrapStyle !== undefined
      ? `(local.set $wrapStyle (i32.const ${wrapStyle})) (local.set $wrapStart ${wrapStart})`
      : "";
  const destination = operations.length ? options.shapeOf(operations) : "$paint";
  const style = lowerStyle(chosen, options.styles);
  const captureCode = captures.join("\n");
  const injectionCode = injections.join("\n");
  const { patch: patchCode, mark: markCode } = record;
  const assignmentCode = assignments.join("\n");
  return `${speculation}
        ${wrapping}
        ${style}
        ${captureCode}
        ${injectionCode}
        ${patchCode}
        ${markCode}
        ${assignmentCode}
        (br ${destination})`;
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
