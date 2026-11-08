import { ABI } from "#/abi/constants.ts";
import type { Manifest } from "#/abi/schema.ts";
import { styleEntry, type Style } from "#/grammar/styles.ts";
import { type Grammar } from "#/grammar/mod.ts";
import { analyzeGrammar } from "#/grammar/analysis.ts";
import { maxDepth } from "#/grammar/limits.ts";
import { captureAreaBytes } from "./capture.ts";
import {
  frameAddressAt,
  frameColumnBytes,
  frameRunBytes,
  frameStateBytes,
  frameWordBytes,
  stateFrameAreaBytes,
} from "./state.ts";
import { usesCapture } from "#/grammar/capture.ts";
import { queueAreas } from "./queue.ts";
import { usesQueue } from "#/grammar/queue.ts";
import { speculationAreaBytes, speculationCode } from "./speculation_codegen.ts";
import { visitGrammar } from "#/grammar/visit.ts";

export function analyzeCompilerGrammar(
  grammar: Grammar,
  options: { speculationScratch?: boolean },
): CompilerFeatures {
  const names = Object.keys(grammar.states);
  const states = names.map((name) => grammar.states[name]!);
  const sharedNames = new Set(names.filter((name) => grammar.states[name]!.slots === "shared"));
  const sharedStates = names.flatMap((name, i) => (sharedNames.has(name) ? [i] : []));
  const initial = names.indexOf(grammar.initial);
  const hasContainers = states.some((state) => state.prefix);
  const speculationGroups = [
    ...new Set(
      states.flatMap((state) =>
        state.arms.flatMap((arm) =>
          arm.then.flatMap((effect) =>
            effect.kind === "speculate"
              ? [effect.group ?? effect.state, ...(effect.isolate ? [effect.isolate.group] : [])]
              : [],
          ),
        ),
      ),
    ),
  ];
  const hasSpeculation = speculationGroups.length > 0;
  const hasZeroWidthSpeculation = states.some((state) =>
    state.arms.some(
      (arm) => arm.redispatch && arm.then.some((effect) => effect.kind === "speculate"),
    ),
  );
  const hasQueue = !!grammar.queueSweep || usesQueue(grammar);
  const scratch = hasQueue || hasSpeculation || (options.speculationScratch ?? false);
  let hasWrap = false;
  let hasFrameWrap = false;
  let hasPreviousChar = false;
  visitGrammar(grammar, {
    matcher(matcher) {
      if (matcher.kind === "previousChar") hasPreviousChar = true;
    },
    effect(effect) {
      if (effect.kind === "wrap") {
        hasWrap = true;
        if (effect.from === "frame") hasFrameWrap = true;
      }
    },
  });
  const analysis = analyzeGrammar(grammar);
  const {
    runs: runSlots,
    frameRuns,
    counters: counterSlots,
    frameCounters,
    ranges: rangeSlots,
    columns,
    tracksColumn,
    embeds,
    injections: hasInjections,
    styles,
  } = analysis;
  const recordPatching = states.some((state) =>
    state.arms.some((arm) =>
      arm.then.some(
        (effect) =>
          effect.kind === "markRecord" ||
          effect.kind === "patchRecord" ||
          (effect.kind === "word" &&
            [...effect.cases.map(({ then }) => then), effect.otherwise].some((branch) =>
              branch.some((step) => step.kind === "markRecord" || step.kind === "patchRecord"),
            )),
      ),
    ),
  );
  const hasTransitions = states.some(
    (state) =>
      (state.otherwise !== undefined && typeof state.otherwise !== "string") ||
      state.arms.some((arm) => arm.redispatch === true),
  );
  return {
    names,
    states,
    sharedNames,
    sharedStates,
    initial,
    hasContainers,
    speculationGroups,
    hasSpeculation,
    hasZeroWidthSpeculation,
    hasQueue,
    scratch,
    hasWrap,
    hasFrameWrap,
    hasPreviousChar,
    runSlots,
    frameRuns,
    counterSlots,
    frameCounters,
    rangeSlots,
    columns,
    tracksColumn,
    embeds,
    hasInjections,
    styles,
    recordPatching,
    hasTransitions,
  };
}

export function layoutCompilerArea(grammar: Grammar, features: CompilerFeatures): CompilerArea {
  const {
    styles,
    frameRuns,
    runSlots,
    columns,
    frameCounters,
    counterSlots,
    hasFrameWrap,
    hasQueue,
    hasSpeculation,
    rangeSlots,
    tracksColumn,
    hasInjections,
    hasTransitions,
    hasContainers,
    hasWrap,
    hasZeroWidthSpeculation,
    embeds,
  } = features;
  const framesOffset = Math.ceil((styles.length * 2) / frameStateBytes) * frameStateBytes;
  const frameRunIndices = [...frameRuns].map((name) => runSlots.get(name)!);
  const frameRunOffset = framesOffset + frameStateBytes + columns.length * frameColumnBytes;
  const frameCounterIndices = [...frameCounters].map((name) => counterSlots.get(name)!);
  const frameCounterOffset = frameRunOffset + frameRunIndices.length * frameRunBytes;
  const frameSlotsEnd = frameCounterOffset + frameCounterIndices.length * frameWordBytes;
  const frameOpeningOffset = hasFrameWrap ? frameSlotsEnd : undefined;
  const frameBytes = frameSlotsEnd - framesOffset + (hasFrameWrap ? frameWordBytes : 0);
  const frameAddress =
    columns.length || hasFrameWrap || frameRunIndices.length || frameCounterIndices.length
      ? frameAddressAt("(local.get $depth)", frameBytes)
      : `(i32.add (global.get $base) (i32.shl (local.get $depth) (i32.const 2)))`;
  const hasCapture = hasQueue || usesCapture(grammar);
  let areaEnd = framesOffset;
  const allocateArea = (bytes: number) => {
    const offset = areaEnd;
    areaEnd += bytes;
    return offset;
  };
  allocateArea(stateFrameAreaBytes(frameBytes));
  const captureOffset = allocateArea(captureAreaBytes(hasCapture));
  const queue = queueAreas(hasQueue, !!grammar.queueSweep);
  const ownerOffset = allocateArea(queue.owners);
  const bodyOffset = allocateArea(queue.bodies);
  const snapshotOffset = areaEnd;
  const spec = speculationCode({
    runs: runSlots.size,
    counters: counterSlots.size,
    ranges: rangeSlots.size,
    columns: columns.length,
    tracksColumn,
    injections: hasInjections,
    transitions: hasTransitions,
    containers: hasContainers,
    groups: hasWrap,
    zeroWidth: hasZeroWidthSpeculation,
    snapshotOffset,
  });
  allocateArea(speculationAreaBytes(hasSpeculation, spec.bytes));
  const manifest: Manifest = {
    abi: ABI,
    language: grammar.name,
    aliases: [...(grammar.aliases ?? [])],
    extensions: [...(grammar.extensions ?? [])],
    filenames: [...(grammar.filenames ?? [])],
    embeds,
    styles: styles.map(styleEntry),
    styleMap: 0,
    areaBytes: Math.ceil(areaEnd / 16) * 16,
    maxDepth,
  };

  return {
    framesOffset,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    frameOpeningOffset,
    frameBytes,
    frameAddress,
    hasCapture,
    captureOffset,
    ownerOffset,
    bodyOffset,
    snapshotOffset,
    spec,
    manifest,
  };
}

export type CompilerFeatures = {
  names: string[];
  states: Grammar["states"][string][];
  sharedNames: Set<string>;
  sharedStates: number[];
  initial: number;
  hasContainers: boolean;
  speculationGroups: string[];
  hasSpeculation: boolean;
  hasZeroWidthSpeculation: boolean;
  hasQueue: boolean;
  scratch: boolean;
  hasWrap: boolean;
  hasFrameWrap: boolean;
  hasPreviousChar: boolean;
  runSlots: Map<string, number>;
  frameRuns: Set<string>;
  counterSlots: Map<string, number>;
  frameCounters: Set<string>;
  rangeSlots: Map<string, number>;
  columns: string[];
  tracksColumn: boolean;
  embeds: string[];
  hasInjections: boolean;
  styles: Style[];
  recordPatching: boolean;
  hasTransitions: boolean;
};

export type CompilerArea = {
  framesOffset: number;
  frameRunIndices: number[];
  frameRunOffset: number;
  frameCounterIndices: number[];
  frameCounterOffset: number;
  frameOpeningOffset: number | undefined;
  frameBytes: number;
  frameAddress: string;
  hasCapture: boolean;
  captureOffset: number;
  ownerOffset: number;
  bodyOffset: number;
  snapshotOffset: number;
  spec: ReturnType<typeof speculationCode>;
  manifest: Manifest;
};
