import type { Grammar, Matcher, State } from "#/grammar/mod.ts";
import { lineBoundaryCheck } from "./line_boundary.ts";
import { i32Or } from "./idioms.ts";
import {
  frameAddressAt,
  frameStateBytes,
  frameColumnBytes,
  frameRunBytes,
  frameWordBytes,
} from "./state.ts";
import type { speculationCode } from "./speculation_codegen.ts";

type ContainerContext = {
  states: State[];
  names: string[];
  grammar: Grammar;
  styles: string[];
  columns: string[];
  runSlots: Map<string, number>;
  frameRunIndices: number[];
  frameRunOffset: number;
  counterSlots: Map<string, number>;
  frameCounterIndices: number[];
  frameCounterOffset: number;
  frameBytes: number;
  shared: boolean;
  framesOffset: number;
  frameAddress: string;
  hasSpeculation: boolean;
  hasInjections: boolean;
  spec: ReturnType<typeof speculationCode>;
  fresh: (hint: string) => string;
  matcher: (matcher: Matcher, fail: string) => string;
};

export function containerCode(context: ContainerContext): string {
  const {
    states,
    names,
    grammar,
    styles,
    columns,
    runSlots,
    frameRunIndices,
    frameRunOffset,
    counterSlots,
    frameCounterIndices,
    frameCounterOffset,
    frameBytes,
    shared,
    framesOffset,
    frameAddress,
    hasSpeculation,
    hasInjections,
    spec,
    fresh,
    matcher,
  } = context;
  const local = (name: string, index: number) => `$${name}${index}`;
  const offset = (value: number) => `offset=${value}`;
  const frameOffset = offset(framesOffset);
  const frameAt = (index: string) => frameAddressAt(index, frameBytes);
  const saved = [
    ...columns.map((_, i) => {
      const saved = local("containerColumn", i);
      const current = local("columnSlot", i);
      return `(local.set ${saved} (local.get ${current}))`;
    }),
    ...[...runSlots.values()].flatMap((i) => {
      const savedByte = local("containerRunByte", i);
      const savedLength = local("containerRunLength", i);
      const byte = local("runByte", i);
      const length = local("runLength", i);
      return [
        `(local.set ${savedByte} (local.get ${byte}))`,
        `(local.set ${savedLength} (local.get ${length}))`,
      ];
    }),
    ...[...counterSlots.values()].map((i) => {
      const saved = local("containerCounter", i);
      const current = local("counter", i);
      return `(local.set ${saved} (local.get ${current}))`;
    }),
  ].join("\n");
  const restore = [
    `(local.set $depth (local.get $containerDepth))`,
    ...columns.map((_, i) => {
      const saved = local("containerColumn", i);
      const current = local("columnSlot", i);
      return `(local.set ${current} (local.get ${saved}))`;
    }),
    ...[...runSlots.values()].flatMap((i) => {
      const savedByte = local("containerRunByte", i);
      const savedLength = local("containerRunLength", i);
      const byte = local("runByte", i);
      const length = local("runLength", i);
      return [
        `(local.set ${byte} (local.get ${savedByte}))`,
        `(local.set ${length} (local.get ${savedLength}))`,
      ];
    }),
    ...[...counterSlots.values()].map((i) => {
      const saved = local("containerCounter", i);
      const current = local("counter", i);
      return `(local.set ${current} (local.get ${saved}))`;
    }),
  ].join("\n");

  const view = (index: string) => {
    const owner = shared
      ? `(local.set $slotOwnerIndex
        (call $findSlotOwner ${index}
          (local.get $containerBaseDepth)
          (local.get $containerBaseState)))`
      : "";
    const address = frameAt(index);
    const slotAddress = shared ? frameAt("(local.get $slotOwnerIndex)") : address;
    const condition = shared
      ? "(i32.ge_s (local.get $slotOwnerIndex) (i32.const 0))"
      : `(i32.lt_u ${index} (local.get $containerBaseDepth))`;
    const columnView = columns
      .map((_, i) => {
        const column = local("columnSlot", i);
        const saved = local("containerColumn", i);
        const current = `(local.get ${saved})`;
        const outerField = hasSpeculation ? spec.outerField(`columnSlot${i}`) : "";
        const outer = hasSpeculation
          ? `(if (result i64) (local.get $specOpen) (then ${outerField}) (else ${current}))`
          : current;
        const columnOffset = offset(framesOffset + frameStateBytes + i * frameColumnBytes);
        return `(local.set ${column}
          (if (result i64) (i32.lt_u ${index} (local.get $containerBaseDepth))
            (then (i64.load ${columnOffset} ${address}))
            (else ${outer})))`;
      })
      .join("\n");
    const runView = [...runSlots.values()]
      .flatMap((i) => {
        const slot = frameRunIndices.indexOf(i);
        const byte = local("runByte", i);
        const length = local("runLength", i);
        const outerByte = hasSpeculation ? spec.outerField(`runByte${i}`) : "";
        const outerLength = hasSpeculation ? spec.outerField(`runLength${i}`) : "";
        const outer = hasSpeculation
          ? `(if (local.get $specOpen)
            (then
              (local.set ${byte} ${outerByte})
              (local.set ${length} ${outerLength})))`
          : "";
        if (slot < 0) return outer ? [outer] : [];
        const byteOffset = offset(frameRunOffset + slot * frameRunBytes);
        const lengthOffset = offset(frameRunOffset + slot * frameRunBytes + frameWordBytes);
        return [
          `(if ${condition}
            (then
              (local.set ${byte} (i32.load ${byteOffset} ${slotAddress}))
              (local.set ${length} (i32.load ${lengthOffset} ${slotAddress})))
            (else ${outer}))`,
        ];
      })
      .join("\n");
    const counterView = [...counterSlots.values()]
      .flatMap((i) => {
        const slot = frameCounterIndices.indexOf(i);
        const counter = local("counter", i);
        const saved = local("containerCounter", i);
        const current = `(local.set ${counter} (local.get ${saved}))`;
        const outerField = hasSpeculation ? spec.outerField(`counter${i}`) : "";
        const outer = hasSpeculation
          ? `(if (local.get $specOpen)
            (then (local.set ${counter} ${outerField}))
            (else ${current}))`
          : current;
        if (slot < 0) return hasSpeculation ? [outer] : [];
        const counterOffset = offset(frameCounterOffset + slot * frameWordBytes);
        return [
          `(if ${condition}
            (then (local.set ${counter} (i32.load ${counterOffset} ${slotAddress})))
            (else ${outer}))`,
        ];
      })
      .join("\n");
    return `${owner}
      (local.set $depth ${index})
      ${columnView}
      ${runView}
      ${counterView}`;
  };
  const attempt = (items: readonly Matcher[], limitLine: boolean) => {
    const miss = fresh("containerMiss");
    const matchers = items.map((item) => matcher(item, miss)).join("\n");
    const boundary = limitLine ? lineBoundaryCheck(items, miss) : "";
    return `(local.set $containerMatched (i32.const 0))
      (local.set $matchCursor (local.get $pos))
      (block ${miss} ${matchers} ${boundary}
        (local.set $containerMatched (i32.const 1)))`;
  };
  const restoreRuns = (address: string) =>
    frameRunIndices
      .map((slot, index) => {
        const byte = local("runByte", slot);
        const length = local("runLength", slot);
        const byteOffset = offset(frameRunOffset + index * frameRunBytes);
        const lengthOffset = offset(frameRunOffset + index * frameRunBytes + frameWordBytes);
        return `(local.set ${byte} (i32.load ${byteOffset} ${address}))
          (local.set ${length} (i32.load ${lengthOffset} ${address}))`;
      })
      .join("\n");
  const restoreCounters = (address: string) =>
    frameCounterIndices
      .map((slot, index) => {
        const counter = local("counter", slot);
        const counterOffset = offset(frameCounterOffset + index * frameWordBytes);
        return `(local.set ${counter} (i32.load ${counterOffset} ${address}))`;
      })
      .join("\n");
  const ownerAddress = frameAt("(local.get $slotOwnerIndex)");
  const ownerRuns = restoreRuns(ownerAddress);
  const ownerCounters = restoreCounters(ownerAddress);
  const restoreOwner = shared
    ? `(local.set $slotOwnerIndex
        (call $findSlotOwner
          (if (result i32) (local.get $containerIndex)
            (then (i32.sub (local.get $containerIndex) (i32.const 1)))
            (else (i32.const 0)))
          (local.get $containerDepth)
          (local.get $state)))
      (if (i32.ge_s (local.get $slotOwnerIndex) (i32.const 0))
        (then ${ownerRuns} ${ownerCounters}))`
    : "";
  const columnsRestore = columns
    .map((_, slot) => {
      const column = local("columnSlot", slot);
      const columnOffset = offset(framesOffset + frameStateBytes + slot * frameColumnBytes);
      return `(local.set ${column} (i64.load ${columnOffset} ${frameAddress}))`;
    })
    .join("\n");
  const runsRestore = shared ? "" : restoreRuns(frameAddress);
  const countersRestore = shared ? "" : restoreCounters(frameAddress);
  const parentPaint = hasInjections
    ? `(local.set $parentPaint (i32.const 1)) (local.set $hostCurrent (i32.const -1))`
    : "";
  const recheck = grammar.queueSweep ? `(local.set $recheck (i32.const 1))` : "";
  const rewindCode = spec.rewind;
  const rewind = hasSpeculation
    ? `(if (local.get $specOpen)
      (then ${rewindCode}
        (br $token)))`
    : "";
  const sealHost = hasInjections
    ? `(if (i32.and (local.get $host) (i32.gt_u (local.get $hostDepth) (local.get $depth)))
      (then
        (call $sealHost (local.get $hostLast))
        (local.set $host (i32.const 0))
        (local.set $hostCurrent (i32.const -1))))`
    : "";
  const initial = names.indexOf(grammar.initial);
  const cases = states
    .map((state, i) => {
      const prefix = state.prefix;
      if (!prefix) return "";
      const lazy = prefix.lazy;
      const lazyStates =
        lazy?.top.map((name) => {
          const stateId = names.indexOf(name);
          return `(i32.eq (local.get $containerBaseState) (i32.const ${stateId}))`;
        }) ?? [];
      const top = i32Or(lazyStates, "(i32.const 0)");
      const frameView = view("(local.get $containerIndex)");
      const prefixAttempt = attempt(prefix.match, true);
      let lazyCheck = "";
      if (lazy) {
        const baseView = view("(local.get $containerBaseDepth)");
        const unlessAttempt = attempt(lazy.unless, false);
        lazyCheck = `(if ${top}
          (then ${baseView} ${unlessAttempt} ${restore}
            (br_if $containerDone (i32.eqz (local.get $containerMatched)))))`;
      }
      const style = styles.indexOf(prefix.style);
      return `(if (i32.eq (local.get $containerFrameState) (i32.const ${i}))
        (then ${frameView} ${prefixAttempt} ${restore}
          (if (local.get $containerMatched)
            (then
              (if (i32.gt_u (local.get $matchCursor) (local.get $pos))
                (then
                  (local.set $containerNext (i32.add (local.get $containerIndex) (i32.const 1)))
                  (local.set $next (local.get $matchCursor))
                  (local.set $style (i32.const ${style}))
                  ${parentPaint}
                  ${recheck}
                  (br $paint)))
              (br $containerContinue)))
          ${lazyCheck}
          ${rewind}
          ${restoreOwner}
          (if (local.get $containerIndex)
            (then
              (local.set $depth (i32.sub (local.get $containerIndex) (i32.const 1)))
              (local.set $state (i32.load ${frameOffset} ${frameAddress}))
              ${columnsRestore}
              ${runsRestore}
              ${countersRestore})
            (else
              (local.set $state (i32.const ${initial}))
              (local.set $depth (i32.const 0))))
          ${sealHost}
          (local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))
          (br $containerDone)))`;
    })
    .join("\n");
  const outerDepth = hasSpeculation ? spec.outerField("depth") : "";
  const outerState = hasSpeculation ? spec.outerField("state") : "";
  const baseDepth = hasSpeculation
    ? `(if (result i32) (local.get $specOpen) (then ${outerDepth}) (else (local.get $depth)))`
    : "(local.get $depth)";
  const baseState = hasSpeculation
    ? `(if (result i32) (local.get $specOpen) (then ${outerState}) (else (local.get $state)))`
    : "(local.get $state)";
  const containerFrame = frameAt("(local.get $containerIndex)");
  return `(if
    (i32.or (local.get $containerLine) (i32.ge_s (local.get $containerNext) (i32.const 0)))
    (then
      (local.set $containerDepth (local.get $depth))
      ${saved}
      (local.set $containerBaseDepth ${baseDepth})
      (local.set $containerBaseState ${baseState})
      (local.set $containerIndex
        (if (result i32) (i32.ge_s (local.get $containerNext) (i32.const 0))
          (then (local.get $containerNext))
          (else (i32.const 0))))
      (local.set $containerLine (i32.const 0))
      (local.set $containerNext (i32.const -1))
      (block $containerDone (loop $containerLoop
        (br_if $containerDone
          (i32.gt_u (local.get $containerIndex) (local.get $containerBaseDepth)))
        (local.set $containerFrameState
          (if (result i32) (i32.lt_u (local.get $containerIndex) (local.get $containerBaseDepth))
            (then (i32.load ${frameOffset} ${containerFrame}))
            (else (local.get $containerBaseState))))
        (block $containerContinue ${cases})
        (local.set $containerIndex (i32.add (local.get $containerIndex) (i32.const 1)))
        (br $containerLoop)))))`;
}
