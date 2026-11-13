import { rangesOf } from "./runtime.ts";
import { lowerMatcher, targetAssignment } from "./registry.ts";
import { lowerBranch } from "./arm_effect.ts";
import type { LowerContext } from "./matcher.ts";
import {
  bytesOf,
  type Arm,
  type ByteSet,
  type Effect,
  type Grammar,
  type Matcher,
} from "#/grammar/mod.ts";
import { maxDepth, maxTransitions } from "#/grammar/limits.ts";
import { lowerInjectionActions } from "./injection.ts";
import { byteInRange, i32Or } from "./idioms.ts";
import { lowerWordSelection, wordFunctions } from "./word.ts";
import { prefixCacheFunctions } from "./combinator.ts";
import { separatedRunFunctions } from "./separated_run.ts";
import { speculationCode } from "./speculation_codegen.ts";
import { lineBoundaryCheck } from "./line_boundary.ts";
import { someMatcher, visitMatchers } from "#/grammar/visit.ts";
import type { CompilerFeatures, CompilerArea } from "./features.ts";

export function buildDispatch(
  grammar: Grammar,
  features: CompilerFeatures,
  area: CompilerArea,
): DispatchPlan {
  const {
    names,
    states,
    sharedNames,
    sharedStates,
    speculationGroups,
    hasSpeculation,
    runSlots,
    counterSlots,
    columns,
  } = features;
  const { framesOffset, frameOpeningOffset, frameBytes, snapshotOffset, spec, manifest } = area;

  const runArguments = [...runSlots.values()]
    .map((i) => `(local.get $runByte${i}) (local.get $runLength${i})`)
    .join(" ");
  const runParameters = [...runSlots.values()]
    .map((i) => `(param $runByte${i} i32) (param $runLength${i} i32)`)
    .join(" ");

  let labels = 0;
  const fresh = (hint: string) => `$${hint}${labels++}`;
  let saves = 0;
  const save = () => `$backtrack${saves++}`;
  const prefix = prefixCacheFunctions();
  const runCounts = new Map<string, number>();
  function countMatchers(root: Matcher) {
    visitMatchers([root], (matcher) => {
      if (matcher.kind === "run") {
        const key = bytesOf(matcher.set).join(",");
        runCounts.set(key, (runCounts.get(key) ?? 0) + 1);
      } else if (matcher.kind === "cachedPrefix") {
        const prefixKey = JSON.stringify(matcher);
        prefix.counts.set(prefixKey, (prefix.counts.get(prefixKey) ?? 0) + 1);
        const key = bytesOf(matcher.rest).join(",");
        runCounts.set(key, (runCounts.get(key) ?? 0) + 1);
      }
      return true;
    });
  }
  const runFunctions = new Map<string, { name: string; code: string }>();

  const { cases, shapes, caseOf, shapeOf } = codeBlockRegistry({
    fresh,
    sharedNames,
    sharedStates,
    columns,
    runSlots,
    counterSlots,
  });
  const words = wordFunctions(snapshotOffset, manifest);
  const scans = new Map<string, string>();
  const scanOf = (bytes: number[], high: boolean) => {
    const key = `${high ? "h" : "a"}:${bytes.join(",")}`;
    let name = scans.get(key);
    if (!name) scans.set(key, (name = `$scan${scans.size}`));
    return name;
  };

  const member = (byte: string, set: ByteSet) =>
    i32Or(
      rangesOf(bytesOf(set)).map(([lo, hi]) =>
        lo === hi ? `(i32.eq ${byte} (i32.const ${lo}))` : byteInRange(byte, lo, hi),
      ),
      "(i32.const 0)",
    );

  const separatedFunctions = separatedRunFunctions();
  const matcherContext: LowerContext = {
    member,
    fresh,
    save,
    rangesOf,
    runFunctions,
    runCounts,
    separatedFunctions,
    names,
    hasSpeculation,
    runSlots,
    counterSlots,
    columns,
    tabStop: grammar.tabStop ?? 4,
    frameBytes,
    framesOffset,
    prefix,
    getSaves: () => saves,
    outerField: () => spec.outerField("state"),
    needsCallerLocals: (item) => needsCallerLocals(item),
    matcher: (item, fail, knownPrefix) => matcher(item, fail, knownPrefix),
  };
  const matcher = (m: Matcher, fail: string, knownPrefix = false): string =>
    lowerMatcher(m, fail, knownPrefix, matcherContext);

  const fallbacks = names.map((name) => fresh(`fallbackFor_${name}_`));

  // The dispatch byte is known to be present and in `bytes`: a first matcher that only
  // checks it consumes it unchecked.
  const known = (first: Matcher | undefined, bytes: Set<number>) =>
    (first?.kind === "one" && [...bytes].every((b) => bytesOf(first.set).includes(b))) ||
    (first?.kind === "literal" &&
      first.text.length === 1 &&
      bytes.size === 1 &&
      bytes.has(first.text.charCodeAt(0)));
  const speculationGroup = (opener: Extract<Effect, { kind: "speculate" }>) => {
    const group = `(i32.const ${speculationGroups.indexOf(opener.group ?? opener.state)})`;
    if (!opener.isolate) return group;
    const outerState = spec.outerField("state");
    const baseState = names.indexOf(opener.isolate.base);
    const isolatedGroup = speculationGroups.indexOf(opener.isolate.group);
    return `(if (result i32)
      (i32.and
        (i32.ne (local.get $specOpen) (i32.const 0))
        (i32.eq ${outerState} (i32.const ${baseState})))
      (then (i32.const ${isolatedGroup}))
      (else ${group}))`;
  };
  const speculationGuard = (group: string | undefined, miss: string) => {
    if (group === undefined) return "";
    const depthLimit = maxDepth - 1;
    return `(br_if ${miss}
      (i32.or
        (i32.ge_u (local.get $depth) (i32.const ${depthLimit}))
        (call $specHas
          (call $specGroupBits ${group})
          (call $specGroupTags ${group})
          (local.get $specEpoch)
          (local.get $pos))))`;
  };
  const chargeTransition = `(local.set $transitions (i32.add (local.get $transitions) (i32.const 1)))
    (if (i32.gt_u (local.get $transitions) (i32.const ${maxTransitions}))
      (then (call $fail)))`;

  const dispatch = dispatchTables(states, fallbacks, caseOf);

  const fallbackCode = lowerFallbacks({
    grammar,
    features,
    shapeOf,
    scanOf,
    chargeTransition,
  });

  // Built after dispatch so that every case is known; cases may add shapes.
  const caseList = [...cases.values()];
  for (const { arms } of caseList) for (const arm of arms) arm.match.forEach(countMatchers);
  const outlined = outlineMatchers(
    caseList,
    known,
    matcher,
    { count: () => saves, restore: (count) => (saves = count) },
    runParameters,
  );
  const armContext = {
    features,
    fresh,
    known,
    matcher,
    shapeOf,
    outlined,
    spec,
    words,
    frameOpeningOffset,
    frameBytes,
    runArguments,
    speculationGroup,
    speculationGuard,
    chargeTransition,
  };
  const caseCode = caseList.map(
    ({ arms, bytes, shared }) =>
      `${arms.map((arm) => lowerArm(arm, bytes, shared, armContext)).join("\n")}\n(br $nomatch)`,
  );
  const shapeList = [...shapes.values()];
  return {
    fresh,
    matcher,
    getSaves: () => saves,
    prefix,
    words,
    scans,
    runFunctions,
    outlined,
    separatedFunctions,
    fallbacks,
    dispatch,
    fallbackCode,
    caseList,
    caseCode,
    shapeList,
  };
}

/**
 * A shared matcher sequence is only worth a function once its lowering is substantial: under
 * V8 a wasm call spills the token loop's locals, so calling a short body costs more than
 * inlining it, while duplicating it costs little. Large bodies stay shared, where size wins.
 */
const outlineBodyMinimum = 3000;

function consumes(m: Matcher | undefined): boolean {
  return (
    m?.kind === "one" ||
    m?.kind === "character" ||
    (m?.kind === "literal" && m.text.length > 0) ||
    (m?.kind === "run" && m.min > 0)
  );
}

function lowerArm(
  arm: Arm,
  bytes: Set<number>,
  shared: boolean,
  context: {
    features: CompilerFeatures;
    fresh: (hint: string) => string;
    known: (first: Matcher | undefined, bytes: Set<number>) => boolean;
    matcher: (item: Matcher, fail: string, knownPrefix?: boolean) => string;
    shapeOf: ReturnType<typeof codeBlockRegistry>["shapeOf"];
    outlined: Map<string, { name: string; code: string }>;
    spec: ReturnType<typeof speculationCode>;
    words: ReturnType<typeof wordFunctions>;
    frameOpeningOffset: number | undefined;
    frameBytes: number;
    runArguments: string;
    speculationGroup: (opener: Extract<Effect, { kind: "speculate" }>) => string;
    speculationGuard: (group: string | undefined, miss: string) => string;
    chargeTransition: string;
  },
): string {
  const {
    features,
    fresh,
    known,
    matcher,
    shapeOf,
    outlined,
    spec,
    words,
    frameOpeningOffset,
    frameBytes,
    runArguments,
    speculationGroup,
    speculationGuard,
    chargeTransition,
  } = context;
  const { names, runSlots, rangeSlots, embeds, styles, hasContainers } = features;

  const miss = fresh("armMismatch_");
  const skip = known(arm.match[0], bytes);
  const classification = arm.then.find((effect) => effect.kind === "word");
  const transition = arm.redispatch === true;
  const ops = arm.then.filter((effect) => effect.kind !== "paint");
  const targets = ops.flatMap((op, i) => targetAssignment(op, i, names));
  if (transition && ops.some((effect) => effect.kind === "abandon")) {
    const match = arm.match.map((item) => matcher(item, miss)).join("\n");
    const rewind = spec.rewind;
    return `(block ${miss}
        (local.set $matchCursor (local.get $pos))
        ${match}
        ${rewind}
        (br $token))`;
  }
  if (transition) {
    const opener = ops.find((effect) => effect.kind === "speculate");
    const group = opener?.kind === "speculate" ? speculationGroup(opener) : undefined;
    const guard = speculationGuard(group, miss);
    const match = arm.match.map((m) => matcher(m, miss)).join("\n");
    const saveSpeculation =
      group !== undefined ? `(local.set $specGroup ${group}) ${spec.save}` : "";
    const closeInjection = ops.some((effect) => effect.kind === "closeInjection")
      ? `(if (i32.eqz (local.get $host)) (then (call $fail)))
          (call $sealHost (local.get $hostLast))
          (local.set $host (i32.const 0))
          (local.set $hostCurrent (i32.const -1))`
      : "";
    const injections = lowerInjectionActions(
      ops.filter((effect) => effect.kind === "openStatic" || effect.kind === "openNamed"),
      rangeSlots,
      embeds,
    ).join("\n");
    const assignments = targets.join("\n");
    const shape = shapeOf(ops, true, shared);
    return `(block ${miss} ${guard}
        (local.set $matchCursor (local.get $pos))
        ${match}
        ${saveSpeculation}
        ${chargeTransition}
        ${closeInjection}
        ${injections}
        ${assignments}
        (br ${shape}))`;
  }
  const rest = arm.match.slice(skip ? 1 : 0);
  const outlinedMatcher = outlined.get(JSON.stringify(rest));
  const body = outlinedMatcher
    ? `(local.set $matchCursor
          (call ${outlinedMatcher.name}
            (local.get $input)
            (local.get $matchCursor)
            (local.get $limit)
            (local.get $docStart)
            ${runArguments}))
        (br_if ${miss} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`
    : rest
        .map((m, i) =>
          matcher(
            m,
            miss,
            !skip &&
              i === 0 &&
              m.kind === "cachedPrefix" &&
              [...bytes].every((byte) => bytesOf(m.first).includes(byte)),
          ),
        )
        .join("\n");
  const branch = (effects: readonly Effect[]) =>
    lowerBranch(
      effects,
      { operations: [], captures: [], injections: [], mark: false, runSlots, rangeSlots, embeds },
      {
        styles,
        names,
        speculationGroup,
        speculationSave: spec.save,
        shapeOf: (operations) => shapeOf(operations, false, shared),
        wrapStart: `(i32.load offset=${frameOpeningOffset ?? 0}
            (i32.add
              (global.get $base)
              (i32.mul (i32.sub (local.get $depth) (i32.const 1)) (i32.const ${frameBytes}))))`,
      },
    );
  const selected =
    classification?.kind === "word"
      ? lowerWordSelection(classification, words.lookup, branch)
      : branch(arm.then);
  const opener = arm.then.find((effect) => effect.kind === "speculate");
  const group = opener?.kind === "speculate" ? speculationGroup(opener) : undefined;
  const guard = speculationGuard(group, miss);
  const start = skip ? "(i32.add (local.get $pos) (i32.const 1))" : "(local.get $pos)";
  const lineBoundary = hasContainers ? lineBoundaryCheck(arm.match, miss) : "";
  const progressCheck =
    skip || arm.match.some(consumes)
      ? ""
      : `(br_if ${miss} (i32.eq (local.get $matchCursor) (local.get $pos)))`;
  return `(block ${miss} ${guard}
      (local.set $matchCursor ${start})
      ${body}
      ${lineBoundary}
      ${progressCheck}
      (local.set $next (local.get $matchCursor))
      ${selected})`;
}

function outlineMatchers(
  caseList: Array<{ arms: readonly Arm[]; bytes: Set<number> }>,
  known: (first: Matcher | undefined, bytes: Set<number>) => boolean,
  matcher: (item: Matcher, fail: string) => string,
  saves: { readonly count: () => number; readonly restore: (count: number) => void },
  runParameters: string,
): Map<string, { name: string; code: string }> {
  const needsInlineState = (m: Matcher): boolean =>
    someMatcher(
      [m],
      (item) =>
        item.kind === "baseState" ||
        item.kind === "counterZero" ||
        item.kind === "counterPositive" ||
        item.kind === "toColumn" ||
        item.kind === "columnAtLeast" ||
        (item.kind === "run" && item.untilColumn !== undefined),
    );
  const candidates = new Map<string, { matchers: readonly Matcher[]; count: number }>();
  for (const { arms, bytes } of caseList)
    for (const arm of arms) {
      const rest = arm.match.slice(known(arm.match[0], bytes) ? 1 : 0);
      if (
        rest.some(needsInlineState) ||
        (rest.length < 2 &&
          !rest.some((m) => m.kind === "either" || m.kind === "opt" || m.kind === "repeat"))
      )
        continue;
      const key = JSON.stringify(rest);
      const candidate = candidates.get(key);
      if (candidate) candidate.count++;
      else candidates.set(key, { matchers: rest, count: 1 });
    }
  const outlined = new Map<string, { name: string; code: string }>();
  for (const [key, { matchers, count }] of candidates) {
    if (count < 2 || someMatcher(matchers, (m) => m.kind === "cachedPrefix")) continue;
    const first = saves.count();
    const body = matchers.map((m) => matcher(m, "$fail")).join("\n");
    // Test the sequence before naming a function: short bodies are cheaper inlined.
    if (body.length < outlineBodyMinimum) {
      saves.restore(first);
      continue;
    }
    const name = `$match${outlined.size}`;
    const locals = Array.from(
      { length: saves.count() - first },
      (_, i) => `(local $backtrack${first + i} i32)`,
    );
    outlined.set(key, {
      name,
      code: `(func ${name} (param $input i32) (param $matchCursor i32) (param $limit i32)
        (param $docStart i32) ${runParameters} (result i32)
        (local $matchByte i32)
        ${locals.join(" ")}
        (block $fail ${body}
          (return (local.get $matchCursor)))
        (i32.const -1))`,
    });
  }
  return outlined;
}

function needsCallerLocals(matcher: Matcher): boolean {
  return someMatcher(
    [matcher],
    (item) =>
      item.kind === "baseState" ||
      item.kind === "sameRun" ||
      item.kind === "counterZero" ||
      item.kind === "counterPositive" ||
      item.kind === "toColumn" ||
      item.kind === "columnAtLeast" ||
      (item.kind === "run" && item.untilColumn !== undefined) ||
      item.kind === "lineEnd" ||
      item.kind === "cachedPrefix",
  );
}

function lowerFallbacks(options: {
  grammar: Grammar;
  features: CompilerFeatures;
  shapeOf: ReturnType<typeof codeBlockRegistry>["shapeOf"];
  scanOf: (bytes: number[], high: boolean) => string;
  chargeTransition: string;
}): string[] {
  const { grammar, features, shapeOf, scanOf, chargeTransition } = options;
  const { names, states, rangeSlots, embeds, hasContainers, styles } = features;
  return names.map((_, index) => {
    const state = states[index]!;
    if (state.otherwise && typeof state.otherwise !== "string") {
      const ops = [...state.otherwise];
      const targets = ops.flatMap((op, i) => targetAssignment(op, i, names));
      const injections = lowerInjectionActions(
        ops.filter((effect) => effect.kind === "openStatic" || effect.kind === "openNamed"),
        rangeSlots,
        embeds,
      ).join("\n");
      const assignments = targets.join("\n");
      const shape = shapeOf(ops, true, state.slots === "shared");
      return `${chargeTransition}
        ${injections}
        ${assignments}
        (br ${shape})`;
    }
    const allStops = [
      ...new Set([
        ...(grammar.queueSweep || hasContainers ? [10] : []),
        ...state.arms.flatMap((arm) => bytesOf(arm.on)),
      ]),
    ];
    const stops = allStops.filter((byte) => byte < 128).sort((a, b) => a - b);
    const high = allStops.some((byte) => byte >= 128);
    const first = `(if (result i32) (i32.lt_u (local.get $byte) (i32.const 128))
      (then (i32.add (local.get $pos) (i32.const 1)))
      (else (call $charEnd (local.get $input) (local.get $pos) (local.get $limit))))`;
    const next =
      typeof state.otherwise === "string" || allStops.length === 256
        ? first
        : stops.length || high
          ? `(call ${scanOf(stops, high)} (local.get $input) ${first} (local.get $limit))`
          : "(local.get $limit)";
    const fallbackEnd =
      grammar.queueSweep || hasContainers
        ? `(if (result i32) (i32.eq (local.get $byte) (i32.const 10))
          (then ${first})
          (else ${next}))`
        : next;
    const capture = state.captureFallback
      ? `(call $captureAppend (local.get $input) (local.get $pos) (local.get $next) (i32.const 0))`
      : "";
    const containerUpdate = hasContainers
      ? `(local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))`
      : "";
    const changeState =
      typeof state.otherwise === "string"
        ? `(local.set $state (i32.const ${names.indexOf(state.otherwise)})) ${containerUpdate}`
        : "";
    const styleIndex = styles.indexOf(state.style);
    return `(local.set $style (i32.const ${styleIndex}))
      (local.set $next ${fallbackEnd})
      ${capture}
      ${changeState}
      (br $paint)`;
  });
}

function codeBlockRegistry(options: {
  fresh: (hint: string) => string;
  sharedNames: ReadonlySet<string>;
  sharedStates: readonly number[];
  columns: string[];
  runSlots: Map<string, number>;
  counterSlots: Map<string, number>;
}) {
  const { fresh, sharedNames, sharedStates, columns, runSlots, counterSlots } = options;
  // Arms sharing a byte, in order, form a case; equal cases are emitted once.
  const cases = new Map<
    string,
    { label: string; arms: readonly Arm[]; bytes: Set<number>; shared: boolean }
  >();
  const caseOf = (arms: readonly Arm[], byte: number, shared: boolean) => {
    const key =
      JSON.stringify(arms.map(({ match, then }) => [match, then])) +
      (sharedStates.length ? `:${shared}` : "");
    let entry = cases.get(key);
    if (!entry)
      cases.set(key, (entry = { label: fresh("byteCase_"), arms, bytes: new Set(), shared }));
    entry.bytes.add(byte);
    return entry.label;
  };
  // Arms with the same sequence of stack operations share their code; targets travel in locals.
  const shapes = new Map<
    string,
    { label: string; ops: Effect[]; transition: boolean; shared: boolean }
  >();
  const shapeOf = (ops: Effect[], transition = false, shared = false) => {
    const operationKeys = ops.map((op) => {
      switch (op.kind) {
        case "captureAppend":
          return `${op.kind}:${op.skip}`;
        case "captureMark":
          return `${op.kind}:${op.flags}`;
        case "queueSave":
          return `${op.kind}:${op.footerIndent}`;
        case "captureColumn":
          return `${op.kind}:${columns.indexOf(op.slot.name)}`;
        case "captureRun":
          return `${op.kind}:${runSlots.get(op.slot.name)}`;
        case "counterReset":
        case "counterIncrement":
        case "counterDecrement":
          return `${op.kind}:${counterSlots.get(op.slot.name)}`;
        case "pop":
          return op.fallback !== undefined ? "popFallback" : op.kind;
        default:
          return op.kind;
      }
    });
    const key = `${transition}:${operationKeys.join(",")}`;
    const ownership = sharedStates.length
      ? ops
          .map((op) =>
            op.kind === "push" || op.kind === "speculate" ? String(sharedNames.has(op.state)) : "",
          )
          .join(",")
      : "";
    const shapeKey = sharedStates.length ? `${key}:${shared}:${ownership}` : key;
    let entry = shapes.get(shapeKey);
    if (!entry)
      shapes.set(shapeKey, (entry = { label: fresh("effectShape_"), ops, transition, shared }));
    return entry.label;
  };
  return { cases, shapes, caseOf, shapeOf };
}

function dispatchTables(
  states: CompilerFeatures["states"],
  fallbacks: string[],
  caseOf: ReturnType<typeof codeBlockRegistry>["caseOf"],
): string[] {
  return states.map((state, index) => {
    const byByte = new Map<number, string>();
    for (let byte = 0; byte < 256; byte++) {
      const arms = state.arms.filter((arm) => bytesOf(arm.on).includes(byte));
      if (arms.length) byByte.set(byte, caseOf(arms, byte, state.slots === "shared"));
    }

    const keys = [...byByte.keys()];
    const fallback = fallbacks[index]!;
    if (!keys.length) return `(br ${fallback})`;
    if (keys.length >= 8) {
      const min = Math.min(...keys);
      const max = Math.max(...keys);
      const table = Array.from(
        { length: max - min + 1 },
        (_, i) => byByte.get(min + i) ?? fallback,
      );
      return `(br_table ${table.join(" ")} ${fallback}
        (i32.sub (local.get $byte) (i32.const ${min})))`;
    }
    const groups = new Map<string, number[]>();
    for (const [byte, label] of byByte) groups.set(label, [...(groups.get(label) ?? []), byte]);
    return (
      [...groups]
        .map(
          ([label, bytes]) =>
            `(br_if ${label}
              ${bytes.map((b) => `(i32.eq (local.get $byte) (i32.const ${b}))`).reduce((a, b) => `(i32.or ${a} ${b})`)})`,
        )
        .join("\n") + `\n(br ${fallback})`
    );
  });
}

export type DispatchPlan = {
  fresh: (hint: string) => string;
  matcher: (matcher: Matcher, fail: string, knownPrefix?: boolean) => string;
  getSaves: () => number;
  prefix: ReturnType<typeof prefixCacheFunctions>;
  words: ReturnType<typeof wordFunctions>;
  scans: Map<string, string>;
  runFunctions: Map<string, { name: string; code: string }>;
  outlined: Map<string, { name: string; code: string }>;
  separatedFunctions: ReturnType<typeof separatedRunFunctions>;
  fallbacks: string[];
  dispatch: string[];
  fallbackCode: string[];
  caseList: Array<{ label: string; arms: readonly Arm[]; bytes: Set<number>; shared: boolean }>;
  caseCode: string[];
  shapeList: Array<{ label: string; ops: Effect[]; transition: boolean; shared: boolean }>;
};
