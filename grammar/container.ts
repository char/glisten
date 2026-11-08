import type { Matcher, State } from "./mod.ts";

export function checkContainer(
  state: State,
  grammar: string,
  name: string,
  names: Set<string>,
  checkMatchers: (matcher: Matcher) => void,
): void {
  const prefix = state.prefix;
  if (!prefix) return;
  if (!prefix.match.length) throw new Error(`${grammar}.${name}: container prefix needs matchers`);
  prefix.match.forEach(checkMatchers);
  prefix.lazy?.unless.forEach(checkMatchers);
  for (const top of prefix.lazy?.top ?? [])
    if (!names.has(top)) throw new Error(`${grammar}.${name}: unknown lazy state ${top}`);
}
