import { type Effect, maxDepth } from "#/grammar/mod.ts";
import type { Style } from "#/grammar/styles.ts";
import { i32Or, injectionAction } from "./runtime.ts";
import {
  lowerCaptureReset,
  lowerCaptureAppend,
  lowerCaptureMark,
  lowerQueueAction,
  lowerQueueSave,
  lowerQueueOpen,
} from "./shell.ts";
import {
  lowerCaptureColumn,
  lowerCounterReset,
  lowerCounterIncrement,
  lowerCounterDecrement,
  captureRunCode,
} from "./slots.ts";

type ShapeContext = {
  framesOffset: number;
  frameAddress: string;
  frameOpeningOffset?: number;
  columns: string[];
  frameRunIndices: number[];
  frameRunOffset: number;
  frameCounterIndices: number[];
  frameCounterOffset: number;
  sharedStates: readonly number[];
  sharedNames: ReadonlySet<string>;
  currentShared: boolean | undefined;
  counterSlots: Map<string, number>;
  runSlots: Map<string, number>;
  hasSpeculation: boolean;
  speculationPass: string;
};

type ArmEffectContext = {
  operations: Effect[];
  captures: string[];
  injections: string[];
  chosen?: Style;
  patch?: Style;
  mark: boolean;
  opener?: Extract<Effect, { kind: "speculate" }>;
  wrap?: Extract<Effect, { kind: "wrap" }>;
  runSlots: Map<string, number>;
  rangeSlots: Map<string, number>;
  embeds: string[];
};

export const frameStateBytes = 4;
export const frameColumnBytes = 8;
export const frameRunBytes = 8;
export const frameWordBytes = 4;

export function frameAddressAt(depth: string, frameBytes: number): string {
  return `(i32.add (global.get $base) (i32.mul ${depth} (i32.const ${frameBytes})))`;
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

function lowerPush(
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

function lowerPop(op: Extract<Effect, { kind: "pop" }>, i: number, context: ShapeContext): string {
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
}

export function lowerInjectionActions(
  effects: readonly Effect[],
  rangeSlots: Map<string, number>,
  embeds: string[],
): string[] {
  return effects.flatMap((effect) => {
    if (
      effect.kind === "saveRange" ||
      effect.kind === "clearRange" ||
      effect.kind === "openNamed"
    ) {
      const index = rangeSlots.get(effect.slot.name)!;
      const start = `$rangeStart${index}`;
      const end = `$rangeEnd${index}`;
      switch (effect.kind) {
        case "saveRange":
          return [
            `(local.set ${start} (local.get $pos))
            (local.set ${end} (local.get $matchCursor))`,
          ];
        case "clearRange":
          return [
            `(local.set ${start} (i32.const 0))
            (local.set ${end} (i32.const 0))`,
          ];
        case "openNamed":
          return [
            `(local.set $openStart (local.get ${start}))
            (local.set $openEnd (local.get ${end}))
            (local.set $openAction (i32.const ${injectionAction.named}))`,
          ];
      }
    }
    if (effect.kind === "openStatic") {
      const language = embeds.indexOf(effect.language);
      return [
        `(local.set $openStart (i32.const ${language})) (local.set $openAction (i32.const ${injectionAction.static}))`,
      ];
    }
    if (effect.kind === "hostPrefix")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail)))
          (local.set $hostCurrent (i32.const -1))
          (local.set $parentPaint (i32.const 1))`,
      ];
    if (effect.kind === "closeInjection")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail)))
          (call $sealHost (local.get $hostLast))
          (local.set $host (i32.const 0))
          (local.set $hostCurrent (i32.const -1))`,
      ];
    return [];
  });
}

export function lowerBranch(
  effects: readonly Effect[],
  context: ArmEffectContext,
  options: {
    styles: Style[];
    names: string[];
    speculationGroup: (opener: Extract<Effect, { kind: "speculate" }>) => string;
    speculationSave: string;
    shapeOf: (operations: Effect[]) => string;
    wrapStart: string;
  },
): string {
  for (const effect of effects) lowerArmEffect(effect, context);
  const { chosen, operations, captures, injections, patch, mark, opener, wrap } = context;
  const assignments = operations.flatMap((op, i) => targetAssignment(op, i, options.names));
  const patchIndex = patch !== undefined ? options.styles.indexOf(patch) : undefined;
  const patchCode = patchIndex !== undefined ? `(local.set $patch (i32.const ${patchIndex}))` : "";
  const markCode = mark ? "(local.set $mark (i32.const 1))" : "";
  const group = opener ? options.speculationGroup(opener) : undefined;
  const speculationSave = options.speculationSave;
  const speculation =
    group !== undefined ? `(local.set $specGroup ${group}) ${speculationSave}` : "";
  const wrapStart = wrap?.from === "arm" ? "(local.get $pos)" : options.wrapStart;
  const wrapStyle = wrap ? options.styles.indexOf(wrap.style) : undefined;
  const wrapping =
    wrapStyle !== undefined
      ? `(local.set $wrapStyle (i32.const ${wrapStyle})) (local.set $wrapStart ${wrapStart})`
      : "";
  const destination = operations.length ? options.shapeOf(operations) : "$paint";
  const style = `(local.set $style (i32.const ${options.styles.indexOf(chosen ?? "plain")}))`;
  const captureCode = captures.join("\n");
  const injectionCode = injections.join("\n");
  const assignmentCode = assignments.join("\n");
  return `${speculation}
        ${wrapping}
        ${style}
        ${captureCode}
        ${injectionCode}
        ${patchCode}
        ${markCode}
        ${assignmentCode}
        (br ${destination})`;
}

export function lowerShapeEffect(effect: Effect, index: number, context: ShapeContext): string {
  switch (effect.kind) {
    case "captureReset":
      return lowerCaptureReset();
    case "captureAppend":
      return lowerCaptureAppend(effect.skip);
    case "captureMark":
      return lowerCaptureMark(effect.flags);
    case "resource":
      return `(call $fail)`;
    case "queueSave":
      return lowerQueueSave(effect.footerIndent);
    case "queueOpen":
      return lowerQueueOpen();
    case "goto":
      return `(local.set $state (local.get $target${index}))`;
    case "push":
      return lowerPush(effect, index, context);
    case "speculate":
      return lowerPush(effect, index, context);
    case "pop":
      return lowerPop(effect, index, context);
    case "captureColumn":
      return lowerCaptureColumn(context.columns.indexOf(effect.slot.name));
    case "counterReset":
      return lowerCounterReset(context.counterSlots.get(effect.slot.name)!);
    case "counterIncrement":
      return lowerCounterIncrement(context.counterSlots.get(effect.slot.name)!);
    case "counterDecrement":
      return lowerCounterDecrement(context.counterSlots.get(effect.slot.name)!);
    case "queueEnter":
    case "queueLeave":
    case "queueShift":
      return lowerQueueAction(effect.kind);
    case "captureRun":
      return effect.slot.scope === "frame"
        ? captureRunCode(context.runSlots.get(effect.slot.name)!)
        : "";
    case "paint":
    case "markRecord":
    case "patchRecord":
    case "wrap":
    case "saveRange":
    case "clearRange":
    case "openNamed":
    case "openStatic":
    case "hostPrefix":
    case "closeInjection":
    case "abandon":
    case "word":
      return "";
  }
}

function lowerArmEffect(effect: Effect, context: ArmEffectContext): void {
  switch (effect.kind) {
    case "captureReset":
    case "captureAppend":
    case "captureMark":
    case "resource":
    case "queueSave":
    case "queueOpen":
    case "goto":
    case "push":
    case "pop":
    case "captureColumn":
    case "counterReset":
    case "counterIncrement":
    case "counterDecrement":
    case "queueEnter":
    case "queueLeave":
    case "queueShift":
      context.operations.push(effect);
      return;
    case "speculate":
      context.operations.push(effect);
      context.opener ??= effect;
      return;
    case "captureRun":
      if (effect.slot.scope === "frame") context.operations.push(effect);
      else context.captures.push(captureRunCode(context.runSlots.get(effect.slot.name)!));
      return;
    case "paint":
      context.chosen ??= effect.style;
      return;
    case "markRecord":
      context.mark = true;
      return;
    case "patchRecord":
      context.patch ??= effect.style;
      return;
    case "wrap":
      context.wrap = effect;
      return;
    case "saveRange":
    case "clearRange":
    case "openNamed":
    case "openStatic":
    case "hostPrefix":
    case "closeInjection":
      context.injections.push(
        ...lowerInjectionActions([effect], context.rangeSlots, context.embeds),
      );
      return;
    case "abandon":
    case "word":
      return;
  }
}

export function targetAssignment(effect: Effect, index: number, names: string[]): string[] {
  let target: string | undefined;
  switch (effect.kind) {
    case "goto":
    case "push":
    case "speculate":
      target = effect.state;
      break;
    case "pop":
      target = effect.fallback;
      break;
    case "captureReset":
    case "captureAppend":
    case "captureMark":
    case "resource":
    case "queueEnter":
    case "queueLeave":
    case "queueShift":
    case "queueSave":
    case "queueOpen":
    case "captureColumn":
    case "paint":
    case "markRecord":
    case "patchRecord":
    case "wrap":
    case "captureRun":
    case "counterReset":
    case "counterIncrement":
    case "counterDecrement":
    case "saveRange":
    case "clearRange":
    case "openNamed":
    case "openStatic":
    case "hostPrefix":
    case "closeInjection":
    case "abandon":
    case "word":
      return [];
  }
  return target === undefined
    ? []
    : [`(local.set $target${index} (i32.const ${names.indexOf(target)}))`];
}
