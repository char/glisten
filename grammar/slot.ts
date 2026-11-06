import type { Effect, Grammar, Matcher } from "./mod.ts";
import { visitGrammar } from "./visit.ts";

const brand: unique symbol = Symbol("grammar slot");
type Kind = "run" | "counter" | "range" | "column";
export type Slot<K extends Kind> = {
  readonly kind: K;
  readonly name: string;
  readonly [brand]: true;
};
export type RunSlot = Slot<"run"> & { readonly scope?: "frame" };
export type CounterSlot = Slot<"counter"> & { readonly scope?: "frame" };
export type RangeSlot = Slot<"range">;
export type ColumnSlot = Slot<"column">;

function makeSlot<K extends Kind>(kind: K, name: string): Slot<K> {
  if (typeof name !== "string" || !name) throw new Error("A slot needs a name");
  return Object.freeze({ kind, name, [brand]: true as const });
}

export const slot = {
  run: (name: string, options: { scope?: "frame" } = {}): RunSlot => {
    if (options.scope !== undefined && options.scope !== "frame")
      throw new Error("Invalid run slot scope");
    const value = makeSlot("run", name);
    return options.scope === "frame" ? Object.freeze({ ...value, scope: "frame" }) : value;
  },
  counter: (name: string, options: { scope?: "frame" } = {}): CounterSlot => {
    if (options.scope !== undefined && options.scope !== "frame")
      throw new Error("Invalid counter slot scope");
    const value = makeSlot("counter", name);
    return options.scope === "frame" ? Object.freeze({ ...value, scope: "frame" }) : value;
  },
  range: (name: string): RangeSlot => makeSlot("range", name),
  column: (name: string): ColumnSlot => makeSlot("column", name),
};

export function checkSlots(grammar: Grammar): void {
  const seen = new Map<string, Slot<Kind>>();
  const check = (value: Slot<Kind>, kind: Kind) => {
    if (!value || typeof value !== "object" || value[brand] !== true || value.kind !== kind)
      throw new Error(`${grammar.name}: expected a ${kind} slot handle`);
    if (
      (kind === "run" || kind === "counter") &&
      (value as RunSlot | CounterSlot).scope !== undefined &&
      (value as RunSlot | CounterSlot).scope !== "frame"
    )
      throw new Error(`${grammar.name}: invalid ${kind} slot scope`);
    const key = `${kind}:${value.name}`;
    const previous = seen.get(key);
    if (previous && previous !== value)
      throw new Error(`${grammar.name}: duplicate ${kind} slot ${value.name}`);
    seen.set(key, value);
  };
  const matcher = (item: Matcher) => {
    if (item.kind === "sameRun") check(item.slot, "run");
    if (item.kind === "counterZero" || item.kind === "counterPositive") check(item.slot, "counter");
    if (item.kind === "toColumn") check(item.slot, "column");
  };
  const effect = (item: Effect) => {
    if (item.kind === "captureRun") check(item.slot, "run");
    if (
      item.kind === "counterReset" ||
      item.kind === "counterIncrement" ||
      item.kind === "counterDecrement"
    )
      check(item.slot, "counter");
    if (item.kind === "captureColumn") check(item.slot, "column");
    if (item.kind === "saveRange" || item.kind === "clearRange" || item.kind === "openNamed")
      check(item.slot, "range");
  };
  visitGrammar(grammar, { matcher, effect });
}
