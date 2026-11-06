import type { Style } from "./styles.ts";
import type { Grammar } from "./mod.ts";
import { visitGrammar } from "./visit.ts";

/** Collect ordered grammar metadata for the compiler. */
export function analyzeGrammar(grammar: Grammar) {
  const styles = new Set<Style>(["plain"]);
  const embeds = new Set<string>();
  const columns = new Set<string>();
  const runs = new Map<string, number>();
  const ranges = new Map<string, number>();
  let injections = false;
  visitGrammar(grammar, {
    state(state) {
      styles.add(state.style);
      if (state.prefix) styles.add(state.prefix.style);
    },
    matcher(matcher) {
      if (matcher.kind === "toColumn") columns.add(matcher.slot.name);
      if (matcher.kind === "sameRun" && !runs.has(matcher.slot.name))
        runs.set(matcher.slot.name, runs.size);
    },
    effect(effect) {
      if (effect.kind === "paint" || effect.kind === "patchRecord" || effect.kind === "wrap")
        styles.add(effect.style);
      if (effect.kind === "captureColumn") columns.add(effect.slot.name);
      if (effect.kind === "captureRun" && !runs.has(effect.slot.name))
        runs.set(effect.slot.name, runs.size);
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
    runs,
    ranges,
    injections,
  };
}

export const stylesOf = (grammar: Grammar): Style[] => analyzeGrammar(grammar).styles;
export const staticEmbeds = (grammar: Grammar): string[] => analyzeGrammar(grammar).embeds;
export const columnSlots = (grammar: Grammar): string[] => analyzeGrammar(grammar).columns;
