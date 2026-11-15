export const slotBrand: unique symbol = Symbol("grammar slot");
type Kind = "run" | "counter" | "range" | "column";
export type Slot<K extends Kind> = {
  readonly kind: K;
  readonly name: string;
  readonly [slotBrand]: true;
};
export type RunSlot = Slot<"run"> & { readonly scope?: "frame" };
export type CounterSlot = Slot<"counter"> & { readonly scope?: "frame" };
export type RangeSlot = Slot<"range">;
export type ColumnSlot = Slot<"column">;

function makeSlot<K extends Kind>(kind: K, name: string): Slot<K> {
  if (typeof name !== "string" || !name) throw new Error("A slot needs a name");
  return Object.freeze({ kind, name, [slotBrand]: true as const });
}

function makeScopedSlot<K extends "run" | "counter">(
  kind: K,
  name: string,
  options: { scope?: "frame" },
): Slot<K> & { readonly scope?: "frame" } {
  if (options.scope !== undefined && options.scope !== "frame")
    throw new Error(`Invalid ${kind} slot scope`);
  const value = makeSlot(kind, name);
  return options.scope === "frame" ? Object.freeze({ ...value, scope: "frame" }) : value;
}

export const slot = {
  run: (name: string, options: { scope?: "frame" } = {}): RunSlot =>
    makeScopedSlot("run", name, options),
  counter: (name: string, options: { scope?: "frame" } = {}): CounterSlot =>
    makeScopedSlot("counter", name, options),
  range: (name: string): RangeSlot => makeSlot("range", name),
  column: (name: string): ColumnSlot => makeSlot("column", name),
};

export type RunRelation = "atLeast" | "exact" | "prefix";
export type FooterIndent = "none" | "tabs" | "whitespace";

export const maxDepth = 128;
export const maxTransitions = 16 + 4 * maxDepth;
export const maxCounter = 2_147_483_647;
export const captureLimit = 256;
