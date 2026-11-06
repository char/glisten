import { maxDepth } from "#/grammar/limits.ts";
import type { Effect } from "#/grammar/mod.ts";
import type { ShapeContext, ShapeLowering } from "./effect.ts";
import type { ArmEffectLowering } from "./arm_effect.ts";

export const lowerSpeculationOpener: ArmEffectLowering<"speculate"> = (effect, context) => {
  context.opener ??= effect;
};

export function stateTarget(effect: Effect): string | undefined {
  if (effect.kind === "push" || effect.kind === "goto" || effect.kind === "speculate")
    return effect.state;
  if (effect.kind === "pop") return effect.fallback;
  return undefined;
}

export const stateFrameAreaBytes = (frameBytes: number): number => frameBytes * maxDepth;

export const lowerResource: ShapeLowering<"resource"> = () => `(call $fail)`;
export const lowerGoto: ShapeLowering<"goto"> = (_op, i) => `(local.set $state (local.get $t${i}))`;

export function lowerPush(
  _op: Extract<Effect, { kind: "push" | "speculate" }>,
  i: number,
  context: ShapeContext,
): string {
  const { framesOffset, frameAddress, columns, frameOpeningOffset } = context;
  return `(if (i32.ge_u (local.get $depth) (i32.const ${maxDepth - 1})) (then (call $fail)))
              (i32.store offset=${framesOffset} ${frameAddress} (local.get $state))
              ${frameOpeningOffset === undefined ? "" : `(i32.store offset=${frameOpeningOffset} ${frameAddress} (local.get $pos))`}
              ${columns.map((_, slot) => `(i64.store offset=${framesOffset + 4 + slot * 8} ${frameAddress} (local.get $columnSlot${slot}))`).join(" ")}
              (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
              (local.set $state (local.get $t${i}))`;
}

export const lowerPop: ShapeLowering<"pop"> = (op, i, context) => {
  const { framesOffset, frameAddress, columns, hasSpeculation, speculationPass } = context;
  return `${hasSpeculation ? speculationPass : ""}
              (if (local.get $depth) (then
              (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))
              (local.set $state (i32.load offset=${framesOffset} ${frameAddress}))
              ${columns.map((_, slot) => `(local.set $columnSlot${slot} (i64.load offset=${framesOffset + 4 + slot * 8} ${frameAddress}))`).join(" ")})
              ${op.fallback === undefined ? "" : `(else (local.set $state (local.get $t${i})))`})`;
};
