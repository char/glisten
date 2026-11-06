import type { CounterSlot } from "./slot.ts";

/** Counter values range from zero through this inclusive maximum. Increments saturate;
 * decrements at zero do nothing. */
export const maxCounter = 2_147_483_647;

export type CounterMatcher =
  | { readonly kind: "counterZero"; readonly slot: CounterSlot }
  | { readonly kind: "counterPositive"; readonly slot: CounterSlot };

export type CounterEffect =
  | { readonly kind: "counterReset"; readonly slot: CounterSlot }
  | { readonly kind: "counterIncrement"; readonly slot: CounterSlot }
  | { readonly kind: "counterDecrement"; readonly slot: CounterSlot };

export const counterZero = (slot: CounterSlot): CounterMatcher => ({ kind: "counterZero", slot });
export const counterPositive = (slot: CounterSlot): CounterMatcher => ({
  kind: "counterPositive",
  slot,
});
export const counterReset = (slot: CounterSlot): CounterEffect => ({ kind: "counterReset", slot });
export const counterIncrement = (slot: CounterSlot): CounterEffect => ({
  kind: "counterIncrement",
  slot,
});
export const counterDecrement = (slot: CounterSlot): CounterEffect => ({
  kind: "counterDecrement",
  slot,
});
