import type { Effect, Grammar, Matcher } from "./mod.ts";
import { visitGrammar } from "./visit.ts";

const brand: unique symbol = Symbol("grammar slot");
type Kind = "run" | "range" | "column";
export type Slot<K extends Kind> = {
  readonly kind: K;
  readonly name: string;
  readonly [brand]: true;
};
export type RunSlot = Slot<"run">;
export type RangeSlot = Slot<"range">;
export type ColumnSlot = Slot<"column">;

function makeSlot<K extends Kind>(kind: K, name: string): Slot<K> {
  if (typeof name !== "string" || !name) throw new Error("A slot needs a name");
  return Object.freeze({ kind, name, [brand]: true as const });
}

export const slot = {
  run: (name: string): RunSlot => makeSlot("run", name),
  range: (name: string): RangeSlot => makeSlot("range", name),
  column: (name: string): ColumnSlot => makeSlot("column", name),
};

export function checkSlots(grammar: Grammar): void {
  const seen = new Map<string, Slot<Kind>>();
  const check = (value: Slot<Kind>, kind: Kind) => {
    if (!value || typeof value !== "object" || value[brand] !== true || value.kind !== kind)
      throw new Error(`${grammar.name}: expected a ${kind} slot handle`);
    const key = `${kind}:${value.name}`;
    const previous = seen.get(key);
    if (previous && previous !== value)
      throw new Error(`${grammar.name}: duplicate ${kind} slot ${value.name}`);
    seen.set(key, value);
  };
  const matcher = (item: Matcher) => {
    if (item.kind === "sameRun") check(item.slot, "run");
    if (item.kind === "toColumn") check(item.slot, "column");
  };
  const effect = (item: Effect) => {
    if (item.kind === "captureRun") check(item.slot, "run");
    if (item.kind === "captureColumn") check(item.slot, "column");
    if (item.kind === "saveRange" || item.kind === "clearRange" || item.kind === "openNamed")
      check(item.slot, "range");
  };
  visitGrammar(grammar, { matcher, effect });
}
