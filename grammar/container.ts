import type { Matcher, State } from "./mod.ts";

export function checkContainer(
  state: State,
  grammar: string,
  name: string,
  names: Set<string>,
  checkMatchers: (matcher: Matcher) => void,
): void {
  if (state.prefix) {
    if (!state.prefix.match.length)
      throw new Error(`${grammar}.${name}: container prefix needs matchers`);
    state.prefix.match.forEach(checkMatchers);
    state.prefix.lazy?.unless.forEach(checkMatchers);
    for (const top of state.prefix.lazy?.top ?? [])
      if (!names.has(top)) throw new Error(`${grammar}.${name}: unknown lazy state ${top}`);
  }
}
