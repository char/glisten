import {
  func,
  global,
  label,
  local,
  raw,
  wat,
  type Def,
  type Local,
  type Part,
} from "#/testing/wat/mod.ts";
import { blankLine, fenceRun, indentedCode, thematicBreak } from "./constructs.ts";
import { columns, containerContinue, containerOpen } from "./containers.ts";
import { atxHeading, setextUnderline } from "./heading.ts";
import { paragraphScratch } from "./scratch.ts";
import { logicalRanges } from "./logical.ts";
import { inlineAtoms } from "./inline_atoms.ts";
import { attention } from "./attention.ts";
import { bracketStack } from "./brackets.ts";
import { inlineResource } from "./resource.ts";
import {
  backtickRun,
  bracket,
  delimiterStackEntry,
  ends,
  event,
  link,
  match,
  queued,
  run,
} from "./layout.ts";
import { kind, styled, styleId } from "./styles.ts";
import { referenceDefinition } from "./reference.ts";
import { htmlEnd, htmlStart } from "./html.ts";
import { taskCheck } from "./task.ts";
import { tableCellEnd, tableDelimiter, tableHeader } from "./table.ts";
import {
  coalesce,
  emitSegment,
  fail,
  flushSpan,
  openInjection,
  recordWriters,
  sealHost,
  status,
  stopScan,
} from "#/compiler/runtime.ts";

export function blocks(workPerByte = 16384) {
  const input = local("input"),
    length = local("length"),
    documents = local("documents");
  const count = local("count"),
    out = local("out"),
    initial = local("initial");
  const pos = local("pos"),
    limit = local("limit"),
    lineEnd = local("lineEnd");
  const next = local("next"),
    cursor = local("cursor"),
    style = local("style");
  const pendingStyle = local("pendingStyle"),
    pendingEnd = local("pendingEnd");
  const start = local("start"),
    mode = local("mode");
  const fuel = global("markdownFuel", () => wat`(mut i64) (i64.const 0)`);
  const charge = func(
    "markdownCharge",
    () => wat`
    (param $amount i64)
    (if (i64.gt_u (local.get $amount) (global.get ${fuel})) (then (call ${fail})))
    (global.set ${fuel} (i64.sub (global.get ${fuel}) (local.get $amount)))`,
  );
  const pendingAddress = local("pendingAddress"),
    host = local("host"),
    hostId = local("hostId");
  const hostDepth = local("hostDepth"),
    hostLast = local("hostLast"),
    hostCurrent = local("hostCurrent");
  const depth = local("depth"),
    openAction = local("openAction"),
    openStart = local("openStart"),
    openEnd = local("openEnd");
  const paragraph = local("paragraph"),
    openedList = local("openedList"),
    taskCandidate = local("taskCandidate"),
    taskStart = local("taskStart"),
    taskEnd = local("taskEnd"),
    taskByte = local("taskByte"),
    table = local("table"),
    tableAt = local("tableAt"),
    tableCell = local("tableCell"),
    tableEnd = local("tableEnd"),
    tableBase = local("tableBase"),
    tableDivider = local("tableDivider"),
    tableHead = local("tableHead"),
    rowStart = local("rowStart"),
    rowEnd = local("rowEnd"),
    rowNext = local("rowNext"),
    rowLazy = local("rowLazy"),
    collecting = local("collecting"),
    queueMark = local("queueMark"),
    queueLimit = local("queueLimit"),
    queueIndex = local("queueIndex"),
    queueEnd = local("queueEnd"),
    queueStyle = local("queueStyle"),
    paragraphStart = local("paragraphStart"),
    queuePos = local("queuePos"),
    queueTarget = local("queueTarget"),
    replayStyle = local("replayStyle"),
    definitionCursor = local("definitionCursor"),
    definitionNext = local("definitionNext"),
    inlineCursor = local("inlineCursor"),
    inlineStyle = local("inlineStyle"),
    inlineWorkspace = local("inlineWorkspace"),
    inlineTickBytes = local("inlineTickBytes"),
    inlineEventCapacity = local("inlineEventCapacity"),
    inlineWorkspaceBytes = local("inlineWorkspaceBytes"),
    attentionEvent = local("attentionEvent"),
    attentionNode = local("attentionNode"),
    attentionPair = local("attentionPair"),
    attentionStart = local("attentionStart"),
    attentionEnd = local("attentionEnd"),
    attentionStyle = local("attentionStyle"),
    attentionTarget = local("attentionTarget"),
    onlyDefinitions = local("onlyDefinitions"),
    fence = local("fence"),
    fenceStart = local("fenceStart");
  const fenceEnd = local("fenceEnd"),
    fenceByte = local("fenceByte"),
    fenceLength = local("fenceLength");
  const fenceIndent = local("fenceIndent"),
    infoEnd = local("infoEnd"),
    runValue = local("runValue");
  const containerColumn = local("containerColumn"),
    containerIndex = local("containerIndex");
  const virtualIndent = local("virtualIndent"),
    previousColumn = local("previousColumn"),
    previousVirtual = local("previousVirtual");
  const sharedTab = local("sharedTab"),
    bodyPos = local("bodyPos");
  const frame = local("frame"),
    prefix = local("prefix"),
    prefixEnd = local("prefixEnd"),
    lazy = local("lazy");
  const stackDone = label("stackDone"),
    stackLoop = label("stackLoop");
  const openDone = label("openDone"),
    openLoop = label("openLoop");
  const stripDone = label("stripDone"),
    strip = label("strip");
  const allDone = label("allDone"),
    document = label("document");
  const documentDone = label("documentDone"),
    line = label("line");
  const records = global("records", () => wat`(export "records") (mut i32) (i32.const 0)`);
  const injections = global("injections", () => wat`(export "injections") (mut i32) (i32.const 0)`);
  const scan = stopScan("lineEnd", [10, 13], false);
  const scratch = paragraphScratch(charge);
  const logical = logicalRanges(scratch.address, charge);
  const task = taskCheck(logical);
  const cellEnd = tableCellEnd(charge),
    headerCells = tableHeader(charge),
    delimiterCells = tableDelimiter(charge);
  const definition = referenceDefinition(logical);
  const inline = inlineAtoms(logical, scratch, charge);
  const resource = inlineResource(logical, definition.destination, definition.title);
  const links = bracketStack(logical, definition.label, resource);
  const emphasis = attention(logical, scratch, inline, links, resource, charge);
  const inScratch = (offset: Part) => wat`(i32.add (global.get ${scratch.address}) ${offset})`;
  const queueAt = inScratch(wat`(local.get ${queueIndex})`);
  const eventAt = inScratch(wat`(local.get ${attentionEvent})`);
  const runAt = inScratch(
    run.at(wat`(global.get ${emphasis.nodes})`, wat`(local.get ${attentionNode})`),
  );
  const endsAt = inScratch(
    ends.at(wat`(global.get ${emphasis.heads})`, wat`(local.get ${attentionNode})`),
  );
  const linkAt = inScratch(
    link.at(wat`(global.get ${inline.links})`, wat`(local.get ${attentionNode})`),
  );
  const matchAt = inScratch(
    match.at(wat`(global.get ${emphasis.pairs})`, wat`(local.get ${attentionPair})`),
  );
  const writers = recordWriters({
    base: wat`(global.get $base)`,
    fail,
    reserveOutput: (end) => wat`
    (call ${charge} (i64.const 8))
    (if (global.get ${scratch.capacity}) (then (call ${scratch.resize} (global.get ${scratch.capacity}) ${end})))`,
  });
  const span = { out, pendingStyle, pendingEnd, pendingAddress };
  const injection = {
    span,
    host,
    hostId,
    hostDepth,
    hostLast,
    hostCurrent,
    depth,
    openAction,
    openStart,
    openEnd,
  };
  function priced(def: Def, extra: number, result: "i32" | "i64", perByte = 1, setup = 1) {
    const parameters = raw(
      Array.from({ length: extra }, (_, i) => `(param $arg${i} i32)`).join(" "),
    );
    const arguments_ = raw(
      Array.from({ length: extra }, (_, i) => `(local.get $arg${i})`).join(" "),
    );
    return func(
      `charged_${def.name}`,
      () => wat`
      (param $input i32) (param $pos i32) (param $end i32) ${parameters} (result ${raw(result)})
      (call ${charge} (i64.add (i64.const ${setup}) (i64.mul (i64.const ${perByte})
        (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))))
      (call ${def} (local.get $input) (local.get $pos) (local.get $end) ${arguments_})`,
    );
  }
  const marker = priced(frontDelimiter(), 0, "i32"),
    heading = priced(atxHeading(), 1, "i32"),
    setext = priced(setextUnderline(), 1, "i32"),
    startHtml = priced(htmlStart(), 2, "i32", 8, 2048),
    endHtml = priced(htmlEnd(), 1, "i32", 32, 16);
  const advanceColumns = priced(columns(), 1, "i32"),
    continueContainer = priced(containerContinue(), 3, "i64", 4),
    openContainer = priced(containerOpen(), 2, "i64", 8);
  const runFence = priced(fenceRun(), 0, "i64"),
    blank = priced(blankLine(), 0, "i32"),
    thematic = priced(thematicBreak(), 2, "i32"),
    indentCode = priced(indentedCode(), 1, "i32");
  const infoScan = priced(stopScan("infoEnd", [9, 13, 32], false), 0, "i32");
  const backtick = priced(stopScan("backtick", [96], false), 0, "i32");
  const delimiter = wat`(call ${marker} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))`;
  const underline = wat`(call ${setext} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent}))`;
  /** Emit plain whitespace from `from` up to the first other byte, leaving `cursor` there. */
  function plainIndent(from: Local, end: Local) {
    return wat`
        (local.set ${cursor} (local.get ${from}))
        (block $indentDone (loop $indent
          (br_if $indentDone (i32.ge_u (local.get ${cursor}) (local.get ${end})))
          (br_if $indentDone (i32.and (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))) (i32.const 32))
            (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))) (i32.const 9))))
          (local.set ${cursor} (i32.add (local.get ${cursor}) (i32.const 1)))
          (br $indent)))
        (if (i32.gt_u (local.get ${cursor}) (local.get ${from})) (then
          (local.set ${style} ${styled("plain")})
          ${coalesce(span, cursor, style, writers.emit)}))`;
  }
  function append(end: Local, spanStyle: Local) {
    return wat`(if (local.get ${collecting})
      (then (call ${scratch.append} (local.get ${out}) (local.get ${end}) (local.get ${spanStyle})))
      (else ${coalesce(span, end, spanStyle, writers.emit)}))`;
  }
  const preserve = local("preserveLeading");
  const replay = func(
    "replayParagraph",
    () => wat`
    (param ${queuePos} i32) (param ${queueIndex} i32) (param ${queueTarget} i32)
    (param ${replayStyle} i32) (param ${preserve} i32)
    (param ${out} i32) (param ${pendingStyle} i32) (param ${pendingEnd} i32) (param ${pendingAddress} i32)
    (result i32 i32 i32 i32 i32 i32)
    (local ${queueEnd} i32) (local ${queueStyle} i32)
    (block $replayDone (loop $replay
      (call ${charge} (i64.const 1))
      (br_if $replayDone (i32.ge_u (local.get ${queuePos}) (local.get ${queueTarget})))
      (local.set ${queueEnd} ${queued.get(queueAt, "end")})
      (local.set ${queueStyle} ${queued.get(queueAt, "style")})
      (if (i32.ne (local.get ${queueStyle}) ${styled("punctuation.special")}) (then
        (if (i32.and (local.get ${preserve}) (i32.eq (local.get ${queueStyle}) (i32.const ${kind.leading})))
          (then (local.set ${queueStyle} ${styled("plain")})) (else (local.set ${queueStyle} (local.get ${replayStyle}))))))
      (local.set ${queuePos} (if (result i32) (i32.lt_u (local.get ${queueEnd}) (local.get ${queueTarget}))
        (then (local.get ${queueEnd})) (else (local.get ${queueTarget}))))
      ${coalesce(span, queuePos, queueStyle, writers.emit)}
      (if (i32.eq (local.get ${queuePos}) (local.get ${queueEnd})) (then
        (local.set ${queueIndex} (i32.add (local.get ${queueIndex}) (i32.const ${queued.size})))))
      (br $replay)))
    (local.get ${queuePos}) (local.get ${queueIndex}) (local.get ${out})
    (local.get ${pendingStyle}) (local.get ${pendingEnd}) (local.get ${pendingAddress})`,
  );
  function replayTo(
    target: ReturnType<typeof wat>,
    paint: number | Local,
    preserveLeading = false,
  ) {
    const value = typeof paint === "number" ? wat`(i32.const ${paint})` : wat`(local.get ${paint})`;
    return wat`
      (call ${replay} (local.get ${queuePos}) (local.get ${queueIndex}) (i32.wrap_i64 ${target})
        ${value} (i32.const ${preserveLeading ? 1 : 0}) (local.get ${out}) (local.get ${pendingStyle}) (local.get ${pendingEnd}) (local.get ${pendingAddress}))
      (local.set ${pendingAddress}) (local.set ${pendingEnd}) (local.set ${pendingStyle})
      (local.set ${out}) (local.set ${queueIndex}) (local.set ${queuePos})`;
  }
  function replayDefinitions() {
    return wat`
      (local.set ${queuePos} (local.get ${paragraphStart}))
      (local.set ${definitionCursor} (call ${logical.normalize} (i64.extend_i32_u (local.get ${paragraphStart})) (local.get ${queueMark})))
      (block $definitionsDone (loop $definitions
        (br_if $definitionsDone (i32.ge_u (i32.wrap_i64 (i64.shr_u (local.get ${definitionCursor}) (i64.const 32))) (local.get ${queueMark})))
        (local.set ${definitionNext} (call ${definition.parse} (local.get ${input}) (local.get ${definitionCursor}) (local.get ${queueMark})))
        (br_if $definitionsDone (i64.eq (local.get ${definitionNext}) (i64.const -1)))
        ${replayTo(wat`(global.get ${definition.labelStart})`, styleId("plain"))}
        ${replayTo(wat`(global.get ${definition.destinationStart})`, styleId("text.reference"))}
        ${replayTo(wat`(global.get ${definition.destinationEnd})`, styleId("text.uri"))}
        (if (i64.ne (global.get ${definition.titleStart}) (i64.const -1)) (then
          ${replayTo(wat`(global.get ${definition.titleStart})`, styleId("text.reference"))}
          ${replayTo(wat`(global.get ${definition.titleEnd})`, styleId("string"))}))
        ${replayTo(wat`(local.get ${definitionNext})`, styleId("plain"))}
        (local.set ${definitionCursor} (local.get ${definitionNext}))
        (br $definitions)))`;
  }
  function resolve(title: boolean) {
    return wat`
      (if (local.get ${collecting}) (then
        (local.set ${queueIndex} (i32.const 0))
        (local.set ${queueLimit} (global.get ${scratch.used}))
        (global.set ${inline.ready} (i32.const 0))
        ${replayDefinitions()}
        (if (i32.and (i32.const ${title ? 0 : 1}) (local.get ${taskCandidate})) (then
          (local.set ${taskStart} (local.get ${definitionCursor}))
          (if (i64.ne (local.get ${definitionCursor}) (call ${logical.normalize} (i64.extend_i32_u (local.get ${paragraphStart})) (local.get ${queueMark}))) (then
            (block $taskIndentDone (loop $taskIndent
              (local.set ${taskByte} (call ${logical.peek} (local.get ${input}) (local.get ${taskStart}) (local.get ${queueMark})))
              (br_if $taskIndentDone (i32.and (i32.ne (local.get ${taskByte}) (i32.const 32)) (i32.ne (local.get ${taskByte}) (i32.const 9))))
              (local.set ${taskStart} (call ${logical.advance} (local.get ${taskStart}) (local.get ${queueMark})))
              (br $taskIndent)))))
          (local.set ${taskEnd} (call ${task} (local.get ${input}) (local.get ${taskStart}) (local.get ${queueMark})))
          (if (i64.ne (local.get ${taskEnd}) (i64.const -1)) (then
            ${replayTo(wat`(local.get ${taskStart})`, styleId("plain"), true)}
            ${replayTo(wat`(local.get ${taskEnd})`, styleId("punctuation.special"))}
            (local.set ${definitionCursor} (local.get ${taskEnd}))))))
        (local.set ${taskCandidate} (i32.const 0))
        ${inlineReplay(wat`(i32.const ${title ? styleId("text.title") : styleId("plain")})`)}
        ${drain(title)}
        (global.set ${scratch.used} (i32.const 0))
        (local.set ${collecting} (i32.const 0))))`;
  }
  /** Resolve inline content from `definitionCursor` to `queueMark`, replaying it over `base`. */
  function inlineReplay(base: Part) {
    return wat`
        (local.set ${inlineCursor} (call ${inline.next} (local.get ${input}) (local.get ${definitionCursor}) (local.get ${queueMark})))
        (if (i32.ne (call ${logical.peek} (local.get ${input}) (local.get ${inlineCursor}) (local.get ${queueMark})) (i32.const -1)) (then
          (call ${inline.countSpecial} (local.get ${input}) (local.get ${inlineCursor}) (local.get ${queueMark}))
          ;; The backtick table has one slot per possible run length and one record per run.
          (local.set ${inlineTickBytes} (i64.add
            (i64.mul (i64.add (i64.extend_i32_u (global.get ${inline.tickMax})) (i64.const 1)) (i64.const 4))
            (i64.mul (i64.extend_i32_u (global.get ${inline.tickRuns})) (i64.const ${backtickRun.size}))))
          ;; Each atom consumes a special byte and has at most one preceding text gap, plus one trailing gap.
          (local.set ${inlineEventCapacity} (i64.add (i64.const 1)
            (i64.add (i64.mul (i64.extend_i32_u (global.get ${inline.specialCount})) (i64.const 2))
              (i64.mul (i64.extend_i32_u (global.get ${inline.closeCount})) (i64.const 8)))))
          ;; Runs, ends, active stack entries, and work runs are each bounded by delimiter bytes.
          ;; A match consumes at least two delimiter bytes.
          ;; Every bracket entry consumes an opening bracket; one extra entry is the null sentinel.
          ;; Every link consumes a closing bracket.
          (local.set ${inlineWorkspaceBytes} (i64.add (i64.add (local.get ${inlineTickBytes}) (i64.const ${56 + bracket.size}))
            (i64.add (i64.mul (local.get ${inlineEventCapacity}) (i64.const ${event.size}))
              (i64.add (i64.mul (i64.extend_i32_u (global.get ${inline.delimiterCount}))
                (i64.const ${run.size * 2 + ends.size + delimiterStackEntry.size}))
                (i64.add (i64.mul (i64.shr_u (i64.extend_i32_u (global.get ${inline.delimiterCount})) (i64.const 1)) (i64.const ${match.size}))
                  (i64.add (i64.mul (i64.extend_i32_u (global.get ${inline.openCount})) (i64.const ${bracket.size}))
                    (i64.mul (i64.extend_i32_u (global.get ${inline.closeCount})) (i64.const ${link.size}))))))))
          (call ${charge} (local.get ${inlineWorkspaceBytes}))
          (local.set ${inlineWorkspace} (call ${scratch.reserveExact} (local.get ${inlineWorkspaceBytes}) (local.get ${out})))
          (global.set ${inline.backticks} (local.get ${inlineWorkspace}))
          (global.set ${inline.backtickCapacity} (i32.wrap_i64 (local.get ${inlineTickBytes})))
          (global.set ${inline.events} (i32.add (local.get ${inlineWorkspace}) (global.get ${inline.backtickCapacity})))
          (global.set ${inline.runs} (i32.add (global.get ${inline.events}) (i32.mul (i32.wrap_i64 (local.get ${inlineEventCapacity})) (i32.const ${event.size}))))
          (global.set ${inline.heads} (i32.add (global.get ${inline.runs}) (i32.mul (global.get ${inline.delimiterCount}) (i32.const ${run.size}))))
          (global.set ${inline.matches} (i32.add (global.get ${inline.heads}) (i32.mul (global.get ${inline.delimiterCount}) (i32.const ${ends.size}))))
          (global.set ${inline.brackets} (i32.add (global.get ${inline.matches}) (i32.mul (i32.shr_u (global.get ${inline.delimiterCount}) (i32.const 1)) (i32.const ${match.size}))))
          (global.set ${inline.stack} (i32.add (global.get ${inline.brackets}) (i32.mul (i32.add (global.get ${inline.openCount}) (i32.const 1)) (i32.const ${bracket.size}))))
          (global.set ${inline.work} (i32.add (global.get ${inline.stack}) (i32.mul (global.get ${inline.delimiterCount}) (i32.const ${delimiterStackEntry.size}))))
          (global.set ${inline.bottoms} (i32.add (global.get ${inline.work}) (i32.mul (global.get ${inline.delimiterCount}) (i32.const ${run.size}))))
          (global.set ${inline.links} (i32.add (global.get ${inline.bottoms}) (i32.const 56)))))
        (if (i32.ne (call ${logical.peek} (local.get ${input}) (local.get ${inlineCursor}) (local.get ${queueMark})) (i32.const -1)) (then
            (call ${emphasis.build} (local.get ${input}) (local.get ${definitionCursor}) (local.get ${queueMark}) (local.get ${out}))
            (local.set ${attentionEvent} (global.get ${emphasis.first}))
            (local.set ${attentionStyle} ${base})
            (block $attentionDone (loop $attention
              (br_if $attentionDone (i32.eqz (local.get ${attentionEvent})))
              (local.set ${attentionStart} (i32.wrap_i64 ${event.get(eventAt, "start")}))
              (local.set ${attentionEnd} (i32.wrap_i64 ${event.get(eventAt, "end")}))
              ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionStart}))`, attentionStyle, true)}
              (if (i32.eq ${event.get(eventAt, "style")} (i32.const ${kind.delimiterRun}))
                (then
                  (local.set ${attentionNode} ${event.get(eventAt, "run")})
                  (local.set ${attentionPair} ${ends.get(endsAt, "closes")})
                  (block $closed (loop $close
                    (br_if $closed (i32.eq (local.get ${attentionPair}) (i32.const -1)))
                    (local.set ${attentionTarget} (i32.add (local.get ${attentionStart})
                      (i32.add ${match.get(matchAt, "closerOffset")}
                        ${match.get(matchAt, "count")})))
                    ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionTarget}))`, attentionStyle, true)}
                    (local.set ${attentionStyle} ${match.get(matchAt, "style")})
                    (local.set ${attentionPair} ${match.get(matchAt, "nextClosing")})
                    (br $close)))
                  (local.set ${attentionPair} ${ends.get(endsAt, "opens")})
                  (block $opened (loop $open
                    (br_if $opened (i32.eq (local.get ${attentionPair}) (i32.const -1)))
                    (local.set ${attentionTarget} (i32.add (local.get ${attentionStart}) ${match.get(matchAt, "openerOffset")}))
                    ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionTarget}))`, attentionStyle, true)}
                    ${match.set(matchAt, "style", wat`(local.get ${attentionStyle})`)}
                    (local.set ${attentionStyle} (if (result i32) (i32.eq ${run.get(runAt, "marker")} (i32.const 126))
                      (then ${styled("text.strikethrough")}) (else (if (result i32) (i32.eq ${match.get(matchAt, "count")} (i32.const 2))
                        (then ${styled("text.strong")}) (else ${styled("text.emphasis")})))))
                    (local.set ${attentionTarget} (i32.add (local.get ${attentionTarget}) ${match.get(matchAt, "count")}))
                    ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionTarget}))`, attentionStyle, true)}
                    (local.set ${attentionPair} ${match.get(matchAt, "nextOpening")})
                    (br $open)))
                  ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionEnd}))`, attentionStyle, true)})
                (else (if (i32.eq ${event.get(eventAt, "style")} (i32.const ${kind.linkOpen}))
                (then
                  (local.set ${attentionNode} ${event.get(eventAt, "run")})
                  ${link.set(linkAt, "saved", wat`(local.get ${attentionStyle})`)}
                  (local.set ${attentionStyle} ${styled("text.reference")})
                  ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionEnd}))`, attentionStyle, true)})
                (else (if (i32.eq ${event.get(eventAt, "style")} (i32.const ${kind.linkTail}))
                (then
                  (local.set ${attentionNode} ${event.get(eventAt, "run")})
                  (if (i32.eq ${link.get(linkAt, "uri")} (i32.const -1))
                    (then ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionEnd}))`, styleId("text.reference"), true)})
                    (else
                      ${replayTo(wat`(i64.extend_i32_u ${link.get(linkAt, "uri")})`, styleId("text.reference"), true)}
                      (if (i32.ne ${link.get(linkAt, "titleStart")} (i32.const -1)) (then
                        ${replayTo(wat`(i64.extend_i32_u ${link.get(linkAt, "titleStart")})`, styleId("text.uri"), true)}
                        ${replayTo(wat`(i64.extend_i32_u ${link.get(linkAt, "titleEnd")})`, styleId("string"), true)}))
                      ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionEnd}))`, styleId("text.uri"), true)}))
                  (local.set ${attentionStyle} ${link.get(linkAt, "saved")}))
                (else
                  (local.set ${inlineStyle} (if (result i32) (i32.or
                    (i32.eq ${event.get(eventAt, "style")} (i32.const ${kind.inlineText}))
                    (i32.eq ${event.get(eventAt, "style")} (i32.const ${kind.inlineBracket})))
                    (then (local.get ${attentionStyle})) (else ${event.get(eventAt, "style")})))
                  ${replayTo(wat`(i64.extend_i32_u (local.get ${attentionEnd}))`, inlineStyle, true)}))))))
              (local.set ${attentionEvent} ${event.get(eventAt, "next")})
              (br $attention)))
            ))`;
  }
  /** Emit the queue's remaining entries with their own styles. */
  function drain(title: boolean) {
    return wat`
        (block $queueDone (loop $queue
          (call ${charge} (i64.const 1))
          (br_if $queueDone (i32.ge_u (local.get ${queueIndex}) (local.get ${queueLimit})))
          (local.set ${queueEnd} ${queued.get(queueAt, "end")})
          (local.set ${queueStyle} ${queued.get(queueAt, "style")})
          (if (i32.eq (local.get ${queueStyle}) (i32.const ${kind.indent}))
            (then (local.set ${queueStyle} ${title ? styled("text.title") : styled("plain")})))
          ${
            title
              ? wat`(if (i32.and (i32.lt_u (local.get ${queueIndex}) (local.get ${queueMark})) (i32.eqz (local.get ${queueStyle})))
            (then (local.set ${queueStyle} ${styled("text.title")})))`
              : wat``
          }
          (if (i32.eq (local.get ${queueStyle}) (i32.const ${kind.leading})) (then (local.set ${queueStyle} ${styled("plain")})))
          ${coalesce(span, queueEnd, queueStyle, writers.emit)}
          (local.set ${queueIndex} (i32.add (local.get ${queueIndex}) (i32.const ${queued.size})))
          (br $queue)))`;
  }
  /** A table cell is its own inline content: queue it alone, and resolve it over `base`. */
  function resolveCell(cellStart: Local, cellEnd: Local, base: Local) {
    return wat`
        (local.set ${collecting} (i32.const 1))
        (local.set ${queuePos} (local.get ${cellStart}))
        (call ${scratch.append} (local.get ${out}) (local.get ${cellEnd}) (local.get ${base}))
        (local.set ${queueMark} (global.get ${scratch.used}))
        (local.set ${queueIndex} (i32.const 0))
        (local.set ${queueLimit} (global.get ${scratch.used}))
        (global.set ${inline.ready} (i32.const 0))
        (local.set ${definitionCursor} (call ${logical.normalize} (i64.extend_i32_u (local.get ${queuePos})) (local.get ${queueMark})))
        ${inlineReplay(wat`(local.get ${base})`)}
        ${drain(false)}
        (global.set ${scratch.used} (i32.const 0))
        (local.set ${collecting} (i32.const 0))`;
  }
  /** Set `runValue` if the line opens a fence. */
  function fenceAhead() {
    return wat`
              (local.set ${runValue} (i32.const 0))
              (local.set ${fence} (call ${runFence} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})))
              (if (i64.ne (local.get ${fence}) (i64.const -1)) (then
                (local.set ${fenceStart} (i32.wrap_i64 (i64.shr_u (local.get ${fence}) (i64.const 32))))
                (local.set ${fenceEnd} (i32.wrap_i64 (local.get ${fence})))
                (if (i32.and (i32.le_u (i32.add (local.get ${virtualIndent}) (i32.sub (local.get ${fenceStart}) (local.get ${pos}))) (i32.const 3))
                  (i32.or (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${fenceStart}))) (i32.const 96))
                    (i32.eq (call ${backtick} (local.get ${input}) (local.get ${fenceEnd}) (local.get ${lineEnd})) (local.get ${lineEnd}))))
                  (then (local.set ${runValue} (i32.const 1))))))`;
  }

  function containers() {
    return wat`
        (local.set ${containerColumn} (i32.const 0))
        (local.set ${virtualIndent} (i32.const 0))
        (local.set ${sharedTab} (i32.const 0))
        (local.set ${containerIndex} (i32.const 0))
        (local.set ${lazy} (i32.const 0))
        (block ${stackDone} (loop ${stackLoop}
          (br_if ${stackDone} (i32.ge_u (local.get ${containerIndex}) (local.get ${depth})))
          (call ${charge} (i64.const 16))
          (local.set ${frame} (i32.load (i32.add (global.get $base)
            (i32.add (i32.const 32) (i32.shl (local.get ${containerIndex}) (i32.const 2))))))
          (local.set ${prefix} (call ${continueContainer} (local.get ${input}) (local.get ${pos})
            (local.get ${lineEnd}) (local.get ${containerColumn}) (local.get ${frame}) (local.get ${virtualIndent})))
          (if (i64.eq (local.get ${prefix}) (i64.const -1)) (then
            (if (i32.and (i32.ne (local.get ${frame}) (i32.const 1))
              (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))) (then
              (local.set ${containerIndex} (i32.add (local.get ${containerIndex}) (i32.const 1)))
              (br ${stackLoop})))
            (if (i32.and (i32.eqz (local.get ${mode})) (local.get ${paragraph})) (then
              ${fenceAhead()}
              (if (i32.and (i32.eqz (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})))
                (i32.and (i64.eq (call ${openContainer} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})
                  (local.get ${containerColumn}) (i32.eq (local.get ${frame}) (i32.const 1))) (i64.const -1))
                  (i32.and (i32.eqz (call ${thematic} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (i32.const 0) (local.get ${virtualIndent})))
                    (i32.and (i32.eqz (local.get ${runValue}))
                      (i32.and (i32.eqz (call ${heading} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent})))
                        (i32.and (i32.eqz (call ${startHtml} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (i32.const 1) (local.get ${virtualIndent})))
                          (i32.eqz ${underline}))))))) (then
                (local.set ${lazy} (i32.const 1))
                (br ${stackDone})))))
            ${resolve(false)}
            (local.set ${depth} (local.get ${containerIndex}))
            (if (i32.eq (local.get ${mode}) (i32.const 2)) (then
              (call ${sealHost} (local.get ${hostLast}))
              (local.set ${host} (i32.const 0))
              (local.set ${hostCurrent} (i32.const -1))))
            (local.set ${mode} (i32.const 0))
            (local.set ${paragraph} (i32.const 0))
            (local.set ${table} (i32.const 0))
            (br ${stackDone})))
          (local.set ${prefixEnd} (i32.wrap_i64 (local.get ${prefix})))
          (local.set ${previousColumn} (local.get ${containerColumn}))
          (local.set ${previousVirtual} (local.get ${virtualIndent}))
          (local.set ${containerColumn} (i32.wrap_i64 (i64.shr_u (local.get ${prefix}) (i64.const 32))))
          (local.set ${virtualIndent} (i32.const 0))
          (if (i32.eq (local.get ${frame}) (i32.const 1)) (then
            (if (i32.and (i32.gt_u (local.get ${prefixEnd}) (local.get ${pos}))
              (i32.eq (i32.load8_u (i32.add (local.get ${input}) (i32.sub (local.get ${prefixEnd}) (i32.const 1)))) (i32.const 9))) (then
              (local.set ${virtualIndent} (i32.sub (i32.sub (local.get ${containerColumn})
                (call ${advanceColumns} (local.get ${input}) (local.get ${pos}) (i32.sub (local.get ${prefixEnd}) (i32.const 1))
                  (local.get ${previousColumn}))) (i32.const 1))))))
            (else (if (i32.gt_u (i32.add (local.get ${previousVirtual}) (i32.sub (local.get ${containerColumn}) (local.get ${previousColumn})))
              (i32.shr_u (local.get ${frame}) (i32.const 1))) (then
              (local.set ${virtualIndent} (i32.sub (i32.add (local.get ${previousVirtual})
                (i32.sub (local.get ${containerColumn}) (local.get ${previousColumn})))
                (i32.shr_u (local.get ${frame}) (i32.const 1))))))))
          (if (i32.and (i32.eq (local.get ${mode}) (i32.const 2))
            (i32.and (i32.eq (i32.add (local.get ${containerIndex}) (i32.const 1)) (local.get ${depth}))
              (i32.and (i32.ne (local.get ${virtualIndent}) (i32.const 0)) (i32.and (i32.gt_u (local.get ${prefixEnd}) (local.get ${pos}))
                (i32.eq (i32.load8_u (i32.add (local.get ${input}) (i32.sub (local.get ${prefixEnd}) (i32.const 1)))) (i32.const 9)))))) (then
            (local.set ${prefixEnd} (i32.sub (local.get ${prefixEnd}) (i32.const 1)))
            (local.set ${sharedTab} (i32.const 1))))
          ;; Only a block quote's ">" (and its space) is styled; indentation takes the style around it.
          (if (i32.gt_u (local.get ${prefixEnd}) (local.get ${pos})) (then
            (local.set ${hostCurrent} (i32.const -1))
            (local.set ${cursor} (local.get ${prefixEnd}))
            (if (i32.eq (local.get ${frame}) (i32.const 1)) (then
              (local.set ${cursor} (local.get ${pos}))
              (block $quoteDone (loop $quote
                (br_if $quoteDone (i32.ge_u (local.get ${cursor}) (local.get ${prefixEnd})))
                (br_if $quoteDone (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))) (i32.const 62)))
                (local.set ${cursor} (i32.add (local.get ${cursor}) (i32.const 1)))
                (br $quote)))))
            (if (i32.gt_u (local.get ${cursor}) (local.get ${pos})) (then
              (if (local.get ${collecting})
                (then (call ${scratch.append} (local.get ${out}) (local.get ${cursor}) (i32.const ${kind.indent})))
                (else
                  (local.set ${style} ${styled("plain")})
                  ${coalesce(span, cursor, style, writers.emit)}))))
            (if (i32.gt_u (local.get ${prefixEnd}) (local.get ${cursor})) (then
              (local.set ${style} ${styled("punctuation.special")})
              ${append(prefixEnd, style)}))))
          (local.set ${pos} (local.get ${prefixEnd}))
          (local.set ${containerIndex} (i32.add (local.get ${containerIndex}) (i32.const 1)))
          (br ${stackLoop})))
        ${openContainers()}
    `;
  }

  function openContainers() {
    return wat`
        (if (i32.and (i32.and (i32.eqz (local.get ${lazy})) (i32.eqz (local.get ${mode})))
          (i32.eqz (i32.and (local.get ${paragraph}) ${underline}))) (then
          (block ${openDone} (loop ${openLoop}
            (br_if ${openDone} (call ${indentCode} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent})))
            (br_if ${openDone} (call ${thematic} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${paragraph}) (local.get ${virtualIndent})))
            (local.set ${prefix} (call ${openContainer} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})
              (local.get ${containerColumn}) (local.get ${paragraph})))
            (br_if ${openDone} (i64.eq (local.get ${prefix}) (i64.const -1)))
            ${resolve(false)}
            (call ${charge} (i64.const 16))
            (if (i32.ge_u (local.get ${depth}) (i32.const 128)) (then (call ${fail})))
            (local.set ${frame} (i32.wrap_i64 (i64.shr_u (local.get ${prefix}) (i64.const 32))))
            (local.set ${openedList} (i32.ne (local.get ${frame}) (i32.const 1)))
            (if (i32.ne (local.get ${frame}) (i32.const 1)) (then
              (local.set ${frame} (i32.add (local.get ${frame}) (i32.shl (local.get ${virtualIndent}) (i32.const 1))))))
            (i32.store (i32.add (global.get $base) (i32.add (i32.const 32) (i32.shl (local.get ${depth}) (i32.const 2)))) (local.get ${frame}))
            (local.set ${depth} (i32.add (local.get ${depth}) (i32.const 1)))
            (local.set ${prefixEnd} (i32.wrap_i64 (local.get ${prefix})))
            (local.set ${previousColumn} (local.get ${containerColumn}))
            (local.set ${containerColumn} (call ${advanceColumns} (local.get ${input}) (local.get ${pos})
              (local.get ${prefixEnd}) (local.get ${containerColumn})))
            (local.set ${virtualIndent} (i32.const 0))
            (if (i32.eq (local.get ${frame}) (i32.const 1)) (then
              (if (i32.eq (i32.load8_u (i32.add (local.get ${input}) (i32.sub (local.get ${prefixEnd}) (i32.const 1)))) (i32.const 9)) (then
                (local.set ${virtualIndent} (i32.sub (i32.sub (local.get ${containerColumn})
                  (call ${advanceColumns} (local.get ${input}) (local.get ${pos}) (i32.sub (local.get ${prefixEnd}) (i32.const 1))
                    (local.get ${previousColumn}))) (i32.const 1))))))
              (else (if (i32.gt_u (i32.sub (local.get ${containerColumn}) (local.get ${previousColumn}))
                (i32.shr_u (local.get ${frame}) (i32.const 1))) (then
                (local.set ${virtualIndent} (i32.sub (i32.sub (local.get ${containerColumn}) (local.get ${previousColumn}))
                  (i32.shr_u (local.get ${frame}) (i32.const 1))))))))
            ${plainIndent(pos, prefixEnd)}
            (local.set ${style} ${styled("punctuation.special")})
            ${coalesce(span, prefixEnd, style, writers.emit)}
            (local.set ${pos} (local.get ${prefixEnd}))
            (local.set ${paragraph} (i32.const 0))
            (local.set ${table} (i32.const 0))
            (br ${openLoop})))))
    `;
  }

  function frontMatter() {
    return wat`
        (if (i32.eq (local.get ${mode}) (i32.const 1)) (then
          (if ${delimiter} (then
            (call ${sealHost} (local.get ${hostLast}))
            (local.set ${host} (i32.const 0))
            (local.set ${hostCurrent} (i32.const -1))
            (local.set ${mode} (i32.const 0))
            (local.set ${style} ${styled("punctuation.delimiter")})
            ${coalesce(span, lineEnd, style, writers.emit)}
            (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
              (local.set ${style} ${styled("plain")})
              ${coalesce(span, next, style, writers.emit)})))
            (else ${emitSegment(injection, next, writers)}))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
        (if (i32.and (i32.eq (local.get ${pos}) (local.get ${start}))
          (i32.and (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) ${delimiter})) (then
          (local.set ${style} ${styled("punctuation.delimiter")})
          ${coalesce(span, next, style, writers.emit)}
          (local.set ${openAction} (i32.const 2))
          (local.set ${openStart} (i32.const 0))
          ${openInjection(injection, { ...writers, fail, injections })}
          (local.set ${mode} (i32.const 1))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
    `;
  }

  function fencedBody() {
    return wat`
        (if (i32.eq (local.get ${mode}) (i32.const 2)) (then
          (local.set ${bodyPos} (i32.add (local.get ${pos}) (local.get ${sharedTab})))
          (local.set ${fence} (call ${runFence} (local.get ${input}) (local.get ${bodyPos}) (local.get ${lineEnd})))
          (if (i64.ne (local.get ${fence}) (i64.const -1)) (then
            (local.set ${fenceStart} (i32.wrap_i64 (i64.shr_u (local.get ${fence}) (i64.const 32))))
            (local.set ${fenceEnd} (i32.wrap_i64 (local.get ${fence})))
            (if (i32.and (i32.le_u (i32.add (local.get ${virtualIndent}) (i32.sub (local.get ${fenceStart}) (local.get ${bodyPos}))) (i32.const 3))
              (i32.and (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${fenceStart}))) (local.get ${fenceByte}))
                (i32.and (i32.ge_u (i32.sub (local.get ${fenceEnd}) (local.get ${fenceStart})) (local.get ${fenceLength}))
                  (call ${blank} (local.get ${input}) (local.get ${fenceEnd}) (local.get ${lineEnd}))))) (then
              (call ${sealHost} (local.get ${hostLast}))
              (local.set ${host} (i32.const 0))
              (local.set ${hostCurrent} (i32.const -1))
              (local.set ${mode} (i32.const 0))
              ${plainIndent(pos, fenceStart)}
              (local.set ${style} ${styled("punctuation.delimiter")})
              ${coalesce(span, lineEnd, style, writers.emit)}
              (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
                (local.set ${style} ${styled("plain")})
                ${coalesce(span, next, style, writers.emit)}))
              (local.set ${pos} (local.get ${next}))
              (br ${line})))))
          (local.set ${cursor} (local.get ${pos}))
          (block ${stripDone} (loop ${strip}
            (br_if ${stripDone} (i32.ge_u (local.get ${cursor}) (local.get ${lineEnd})))
            (br_if ${stripDone} (i32.ge_u (i32.add (local.get ${virtualIndent}) (i32.sub (local.get ${cursor}) (local.get ${pos}))) (local.get ${fenceIndent})))
            (br_if ${stripDone} (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))) (i32.const 32)))
            (local.set ${cursor} (i32.add (local.get ${cursor}) (i32.const 1)))
            (br ${strip})))
          (if (i32.gt_u (local.get ${cursor}) (local.get ${pos})) (then
            (local.set ${hostCurrent} (i32.const -1))
            (local.set ${style} ${styled("plain")})
            ${coalesce(span, cursor, style, writers.emit)}))
          (if (i32.lt_u (local.get ${cursor}) (local.get ${next})) (then
            ${emitSegment(injection, next, writers)}))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
    `;
  }

  function htmlBody() {
    return wat`
        (if (i32.ge_u (local.get ${mode}) (i32.const 4)) (then
          (if (i32.and (i32.eq (local.get ${mode}) (i32.const 12))
            (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})))
            (then (local.set ${mode} (i32.const 0)))
            (else
              (local.set ${style} ${styled("plain")})
              ${coalesce(span, next, style, writers.emit)}
              (if (i32.and (i32.ne (local.get ${mode}) (i32.const 12))
                (call ${endHtml} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${mode})))
                (then (local.set ${mode} (i32.const 0))))
              (local.set ${pos} (local.get ${next}))
              (br ${line})))))
    `;
  }

  function htmlOpening() {
    return wat`
        (local.set ${mode} (call ${startHtml} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})
          (local.get ${paragraph}) (local.get ${virtualIndent})))
        (if (local.get ${mode}) (then
          ${resolve(false)}
          (local.set ${paragraph} (i32.const 0))
          (local.set ${style} ${styled("plain")})
          ${coalesce(span, next, style, writers.emit)}
          (if (i32.and (i32.ne (local.get ${mode}) (i32.const 12))
            (call ${endHtml} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${mode})))
            (then (local.set ${mode} (i32.const 0))))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
    `;
  }

  function indentedAndThematic() {
    return wat`
        (if (i32.eq (local.get ${mode}) (i32.const 3)) (then
          (if (i32.or (call ${indentCode} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent}))
            (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))) (then
            (local.set ${style} ${styled("text.literal")})
            ${coalesce(span, next, style, writers.emit)}
            (local.set ${pos} (local.get ${next}))
            (br ${line})))
          (local.set ${mode} (i32.const 0))
          ${openContainers()}))
        (if (i32.and (i32.eqz (local.get ${paragraph}))
          (i32.and (call ${indentCode} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent}))
            (i32.eqz (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))))) (then
          (local.set ${mode} (i32.const 3))
          (local.set ${style} ${styled("text.literal")})
          ${coalesce(span, next, style, writers.emit)}
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
        (if (call ${thematic} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${paragraph}) (local.get ${virtualIndent})) (then
          ${resolve(false)}
          (local.set ${paragraph} (i32.const 0))
          ${plainIndent(pos, lineEnd)}
          (local.set ${style} ${styled("punctuation.delimiter")})
          ${coalesce(span, lineEnd, style, writers.emit)}
          (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
            (local.set ${style} ${styled("plain")})
            ${coalesce(span, next, style, writers.emit)}))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
    `;
  }

  function fenceOpening() {
    return wat`
        (local.set ${fence} (call ${runFence} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd})))
        (if (i64.ne (local.get ${fence}) (i64.const -1)) (then
          (local.set ${fenceStart} (i32.wrap_i64 (i64.shr_u (local.get ${fence}) (i64.const 32))))
          (local.set ${fenceEnd} (i32.wrap_i64 (local.get ${fence})))
          (local.set ${fenceByte} (i32.load8_u (i32.add (local.get ${input}) (local.get ${fenceStart}))))
          (if (i32.and (i32.le_u (i32.add (local.get ${virtualIndent}) (i32.sub (local.get ${fenceStart}) (local.get ${pos}))) (i32.const 3))
            (i32.or (i32.ne (local.get ${fenceByte}) (i32.const 96))
              (i32.eq (call ${backtick} (local.get ${input}) (local.get ${fenceEnd}) (local.get ${lineEnd})) (local.get ${lineEnd})))) (then
            ${resolve(false)}
            (local.set ${paragraph} (i32.const 0))
            (local.set ${fenceLength} (i32.sub (local.get ${fenceEnd}) (local.get ${fenceStart})))
            (local.set ${fenceIndent} (i32.add (local.get ${virtualIndent}) (i32.sub (local.get ${fenceStart}) (local.get ${pos}))))
            ${plainIndent(pos, fenceStart)}
            (local.set ${style} ${styled("punctuation.delimiter")})
            ${coalesce(span, fenceEnd, style, writers.emit)}
            (local.set ${cursor} (local.get ${fenceEnd}))
            (block $infoWhitespaceDone (loop $infoWhitespace
              (br_if $infoWhitespaceDone (i32.ge_u (local.get ${cursor}) (local.get ${lineEnd})))
              (local.set ${runValue} (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))))
              (br_if $infoWhitespaceDone (i32.and (i32.ne (local.get ${runValue}) (i32.const 32)) (i32.ne (local.get ${runValue}) (i32.const 9))))
              (local.set ${cursor} (i32.add (local.get ${cursor}) (i32.const 1)))
              (br $infoWhitespace)))
            (if (i32.gt_u (local.get ${cursor}) (local.get ${fenceEnd})) (then
              (local.set ${style} ${styled("plain")})
              ${coalesce(span, cursor, style, writers.emit)}))
            (local.set ${infoEnd} (call ${infoScan} (local.get ${input}) (local.get ${cursor}) (local.get ${lineEnd})))
            (local.set ${openStart} (i32.const 0))
            (local.set ${openEnd} (i32.const 0))
            (if (i32.gt_u (local.get ${infoEnd}) (local.get ${cursor})) (then
              (local.set ${openStart} (local.get ${cursor}))
              (local.set ${openEnd} (local.get ${infoEnd}))
              (local.set ${style} ${styled("label")})
              ${coalesce(span, infoEnd, style, writers.emit)}))
            (if (i32.gt_u (local.get ${next}) (local.get ${infoEnd})) (then
              (local.set ${style} ${styled("plain")})
              ${coalesce(span, next, style, writers.emit)}))
            (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
              (local.set ${openAction} (i32.const 1))
              ${openInjection(injection, { ...writers, fail, injections })}
              (local.set ${mode} (i32.const 2))))
            (local.set ${pos} (local.get ${next}))
            (br ${line})))))
    `;
  }

  /** Skip at most three spaces of indentation, or leave `tableAt` on one. */
  function indentation(from: Local, columns: Part) {
    return wat`
        (local.set ${tableAt} (local.get ${from}))
        (block $indented (loop $indent
          (br_if $indented (i32.ge_u (i32.add ${columns} (i32.sub (local.get ${tableAt}) (local.get ${from}))) (i32.const 3)))
          (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${tableAt}))) (i32.const 32)))
          (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))
          (br $indent)))`;
  }
  const spaceAt = (at: Local) => wat`(i32.or
    (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${at}))) (i32.const 32))
    (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${at}))) (i32.const 9)))`;
  const withoutReturn = (from: Local, end: Local) => wat`(i32.sub (local.get ${end})
    (i32.and (i32.gt_u (local.get ${end}) (local.get ${from}))
      (i32.eq (i32.load8_u (i32.add (local.get ${input}) (i32.sub (local.get ${end}) (i32.const 1)))) (i32.const 13))))`;

  /**
   * GFM tables. A delimiter row turns the paragraph's last line into a header with as
   * many cells; body rows follow until a blank line or another block starts. Each cell
   * is its own inline content.
   */
  function tables() {
    return wat`
        (local.set ${tableHead} (i32.const 0))
        (local.set ${tableEnd} ${withoutReturn(pos, lineEnd)})
        (if (local.get ${table}) (then
          ${fenceAhead()}
          (if (i32.or (i32.or (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))
              (call ${indentCode} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent})))
            (i32.or (i32.or (local.get ${runValue})
                (call ${thematic} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (i32.const 0) (local.get ${virtualIndent})))
              (i32.or (call ${heading} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent}))
                (call ${startHtml} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (i32.const 0) (local.get ${virtualIndent})))))
            (then (local.set ${table} (i32.const 0)))
            (else
              (local.set ${tableBase} ${styled("plain")})
              (local.set ${tableDivider} ${styled("punctuation.delimiter")})
              (local.set ${tableAt} (local.get ${pos}))))))
        (if (i32.and (i32.and (local.get ${paragraph}) (i32.eqz (local.get ${mode})))
          (i32.eqz (i32.or (local.get ${lazy}) (local.get ${rowLazy})))) (then
          ${indentation(pos, wat`(local.get ${virtualIndent})`)}
          (if (i32.eqz ${spaceAt(tableAt)}) (then
            (local.set ${tableCell} (call ${delimiterCells} (local.get ${input}) (local.get ${tableAt}) (local.get ${tableEnd})))
            (if (local.get ${tableCell}) (then
              ${indentation(rowStart, wat`(i32.const 0)`)}
              (local.set ${rowEnd} ${withoutReturn(rowStart, rowEnd)})
              (if (i32.and (i32.eqz ${spaceAt(tableAt)})
                (i32.eq (call ${headerCells} (local.get ${input}) (local.get ${tableAt}) (local.get ${rowEnd})) (local.get ${tableCell}))) (then
                ;; Resolve the paragraph before the header line, whose queue entry may continue into it.
                (local.set ${queueIndex} (i32.const 0))
                (block $found (loop $seek
                  (call ${charge} (i64.const 1))
                  (br_if $found (i32.ge_u (local.get ${queueIndex}) (global.get ${scratch.used})))
                  (br_if $found (i32.gt_u ${queued.get(queueAt, "end")} (local.get ${rowStart})))
                  (local.set ${queueIndex} (i32.add (local.get ${queueIndex}) (i32.const ${queued.size})))
                  (br $seek)))
                (if (i32.lt_u (local.get ${queueIndex}) (global.get ${scratch.used})) (then
                  (if (i32.lt_u (if (result i32) (local.get ${queueIndex})
                      (then ${queued.get(inScratch(wat`(i32.sub (local.get ${queueIndex}) (i32.const ${queued.size}))`), "end")})
                      (else (local.get ${paragraphStart})))
                    (local.get ${rowStart})) (then
                    ${queued.set(queueAt, "end", wat`(local.get ${rowStart})`)}
                    (local.set ${queueIndex} (i32.add (local.get ${queueIndex}) (i32.const ${queued.size})))))))
                (global.set ${scratch.used} (local.get ${queueIndex}))
                (local.set ${queueMark} (local.get ${queueIndex}))
                ${resolve(false)}
                (local.set ${paragraph} (i32.const 0))
                (local.set ${tableHead} (i32.const 1))
                (local.set ${tableBase} ${styled("text.title")})
                (local.set ${tableDivider} ${styled("text.title")})
                (local.set ${tableAt} (local.get ${rowStart}))
                (local.set ${tableEnd} (local.get ${rowEnd}))))))))))
        (if (i32.or (local.get ${tableHead}) (local.get ${table})) (then
          (local.set ${cursor} (local.get ${tableAt}))
          (block $leading (loop $space
            (br_if $leading (i32.ge_u (local.get ${tableAt}) (local.get ${tableEnd})))
            (br_if $leading (i32.eqz ${spaceAt(tableAt)}))
            (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))
            (br $space)))
          (if (i32.gt_u (local.get ${tableAt}) (local.get ${cursor})) (then
            (local.set ${style} ${styled("plain")})
            ${coalesce(span, tableAt, style, writers.emit)}))
          (block $row (loop $cells
            (br_if $row (i32.ge_u (local.get ${tableAt}) (local.get ${tableEnd})))
            (if (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${tableAt}))) (i32.const 124))
              (then
                (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))
                ${coalesce(span, tableAt, tableDivider, writers.emit)})
              (else
                (local.set ${tableCell} (call ${cellEnd} (local.get ${input}) (local.get ${tableAt}) (local.get ${tableEnd})))
                ${resolveCell(tableAt, tableCell, tableBase)}
                (local.set ${tableAt} (local.get ${tableCell}))))
            (br $cells)))
          (if (local.get ${tableHead})
            (then
              (local.set ${style} ${styled("text.title")})
              ${coalesce(span, rowNext, style, writers.emit)}
              ;; The delimiter row's container prefixes: a block quote's ">" and its space, and indentation.
              (local.set ${tableAt} (local.get ${rowNext}))
              (block $prefixed (loop $prefix
                (br_if $prefixed (i32.ge_u (local.get ${tableAt}) (local.get ${pos})))
                (if (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${tableAt}))) (i32.const 62))
                  (then
                    (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))
                    (if (i32.and (i32.lt_u (local.get ${tableAt}) (local.get ${pos})) ${spaceAt(tableAt)})
                      (then (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))))
                    (local.set ${style} ${styled("punctuation.special")}))
                  (else
                    (block $plain (loop $indent
                      (br_if $plain (i32.ge_u (local.get ${tableAt}) (local.get ${pos})))
                      (br_if $plain (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${tableAt}))) (i32.const 62)))
                      (local.set ${tableAt} (i32.add (local.get ${tableAt}) (i32.const 1)))
                      (br $indent)))
                    (local.set ${style} ${styled("plain")})))
                ${coalesce(span, tableAt, style, writers.emit)}
                (br $prefix)))
              (local.set ${tableEnd} ${withoutReturn(pos, lineEnd)})
              (local.set ${style} ${styled("punctuation.delimiter")})
              ${coalesce(span, tableEnd, style, writers.emit)}
              (local.set ${table} (i32.const 1)))
            (else (local.set ${tableAt} (local.get ${tableEnd}))))
          (if (i32.lt_u (local.get ${tableEnd}) (local.get ${next})) (then
            (local.set ${style} ${styled("plain")})
            ${coalesce(span, next, style, writers.emit)}))
          (local.set ${pos} (local.get ${next}))
          (br ${line})))
    `;
  }

  function setextHeading() {
    return wat`
      (if (i32.and (local.get ${paragraph}) ${underline}) (then
        (local.set ${onlyDefinitions} (i32.const 0))
        (local.set ${definitionCursor} (call ${logical.normalize} (i64.extend_i32_u (local.get ${paragraphStart})) (local.get ${queueMark})))
        (block $checked (loop $checkDefinition
          (br_if $checked (i32.ge_u (i32.wrap_i64 (i64.shr_u (local.get ${definitionCursor}) (i64.const 32))) (local.get ${queueMark})))
          (local.set ${definitionNext} (call ${definition.parse} (local.get ${input}) (local.get ${definitionCursor}) (local.get ${queueMark})))
          (br_if $checked (i64.eq (local.get ${definitionNext}) (i64.const -1)))
          (local.set ${definitionCursor} (local.get ${definitionNext}))
          (if (i32.ge_u (i32.wrap_i64 (i64.shr_u (local.get ${definitionCursor}) (i64.const 32))) (local.get ${queueMark}))
            (then (local.set ${onlyDefinitions} (i32.const 1))))
          (br $checkDefinition)))
        (if (local.get ${onlyDefinitions}) (then
          ${resolve(false)}
          (local.set ${paragraph} (i32.const 0))
          ${openContainers()})
        (else
        ${resolve(true)}
        (local.set ${paragraph} (i32.const 0))
        (local.set ${style} ${styled("text.title")})
        ${append(lineEnd, style)}
        (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
          (local.set ${style} ${styled("plain")})
          ${append(next, style)}))
        (local.set ${pos} (local.get ${next}))
        (br ${line})))))
    `;
  }

  function paragraphLine() {
    return wat`
        (local.set ${style} ${styled("plain")})
        (if (call ${blank} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}))
          (then
            ${resolve(false)}
            (local.set ${paragraph} (i32.const 0)))
          (else
            (if (call ${heading} (local.get ${input}) (local.get ${pos}) (local.get ${lineEnd}) (local.get ${virtualIndent}))
              (then
                ${resolve(false)}
                (local.set ${paragraph} (i32.const 0))
                ${plainIndent(pos, lineEnd)}
                (local.set ${pos} (local.get ${cursor}))
                (local.set ${collecting} (i32.const 1))
                (local.set ${paragraphStart} (local.get ${pos}))
                (local.set ${style} ${styled("text.title")})
                ${append(lineEnd, style)}
                (local.set ${queueMark} (global.get ${scratch.used}))
                ${resolve(true)}
                (local.set ${pos} (local.get ${lineEnd})))
              (else
                (if (i32.eqz (local.get ${paragraph})) (then
                  (local.set ${taskCandidate} (local.get ${openedList}))
                  (local.set ${paragraphStart} (local.get ${pos}))
                  (local.set ${collecting} (i32.const 1))
                  (local.set ${cursor} (local.get ${pos}))
                  (block $leadingDone (loop $leading
                    (br_if $leadingDone (i32.ge_u (local.get ${cursor}) (local.get ${lineEnd})))
                    (br_if $leadingDone (i32.ge_u (i32.sub (local.get ${cursor}) (local.get ${pos})) (i32.const 3)))
                    (br_if $leadingDone (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${cursor}))) (i32.const 32)))
                    (local.set ${cursor} (i32.add (local.get ${cursor}) (i32.const 1))) (br $leading)))
                  (if (i32.gt_u (local.get ${cursor}) (local.get ${pos})) (then
                    (local.set ${style} (i32.const ${kind.leading}))
                    ${append(cursor, style)}
                    (local.set ${style} ${styled("plain")})))))
                (local.set ${rowStart} (local.get ${pos}))
                (local.set ${rowEnd} (local.get ${lineEnd}))
                (local.set ${rowNext} (local.get ${next}))
                (local.set ${rowLazy} (local.get ${lazy}))
                (local.set ${paragraph} (i32.const 1))
                (local.set ${collecting} (i32.const 1))))))
        (if (i32.lt_u (local.get ${pos}) (local.get ${lineEnd})) (then
          ${append(lineEnd, style)}))
        (if (i32.lt_u (local.get ${lineEnd}) (local.get ${next})) (then
          (local.set ${style} ${styled("plain")})
          ${append(next, style)}))
    `;
  }

  return func(
    "highlight",
    () => wat`
    (export "highlight")
    (param ${input} i32) (param ${length} i32) (param ${documents} i32)
    (param ${count} i32) (param ${out} i32) (result i32)
    (local ${initial} i32) (local ${pos} i32) (local ${limit} i32)
    (local ${lineEnd} i32) (local ${next} i32) (local ${cursor} i32)
    (local ${style} i32) (local ${pendingStyle} i32) (local ${pendingEnd} i32)
    (local ${start} i32) (local ${mode} i32)
    (local ${pendingAddress} i32) (local ${host} i32) (local ${hostId} i32)
    (local ${hostDepth} i32) (local ${hostLast} i32) (local ${hostCurrent} i32)
    (local ${depth} i32) (local ${openAction} i32) (local ${openStart} i32) (local ${openEnd} i32)
    (local ${paragraph} i32) (local ${openedList} i32) (local ${taskCandidate} i32) (local ${taskStart} i64) (local ${taskEnd} i64) (local ${taskByte} i32)
    (local ${table} i32) (local ${tableAt} i32) (local ${tableCell} i32) (local ${tableEnd} i32)
    (local ${tableBase} i32) (local ${tableDivider} i32) (local ${tableHead} i32)
    (local ${rowStart} i32) (local ${rowEnd} i32) (local ${rowNext} i32) (local ${rowLazy} i32) (local ${collecting} i32) (local ${queueMark} i32) (local ${queueLimit} i32) (local ${queueIndex} i32)
    (local ${queueEnd} i32) (local ${queueStyle} i32) (local ${paragraphStart} i32) (local ${queuePos} i32)
    (local ${queueTarget} i32) (local ${replayStyle} i32) (local ${definitionCursor} i64) (local ${definitionNext} i64)
    (local ${inlineCursor} i64) (local ${inlineStyle} i32)
    (local ${inlineWorkspace} i32) (local ${inlineTickBytes} i64) (local ${inlineEventCapacity} i64) (local ${inlineWorkspaceBytes} i64)
    (local ${attentionEvent} i32) (local ${attentionNode} i32) (local ${attentionPair} i32)
    (local ${attentionStart} i32) (local ${attentionEnd} i32) (local ${attentionStyle} i32) (local ${attentionTarget} i32)
    (local ${onlyDefinitions} i32) (local ${fence} i64) (local ${fenceStart} i32) (local ${fenceEnd} i32)
    (local ${fenceByte} i32) (local ${fenceLength} i32) (local ${fenceIndent} i32)
    (local ${infoEnd} i32) (local ${runValue} i32)
    (local ${containerColumn} i32) (local ${containerIndex} i32) (local ${frame} i32)
    (local ${prefix} i64) (local ${prefixEnd} i32) (local ${lazy} i32)
    (local ${virtualIndent} i32) (local ${previousColumn} i32) (local ${previousVirtual} i32)
    (local ${sharedTab} i32) (local ${bodyPos} i32)
    (global.set ${status} (i32.const 0))
    (global.set ${records} (i32.const 0))
    (global.set ${injections} (i32.const 0))
    (global.set ${scratch.capacity} (i32.const 0))
    (global.set ${scratch.used} (i32.const 0))
    (global.set ${scratch.required} (i64.const 0))
    (if (i64.gt_u (i64.extend_i32_u (local.get ${count}))
      (i64.add (i64.extend_i32_u (local.get ${length})) (i64.const 1024))) (then (call ${fail})))
    (local.set ${initial} (local.get ${out}))
    (block ${allDone} (loop ${document}
      (br_if ${allDone} (i32.eqz (local.get ${count})))
      (local.set ${pos} (i32.load (local.get ${documents})))
      (local.set ${limit} (i32.load offset=4 (local.get ${documents})))
      (local.set ${start} (local.get ${pos}))
      (local.set ${pendingStyle} (i32.const -1))
      (local.set ${pendingAddress} (i32.const -1))
      (local.set ${host} (i32.const 0))
      (local.set ${hostLast} (i32.const -1))
      (local.set ${hostCurrent} (i32.const -1))
      (local.set ${mode} (i32.const 0))
      (local.set ${depth} (i32.const 0))
      (local.set ${paragraph} (i32.const 0))
      (local.set ${table} (i32.const 0))
      (local.set ${collecting} (i32.const 0))
      (global.set ${fuel} (i64.add (i64.const 64)
        (i64.mul (i64.extend_i32_u (i32.sub (local.get ${limit}) (local.get ${pos}))) (i64.const ${workPerByte}))))
      (call ${charge} (i64.extend_i32_u (i32.sub (local.get ${limit}) (local.get ${pos}))))
      (block ${documentDone} (loop ${line}
        (br_if ${documentDone} (i32.ge_u (local.get ${pos}) (local.get ${limit})))
        (local.set ${openedList} (i32.const 0))
        (local.set ${queueMark} (global.get ${scratch.used}))
        (local.set ${lineEnd} (call ${scan} (local.get ${input}) (local.get ${pos}) (local.get ${limit})))
        (if (i32.and (i32.lt_u (i32.add (local.get ${lineEnd}) (i32.const 1)) (local.get ${limit}))
          (i32.and (i32.eq (i32.load8_u (i32.add (local.get ${input}) (local.get ${lineEnd}))) (i32.const 13))
            (i32.eq (i32.load8_u offset=1 (i32.add (local.get ${input}) (local.get ${lineEnd}))) (i32.const 10))))
          (then (local.set ${lineEnd} (i32.add (local.get ${lineEnd}) (i32.const 1)))))
        (local.set ${next} (if (result i32) (i32.lt_u (local.get ${lineEnd}) (local.get ${limit}))
          (then (i32.add (local.get ${lineEnd}) (i32.const 1))) (else (local.get ${lineEnd}))))
        (call ${charge}
          (i64.add (i64.const 8) (i64.mul (i64.const 8) (i64.extend_i32_u (i32.sub (local.get ${next}) (local.get ${pos}))))))
        ${containers()}
        ${frontMatter()}
        ${fencedBody()}
        ${htmlBody()}
        ${tables()}
        ${setextHeading()}
        ${indentedAndThematic()}
        ${fenceOpening()}
        ${htmlOpening()}
        ${paragraphLine()}
        (local.set ${pos} (local.get ${next}))
        (br ${line})))
      (local.set ${queueMark} (global.get ${scratch.used}))
      ${resolve(false)}
      ${flushSpan(span, writers.emit)}
      (if (local.get ${host}) (then (call ${sealHost} (local.get ${hostLast}))))
      (local.set ${documents} (i32.add (local.get ${documents}) (i32.const 8)))
      (local.set ${count} (i32.sub (local.get ${count}) (i32.const 1)))
      (br ${document})))
    (global.set ${records} (i32.shr_u (i32.sub (local.get ${out}) (local.get ${initial})) (i32.const 3)))
    (i32.const 0)`,
  );
}

function frontDelimiter() {
  const input = local("input"),
    pos = local("pos"),
    end = local("end"),
    byte = local("byte");
  const done = label("done"),
    more = label("more");
  return func(
    "frontDelimiter",
    () => wat`
    (param ${input} i32) (param ${pos} i32) (param ${end} i32) (result i32)
    (local ${byte} i32)
    (if (i32.lt_u (i32.sub (local.get ${end}) (local.get ${pos})) (i32.const 3)) (then (return (i32.const 0))))
    (if (i32.or
      (i32.ne (i32.load8_u (i32.add (local.get ${input}) (local.get ${pos}))) (i32.const 45))
      (i32.or (i32.ne (i32.load8_u offset=1 (i32.add (local.get ${input}) (local.get ${pos}))) (i32.const 45))
        (i32.ne (i32.load8_u offset=2 (i32.add (local.get ${input}) (local.get ${pos}))) (i32.const 45))))
      (then (return (i32.const 0))))
    (local.set ${pos} (i32.add (local.get ${pos}) (i32.const 3)))
    (block ${done} (loop ${more}
      (br_if ${done} (i32.ge_u (local.get ${pos}) (local.get ${end})))
      (local.set ${byte} (i32.load8_u (i32.add (local.get ${input}) (local.get ${pos}))))
      (if (i32.eq (local.get ${byte}) (i32.const 13)) (then
        (return (i32.eq (i32.add (local.get ${pos}) (i32.const 1)) (local.get ${end})))))
      (if (i32.and (i32.ne (local.get ${byte}) (i32.const 32)) (i32.ne (local.get ${byte}) (i32.const 9)))
        (then (return (i32.const 0))))
      (local.set ${pos} (i32.add (local.get ${pos}) (i32.const 1)))
      (br ${more})))
    (i32.const 1)`,
  );
}
