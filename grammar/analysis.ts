import type { Effect, Grammar, Matcher, State } from "./mod.ts";
import type { CounterSlot, RunSlot } from "./slots.ts";
import type { Style } from "./styles.ts";

export type GrammarVisitor = {
  state?: (state: State) => void;
  matcher?: (matcher: Matcher) => void;
  effect?: (effect: Effect) => void;
};

export function visitMatchers(
  matchers: readonly Matcher[],
  visit: (matcher: Matcher) => void | boolean,
  leave?: (matcher: Matcher) => void,
): void {
  const match = (item: Matcher): void => {
    if (visit(item) === false) {
      leave?.(item);
      return;
    }
    switch (item.kind) {
      case "either":
        item.alternatives.forEach((alternative) => alternative.forEach(match));
        break;
      case "ahead":
      case "notAhead":
      case "opt":
      case "repeat":
        item.matchers.forEach(match);
        break;
      case "cachedPrefix":
        item.suffix.forEach(match);
        break;
    }
    leave?.(item);
  };
  matchers.forEach(match);
}

export function someMatcher(
  matchers: readonly Matcher[],
  predicate: (matcher: Matcher) => boolean,
): boolean {
  let found = false;
  visitMatchers(matchers, (matcher) => {
    if (found) return false;
    if (predicate(matcher)) found = true;
    return !found;
  });
  return found;
}

export function visitGrammar(grammar: Grammar, visitor: GrammarVisitor): void {
  const match = (matcher: Matcher) => visitMatchers([matcher], (item) => visitor.matcher?.(item));
  const effect = (item: Effect): void => {
    visitor.effect?.(item);
    if (item.kind === "word") {
      item.cases.forEach(({ then }) => then.forEach(effect));
      item.otherwise.forEach(effect);
    }
  };
  for (const state of Object.values(grammar.states)) {
    visitor.state?.(state);
    state.prefix?.match.forEach(match);
    state.prefix?.lazy?.unless.forEach(match);
    for (const arm of state.arms) {
      arm.match.forEach(match);
      arm.then.forEach(effect);
    }
    if (state.otherwise && typeof state.otherwise !== "string") state.otherwise.forEach(effect);
  }
}

export function usesCapture(grammar: Grammar): boolean {
  let used = false;
  visitGrammar(grammar, {
    state: (state) => {
      if (state.captureFallback) used = true;
    },
    matcher: (matcher) => {
      if (matcher.kind === "captured") used = true;
    },
    effect: (effect) => {
      if (
        effect.kind === "captureReset" ||
        effect.kind === "captureAppend" ||
        effect.kind === "captureMark" ||
        effect.kind === "queueSave"
      )
        used = true;
    },
  });
  return used;
}

export function usesQueue(grammar: Grammar): boolean {
  let used = !!grammar.queueSweep;
  visitGrammar(grammar, {
    matcher: (matcher) => {
      if (
        matcher.kind === "queueHas" ||
        matcher.kind === "queueText" ||
        matcher.kind === "queueFooter"
      )
        used = true;
    },
    effect: (effect) => {
      if (
        effect.kind === "queueEnter" ||
        effect.kind === "queueLeave" ||
        effect.kind === "queueSave" ||
        effect.kind === "queueShift" ||
        effect.kind === "queueOpen"
      )
        used = true;
    },
  });
  return used;
}

export function analyzeGrammar(grammar: Grammar) {
  const styles = new Set<Style>(["plain"]);
  const embeds = new Set<string>();
  const columns = new Set<string>();
  const runs = new Map<string, number>();
  const frameRuns = new Set<string>();
  const counters = new Map<string, number>();
  const frameCounters = new Set<string>();
  const ranges = new Map<string, number>();
  let injections = false;
  let tracksColumn = false;
  const useRun = (slot: RunSlot) => {
    if (!runs.has(slot.name)) runs.set(slot.name, runs.size);
    if (slot.scope === "frame") frameRuns.add(slot.name);
  };
  const useCounter = (slot: CounterSlot) => {
    if (!counters.has(slot.name)) counters.set(slot.name, counters.size);
    if (slot.scope === "frame") frameCounters.add(slot.name);
  };
  visitGrammar(grammar, {
    state(state) {
      styles.add(state.style);
      if (state.prefix) styles.add(state.prefix.style);
    },
    matcher(matcher) {
      if (matcher.kind === "toColumn") columns.add(matcher.slot.name);
      if (
        matcher.kind === "columnAtLeast" ||
        (matcher.kind === "run" && matcher.untilColumn !== undefined)
      )
        tracksColumn = true;
      if (matcher.kind === "counterZero" || matcher.kind === "counterPositive")
        useCounter(matcher.slot);
      if (matcher.kind === "sameRun") useRun(matcher.slot);
    },
    effect(effect) {
      if (effect.kind === "paint" || effect.kind === "patchRecord" || effect.kind === "wrap")
        styles.add(effect.style);
      if (effect.kind === "captureColumn") columns.add(effect.slot.name);
      if (
        effect.kind === "counterReset" ||
        effect.kind === "counterIncrement" ||
        effect.kind === "counterDecrement"
      )
        useCounter(effect.slot);
      if (effect.kind === "captureRun") useRun(effect.slot);
      if (
        effect.kind === "saveRange" ||
        effect.kind === "clearRange" ||
        effect.kind === "openNamed"
      ) {
        if (!ranges.has(effect.slot.name)) ranges.set(effect.slot.name, ranges.size);
      }
      if (effect.kind === "openStatic") embeds.add(effect.language);
      if (
        effect.kind === "openNamed" ||
        effect.kind === "openStatic" ||
        effect.kind === "closeInjection" ||
        effect.kind === "hostPrefix"
      )
        injections = true;
    },
  });
  if (grammar.queueSweep) {
    styles.add(grammar.queueSweep.footerStyle);
    styles.add(grammar.queueSweep.tabStyle);
  }
  return {
    styles: [...styles],
    embeds: [...embeds],
    columns: [...columns],
    tracksColumn: tracksColumn || columns.size > 0,
    runs,
    frameRuns,
    counters,
    frameCounters,
    ranges,
    injections,
  };
}
