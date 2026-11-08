import { maxDepth } from "#/grammar/limits.ts";
import type { Effect } from "#/grammar/mod.ts";
import type { ShapeContext, ShapeLowering } from "./effect.ts";
import type { ArmEffectLowering } from "./arm_effect.ts";
import { i32Or } from "./idioms.ts";

export const frameStateBytes = 4;
export const frameColumnBytes = 8;
export const frameRunBytes = 8;
export const frameWordBytes = 4;

export function frameAddressAt(depth: string, frameBytes: number): string {
  return `(i32.add (global.get $base) (i32.mul ${depth} (i32.const ${frameBytes})))`;
}

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

export const isSharedState = (state: string, sharedStates: readonly number[]): string =>
  i32Or(
    sharedStates.map((id) => `(i32.eq ${state} (i32.const ${id}))`),
    "(i32.const 0)",
  );

export function slotOwnerFunction(
  sharedStates: readonly number[],
  frameBytes: number,
  framesOffset: number,
): string {
  const frameOffset = `offset=${framesOffset}`;
  const childShared = isSharedState("(local.get $child)", sharedStates);
  const nextFrame = frameAddressAt("(i32.add (local.get $from) (i32.const 1))", frameBytes);
  return `(func $findSlotOwner (param $from i32) (param $depth i32) (param $state i32) (result i32)
    (local $child i32)
    (block $done (loop $next
      (br_if $done (i32.ge_u (local.get $from) (local.get $depth)))
      (local.set $child
        (if (result i32) (i32.eq (i32.add (local.get $from) (i32.const 1)) (local.get $depth))
          (then (local.get $state))
          (else
            (i32.load ${frameOffset} ${nextFrame}))))
      (br_if $done (i32.eqz ${childShared}))
      (local.set $from (i32.add (local.get $from) (i32.const 1)))
      (br $next)))
    (if (result i32) (i32.lt_u (local.get $from) (local.get $depth))
      (then (local.get $from))
      (else (i32.const -1))))`;
}

export const lowerResource: ShapeLowering<"resource"> = () => `(call $fail)`;
export const lowerGoto: ShapeLowering<"goto"> = (_op, i) => {
  const target = `$target${i}`;
  return `(local.set $state (local.get ${target}))`;
};

export function lowerPush(
  op: Extract<Effect, { kind: "push" | "speculate" }>,
  i: number,
  context: ShapeContext,
): string {
  const {
    framesOffset,
    frameAddress,
    columns,
    frameOpeningOffset,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    sharedNames,
  } = context;
  const shared = sharedNames.has(op.state);
  const depthLimit = maxDepth - 1;
  const frameOffset = `offset=${framesOffset}`;
  const target = `$target${i}`;
  const openingOffset = `offset=${frameOpeningOffset}`;
  const opening =
    frameOpeningOffset === undefined
      ? ""
      : `(i32.store ${openingOffset} ${frameAddress} (local.get $pos))`;
  const columnStores = columns
    .map((_, slot) => {
      const column = `$columnSlot${slot}`;
      const offset = `offset=${framesOffset + frameStateBytes + slot * frameColumnBytes}`;
      return `(i64.store ${offset} ${frameAddress} (local.get ${column}))`;
    })
    .join("\n");
  const runStores = shared
    ? ""
    : frameRunIndices
        .map((slot, index) => {
          const byte = `$runByte${slot}`;
          const length = `$runLength${slot}`;
          const byteOffset = `offset=${frameRunOffset + index * frameRunBytes}`;
          const lengthOffset = `offset=${frameRunOffset + index * frameRunBytes + frameWordBytes}`;
          return `(i32.store ${byteOffset} ${frameAddress} (local.get ${byte}))
            (i32.store ${lengthOffset} ${frameAddress} (local.get ${length}))`;
        })
        .join("\n");
  const counterStores = shared
    ? ""
    : frameCounterIndices
        .map((slot, index) => {
          const counter = `$counter${slot}`;
          const offset = `offset=${frameCounterOffset + index * frameWordBytes}`;
          return `(i32.store ${offset} ${frameAddress} (local.get ${counter}))`;
        })
        .join("\n");
  return `(if (i32.ge_u (local.get $depth) (i32.const ${depthLimit})) (then (call $fail)))
    (i32.store ${frameOffset} ${frameAddress} (local.get $state))
    ${opening}
    ${columnStores}
    ${runStores}
    ${counterStores}
    (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
    (local.set $state (local.get ${target}))`;
}

export const lowerPop: ShapeLowering<"pop"> = (op, i, context) => {
  const {
    framesOffset,
    frameAddress,
    columns,
    hasSpeculation,
    speculationPass,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    sharedStates,
    currentShared,
  } = context;
  const runRestore = frameRunIndices
    .map((slot, index) => {
      const byte = `$runByte${slot}`;
      const length = `$runLength${slot}`;
      const byteOffset = `offset=${frameRunOffset + index * frameRunBytes}`;
      const lengthOffset = `offset=${frameRunOffset + index * frameRunBytes + frameWordBytes}`;
      return `(local.set ${byte} (i32.load ${byteOffset} ${frameAddress}))
        (local.set ${length} (i32.load ${lengthOffset} ${frameAddress}))`;
    })
    .join("\n");
  const counterRestore = frameCounterIndices
    .map((slot, index) => {
      const counter = `$counter${slot}`;
      const offset = `offset=${frameCounterOffset + index * frameWordBytes}`;
      return `(local.set ${counter} (i32.load ${offset} ${frameAddress}))`;
    })
    .join("\n");
  const stateShared = isSharedState("(local.get $state)", sharedStates);
  const slots =
    !sharedStates.length || currentShared === true
      ? ""
      : currentShared === false
        ? `${runRestore} ${counterRestore}`
        : `(if (i32.eqz ${stateShared})
          (then ${runRestore} ${counterRestore}))`;
  const pass = hasSpeculation ? speculationPass : "";
  const frameOffset = `offset=${framesOffset}`;
  const columnRestore = columns
    .map((_, slot) => {
      const column = `$columnSlot${slot}`;
      const offset = `offset=${framesOffset + frameStateBytes + slot * frameColumnBytes}`;
      return `(local.set ${column} (i64.load ${offset} ${frameAddress}))`;
    })
    .join("\n");
  const unsharedRuns = sharedStates.length ? "" : runRestore;
  const unsharedCounters = sharedStates.length ? "" : counterRestore;
  const target = `$target${i}`;
  const fallback =
    op.fallback === undefined ? "" : `(else (local.set $state (local.get ${target})))`;
  return `${pass}
    (if (local.get $depth) (then
      (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))
      ${slots}
      (local.set $state (i32.load ${frameOffset} ${frameAddress}))
      ${columnRestore} ${unsharedRuns} ${unsharedCounters})
      ${fallback})`;
};
