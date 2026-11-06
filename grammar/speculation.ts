import type { Arm, Effect, Grammar, State } from "./mod.ts";
import { usesCapture } from "./capture.ts";
import { usesQueue } from "./queue.ts";

/** Enter a speculative state or abandon the currently open speculative state. */
export type SpeculationEffect =
  | {
      readonly kind: "speculate";
      readonly state: string;
      readonly group?: string;
      readonly isolate?: { readonly base: string; readonly group: string };
    }
  | { readonly kind: "abandon" };

export const speculate = (
  state: string,
  group?: string,
  isolate?: { readonly base: string; readonly group: string },
): SpeculationEffect => ({ kind: "speculate", state, group, isolate });
export const abandon = (): SpeculationEffect => ({ kind: "abandon" });

export function checkSpeculationArm(arm: Arm): void {
  if (
    arm.then.some((step) => step.kind === "speculate") &&
    (arm.match.length === 0 || !arm.then.some((step) => step.kind === "paint"))
  )
    throw new Error("A speculative opener must consume and paint");
  if (
    arm.then.some((step) => step.kind === "abandon") &&
    (arm.then.length !== 1 ||
      arm.match.some(
        (matcher) =>
          !["ahead", "notAhead", "notNext", "notBehind", "lineEnd"].includes(matcher.kind),
      ))
  )
    throw new Error("Abandon must be the sole effect of a zero-width arm");
}

export function checkSpeculationEffects(
  effects: readonly Effect[],
  grammar: string,
  state: string,
): void {
  if (
    effects.some((effect) => effect.kind === "speculate") &&
    effects.filter(
      (effect) =>
        effect.kind === "speculate" ||
        effect.kind === "push" ||
        effect.kind === "pop" ||
        effect.kind === "goto",
    ).length !== 1
  )
    throw new Error(`${grammar}.${state}: a speculative opener must be the only stack action`);
}

export function checkSpeculativeStates<Name extends string>(grammar: Grammar<Name>): Set<string> {
  const speculativeStates = new Set<string>();
  for (const state of Object.values<State>(grammar.states))
    for (const arm of state.arms)
      for (const effect of arm.then)
        if (effect.kind === "speculate") speculativeStates.add(effect.state);
  const nestedStates = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const add = (set: Set<string>, name: string) => {
      if (!set.has(name)) {
        set.add(name);
        changed = true;
      }
    };
    for (const name of speculativeStates) {
      const state = grammar.states[name as Name];
      if (!state) continue;
      for (const arm of state.arms) {
        let popped = false;
        for (const effect of arm.then) {
          if (effect.kind === "pop") popped = true;
          if (effect.kind === "speculate") add(nestedStates, effect.state);
          if (effect.kind === "goto" && (!popped || nestedStates.has(name))) {
            add(speculativeStates, effect.state);
            if (nestedStates.has(name)) add(nestedStates, effect.state);
          }
        }
      }
    }
  }
  if (speculativeStates.size && (usesCapture(grammar) || usesQueue(grammar)))
    throw new Error(
      `${grammar.name}: speculation cannot be combined with heredoc queues or captures`,
    );
  if (speculativeStates.has(grammar.initial))
    throw new Error(`${grammar.name}: the root cannot be a speculative state`);
  return speculativeStates;
}
