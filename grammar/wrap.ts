import type { Effect, Grammar, State } from "./mod.ts";
import { styleTags } from "./styles.ts";

/** Check wrapping per executable branch and ensure frame-form wraps have an opener. */
export function checkWraps(grammar: Grammar): void {
  const pushed = new Set<string>();
  const root = new Set<string>([grammar.initial]);
  const branches = (effects: readonly Effect[]): readonly (readonly Effect[])[] => {
    const word = effects.find((effect) => effect.kind === "word");
    return word?.kind === "word"
      ? [...word.cases.map((item) => item.then), word.otherwise]
      : [effects];
  };
  for (const state of Object.values<State>(grammar.states)) {
    const lists = state.arms.flatMap((arm) => branches(arm.then));
    if (state.otherwise && typeof state.otherwise !== "string") lists.push(state.otherwise);
    for (const list of lists) {
      let depth = 0;
      let returned = false;
      for (const effect of list) {
        if (effect.kind === "push" || effect.kind === "speculate") {
          pushed.add(effect.state);
          depth++;
        } else if (effect.kind === "pop") {
          if (depth) depth--;
          else returned = true;
        } else if (effect.kind === "goto") {
          if (depth) pushed.add(effect.state);
          else if (returned) root.add(effect.state);
        }
      }
    }
  }
  for (const frames of [root, pushed]) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const name of [...frames]) {
        const state = grammar.states[name];
        if (!state) continue;
        const targets: string[] = [];
        if (typeof state.otherwise === "string") targets.push(state.otherwise);
        const lists = state.arms.flatMap((arm) => branches(arm.then));
        if (state.otherwise && typeof state.otherwise !== "string") lists.push(state.otherwise);
        for (const list of lists) {
          let depth = 0;
          for (const effect of list) {
            if (effect.kind === "push" || effect.kind === "speculate") depth++;
            if (effect.kind === "goto" && depth === 0) targets.push(effect.state);
            if (effect.kind === "pop") {
              if (depth) depth--;
              else if (frames === root && effect.fallback !== undefined)
                targets.push(effect.fallback);
            }
          }
        }
        for (const target of targets)
          if (!frames.has(target)) {
            frames.add(target);
            changed = true;
          }
      }
    }
  }
  for (const [name, state] of Object.entries<State>(grammar.states)) {
    for (const arm of state.arms)
      for (const list of branches(arm.then)) {
        const wraps = list.filter((effect) => effect.kind === "wrap");
        if (wraps.length > 1) throw new Error(`${grammar.name}.${name}: at most one wrap per arm`);
        for (const effect of wraps) {
          if (!Object.hasOwn(styleTags, effect.style) || !styleTags[effect.style])
            throw new Error(`${grammar.name}.${name}: wrap style must have a tag`);
          if (effect.from !== "arm" && effect.from !== "frame")
            throw new Error(`${grammar.name}.${name}: invalid wrap origin`);
          if (effect.from === "frame" && (!pushed.has(name) || root.has(name)))
            throw new Error(`${grammar.name}.${name}: frame wrap requires a pushed state`);
        }
      }
  }
}
