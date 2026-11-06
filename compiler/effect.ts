import type { Effect } from "#/grammar/mod.ts";

export type ShapeContext = {
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

export type ShapeLowering<K extends Effect["kind"]> = (
  effect: Extract<Effect, { kind: K }>,
  index: number,
  context: ShapeContext,
) => string;
