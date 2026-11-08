import { maxCounter } from "#/grammar/counter_slot.ts";
import type { MatcherLowering } from "./matcher.ts";
import type { ShapeLowering } from "./effect.ts";

export const lowerCounterZero: MatcherLowering<"counterZero"> = (
  matcher,
  fail,
  _known,
  context,
) => {
  const local = `$counter${context.counterSlots.get(matcher.slot.name)!}`;
  return `(br_if ${fail} (local.get ${local}))`;
};

export const lowerCounterPositive: MatcherLowering<"counterPositive"> = (
  matcher,
  fail,
  _known,
  context,
) => {
  const local = `$counter${context.counterSlots.get(matcher.slot.name)!}`;
  return `(br_if ${fail} (i32.eqz (local.get ${local})))`;
};

export const lowerCounterReset: ShapeLowering<"counterReset"> = (effect, _index, context) => {
  const local = `$counter${context.counterSlots.get(effect.slot.name)!}`;
  return `(local.set ${local} (i32.const 0))`;
};

export const lowerCounterIncrement: ShapeLowering<"counterIncrement"> = (
  effect,
  _index,
  context,
) => {
  const local = `$counter${context.counterSlots.get(effect.slot.name)!}`;
  return `(if (i32.lt_u (local.get ${local}) (i32.const ${maxCounter}))
    (then (local.set ${local} (i32.add (local.get ${local}) (i32.const 1)))))`;
};

export const lowerCounterDecrement: ShapeLowering<"counterDecrement"> = (
  effect,
  _index,
  context,
) => {
  const local = `$counter${context.counterSlots.get(effect.slot.name)!}`;
  return `(if (local.get ${local})
    (then (local.set ${local} (i32.sub (local.get ${local}) (i32.const 1)))))`;
};
