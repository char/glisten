import type { Arm, Effect } from "./mod.ts";
import { checkRecordEffects } from "./record.ts";

/** Choose effects by the UTF-8 bytes matched by the arm, within this segment. */
export type WordEffect = {
  readonly kind: "word";
  readonly cases: readonly { readonly text: string; readonly then: readonly Effect[] }[];
  readonly otherwise: readonly Effect[];
  readonly caseless?: boolean;
};

/** Classify the completed match once; every branch must paint and cannot classify again. */
export function classify(
  cases: readonly { readonly text: string; readonly then: readonly Effect[] }[],
  otherwise: readonly Effect[],
  options: { readonly caseless?: boolean } = {},
): WordEffect {
  return options.caseless
    ? { kind: "word", cases, otherwise, caseless: true }
    : { kind: "word", cases, otherwise };
}

export function branchEffects(effects: readonly Effect[]): readonly Effect[] {
  const classification = effects.find((effect) => effect.kind === "word");
  return classification?.kind === "word"
    ? [...classification.cases.flatMap(({ then }) => then), ...classification.otherwise]
    : effects;
}

export function checkWordArm(arm: Arm, classification: WordEffect): void {
  if (arm.then.length !== 1 || arm.match.length === 0)
    throw new Error("A word classification must be the only effect of a consuming arm");
  const keys = classification.cases.map(({ text }) =>
    [...new TextEncoder().encode(text)].join(","),
  );
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate word classification case");
  if (
    classification.caseless &&
    classification.cases.some(({ text }) => text !== text.toLowerCase())
  )
    throw new Error("Caseless word classification cases must be lowercase");
  for (const branch of [
    ...classification.cases.map(({ then }) => then),
    classification.otherwise,
  ]) {
    checkRecordEffects(branch);
    if (
      branch.filter((effect) => effect.kind === "paint").length !== 1 ||
      branch.some(
        (effect) =>
          effect.kind === "word" || effect.kind === "speculate" || effect.kind === "abandon",
      )
    )
      throw new Error(
        "Each word classification branch must have exactly one paint and no classification",
      );
  }
}
