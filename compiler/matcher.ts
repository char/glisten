import type { ByteSet, Matcher } from "#/grammar/mod.ts";
import type { prefixCacheFunctions } from "./combinator.ts";

type FunctionCode = { name: string; code: string };

export type LowerContext = {
  member: (byte: string, set: ByteSet) => string;
  fresh: (hint: string) => string;
  save: () => string;
  rangesOf: (bytes: number[]) => [number, number][];
  runFunctions: Map<string, FunctionCode>;
  runCounts: Map<string, number>;
  separatedFunctions: Map<string, FunctionCode>;
  names: string[];
  hasSpeculation: boolean;
  runSlots: Map<string, number>;
  counterSlots: Map<string, number>;
  columns: string[];
  tabStop: number;
  frameBytes: number;
  framesOffset: number;
  prefix: ReturnType<typeof prefixCacheFunctions>;
  getSaves: () => number;
  outerField: () => string;
  needsCallerLocals: (matcher: Matcher) => boolean;
  matcher: (matcher: Matcher, fail: string, knownPrefix?: boolean) => string;
};

export type MatcherLowering<K extends Matcher["kind"]> = (
  matcher: Extract<Matcher, { kind: K }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
) => string;
