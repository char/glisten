import type { Effect, Grammar, Matcher, State } from "./mod.ts";

export type GrammarVisitor = {
  state?: (state: State) => void;
  matcher?: (matcher: Matcher) => void;
  effect?: (effect: Effect) => void;
};

/** Visit matchers in source order. Returning false skips children but still calls leave. */
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

/** Test matchers recursively, including those inside combinators. */
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

/** Walk a grammar in declaration order, visiting each node before its children. */
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
