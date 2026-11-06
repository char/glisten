import { ABI } from "#/abi/constants.ts";
import { lowerMatcher, lowerShapeEffect, targetAssignment } from "./registry.ts";
import { lowerBranch } from "./arm_effect.ts";
import type { LowerContext } from "./matcher.ts";
import type { Manifest } from "#/abi/schema.ts";
import { styleEntry } from "#/grammar/styles.ts";
import {
  bytesOf,
  type Arm,
  type ByteSet,
  type Effect,
  type Grammar,
  type Matcher,
} from "#/grammar/mod.ts";
import { analyzeGrammar } from "#/grammar/analysis.ts";
import { maxDepth, maxTransitions } from "#/grammar/limits.ts";
import { emitRaw, lowerInjectionActions } from "./injection.ts";
import { columnFunction } from "./column.ts";
import { lowerWordSelection, wordFunctions } from "./word.ts";
import { captureAreaBytes, captureWat } from "./capture.ts";
import { stateFrameAreaBytes } from "./state.ts";
import { usesCapture } from "#/grammar/capture.ts";
import { queueAreas, queueWat, queueSweepCode } from "./queue.ts";
import { containerCode } from "./container.ts";
import { prefixCacheFunctions } from "./combinator.ts";
import { separatedRunFunctions } from "./separated_run.ts";
import { usesQueue } from "#/grammar/queue.ts";
import { groupWat } from "./group.ts";
import { usesGroup } from "#/grammar/group.ts";
import { speculationScratch } from "./speculation_scratch.ts";
import { speculationFunctions } from "./speculation.ts";
import { speculationOutputFunctions } from "./speculation_output.ts";
import { speculationAreaBytes, speculationCode } from "./speculation_codegen.ts";
import { crossesLineFunction, lineBoundaryCheck } from "./line_boundary.ts";
import { someMatcher, visitGrammar, visitMatchers } from "#/grammar/visit.ts";

/** A compiled grammar: its WAT text and manifest (docs/abi.md). */
export type Compiled = { wat: string; manifest: Manifest };

/** Compile a grammar to one token loop (docs/grammar.md). */
export function compile(
  grammar: Grammar,
  options: { speculationScratch?: boolean } = {},
): Compiled {
  const names = Object.keys(grammar.states);
  const states = names.map((name) => grammar.states[name]!);
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
  const hasQueue = !!grammar.queueSweep || usesQueue(grammar);
  const scratch = hasQueue || hasSpeculation || (options.speculationScratch ?? false);
  let hasWrap = false;
  let hasFrameWrap = false;
  visitGrammar(grammar, {
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
    ranges: rangeSlots,
    columns,
    embeds,
    injections: hasInjections,
    styles,
  } = analysis;
  const runArguments = [...runSlots.values()]
    .map((i) => `(local.get $runByte${i}) (local.get $runLength${i})`)
    .join(" ");
  const runParameters = [...runSlots.values()]
    .map((i) => `(param $runByte${i} i32) (param $runLength${i} i32)`)
    .join(" ");
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
  const framesOffset = Math.ceil((styles.length * 2) / 4) * 4;
  // The extra frame word holds the opening arm position only when frame wraps are used.
  const frameOpeningOffset = hasFrameWrap ? framesOffset + 4 + columns.length * 8 : undefined;
  const frameBytes = 4 + columns.length * 8 + (hasFrameWrap ? 4 : 0);
  const frameAddress =
    columns.length || hasFrameWrap
      ? `(i32.add (global.get $base) (i32.mul (local.get $depth) (i32.const ${frameBytes})))`
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
    ranges: rangeSlots.size,
    columns: columns.length,
    injections: hasInjections,
    transitions: hasTransitions,
    containers: hasContainers,
    groups: hasWrap,
    snapshotOffset,
  });
  allocateArea(speculationAreaBytes(hasSpeculation, spec.bytes));
  const manifest: Manifest = {
    abi: ABI,
    language: grammar.name,
    aliases: [...(grammar.aliases ?? [])],
    embeds,
    styles: styles.map(styleEntry),
    styleMap: 0,
    areaBytes: Math.ceil(areaEnd / 16) * 16,
    maxDepth,
  };

  let labels = 0;
  const fresh = (hint: string) => `$${hint}${labels++}`;
  let saves = 0;
  const save = () => `$q${saves++}`;
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

  // Arms sharing a byte, in order, form a case; equal cases are emitted once.
  const cases = new Map<string, { label: string; arms: readonly Arm[]; bytes: Set<number> }>();
  const caseOf = (arms: readonly Arm[], byte: number) => {
    const key = JSON.stringify(arms.map(({ match, then }) => [match, then]));
    let entry = cases.get(key);
    if (!entry) cases.set(key, (entry = { label: fresh("case"), arms, bytes: new Set() }));
    entry.bytes.add(byte);
    return entry.label;
  };
  // Arms with the same sequence of stack operations share their code; targets travel in locals.
  const shapes = new Map<string, { label: string; ops: Effect[]; transition: boolean }>();
  const shapeOf = (ops: Effect[], transition = false) => {
    const key = `${transition}:${ops.map((op) => (op.kind === "captureAppend" ? `${op.kind}:${op.skip}` : op.kind === "captureMark" ? `${op.kind}:${op.flags}` : op.kind === "queueSave" ? `${op.kind}:${op.footerIndent}` : op.kind === "captureColumn" ? `${op.kind}:${columns.indexOf(op.slot.name)}` : op.kind === "pop" && op.fallback !== undefined ? "popFallback" : op.kind)).join(",")}`;
    let entry = shapes.get(key);
    if (!entry) shapes.set(key, (entry = { label: fresh("shape"), ops, transition }));
    return entry.label;
  };
  const words = wordFunctions(snapshotOffset, manifest);
  const scans = new Map<string, string>();
  const scanOf = (bytes: number[], high: boolean) => {
    const key = `${high ? "h" : "a"}:${bytes.join(",")}`;
    let name = scans.get(key);
    if (!name) scans.set(key, (name = `$scan${scans.size}`));
    return name;
  };

  const member = (byte: string, set: ByteSet) =>
    rangesOf(bytesOf(set))
      .map(([lo, hi]) =>
        lo === hi
          ? `(i32.eq ${byte} (i32.const ${lo}))`
          : `(i32.le_u (i32.sub ${byte} (i32.const ${lo})) (i32.const ${hi - lo}))`,
      )
      .reduce((a, b) => `(i32.or ${a} ${b})`, "(i32.const 0)");

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

  const fallbacks = names.map((name) => fresh(`fallback_${name}_`));

  // The dispatch byte is known to be present and in `bytes`: a first matcher that only
  // checks it consumes it unchecked.
  const known = (first: Matcher | undefined, bytes: Set<number>) =>
    (first?.kind === "one" && [...bytes].every((b) => bytesOf(first.set).includes(b))) ||
    (first?.kind === "literal" &&
      first.text.length === 1 &&
      bytes.size === 1 &&
      bytes.has(first.text.charCodeAt(0)));
  const consumes = (m: Matcher | undefined) =>
    m?.kind === "one" ||
    m?.kind === "character" ||
    (m?.kind === "literal" && m.text.length > 0) ||
    (m?.kind === "run" && m.min > 0);

  const speculationGroup = (opener: Extract<Effect, { kind: "speculate" }>) => {
    const group = `(i32.const ${speculationGroups.indexOf(opener.group ?? opener.state)})`;
    if (!opener.isolate) return group;
    return `(if (result i32) (i32.and (i32.ne (local.get $specOpen) (i32.const 0)) (i32.eq ${spec.outerField("state")} (i32.const ${names.indexOf(opener.isolate.base)}))) (then (i32.const ${speculationGroups.indexOf(opener.isolate.group)})) (else ${group}))`;
  };
  const armCode = (arm: Arm, bytes: Set<number>) => {
    const miss = fresh("arm");
    const skip = known(arm.match[0], bytes);
    const classification = arm.then.find((effect) => effect.kind === "word");
    const transition = arm.redispatch === true;
    const ops = arm.then.filter((effect) => effect.kind !== "paint");
    const targets = ops.flatMap((op, i) => targetAssignment(op, i, names));
    if (transition && ops.some((effect) => effect.kind === "abandon"))
      return `(block ${miss} (local.set $p (local.get $pos))
        ${arm.match.map((item) => matcher(item, miss)).join("\n")}
        ${spec.rewind} (br $token))`;
    if (transition)
      return `(block ${miss}
      (local.set $p (local.get $pos))
      ${arm.match.map((m) => matcher(m, miss)).join("\n")}
      (local.set $transitions (i32.add (local.get $transitions) (i32.const 1)))
      (if (i32.gt_u (local.get $transitions) (i32.const ${maxTransitions})) (then (call $fail)))
      ${ops.some((effect) => effect.kind === "closeInjection") ? "(if (i32.eqz (local.get $host)) (then (call $fail))) (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0)) (local.set $hostCurrent (i32.const -1))" : ""}
      ${lowerInjectionActions(
        ops.filter((effect) => effect.kind === "openStatic" || effect.kind === "openNamed"),
        rangeSlots,
        embeds,
      ).join(" ")}
      ${targets.join(" ")}
      (br ${shapeOf(ops, true)}))`;
    const rest = arm.match.slice(skip ? 1 : 0);
    const shared = outlined.get(JSON.stringify(rest));
    const body = shared
      ? `(local.set $p (call ${shared.name} (local.get $input) (local.get $p) (local.get $limit) (local.get $docStart) ${runArguments}))
        (br_if ${miss} (i32.lt_s (local.get $p) (i32.const 0)))`
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
          shapeOf,
          wrapStart: `(i32.load offset=${frameOpeningOffset ?? 0} (i32.add (global.get $base) (i32.mul (i32.sub (local.get $depth) (i32.const 1)) (i32.const ${frameBytes}))))`,
        },
      );
    const selected =
      classification?.kind === "word"
        ? lowerWordSelection(classification, words.lookup, branch)
        : branch(arm.then);
    const opener = arm.then.find((effect) => effect.kind === "speculate");
    const group = opener?.kind === "speculate" ? speculationGroup(opener) : undefined;
    return `(block ${miss}
      ${group !== undefined ? `(br_if ${miss} (i32.or (i32.ge_u (local.get $depth) (i32.const ${maxDepth - 1})) (call $specHas (call $specGroupBits ${group}) (call $specGroupTags ${group}) (local.get $specEpoch) (local.get $pos))))` : ""}
      (local.set $p ${skip ? "(i32.add (local.get $pos) (i32.const 1))" : "(local.get $pos)"})
      ${body}
      ${hasContainers ? lineBoundaryCheck(arm.match, miss) : ""}
      ${skip || arm.match.some(consumes) ? "" : `(br_if ${miss} (i32.eq (local.get $p) (local.get $pos)))`}
      (local.set $next (local.get $p))
      ${selected})`;
  };

  const dispatch = names.map((name, index) => {
    const state = states[index]!;
    const byByte = new Map<number, string>();
    for (let byte = 0; byte < 256; byte++) {
      const arms = state.arms.filter((arm) => bytesOf(arm.on).includes(byte));
      if (arms.length) byByte.set(byte, caseOf(arms, byte));
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
      return `(br_table ${table.join(" ")} ${fallback} (i32.sub (local.get $byte) (i32.const ${min})))`;
    }
    const groups = new Map<string, number[]>();
    for (const [byte, label] of byByte) groups.set(label, [...(groups.get(label) ?? []), byte]);
    return (
      [...groups]
        .map(
          ([label, bytes]) =>
            `(br_if ${label} ${bytes.map((b) => `(i32.eq (local.get $byte) (i32.const ${b}))`).reduce((a, b) => `(i32.or ${a} ${b})`)})`,
        )
        .join("\n") + `\n(br ${fallback})`
    );
  });

  const fallbackCode = names.map((_, index) => {
    const state = states[index]!;
    if (state.otherwise && typeof state.otherwise !== "string") {
      const ops = [...state.otherwise];
      const targets = ops.flatMap((op, i) =>
        op.kind === "push" || op.kind === "goto"
          ? [`(local.set $t${i} (i32.const ${names.indexOf(op.state)}))`]
          : [],
      );
      return `(local.set $transitions (i32.add (local.get $transitions) (i32.const 1)))
        (if (i32.gt_u (local.get $transitions) (i32.const ${maxTransitions})) (then (call $fail)))
        ${lowerInjectionActions(
          ops.filter((effect) => effect.kind === "openStatic" || effect.kind === "openNamed"),
          rangeSlots,
          embeds,
        ).join(" ")}
        ${targets.join(" ")}
        (br ${shapeOf(ops, true)})`;
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
    return `(local.set $style (i32.const ${styles.indexOf(state.style)}))
      (local.set $next ${grammar.queueSweep || hasContainers ? `(if (result i32) (i32.eq (local.get $byte) (i32.const 10)) (then ${first}) (else ${next}))` : next})
      ${state.captureFallback ? "(call $captureAppend (local.get $input) (local.get $pos) (local.get $next) (i32.const 0))" : ""}
      ${typeof state.otherwise === "string" ? `(local.set $state (i32.const ${names.indexOf(state.otherwise)})) ${hasContainers ? "(local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))" : ""}` : ""}
      (br $paint)`;
  });

  // Built after dispatch so that every case is known; cases may add shapes.
  const caseList = [...cases.values()];
  for (const { arms } of caseList) for (const arm of arms) arm.match.forEach(countMatchers);
  // lowerings-match: a matcher sequence used by several arms is outlined.
  const usesColumn = (m: Matcher): boolean =>
    someMatcher([m], (item) => item.kind === "baseState" || item.kind === "toColumn");
  const uses = new Map<string, readonly Matcher[]>();
  const counts = new Map<string, number>();
  for (const { arms, bytes } of caseList)
    for (const arm of arms) {
      const rest = arm.match.slice(known(arm.match[0], bytes) ? 1 : 0);
      if (
        rest.some(usesColumn) ||
        (rest.length < 2 &&
          !rest.some((m) => m.kind === "either" || m.kind === "opt" || m.kind === "repeat"))
      )
        continue;
      const key = JSON.stringify(rest);
      uses.set(key, rest);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const hasCachedPrefix = (root: Matcher): boolean => {
    let found = false;
    visitMatchers([root], (matcher) => {
      if (matcher.kind === "cachedPrefix") found = true;
      return !found;
    });
    return found;
  };
  const needsCallerLocals = (matcher: Matcher): boolean =>
    someMatcher(
      [matcher],
      (item) =>
        item.kind === "baseState" ||
        item.kind === "sameRun" ||
        item.kind === "toColumn" ||
        item.kind === "lineEnd" ||
        item.kind === "cachedPrefix",
    );
  const outlined = new Map<string, { name: string; code: string }>();
  for (const [key, rest] of uses) {
    if (counts.get(key)! < 2 || rest.some(hasCachedPrefix)) continue;
    const name = `$match${outlined.size}`;
    const first = saves;
    const body = rest.map((m) => matcher(m, "$fail")).join("\n");
    const locals = Array.from({ length: saves - first }, (_, i) => `(local $q${first + i} i32)`);
    outlined.set(key, {
      name,
      code: `(func ${name} (param $input i32) (param $p i32) (param $limit i32) (param $docStart i32) ${runParameters} (result i32)
        (local $b i32) ${locals.join(" ")}
        (block $fail ${body} (return (local.get $p)))
        (i32.const -1))`,
    });
  }
  const caseCode = caseList.map(
    ({ arms, bytes }) => `${arms.map((arm) => armCode(arm, bytes)).join("\n")}\n(br $nomatch)`,
  );
  const shapeList = [...shapes.values()];
  const emitOpen = `(if (local.get $host) (then (call $fail)))
      (if (i32.ge_u (global.get $injections) (i32.const 536870912)) (then (call $fail)))
      (if (i32.and (i32.ge_s (local.get $pending) (i32.const 0)) (i32.eq (local.get $pendingAddress) (i32.const -1))) (then
        (local.set $pendingAddress (local.get $out))
        (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))
      (local.set $hostId (global.get $injections))
      (global.set $injections (i32.add (global.get $injections) (i32.const 1)))
      (if (i32.eq (local.get $openAction) (i32.const 1))
        (then
          (local.set $out (call $emitRaw (local.get $out) (i32.const 0) (i32.or (i32.const -536870912) (local.get $hostId))))
          (local.set $out (call $emitRaw (local.get $out) (local.get $openStart) (local.get $openEnd))))
        (else
          (local.set $out (call $emitRaw (local.get $out) (local.get $openStart) (i32.or (i32.const -1073741824) (local.get $hostId))))))
      (local.set $host (i32.const 1))
      (local.set $hostDepth (local.get $depth))
      (local.set $hostLast (i32.const -1))
      (local.set $hostCurrent (i32.const -1))
      (local.set $openAction (i32.const 0))`;
  const shapeCode = shapeList.map(
    ({ ops, transition }) =>
      ops
        .map((op, i) =>
          lowerShapeEffect(op, i, {
            framesOffset,
            frameAddress,
            frameOpeningOffset,
            columns,
            hasSpeculation,
            speculationPass: spec.pass,
          }),
        )
        .join("\n") +
      (hasContainers &&
      ops.some(
        (op) =>
          op.kind === "push" || op.kind === "pop" || op.kind === "goto" || op.kind === "speculate",
      )
        ? "\n(local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))"
        : "") +
      (transition && ops.some((op) => op.kind === "openStatic" || op.kind === "openNamed")
        ? `\n${emitOpen}`
        : "") +
      (transition ? "\n(br $token)" : "\n(br $paint)"),
  );
  const targetCount = Math.max(0, ...shapeList.map(({ ops }) => ops.length));

  const nest = (labels: string[], inner: string, bodies: string[]) =>
    labels.reduce((code, label, i) => `(block ${label} ${code})\n${bodies[i]}`, inner);
  const stateLabels = names.map((name) => fresh(`state_${name}_`));
  const body = nest(
    shapeList.map((s) => s.label),
    nest(
      fallbacks,
      `(block $nomatch ${nest(
        caseList.map((c) => c.label),
        nest(stateLabels, `(br_table ${stateLabels.join(" ")} (local.get $state))`, dispatch),
        caseCode,
      )})
      (br_table ${fallbacks.join(" ")} (local.get $state))`,
      fallbackCode,
    ),
    shapeCode,
  );

  const container = hasContainers
    ? containerCode({
        states,
        names,
        grammar,
        styles,
        columns,
        runSlots,
        frameBytes,
        framesOffset,
        frameAddress,
        hasSpeculation,
        hasInjections,
        spec,
        fresh,
        matcher,
      })
    : "";

  const scanDefs = [...scans].map(([key, name]) => {
    const [kind, bytes] = key.split(":");
    return scanFunction(name, bytes ? bytes.split(",").map(Number) : [], kind === "h");
  });
  const locals = [
    ...Array.from({ length: saves }, (_, i) => `(local $q${i} i32)`),
    ...Array.from({ length: targetCount }, (_, i) => `(local $t${i} i32)`),
    ...[...prefix.caches.values()].map((name) => `(local ${name} i32) (local ${name}Start i32)`),
  ].join(" ");

  const spanPaint = hasInjections
    ? `(if (i32.ne (local.get $pending) (local.get $style)) (then
      (if (i32.and (i32.ge_s (local.get $pending) (i32.const 0)) (i32.eq (local.get $pendingAddress) (i32.const -1))) (then
        (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))
      (local.set $pendingAddress (i32.const -1))
      (local.set $pending (local.get $style))))
    (local.set $pendingEnd (local.get $next))
    (if (i32.ne (local.get $pendingAddress) (i32.const -1)) (then
      (i32.store (local.get $pendingAddress) (local.get $next))))`
    : `(if (i32.ne (local.get $pending) (local.get $style)) (then
    (if (i32.ge_s (local.get $pending) (i32.const 0)) (then
      (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))
    (local.set $pending (local.get $style))))
    (local.set $pendingEnd (local.get $next))`;
  const outputPaint = hasInjections
    ? `(if (i32.and (local.get $host) (i32.eqz (local.get $parentPaint))) (then
    (if (i32.and (i32.ge_s (local.get $pending) (i32.const 0)) (i32.eq (local.get $pendingAddress) (i32.const -1))) (then
      (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))
    (local.set $pending (i32.const -1))
    (local.set $pendingAddress (i32.const -1))
    (if (i32.ne (local.get $hostCurrent) (i32.const -1))
      (then (i32.store (local.get $hostCurrent) (local.get $next)))
      (else
        (local.set $hostCurrent (local.get $out))
        (local.set $hostLast (local.get $out))
        (local.set $out (call $emitRaw (local.get $out) (local.get $next) (i32.or (i32.const -2147483648) (local.get $hostId)))))))
    (else ${spanPaint}))
    (local.set $parentPaint (i32.const 0))
    (if (local.get $openAction) (then ${emitOpen}))`
    : spanPaint;

  const wat = `(module
  (import "env" "memory" (memory 1))
  (import "env" "base" (global $base i32))
  (global $records (export "records") (mut i32) (i32.const 0))
  (global $injections (export "injections") (mut i32) (i32.const 0))
  ${hasWrap ? '(global $groups (export "groups") (mut i32) (i32.const 0))' : ""}
  (global $status (export "status") (mut i32) (i32.const 0))
  (func $fail (global.set $status (i32.const 1)) (unreachable))
  ${scratch ? speculationScratch : ""}
  ${hasSpeculation ? speculationFunctions : ""}
  ${hasSpeculation && hasInjections ? speculationOutputFunctions : ""}
  ${emitFunction(scratch)}
  ${
    hasInjections || hasWrap
      ? `${emitRaw(scratch)}${
          hasInjections
            ? `
  (func $sealHost (param $last i32)
    (if (i32.ne (local.get $last) (i32.const -1)) (then
      (i32.store offset=4 (local.get $last) (i32.or (i32.load offset=4 (local.get $last)) (i32.const 536870912))))))`
            : ""
        }`
      : ""
  }
  ${charEndFunction}
  ${
    hasContainers
      ? `${crossesLineFunction}
  (func $isContainer (param $state i32) (result i32) ${states
    .map((state, i) => (state.prefix ? `(i32.eq (local.get $state) (i32.const ${i}))` : ""))
    .filter(Boolean)
    .reduce((a, b) => `(i32.or ${a} ${b})`, "(i32.const 0)")})
  (func $findContainer (param $depth i32) (param $state i32) (result i32)
    (if (call $isContainer (local.get $state)) (then (return (i32.const 1))))
    (block $done (loop $more
      (br_if $done (i32.eqz (local.get $depth)))
      (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))
      (if (call $isContainer (i32.load offset=${framesOffset} (i32.add (global.get $base) (i32.mul (local.get $depth) (i32.const ${frameBytes}))))) (then (return (i32.const 1))))
      (br $more))) (i32.const 0))`
      : ""
  }
  ${hasCapture ? captureWat(captureOffset) : ""}
  ${states.some((state) => state.arms.some((arm) => usesGroup(arm.match)) || (state.prefix && (usesGroup(state.prefix.match) || (state.prefix.lazy && usesGroup(state.prefix.lazy.unless))))) ? groupWat : ""}
  ${hasQueue ? queueWat(captureOffset, ownerOffset, bodyOffset) : ""}
  ${columns.length ? columnFunction(grammar.tabStop ?? 4) : ""}
  ${scanDefs.join("\n")}
  ${[...words.functions.values()].map(({ data }) => data ?? "").join("\n")}
  ${[...runFunctions.values()].map(({ code }) => code).join("\n")}
  ${[...prefix.functions.values()].map(({ code }) => code).join("\n")}
  ${[...outlined.values()].map(({ code }) => code).join("\n")}
  ${[...separatedFunctions.values()].map(({ code }) => code).join("\n")}
  ${[...words.functions.values()].map(({ code }) => code).join("\n")}
  (func (export "highlight") (param $input i32) (param $length i32) (param $documents i32) (param $count i32)
    (param $out i32) (result i32)
    (local $initial i32) (local $state i32) (local $depth i32)
    (local $docStart i32) (local $limit i32) (local $pos i32) (local $p i32) (local $next i32)
    ${columns.length ? `(local $column i64) (local $matchColumn i64) (local $matchTarget i64) ${columns.map((_, i) => `(local $columnSlot${i} i64)`).join(" ")}` : ""}
    ${runSlots.size ? `(local $runAt i32) ${[...runSlots.values()].map((i) => `(local $runByte${i} i32) (local $runLength${i} i32)`).join(" ")}` : ""}
    ${[...rangeSlots.values()].map((i) => `(local $rangeStart${i} i32) (local $rangeEnd${i} i32)`).join(" ")}
    ${hasInjections ? "(local $host i32) (local $hostDepth i32) (local $hostId i32) (local $hostLast i32) (local $hostCurrent i32) (local $parentPaint i32) (local $pendingAddress i32) (local $openAction i32) (local $openStart i32) (local $openEnd i32)" : ""}
    (local $byte i32) (local $b i32) (local $style i32) (local $pending i32) (local $pendingEnd i32)
    ${hasWrap ? "(local $wrapStyle i32) (local $wrapStart i32)" : ""}
    ${recordPatching ? `(local $candidate i32) (local $patch i32) (local $mark i32) ${hasInjections ? "(local $markHost i32)" : ""}` : ""}
    ${hasTransitions ? "(local $transitions i32)" : ""}
    ${words.functions.size ? "(local $word i32)" : ""}
    ${grammar.queueSweep ? "(local $lineStart i32) (local $joined i32) (local $recheck i32) (local $sweepIndex i32) (local $sweepBody i32) (local $sweepOwner i32) (local $sweepEntry i32) (local $sweepFlags i32) (local $sweepLen i32) (local $sweepPos i32)" : ""}
    ${hasContainers ? `(local $containerLine i32) (local $containerNext i32) (local $containerOpen i32) (local $containerIndex i32) (local $containerDepth i32) (local $containerBaseDepth i32) (local $containerBaseState i32) (local $containerFrameState i32) (local $containerMatched i32) ${columns.map((_, i) => `(local $containerColumn${i} i64)`).join(" ")} ${[...runSlots.values()].map((i) => `(local $containerRunByte${i} i32) (local $containerRunLength${i} i32)`).join(" ")}` : ""}
    ${locals}
    ${hasSpeculation ? spec.locals : ""}
    (global.set $status (i32.const 0)) (global.set $injections (i32.const 0))
    ${hasWrap ? "(global.set $groups (i32.const 0))" : ""}
    ${scratch ? `(call $scratchInit (local.get $out) (local.get $length) (i32.const ${Math.max(speculationGroups.length, options.speculationScratch ? 1 : 0)}))` : ""}
    (local.set $initial (local.get $out))
    (block $documents (loop $document
      (br_if $documents (i32.eqz (local.get $count)))
        ${hasSpeculation ? `(local.set $specEpoch (call $specNextEpoch (call $specTags) (i32.mul (i32.shl (i32.wrap_i64 (i64.shr_u (i64.add (i64.extend_i32_u (local.get $length)) (i64.const 7)) (i64.const 3))) (i32.const 2)) (i32.const ${speculationGroups.length})) (local.get $specEpoch))) (local.set $specFrontier (i64.const 0)) (local.set $specRewound (i64.const 0))` : ""}
        ${hasInjections ? "(if (local.get $host) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0))))" : ""}
        ${[...rangeSlots.values()].map((i) => `(local.set $rangeStart${i} (i32.const 0)) (local.set $rangeEnd${i} (i32.const 0))`).join(" ")}
        ${columns.length ? `(local.set $column (i64.const 0)) ${columns.map((_, i) => `(local.set $columnSlot${i} (i64.const -1))`).join(" ")}` : ""}
        (local.set $state (i32.const ${initial})) (local.set $depth (i32.const 0))
        ${hasContainers ? `(local.set $containerLine (i32.const 0)) (local.set $containerNext (i32.const -1)) (local.set $containerOpen (i32.const ${states[initial]!.prefix ? 1 : 0}))` : ""}
        ${recordPatching ? "(local.set $candidate (i32.const -1))" : ""}
        ${hasTransitions ? "(local.set $transitions (i32.const 0))" : ""}
        ${hasCapture ? "(call $captureReset)" : ""}
        ${hasQueue ? "(call $queueReset)" : ""}
        ${grammar.queueSweep ? "(local.set $lineStart (i32.const 1)) (local.set $joined (i32.const 0))" : ""}
        ${[...runSlots.values()].map((i) => `(local.set $runLength${i} (i32.const 0))`).join(" ")}
      (local.set $docStart (i32.load (local.get $documents)))
      (local.set $limit (i32.load offset=4 (local.get $documents)))
      (local.set $pos (local.get $docStart))
      ${[...prefix.caches.values()].map((name) => `(local.set ${name} (local.get $docStart)) (local.set ${name}Start (local.get $docStart))`).join(" ")}
      (local.set $pending (i32.const -1))
      ${hasInjections ? "(local.set $hostCurrent (i32.const -1)) (local.set $pendingAddress (i32.const -1))" : ""}
      (block $tokens (loop $token
        ${hasSpeculation ? `(if (i32.ge_u (local.get $pos) (local.get $limit)) (then (if (local.get $specOpen) (then ${spec.rewind} (br $token))) (br $tokens)))` : "(br_if $tokens (i32.ge_u (local.get $pos) (local.get $limit)))"}
        (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        ${hasWrap ? "(local.set $wrapStyle (i32.const -1))" : ""}
        ${recordPatching ? "(local.set $patch (i32.const -1)) (local.set $mark (i32.const 0))" : ""}
        ${grammar.queueSweep ? "(local.set $recheck (i32.const 0))" : ""}
        (block $paint ${hasContainers ? `(if (local.get $containerOpen) (then ${container}) (else (local.set $containerLine (i32.const 0)) (local.set $containerNext (i32.const -1))))` : ""} ${grammar.queueSweep ? queueSweepCode(grammar.queueSweep, names, styles, ownerOffset, bodyOffset, hasInjections, hasContainers) : ""} ${body})
        ${hasTransitions ? "(local.set $transitions (i32.const 0))" : ""}
        ${
          recordPatching
            ? hasInjections
              ? `(if (i32.and (i32.ge_s (local.get $patch) (i32.const 0)) (i32.ne (local.get $candidate) (i32.const -1))) (then
          (if (i32.or (i32.eq (local.get $candidate) (local.get $out)) (i32.eq (local.get $candidate) (local.get $pendingAddress)))
            (then (local.set $pending (local.get $patch))))
          (if (i32.ne (local.get $candidate) (local.get $out)) (then
            (i32.store offset=4 (local.get $candidate) (i32.load16_u (i32.add (global.get $base) (i32.shl (local.get $patch) (i32.const 1)))))))))`
              : `(if (i32.and (i32.ge_s (local.get $patch) (i32.const 0)) (i32.ne (local.get $candidate) (i32.const -1))) (then
          (if (i32.eq (local.get $candidate) (local.get $out))
            (then (local.set $pending (local.get $patch)))
            (else (i32.store offset=4 (local.get $candidate) (i32.load16_u (i32.add (global.get $base) (i32.shl (local.get $patch) (i32.const 1)))))))))`
            : ""
        }

        ${recordPatching && hasInjections ? "(local.set $markHost (i32.and (local.get $host) (i32.eqz (local.get $parentPaint))))" : ""}
        ${outputPaint}
        ${hasContainers ? `(local.set $containerLine (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 1)))) (i32.const 10))) (if (local.get $containerLine) (then (local.set $containerNext (i32.const -1))))` : ""}
        ${
          columns.length
            ? `(local.set $column (if (result i64)
          (i32.and (i32.eq (local.get $next) (i32.add (local.get $pos) (i32.const 1)))
            (i32.le_u (i32.sub (local.get $byte) (i32.const 32)) (i32.const 95)))
          (then (i64.add (i64.and (local.get $column) (i64.const 4611686018427387903)) (i64.const 1)))
          (else (call $advanceColumn (local.get $input) (local.get $pos) (local.get $next) (local.get $column)))))`
            : ""
        }
        ${
          grammar.queueSweep
            ? `(local.set $b (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 1)))))
        (if (i32.eq (local.get $b) (i32.const 10)) (then
          (local.set $joined (if (result i32) (i32.gt_u (local.get $next) (i32.add (local.get $docStart) (i32.const 1)))
            (then (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 2)))) (i32.const 92)))
            (else (i32.const 0))))
          (local.set $lineStart (i32.const 1))) (else (local.set $lineStart (local.get $recheck))))`
            : ""
        }
        ${
          recordPatching
            ? hasInjections
              ? "(if (local.get $mark) (then (local.set $candidate (if (result i32) (local.get $markHost) (then (i32.const -1)) (else (if (result i32) (i32.ne (local.get $pendingAddress) (i32.const -1)) (then (local.get $pendingAddress)) (else (local.get $out))))))))"
              : "(if (local.get $mark) (then (local.set $candidate (local.get $out))))"
            : ""
        }
        ${
          hasWrap
            ? `(if (i32.and (i32.ge_s (local.get $wrapStyle) (i32.const 0)) (i32.lt_u (local.get $wrapStart) (local.get $next))) (then
          (if ${hasInjections ? "(i32.and (i32.ge_s (local.get $pending) (i32.const 0)) (i32.eq (local.get $pendingAddress) (i32.const -1)))" : "(i32.ge_s (local.get $pending) (i32.const 0))"} (then
            (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))
          (local.set $pending (i32.const -1))
          ${hasInjections ? "(local.set $pendingAddress (i32.const -1)) (local.set $hostCurrent (i32.const -1))" : ""}
          (local.set $out (call $emitRaw (local.get $out) (local.get $wrapStart)
            (i32.or (i32.const 1073741824) (i32.load16_u (i32.add (global.get $base) (i32.shl (local.get $wrapStyle) (i32.const 1)))))))
          (global.set $groups (i32.add (global.get $groups) (i32.const 1)))))`
            : ""
        }
        (local.set $pos (local.get $next))
        (br $token)))
      ${hasInjections ? "(if (i32.and (i32.ge_s (local.get $pending) (i32.const 0)) (i32.eq (local.get $pendingAddress) (i32.const -1))) (then (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))\n      (if (local.get $host) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0))))" : hasWrap ? "(if (i32.ge_s (local.get $pending) (i32.const 0)) (then (local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))))" : "(local.set $out (call $emit (local.get $out) (local.get $pendingEnd) (local.get $pending)))"}
      (local.set $documents (i32.add (local.get $documents) (i32.const 8)))
      (local.set $count (i32.sub (local.get $count) (i32.const 1)))
      (br $document)))
    (global.set $records (i32.shr_u (i32.sub (local.get $out) (local.get $initial)) (i32.const 3)))
    (i32.const 0)))`;
  return { wat, manifest };
}

/** Inclusive runs of consecutive bytes. */
function rangesOf(bytes: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const byte of bytes) {
    const last = ranges.at(-1);
    if (last && last[1] === byte - 1) last[1] = byte;
    else ranges.push([byte, byte]);
  }
  return ranges;
}

// lowerings-paint: separate stores in one outlined, checked emitter.
const emitFunction = (
  scratch: boolean,
) => `(func $emit (param $out i32) (param $end i32) (param $style i32) (result i32)
    (local $need i64) (local $available i64)
    (local.set $need (i64.add (i64.extend_i32_u (local.get $out)) (i64.const 8)))
    (if (i64.gt_u (local.get $need) (i64.const 4294967295)) (then (call $fail)))
    ${scratch ? "(call $specReserveOutput (local.get $need))" : ""}
    (local.set $available (i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16)))
    (if (i64.gt_u (local.get $need) (local.get $available)) (then
      (if (i32.eq (memory.grow (i32.wrap_i64 (i64.shr_u (i64.add (i64.sub (local.get $need) (local.get $available)) (i64.const 65535)) (i64.const 16)))) (i32.const -1))
        (then (call $fail)))))
    (i32.store (local.get $out) (local.get $end))
    (i32.store offset=4 (local.get $out) (i32.load16_u (i32.add (global.get $base) (i32.shl (local.get $style) (i32.const 1)))))
    (i32.add (local.get $out) (i32.const 8)))`;

const charEndFunction = `(func $charEnd (param $input i32) (param $p i32) (param $limit i32) (result i32)
    (local $b i32) (local $width i32) (local $end i32)
    (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
    (local.set $width (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 192)) (i32.const 31)) (then (i32.const 2))
      (else (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 224)) (i32.const 15)) (then (i32.const 3))
      (else (if (result i32) (i32.le_u (i32.sub (local.get $b) (i32.const 240)) (i32.const 7)) (then (i32.const 4)) (else (i32.const 1))))))))
    (local.set $end (i32.add (local.get $p) (i32.const 1)))
    (block $done (loop $more
      (br_if $done (i32.or (i32.ge_u (local.get $end) (local.get $limit)) (i32.ge_u (i32.sub (local.get $end) (local.get $p)) (local.get $width))))
      (br_if $done (i32.gt_u (i32.sub (i32.load8_u (i32.add (local.get $input) (local.get $end))) (i32.const 128)) (i32.const 63)))
      (local.set $end (i32.add (local.get $end) (i32.const 1))) (br $more)))
    (local.get $end))`;

/** A segment-bounded SIMD scan to ASCII stop bytes and, optionally, any high byte. */
function scanFunction(name: string, bytes: number[], high: boolean): string {
  // lowerings-scan: splat compares up to eight stop bytes, nibble tables beyond.
  const asciiVector =
    bytes.length === 0
      ? ""
      : bytes.length <= 8
        ? bytes
            .map((b) => `(i8x16.eq (local.get $chunk) (i8x16.splat (i32.const ${b})))`)
            .reduce((a, b) => `(v128.or ${a} ${b})`)
        : (() => {
            const lo = Array(16).fill(0);
            const hi = Array(16).fill(0);
            for (const b of bytes) {
              lo[b & 15] |= 1 << (b >> 4);
              hi[b >> 4] = 1 << (b >> 4);
            }
            return `(i8x16.ne (v128.and
            (i8x16.swizzle (v128.const i8x16 ${lo.join(" ")}) (v128.and (local.get $chunk) (i8x16.splat (i32.const 15))))
            (i8x16.swizzle (v128.const i8x16 ${hi.join(" ")}) (v128.and (i16x8.shr_u (local.get $chunk) (i32.const 4)) (i8x16.splat (i32.const 15)))))
            (i8x16.splat (i32.const 0)))`;
          })();
  const asciiScalar = rangesOf(bytes)
    .map(([lo, hi]) =>
      lo === hi
        ? `(i32.eq (local.get $b) (i32.const ${lo}))`
        : `(i32.le_u (i32.sub (local.get $b) (i32.const ${lo})) (i32.const ${hi - lo}))`,
    )
    .reduce((a, b) => (a ? `(i32.or ${a} ${b})` : b), "");
  const vectorHigh = `(i8x16.lt_s (local.get $chunk) (i8x16.splat (i32.const 0)))`;
  const vector = high
    ? asciiVector
      ? `(v128.or ${asciiVector} ${vectorHigh})`
      : vectorHigh
    : asciiVector;
  const scalarHigh = `(i32.ge_u (local.get $b) (i32.const 128))`;
  const scalar = high
    ? asciiScalar
      ? `(i32.or ${asciiScalar} ${scalarHigh})`
      : scalarHigh
    : asciiScalar;
  return `(func ${name} (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $chunk v128) (local $mask i32) (local $b i32)
    (block $done
      (block $tail (loop $vectors
        (br_if $tail (i32.lt_u (i32.sub (local.get $end) (local.get $pos)) (i32.const 16)))
        (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $pos))))
        (local.set $mask (i8x16.bitmask ${vector}))
        (if (local.get $mask) (then (local.set $pos (i32.add (local.get $pos) (i32.ctz (local.get $mask)))) (br $done)))
        (local.set $pos (i32.add (local.get $pos) (i32.const 16)))
        (br $vectors)))
      (loop $scalar
        (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $done ${scalar})
        (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (br $scalar)))
    (local.get $pos))`;
}
