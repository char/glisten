import type { Style } from "./styles.ts";
import type { Grammar } from "./mod.ts";
import { visitGrammar } from "./visit.ts";

/** Collect ordered grammar metadata for the compiler. */
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
      if (matcher.kind === "counterZero" || matcher.kind === "counterPositive") {
        if (!counters.has(matcher.slot.name)) counters.set(matcher.slot.name, counters.size);
        if (matcher.slot.scope === "frame") frameCounters.add(matcher.slot.name);
      }
      if (matcher.kind === "sameRun") {
        if (!runs.has(matcher.slot.name)) runs.set(matcher.slot.name, runs.size);
        if (matcher.slot.scope === "frame") frameRuns.add(matcher.slot.name);
      }
    },
    effect(effect) {
      if (effect.kind === "paint" || effect.kind === "patchRecord" || effect.kind === "wrap")
        styles.add(effect.style);
      if (effect.kind === "captureColumn") columns.add(effect.slot.name);
      if (
        effect.kind === "counterReset" ||
        effect.kind === "counterIncrement" ||
        effect.kind === "counterDecrement"
      ) {
        if (!counters.has(effect.slot.name)) counters.set(effect.slot.name, counters.size);
        if (effect.slot.scope === "frame") frameCounters.add(effect.slot.name);
      }
      if (effect.kind === "captureRun") {
        if (!runs.has(effect.slot.name)) runs.set(effect.slot.name, runs.size);
        if (effect.slot.scope === "frame") frameRuns.add(effect.slot.name);
      }
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

export const stylesOf = (grammar: Grammar): Style[] => analyzeGrammar(grammar).styles;
export const staticEmbeds = (grammar: Grammar): string[] => analyzeGrammar(grammar).embeds;
export const columnSlots = (grammar: Grammar): string[] => analyzeGrammar(grammar).columns;
