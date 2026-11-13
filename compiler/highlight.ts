import { record } from "#/abi/mod.ts";
import { wat as fragment, type Def, type Fragment, type Local } from "#/testing/wat/mod.ts";
import { emitGroup, emitPending, flushSpan, recordWriters } from "./runtime.ts";
import { type Grammar } from "#/grammar/mod.ts";
import { columnValueMask } from "./column.ts";
import { queueSweepCode } from "./queue.ts";
import { prefixCacheFunctions } from "./combinator.ts";
import type { CompilerFeatures, CompilerArea } from "./features.ts";

export function emitHighlight(context: {
  grammar: Grammar;
  features: CompilerFeatures;
  area: CompilerArea;
  prefix: ReturnType<typeof prefixCacheFunctions>;
  hasWords: boolean;
  locals: string;
  handles: { hostCurrent: Local; wrapStyle: Local; wrapStart: Local };
  records: ReturnType<typeof recordWriters>;
  groups: Def;
  renderInline: (body: Fragment) => string;
  simpleSpan: { out: Local; pendingStyle: Local; pendingEnd: Local };
  injectedSpan: { out: Local; pendingStyle: Local; pendingEnd: Local; pendingAddress: Local };
  end: Local;
  emitOpen: string;
  outputPaint: string;
  container: string;
  body: string;
}): string {
  const {
    grammar,
    features,
    area,
    prefix,
    hasWords,
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
  } = context;
  const {
    tracksColumn,
    columns,
    runSlots,
    counterSlots,
    rangeSlots,
    hasInjections,
    hasWrap,
    recordPatching,
    hasTransitions,
    sharedStates,
    hasContainers,
    hasSpeculation,
    scratch,
    scratchGroups,
    speculationGroups,
    states,
    initial,
    hasQueue,
    names,
    styles,
  } = features;
  const {
    hasCapture,
    spec,
    ownerOffset,
    bodyOffset,
    frameRunIndices,
    frameRunOffset,
    frameCounterIndices,
    frameCounterOffset,
    frameBytes,
    framesOffset,
  } = area;
  const columnLocals = tracksColumn
    ? [
        "(local $column i64) (local $matchColumn i64) (local $matchTarget i64)",
        ...columns.map((_, i) => {
          const name = `$columnSlot${i}`;
          return `(local ${name} i64)`;
        }),
      ].join("\n")
    : "";
  const runLocals = runSlots.size
    ? [
        "(local $runAt i32)",
        ...[...runSlots.values()].map((i) => {
          const byte = `$runByte${i}`;
          const length = `$runLength${i}`;
          return `(local ${byte} i32) (local ${length} i32)`;
        }),
      ].join("\n")
    : "";
  const counterLocals = [...counterSlots.values()]
    .map((i) => {
      const name = `$counter${i}`;
      return `(local ${name} i32)`;
    })
    .join("\n");
  const rangeLocals = [...rangeSlots.values()]
    .map((i) => {
      const start = `$rangeStart${i}`;
      const end = `$rangeEnd${i}`;
      return `(local ${start} i32) (local ${end} i32)`;
    })
    .join("\n");
  const injectionLocals = hasInjections
    ? `(local $host i32) (local $hostDepth i32) (local $hostId i32) (local $hostLast i32)
       (local $hostCurrent i32) (local $parentPaint i32) (local $pendingAddress i32)
       (local $openAction i32) (local $openStart i32) (local $openEnd i32)`
    : "";
  const wrapLocals = hasWrap ? "(local $wrapStyle i32) (local $wrapStart i32)" : "";
  const markHostLocal = hasInjections ? "(local $markHost i32)" : "";
  const recordLocals = recordPatching
    ? `(local $candidate i32) (local $patch i32) (local $mark i32) ${markHostLocal}`
    : "";
  const transitionLocals = hasTransitions ? "(local $transitions i32)" : "";
  const wordLocals = hasWords ? "(local $word i32)" : "";
  const ownerLocals =
    sharedStates.length && (hasContainers || grammar.queueSweep)
      ? "(local $slotOwnerIndex i32)"
      : "";
  const sweepLocals = grammar.queueSweep
    ? `(local $lineStart i32) (local $joined i32) (local $recheck i32) (local $sweepIndex i32)
       (local $sweepBody i32) (local $sweepOwner i32) (local $sweepEntry i32)
       (local $sweepFlags i32) (local $sweepLen i32) (local $sweepPos i32)`
    : "";
  const containerLocals = hasContainers
    ? [
        `(local $containerLine i32) (local $containerNext i32) (local $containerOpen i32)
         (local $containerIndex i32) (local $containerDepth i32) (local $containerBaseDepth i32)
         (local $containerBaseState i32) (local $containerFrameState i32) (local $containerMatched i32)`,
        ...columns.map((_, i) => {
          const name = `$containerColumn${i}`;
          return `(local ${name} i64)`;
        }),
        ...[...runSlots.values()].map((i) => {
          const byte = `$containerRunByte${i}`;
          const length = `$containerRunLength${i}`;
          return `(local ${byte} i32) (local ${length} i32)`;
        }),
        ...[...counterSlots.values()].map((i) => {
          const name = `$containerCounter${i}`;
          return `(local ${name} i32)`;
        }),
      ].join("\n")
    : "";
  const speculationLocals = hasSpeculation ? spec.locals : "";
  const highlightLocals = `  (func (export "highlight") (param $input i32) (param $length i32) (param $documents i32) (param $count i32)
    (param $out i32) (result i32)
    (local $initial i32) (local $state i32) (local $depth i32)
    (local $docStart i32) (local $limit i32) (local $pos i32) (local $matchCursor i32) (local $next i32)
    ${columnLocals}
    ${runLocals}
    ${counterLocals}
    ${rangeLocals}
    ${injectionLocals}
    (local $byte i32) (local $matchByte i32) (local $style i32) (local $pending i32) (local $pendingEnd i32)
    ${wrapLocals}
    ${recordLocals}
    ${transitionLocals}
    ${wordLocals}
    ${ownerLocals}
    ${sweepLocals}
    ${containerLocals}
    ${locals}
    ${speculationLocals}
`;
  const resetGroups = hasWrap ? "(global.set $groups (i32.const 0))" : "";
  const initializeScratch = scratch
    ? `(call $scratchInit (local.get $out) (local.get $length) (i32.const ${scratchGroups}))`
    : "";
  const refreshOutputLimit = renderInline(records.init);
  const groupCount = speculationGroups.length;
  const resetSpeculation = hasSpeculation
    ? `(local.set $specEpoch
        (call $specNextEpoch
          (call $specTags)
          (i32.mul
            (i32.shl
              (i32.wrap_i64
                (i64.shr_u
                  (i64.add (i64.extend_i32_u (local.get $length)) (i64.const 7))
                  (i64.const 3)))
              (i32.const 2))
            (i32.const ${groupCount}))
          (local.get $specEpoch)))
      (local.set $specFrontier (i64.const 0))
      (local.set $specRewound (i64.const 0))`
    : "";
  const resetHost = hasInjections
    ? "(if (local.get $host) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0))))"
    : "";
  const resetRanges = [...rangeSlots.values()]
    .map((i) => {
      const start = `$rangeStart${i}`;
      const end = `$rangeEnd${i}`;
      return `(local.set ${start} (i32.const 0)) (local.set ${end} (i32.const 0))`;
    })
    .join("\n");
  const resetColumns = tracksColumn
    ? [
        "(local.set $column (i64.const 0))",
        ...columns.map((_, i) => {
          const name = `$columnSlot${i}`;
          return `(local.set ${name} (i64.const -1))`;
        }),
      ].join("\n")
    : "";
  const initialContainer = hasContainers && states[initial]!.prefix ? 1 : 0;
  const resetContainers = hasContainers
    ? `(local.set $containerLine (i32.const 0))
      (local.set $containerNext (i32.const -1))
      (local.set $containerOpen (i32.const ${initialContainer}))`
    : "";
  const resetRecord = recordPatching ? "(local.set $candidate (i32.const -1))" : "";
  const resetTransitions = hasTransitions ? "(local.set $transitions (i32.const 0))" : "";
  const resetCapture = hasCapture ? "(call $captureReset)" : "";
  const resetQueue = hasQueue ? "(call $queueReset)" : "";
  const resetSweep = grammar.queueSweep
    ? "(local.set $lineStart (i32.const 1)) (local.set $joined (i32.const 0))"
    : "";
  const resetRuns = [...runSlots.values()]
    .map((i) => {
      const name = `$runLength${i}`;
      return `(local.set ${name} (i32.const 0))`;
    })
    .join("\n");
  const resetCounters = [...counterSlots.values()]
    .map((i) => {
      const name = `$counter${i}`;
      return `(local.set ${name} (i32.const 0))`;
    })
    .join("\n");
  const documentSetup = `    (global.set $status (i32.const 0)) (global.set $injections (i32.const 0))
    ${resetGroups}
    ${initializeScratch}
    ${refreshOutputLimit}
    (local.set $initial (local.get $out))
    (block $documents (loop $document
      (br_if $documents (i32.eqz (local.get $count)))
        ${resetSpeculation}
        ${resetHost}
        ${resetRanges}
        ${resetColumns}
        (local.set $state (i32.const ${initial})) (local.set $depth (i32.const 0))
        ${resetContainers}
        ${resetRecord}
        ${resetTransitions}
        ${resetCapture}
        ${resetQueue}
        ${resetSweep}
        ${resetRuns}
        ${resetCounters}
`;
  const resetPrefixes = [...prefix.caches.values()]
    .map((name) => {
      const start = `${name}Start`;
      return `(local.set ${name} (local.get $docStart)) (local.set ${start} (local.get $docStart))`;
    })
    .join("\n");
  const resetInjectionOutput = hasInjections
    ? "(local.set $hostCurrent (i32.const -1)) (local.set $pendingAddress (i32.const -1))"
    : "";
  const documentInput = ` (local.set $docStart (i32.load (local.get $documents)))
    (local.set $limit (i32.load offset=4 (local.get $documents)))
    (local.set $pos (local.get $docStart))
    ${resetPrefixes}
    (local.set $pending (i32.const -1))
    ${resetInjectionOutput}
  `;
  const recordWordOffset = `offset=${record.word}`;
  const mappedPatchStyle = `(i32.load16_u
    (i32.add (global.get $base) (i32.shl (local.get $patch) (i32.const 1))))`;
  const patchRecord = recordPatching
    ? hasInjections
      ? `(if
        (i32.and
          (i32.ge_s (local.get $patch) (i32.const 0))
          (i32.ne (local.get $candidate) (i32.const -1)))
        (then
          (if
            (i32.or
              (i32.eq (local.get $candidate) (local.get $out))
              (i32.eq (local.get $candidate) (local.get $pendingAddress)))
            (then (local.set $pending (local.get $patch))))
          (if (i32.ne (local.get $candidate) (local.get $out))
            (then
              (i32.store ${recordWordOffset}
                (local.get $candidate)
                ${mappedPatchStyle})))))`
      : `(if
        (i32.and
          (i32.ge_s (local.get $patch) (i32.const 0))
          (i32.ne (local.get $candidate) (i32.const -1)))
        (then
          (if (i32.eq (local.get $candidate) (local.get $out))
            (then (local.set $pending (local.get $patch)))
            (else
              (i32.store ${recordWordOffset}
                (local.get $candidate)
                ${mappedPatchStyle})))))`
    : "";
  const advanceColumn = tracksColumn
    ? `(local.set $column
      (if (result i64)
        (i32.and
          (i32.eq (local.get $next) (i32.add (local.get $pos) (i32.const 1)))
          (i32.le_u (i32.sub (local.get $byte) (i32.const 32)) (i32.const 95)))
        (then (i64.add (i64.and (local.get $column) (i64.const ${columnValueMask})) (i64.const 1)))
        (else
          (call $advanceColumn
            (local.get $input)
            (local.get $pos)
            (local.get $next)
            (local.get $column)))))`
    : "";
  const advanceQueueLine = grammar.queueSweep
    ? `(local.set $matchByte
        (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 1)))))
      (if (i32.eq (local.get $matchByte) (i32.const 10))
        (then
          (local.set $joined
            (if (result i32)
              (i32.gt_u (local.get $next) (i32.add (local.get $docStart) (i32.const 1)))
              (then
                (i32.eq
                  (i32.load8_u
                    (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 2))))
                  (i32.const 92)))
              (else (i32.const 0))))
          (local.set $lineStart (i32.const 1)))
        (else (local.set $lineStart (local.get $recheck))))`
    : "";
  const rememberRecord = recordPatching
    ? hasInjections
      ? "(if (local.get $mark) (then (local.set $candidate (if (result i32) (local.get $markHost) (then (i32.const -1)) (else (if (result i32) (i32.ne (local.get $pendingAddress) (i32.const -1)) (then (local.get $pendingAddress)) (else (local.get $out))))))))"
      : "(if (local.get $mark) (then (local.set $candidate (local.get $out))))"
    : "";
  const emitWrappedGroup = hasWrap
    ? renderInline(
        emitGroup(
          hasInjections
            ? {
                span: injectedSpan,
                hostCurrent: handles.hostCurrent,
                wrapStyle: handles.wrapStyle,
                wrapStart: handles.wrapStart,
              }
            : {
                span: simpleSpan,
                wrapStyle: handles.wrapStyle,
                wrapStart: handles.wrapStart,
              },
          end,
          fragment`(global.get $base)`,
          { ...records, groups },
        ),
      )
    : "";
  const speculationRewind = spec.rewind;
  const tokenEnd = hasSpeculation
    ? `(if (i32.ge_u (local.get $pos) (local.get $limit))
      (then
        (if (local.get $specOpen)
          (then ${speculationRewind}
            (br $token)))
        (br $tokens)))`
    : `(br_if $tokens (i32.ge_u (local.get $pos) (local.get $limit)))`;
  const containerDispatch = hasContainers
    ? `(if (local.get $containerOpen)
      (then ${container})
      (else
        (local.set $containerLine (i32.const 0))
        (local.set $containerNext (i32.const -1))))`
    : "";
  const queueSweep = grammar.queueSweep
    ? queueSweepCode(
        grammar.queueSweep,
        names,
        styles,
        ownerOffset,
        bodyOffset,
        hasInjections,
        hasContainers,
        {
          indices: frameRunIndices,
          offset: frameRunOffset,
          counterIndices: frameCounterIndices,
          counterOffset: frameCounterOffset,
          frameBytes,
          sharedStates,
          framesOffset,
        },
      )
    : "";
  const resetWrap = hasWrap ? "(local.set $wrapStyle (i32.const -1))" : "";
  const resetPatch = recordPatching
    ? "(local.set $patch (i32.const -1)) (local.set $mark (i32.const 0))"
    : "";
  const resetRecheck = grammar.queueSweep ? "(local.set $recheck (i32.const 0))" : "";
  const markHost =
    recordPatching && hasInjections
      ? "(local.set $markHost (i32.and (local.get $host) (i32.eqz (local.get $parentPaint))))"
      : "";
  const advanceContainerLine = hasContainers
    ? `(local.set $containerLine
        (i32.eq
          (i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $next) (i32.const 1))))
          (i32.const 10)))
      (if (local.get $containerLine) (then (local.set $containerNext (i32.const -1))))`
    : "";
  const tokenLoop = ` (block $tokens (loop $token ${tokenEnd}
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    ${resetWrap}
    ${resetPatch}
    ${resetRecheck}
    (block $paint ${containerDispatch} ${queueSweep} ${body})
    ${resetTransitions}
    ${patchRecord}
    ${markHost}
    ${outputPaint}
    ${advanceContainerLine}
    ${advanceColumn}
    ${advanceQueueLine}
    ${rememberRecord}
    ${emitWrappedGroup}
    (local.set $pos (local.get $next))
    (br $token)))
  `;
  let flushDocument: string;
  if (hasInjections) {
    const flush = renderInline(flushSpan(injectedSpan, records.emit));
    flushDocument = `${flush}
      (if (local.get $host) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0))))`;
  } else if (hasWrap) {
    flushDocument = renderInline(flushSpan(simpleSpan, records.emit));
  } else {
    flushDocument = renderInline(emitPending(simpleSpan, records.emit));
  }
  // Lazy record writes reserve scratch only near the limit, so each document settles its peak.
  const reserveDocumentOutput = scratch
    ? "(call $specReserveOutput (i64.extend_i32_u (local.get $out)))"
    : "";
  const documentFinish = `      ${flushDocument}
      ${reserveDocumentOutput}
      (local.set $documents (i32.add (local.get $documents) (i32.const 8)))
      (local.set $count (i32.sub (local.get $count) (i32.const 1)))
      (br $document)))
`;
  const highlightResult = `    (global.set $records (i32.shr_u (i32.sub (local.get $out) (local.get $initial)) (i32.const 3)))
    (i32.const 0)))`;
  return `${highlightLocals}${documentSetup}${documentInput}${tokenLoop}${documentFinish}${highlightResult}`;
}
