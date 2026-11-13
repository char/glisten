import { record } from "#/abi/constants.ts";
import {
  global,
  local,
  print,
  wat as fragment,
  type Def,
  type Fragment,
  type Local,
} from "#/testing/wat/mod.ts";
import {
  charEnd,
  coalesce,
  emitSegment,
  fail,
  openInjection,
  recordWriters,
  sealHost,
  status,
  stopScan,
} from "./runtime.ts";
import { lowerShapeEffect } from "./registry.ts";
import { type Effect, type Grammar } from "#/grammar/mod.ts";
import { columnFunction } from "./column.ts";
import { previousCharFunction } from "./boundary.ts";
import { wordFunctions } from "./word.ts";
import { captureWat } from "./capture.ts";
import { slotOwnerFunction } from "./state.ts";
import { queueWat } from "./queue.ts";
import { containerCode } from "./container.ts";
import { prefixCacheFunctions } from "./combinator.ts";
import { separatedRunFunctions } from "./separated_run.ts";
import { groupWat } from "./group.ts";
import { speculationScratch } from "./speculation_scratch.ts";
import { speculationFunctions } from "./speculation.ts";
import { speculationOutputFunctions } from "./speculation_output.ts";
import { crossesLineFunction } from "./line_boundary.ts";
import type { Compiled } from "./mod.ts";
import type { CompilerFeatures, CompilerArea } from "./features.ts";
import type { DispatchPlan } from "./dispatch.ts";
import { emitHighlight } from "./highlight.ts";

export function assembleCompiled(
  grammar: Grammar,
  features: CompilerFeatures,
  area: CompilerArea,
  plan: DispatchPlan,
): Compiled {
  const {
    names,
    states,
    sharedStates,
    hasContainers,
    hasSpeculation,
    scratch,
    runSlots,
    counterSlots,
    columns,
    hasInjections,
    styles,
  } = features;
  const {
    framesOffset,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    frameBytes,
    frameAddress,
    spec,
    manifest,
  } = area;

  const {
    fresh,
    matcher,
    getSaves,
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
  } = plan;
  const records = recordWriters({
    base: fragment`(global.get $base)`,
    fail,
    writable: scratch
      ? fragment`(i32.sub (global.get $specScratch) (i32.const ${record.bytes}))`
      : undefined,
    reserveOutput: scratch ? (end) => fragment`(call $specReserveOutput ${end})` : undefined,
    lazyReserve: true,
  });
  const injections = global(
    "injections",
    () => fragment`(export "injections") (mut i32) (i32.const 0)`,
  );
  const groups = global("groups", () => fragment`(export "groups") (mut i32) (i32.const 0)`);
  const handles = {
    out: local("out"),
    pending: local("pending"),
    pendingEnd: local("pendingEnd"),
    pendingAddress: local("pendingAddress"),
    host: local("host"),
    hostId: local("hostId"),
    hostDepth: local("hostDepth"),
    hostLast: local("hostLast"),
    hostCurrent: local("hostCurrent"),
    depth: local("depth"),
    openAction: local("openAction"),
    openStart: local("openStart"),
    openEnd: local("openEnd"),
    next: local("next"),
    style: local("style"),
    wrapStyle: local("wrapStyle"),
    wrapStart: local("wrapStart"),
  };
  const bindings = new Map(Object.entries(handles).map(([name, handle]) => [handle, name]));
  const renderInline = (body: Fragment) => inline(body, bindings);
  const simpleSpan = {
    out: handles.out,
    pendingStyle: handles.pending,
    pendingEnd: handles.pendingEnd,
  };
  const injectedSpan = { ...simpleSpan, pendingAddress: handles.pendingAddress };
  const injectionState = {
    span: injectedSpan,
    host: handles.host,
    hostId: handles.hostId,
    hostDepth: handles.hostDepth,
    hostLast: handles.hostLast,
    hostCurrent: handles.hostCurrent,
    depth: handles.depth,
    openAction: handles.openAction,
    openStart: handles.openStart,
    openEnd: handles.openEnd,
  };
  const end = handles.next;
  const style = handles.style;
  const emitOpen = renderInline(openInjection(injectionState, { ...records, fail, injections }));
  const shapeCode = lowerShapes(shapeList, features, area, emitOpen);

  const targetCount = Math.max(0, ...shapeList.map(({ ops }) => ops.length));

  const nest = (labels: string[], inner: string, bodies: string[]) =>
    labels.reduce(
      (code, label, i) => `(block ${label} ${code})
        \n${bodies[i]}`,
      inner,
    );
  const stateLabels = names.map((name) => fresh(`dispatchState_${name}_`));
  const body = nest(
    shapeList.map((s) => s.label),
    nest(
      fallbacks,
      `(block $nomatch
          ${nest(
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
        frameRunIndices,
        frameRunOffset,
        counterSlots,
        frameCounterIndices,
        frameCounterOffset,
        frameBytes,
        shared: sharedStates.length > 0,
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
    return definition(
      stopScan(name.slice(1), bytes ? bytes.split(",").map(Number) : [], kind === "h"),
    );
  });
  const locals = [
    ...Array.from({ length: getSaves() }, (_, i) => `(local $backtrack${i} i32)`),
    ...Array.from({ length: targetCount }, (_, i) => `(local $target${i} i32)`),
    ...[...prefix.caches.values()].map((name) => `(local ${name} i32) (local ${name}Start i32)`),
  ].join(" ");

  const spanPaint = renderInline(
    coalesce(hasInjections ? injectedSpan : simpleSpan, end, style, records.emit),
  );
  const injectedPaint = hasInjections
    ? renderInline(emitSegment(injectionState, end, records))
    : "";
  const outputPaint = hasInjections
    ? `(if (i32.and (local.get $host) (i32.eqz (local.get $parentPaint)))
        (then ${injectedPaint})
        (else ${spanPaint}))
      (local.set $parentPaint (i32.const 0))
      (if (local.get $openAction) (then ${emitOpen}))`
    : spanPaint;

  const moduleDefinitions = emitModuleDefinitions({
    grammar,
    features,
    area,
    injections,
    groups,
    records,
    scanDefs,
    words,
    runFunctions,
    prefix,
    outlined,
    separatedFunctions,
  });

  const highlight = emitHighlight({
    grammar,
    features,
    area,
    prefix,
    hasWords: words.functions.size > 0,
    locals,
    handles,
    records,
    groups,
    renderInline,
    simpleSpan,
    injectedSpan,
    end,
    emitOpen,
    outputPaint,
    container,
    body,
  });
  const wat = `${moduleDefinitions}${highlight}`;
  return { wat, manifest };
}

function emitModuleDefinitions(context: {
  grammar: Grammar;
  features: CompilerFeatures;
  area: CompilerArea;
  injections: Def;
  groups: Def;
  records: ReturnType<typeof recordWriters>;
  scanDefs: string[];
  words: ReturnType<typeof wordFunctions>;
  runFunctions: Map<string, { name: string; code: string }>;
  prefix: ReturnType<typeof prefixCacheFunctions>;
  outlined: Map<string, { name: string; code: string }>;
  separatedFunctions: ReturnType<typeof separatedRunFunctions>;
}): string {
  const {
    grammar,
    features,
    area,
    injections,
    groups,
    records,
    scanDefs,
    words,
    runFunctions,
    prefix,
    outlined,
    separatedFunctions,
  } = context;
  const {
    hasWrap,
    scratch,
    hasSpeculation,
    hasInjections,
    hasPreviousChar,
    hasGroupMatcher,
    hasContainers,
    states,
    sharedStates,
    hasQueue,
    tracksColumn,
  } = features;
  const { framesOffset, frameBytes, hasCapture, captureOffset, ownerOffset, bodyOffset } = area;
  // With scratch, the limit is declared beside the scratch globals that move it.
  const outputLimit = scratch ? "" : definition(records.limit);
  return `(module
  (import "env" "memory" (memory 1))
  (import "env" "base" (global $base i32))
  (global $records (export "records") (mut i32) (i32.const 0))
  ${definition(injections)}
  ${hasWrap ? definition(groups) : ""}
  ${definition(status)}
  ${definition(fail)}
  ${scratch ? speculationScratch : ""}
  ${hasSpeculation ? speculationFunctions : ""}
  ${hasSpeculation && hasInjections ? speculationOutputFunctions : ""}
  ${outputLimit}
  ${definition(records.grow)}
  ${definition(records.emit)}
  ${
    hasInjections || hasWrap
      ? `${definition(records.emitRaw)}${hasInjections ? `\n  ${definition(sealHost)}` : ""}`
      : ""
  }
  ${definition(charEnd)}${hasPreviousChar ? `\n  ${previousCharFunction}` : ""}
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
  ${sharedStates.length && (hasContainers || grammar.queueSweep) ? slotOwnerFunction(sharedStates, frameBytes, framesOffset) : ""}
  ${hasCapture ? captureWat(captureOffset) : ""}
  ${hasGroupMatcher ? groupWat : ""}
  ${hasQueue ? queueWat(captureOffset, ownerOffset, bodyOffset) : ""}
  ${tracksColumn ? columnFunction(grammar.tabStop ?? 4) : ""}
  ${scanDefs.join("\n")}
  ${[...words.functions.values()].map(({ data }) => data ?? "").join("\n")}
  ${[...runFunctions.values()].map(({ code }) => code).join("\n")}
  ${[...prefix.functions.values()].map(({ code }) => code).join("\n")}
  ${[...outlined.values()].map(({ code }) => code).join("\n")}
  ${[...separatedFunctions.values()].map(({ code }) => code).join("\n")}
  ${[...words.functions.values()].map(({ code }) => code).join("\n")}
`;
}

function lowerShapes(
  shapeList: Array<{ ops: Effect[]; transition: boolean; shared: boolean }>,
  features: CompilerFeatures,
  area: CompilerArea,
  emitOpen: string,
): string[] {
  const {
    columns,
    sharedStates,
    sharedNames,
    counterSlots,
    runSlots,
    hasSpeculation,
    hasContainers,
  } = features;
  const {
    framesOffset,
    frameAddress,
    frameOpeningOffset,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    spec,
  } = area;
  return shapeList.map(({ ops, transition, shared }) => {
    let currentShared: boolean | undefined = shared;
    const pushed: (boolean | undefined)[] = [];
    return (
      ops
        .map((op, i) => {
          const code = lowerShapeEffect(op, i, {
            framesOffset,
            frameAddress,
            frameOpeningOffset,
            columns,
            frameRunIndices,
            frameRunOffset,
            frameCounterIndices,
            frameCounterOffset,
            sharedStates,
            sharedNames,
            currentShared,
            counterSlots,
            runSlots,
            hasSpeculation,
            speculationPass: spec.pass,
          });
          if (op.kind === "push" || op.kind === "speculate") {
            pushed.push(currentShared);
            currentShared = sharedNames.has(op.state);
          } else if (op.kind === "pop") {
            currentShared = pushed.length ? pushed.pop() : undefined;
          } else if (op.kind === "goto") currentShared = sharedNames.has(op.state);
          return code;
        })
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
      (transition ? "\n(br $token)" : "\n(br $paint)")
    );
  });
}

function inline(body: Fragment, bindings: ReadonlyMap<Local, string>): string {
  return body.chunks
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "fragment") return inline(part, bindings);
      if (part.type === "def") return `$${part.name}`;
      if (part.type === "local") {
        const name = bindings.get(part);
        if (name === undefined) throw new Error("Unbound compiler inline local");
        return `$${name}`;
      }
      throw new Error("Compiler inline templates cannot introduce labels");
    })
    .join("");
}

function definition(def: Def): string {
  return `(${def.kind} $${def.name} ${print(def.body())})`;
}
