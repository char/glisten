import type { Style } from "./styles.ts";
import type { ByteSet, ByteMatcher } from "./bytes.ts";
export {
  bytesOf,
  byteSet,
  range,
  ascii,
  utf8Bytes,
  union,
  intersection,
  except,
  literal,
  byte,
  character,
  bytes,
  type ByteSet,
} from "./bytes.ts";
import { visitMatchers } from "./visit.ts";
import { checkEffect, checkMatcher } from "./registry.ts";
import { checkArm } from "./arm.ts";
import { checkContainer } from "./container.ts";
import { checkFallback, checkZeroWidthOpen } from "./state.ts";
import { checkWraps } from "./wrap.ts";
import { checkSlots } from "./slot.ts";
export { slot, type RunSlot, type RangeSlot, type ColumnSlot } from "./slot.ts";
export { on, redispatch } from "./arm.ts";
export { token, oneOf, keywordTable } from "./authoring.ts";
import type { RecordEffect } from "./record.ts";
import type { StateEffect } from "./state.ts";
export { paint, markRecord, patchRecord, wrap } from "./record.ts";
export { pushState, popState, setState, resource } from "./state.ts";
import type { BoundaryMatcher } from "./boundary.ts";
import type { CombinatorMatcher } from "./combinator.ts";
export { baseState, notNext, previousNotIn, lineStart, lineEnd } from "./boundary.ts";
export {
  seq,
  choice,
  optional,
  repeat,
  lookahead,
  notLookahead,
  cachedPrefix,
} from "./combinator.ts";
import { checkSpeculationEffects, checkSpeculativeStates } from "./speculation.ts";
import { branchEffects, type WordEffect } from "./word.ts";
import { checkQueueSweep } from "./queue.ts";
import type { CaptureEffect, CaptureMatcher } from "./capture.ts";
import type { QueueEffect, QueueMatcher } from "./queue.ts";
import type { GroupMatcher } from "./group.ts";
export * as shell from "./shell.ts";
import type { CaptureRun, SameRun } from "./run_slot.ts";
import type { InjectionEffect, RangeEffect } from "./injection.ts";
import type { CaptureColumn, ToColumn } from "./column.ts";
import type { SpeculationEffect } from "./speculation.ts";
export { speculate, abandon } from "./speculation.ts";
import type { SeparatedRun } from "./separated_run.ts";
export { separatedRun } from "./separated_run.ts";
export { saveColumn, indentTo } from "./column.ts";
export { clearRange, saveRange, openInjection, hostPrefix, closeInjection } from "./injection.ts";
export { saveRun, matchRun } from "./run_slot.ts";
export { classify } from "./word.ts";

/**
 * Consumes input from `pos`, or fails. A failed matcher leaves `pos` unspecified: the
 * arm containing it fails as a whole, and `optional` restores its own start.
 */
export type Matcher =
  | ByteMatcher
  | BoundaryMatcher
  | CombinatorMatcher
  | SameRun
  | SeparatedRun
  | ToColumn
  | CaptureMatcher
  | QueueMatcher
  | GroupMatcher;

/** Runs once an arm has matched; never fails. */
export type Effect =
  | RecordEffect
  | StateEffect
  | CaptureRun
  | CaptureColumn
  | RangeEffect
  | InjectionEffect
  | SpeculationEffect
  | WordEffect
  | CaptureEffect
  | QueueEffect;

/**
 * A byte arm: tried when the byte at `pos` is in `on`. Its matchers run from `pos`
 * (the dispatch byte is not consumed implicitly); if any fails, the byte's next arm is
 * tried from the same `pos`. Consuming arms paint and fail on a zero-length match.
 * Explicit redispatch arms apply permitted zero-width effects and retry the same byte;
 * queue predicates and certain assertions on abandonment are allowed. More than
 * 16 + 4 × 128 consecutive transitions fail with a resource error.
 * A word classification is the sole effect of its arm; its selected branch must paint
 * exactly once and may perform stack effects. Classification sees only the bytes matched
 * by this arm, so a segment boundary ends a word for classification purposes.
 */
export type Arm = {
  readonly on: ByteSet;
  readonly match: readonly Matcher[];
  readonly then: readonly Effect[];
  readonly redispatch?: true;
};

/**
 * A lexer state. Without `otherwise`, bytes that start no arm are skipped (SIMD)
 * and painted with `style`; a byte whose arms all fail is painted as one UTF-8
 * character. A string `otherwise` replaces the state after painting that character;
 * an effect list instead retries the byte with nonempty stack effects, subject to the
 * transition limit.
 */
export type State = {
  readonly style: Style;
  readonly arms: readonly Arm[];
  readonly captureFallback?: boolean;
  readonly prefix?: {
    readonly match: readonly Matcher[];
    readonly style: Style;
    readonly lazy?: { readonly top: readonly string[]; readonly unless: readonly Matcher[] };
  };
  readonly otherwise?: string | readonly Effect[];
};

/** A whole grammar. Each document starts in the named initial state. */
export type Grammar<Name extends string = string> = {
  readonly name: string;
  readonly initial: NoInfer<Name>;
  readonly aliases?: readonly string[];
  /** Tab stops for physical columns (`saveColumn`, `indentTo`): 4 (the default) or 8. */
  readonly tabStop?: 4 | 8;
  /** Sweep live queued bodies at line starts, restoring this state on a footer. */
  readonly queueSweep?: {
    readonly footer: string;
    readonly footerStyle: Style;
    readonly tabStyle: Style;
  };
  readonly states: { readonly [name in Name]: State };
};

/** Define a grammar, checking that every state it names exists. */
export function defineGrammar<Name extends string>(grammar: Grammar<Name>): Grammar<Name> {
  const names = new Set<string>(Object.keys(grammar.states));
  if (!names.size) throw new Error(`${grammar.name}: a grammar needs a state`);
  if (!names.has(grammar.initial))
    throw new Error(`${grammar.name}: unknown initial state ${grammar.initial}`);
  checkSlots(grammar);
  checkWraps(grammar);
  const speculativeStates = checkSpeculativeStates(grammar);
  checkQueueSweep(grammar, names);
  const caches = new Map<string, string>();
  const checkMatchers = (root: Matcher) =>
    visitMatchers([root], (matcher) =>
      checkMatcher(matcher, { names, grammar: grammar.name, caches }),
    );
  for (const [name, state] of Object.entries<State>(grammar.states)) {
    checkContainer(state, grammar.name, name, names, checkMatchers);
    checkFallback(state, grammar.name, name, names, speculativeStates);
    for (const arm of state.arms) {
      arm.match.forEach((matcher) => checkMatchers(matcher));
      checkArm(arm);
      if (arm.redispatch) checkZeroWidthOpen(arm.then, grammar.name, name);
      const effects = branchEffects(arm.then);
      checkSpeculationEffects(effects, grammar.name, name);
      for (const effect of effects)
        checkEffect(effect, {
          names,
          grammar: grammar.name,
          state: name,
          speculativeStates,
          hasQueueSweep: !!grammar.queueSweep,
        });
    }
  }
  return grammar;
}
