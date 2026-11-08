import type { Effect, Grammar, State } from "./mod.ts";
import type { EffectValidationContext } from "./registry.ts";

export type StateEffect =
  | { readonly kind: "push"; readonly state: string }
  | { readonly kind: "pop"; readonly fallback?: string }
  | { readonly kind: "goto"; readonly state: string }
  | { readonly kind: "resource" };

/** Enter a state, returning to this one on `popState`. */
export const pushState = (state: string): Effect => ({ kind: "push", state });
/** Return to the state below, or use `atRoot` at the bottom if supplied. */
export const popState = (options: { atRoot?: string } = {}): Effect =>
  options.atRoot === undefined ? { kind: "pop" } : { kind: "pop", fallback: options.atRoot };
/** Replace the current state. */
export const setState = (state: string): Effect => ({ kind: "goto", state });
/** Fail the current highlight as a resource error. */
export const resource = (): Effect => ({ kind: "resource" });

export function checkStateEffect(effect: Effect, context: EffectValidationContext): void {
  const { grammar, state: name, names, speculativeStates } = context;
  const insideSpeculation = speculativeStates.has(name);
  if (insideSpeculation && effect.kind === "push")
    throw new Error(`${grammar}.${name}: ordinary pushes inside speculation are not supported`);
  if (!insideSpeculation && effect.kind === "abandon")
    throw new Error(`${grammar}.${name}: abandon requires a speculative state`);
  if (
    (effect.kind === "push" || (effect.kind === "goto" && !insideSpeculation)) &&
    speculativeStates.has(effect.state)
  )
    throw new Error(`${grammar}.${name}: speculative states require a speculative opener`);
  if (
    (effect.kind === "push" || effect.kind === "goto" || effect.kind === "speculate") &&
    !names.has(effect.state)
  )
    throw new Error(`${grammar}.${name}: unknown state ${effect.state}`);
  if (effect.kind === "pop" && effect.fallback !== undefined && !names.has(effect.fallback))
    throw new Error(`${grammar}.${name}: unknown state ${effect.fallback}`);
  if (effect.kind === "speculate" && effect.isolate && !names.has(effect.isolate.base))
    throw new Error(`${grammar}.${name}: unknown speculation base state ${effect.isolate.base}`);
}

export function checkSlotTransitions(
  grammar: Grammar,
  name: string,
  effects: readonly Effect[],
): void {
  type Ownership = "shared" | "owning";
  const ownershipOf = (state: string): Ownership =>
    grammar.states[state]?.slots === "shared" ? "shared" : "owning";
  const ownership = new Set(Object.keys(grammar.states).map(ownershipOf));
  // A pop to an unknown caller is still unambiguous if every state has the same ownership.
  const returned = ownership.size === 1 ? ownership.values().next().value : undefined;
  let current: Ownership | undefined = ownershipOf(name);
  const pushed: (Ownership | undefined)[] = [];
  const checkReplacement = (target: string) => {
    if (current === undefined)
      throw new Error(
        `${grammar.name}.${name}: cannot determine slot ownership after pop before changing state`,
      );
    if (current !== ownershipOf(target))
      throw new Error(
        `${grammar.name}.${name}: state change cannot cross shared and owning slot frames`,
      );
  };
  for (const effect of effects) {
    if (effect.kind === "push" || effect.kind === "speculate") {
      pushed.push(current);
      current = ownershipOf(effect.state);
    } else if (effect.kind === "pop") {
      if (!pushed.length && effect.fallback !== undefined) checkReplacement(effect.fallback);
      current = pushed.length ? pushed.pop() : returned;
    } else if (effect.kind === "goto") {
      checkReplacement(effect.state);
      current = ownershipOf(effect.state);
    } else if (effect.kind === "queueOpen" && grammar.queueSweep) {
      checkReplacement(grammar.queueSweep.footer);
    }
  }
}

export function checkZeroWidthOpen(
  effects: readonly Effect[],
  grammar: string,
  name: string,
): void {
  const opens = effects.filter(
    (effect) => effect.kind === "openStatic" || effect.kind === "openNamed",
  );
  if (!opens.length) return;
  const transitions = effects.filter(
    (effect) => effect.kind === "push" || effect.kind === "pop" || effect.kind === "goto",
  );
  const change = transitions[0];
  if (
    opens.length !== 1 ||
    transitions.length !== 1 ||
    !change ||
    (change.kind === "pop"
      ? change.fallback === undefined || change.fallback === name
      : change.state === name)
  )
    throw new Error(
      `${grammar}.${name}: a zero-width injection open needs exactly one state change`,
    );
}

export function checkFallback(
  state: State,
  grammar: string,
  name: string,
  names: Set<string>,
  speculativeStates: Set<string>,
): void {
  if (typeof state.otherwise === "string" && speculativeStates.has(state.otherwise))
    throw new Error(`${grammar}.${name}: speculative states require a speculative opener`);
  if (speculativeStates.has(name) && state.otherwise !== undefined)
    throw new Error(`${grammar}.${name}: a speculative state cannot replace itself`);
  if (typeof state.otherwise === "string" && !names.has(state.otherwise))
    throw new Error(`${grammar}.${name}: unknown state ${state.otherwise}`);
  if (state.otherwise && typeof state.otherwise !== "string") {
    if (
      !state.otherwise.length ||
      state.otherwise.some(
        (effect) =>
          effect.kind !== "push" &&
          effect.kind !== "pop" &&
          effect.kind !== "goto" &&
          effect.kind !== "openStatic" &&
          effect.kind !== "openNamed",
      )
    )
      throw new Error("A fallback transition needs only stack effects");
    checkZeroWidthOpen(state.otherwise, grammar, name);
    for (const effect of state.otherwise) {
      if ((effect.kind === "push" || effect.kind === "goto") && !names.has(effect.state))
        throw new Error(`${grammar}.${name}: unknown state ${effect.state}`);
      if (effect.kind === "pop" && effect.fallback !== undefined && !names.has(effect.fallback))
        throw new Error(`${grammar}.${name}: unknown state ${effect.fallback}`);
    }
  }
}
