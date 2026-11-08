import type { Grammar, Matcher } from "#/grammar/mod.ts";
import type { FooterIndent } from "#/grammar/queue.ts";
import type { LowerContext } from "./matcher.ts";
import type { ShapeLowering } from "./effect.ts";
import { captureBytes, captureLayout } from "./capture.ts";
import { maxDepth } from "#/grammar/limits.ts";
import { record } from "#/abi/constants.ts";
import { heredocFooterWat } from "./heredoc_footer.ts";
import { isSharedState } from "./state.ts";

export const lowerQueueAction = (op: {
  kind: "queueEnter" | "queueLeave" | "queueShift";
}): string => {
  const action = `$${op.kind}`;
  return `(call ${action})`;
};
const quotedDelimiterFlag = 1;
const footerIndentFlags: Record<FooterIndent, number> = { none: 0, tabs: 2, whitespace: 4 };
const queueEntryCaptureOffset = 4;
const queueEntryLayout = {
  capture: queueEntryCaptureOffset,
  length: queueEntryCaptureOffset + captureLayout.length,
  overflow: queueEntryCaptureOffset + captureLayout.overflow,
  data: queueEntryCaptureOffset + captureLayout.data,
  flags: queueEntryCaptureOffset + captureLayout.flags,
  bytes: queueEntryCaptureOffset + captureBytes,
} as const;
const queuePairShift = 3;
const queuePairBytes = 1 << queuePairShift;
const ownerTailOffset = "offset=4";
const bodyDepthOffset = "offset=4";
const initialQueueCapacity = 512;
const maxQueueCapacity = 2 ** 31;
export const lowerQueueSave: ShapeLowering<"queueSave"> = ({ footerIndent }) => {
  const flags = footerIndentFlags[footerIndent];
  return `(call $queueSave (local.get $out) (i32.const ${flags}))`;
};
export const lowerQueueOpen: ShapeLowering<"queueOpen"> = () =>
  `(call $queueOpen (local.get $depth))`;
export const queueOwnerBytes = maxDepth * queuePairBytes;
export const queueBodyBytes = maxDepth * queuePairBytes;
export const queueAreas = (enabled: boolean, sweep: boolean) => ({
  owners: enabled ? queueOwnerBytes : 0,
  bodies: sweep ? queueBodyBytes : 0,
});

/** Scratch entries are relocatable offsets; output growth and scratch growth share one allocator. */
export function queueWat(captureOffset: number, ownerOffset: number, bodyOffset: number): string {
  const entryBytes = queueEntryLayout.bytes;
  const captureInEntry = queueEntryLayout.capture;
  const lengthOffset = `offset=${queueEntryLayout.length}`;
  const overflowOffset = `offset=${queueEntryLayout.overflow}`;
  const dataOffset = `offset=${queueEntryLayout.data}`;
  const dataInEntry = queueEntryLayout.data;
  const flagsOffset = `offset=${queueEntryLayout.flags}`;
  const footer = heredocFooterWat();
  const ownerLimit = maxDepth - 1;
  const outputRecordBytes = record.bytes;
  return `
    (global $queueOwner (mut i32) (i32.const 0))
    (global $queueBodies (mut i32) (i32.const 0))
    ${footer}
    (func $queueBase (result i32)
      (i32.add (global.get $specScratch) (global.get $specScratchSize)))
    (func $queueOwnerPtr (result i32)
      (i32.add
        (i32.add (global.get $base) (i32.const ${ownerOffset}))
        (i32.shl (global.get $queueOwner) (i32.const ${queuePairShift}))))
    (func $queueHead (result i32)
      (i32.load (call $queueOwnerPtr)))
    (func $queueEntry (param $id i32) (result i32)
      (i32.add (call $queueBase) (i32.sub (local.get $id) (i32.const 1))))
    (func $queueResize (param $capacity i32) (param $out i32)
      (call $scratchResize
        (local.get $capacity)
        (i64.add (i64.extend_i32_u (local.get $out)) (i64.const ${outputRecordBytes}))))
    (func $queueReserve (param $out i32)
      (local $need i64) (local $capacity i32)
      (local.set $need
        (i64.add (i64.extend_i32_u (global.get $queueUsed)) (i64.const ${entryBytes})))
      (if (i64.gt_u (local.get $need) (i64.const ${maxQueueCapacity})) (then (call $fail)))
      (local.set $capacity (global.get $queueCapacity))
      (if (i64.gt_u (local.get $need) (i64.extend_i32_u (local.get $capacity)))
        (then
          (if (i32.eqz (local.get $capacity)) (then (local.set $capacity (i32.const ${initialQueueCapacity}))))
          (block $done (loop $double
            (br_if $done (i64.le_u (local.get $need) (i64.extend_i32_u (local.get $capacity))))
            (local.set $capacity (i32.shl (local.get $capacity) (i32.const 1)))
            (br $double)))
          (call $queueResize (local.get $capacity) (local.get $out)))))
    (func $queueReset
      (global.set $queueUsed (i32.const 0))
      (global.set $queueOwner (i32.const 0))
      (global.set $queueBodies (i32.const 0))
      (i64.store (call $queueOwnerPtr) (i64.const 0)))
    (func $queueEnter
      (if (i32.ge_u (global.get $queueOwner) (i32.const ${ownerLimit})) (then (call $fail)))
      (global.set $queueOwner (i32.add (global.get $queueOwner) (i32.const 1)))
      (i64.store (call $queueOwnerPtr) (i64.const 0)))
    (func $queueOpen (param $depth i32)
      (local $body i32)
      (if
        (i32.or
          (i32.eqz (call $queueHead))
          (i32.ge_u (global.get $queueBodies) (i32.const ${maxDepth})))
        (then (call $fail)))
      (local.set $body
        (i32.add
          (i32.add (global.get $base) (i32.const ${bodyOffset}))
          (i32.shl (global.get $queueBodies) (i32.const ${queuePairShift}))))
      (i32.store (local.get $body) (global.get $queueOwner))
      (i32.store ${bodyDepthOffset} (local.get $body) (local.get $depth))
      (global.set $queueBodies (i32.add (global.get $queueBodies) (i32.const 1))))
    (func $queueLeave
      (if (global.get $queueOwner)
        (then (global.set $queueOwner (i32.sub (global.get $queueOwner) (i32.const 1))))))
    (func $queueSave (param $out i32) (param $indent i32)
      (local $id i32) (local $entry i32) (local $owner i32) (local $tail i32)
      (call $queueReserve (local.get $out))
      (local.set $id (i32.add (global.get $queueUsed) (i32.const 1)))
      (local.set $entry (call $queueEntry (local.get $id)))
      (i32.store (local.get $entry) (i32.const 0))
      (memory.copy
        (i32.add (local.get $entry) (i32.const ${captureInEntry}))
        (i32.add (global.get $base) (i32.const ${captureOffset}))
        (i32.const ${captureBytes}))
      (i32.store ${flagsOffset}
        (local.get $entry)
        (i32.or (i32.load ${flagsOffset} (local.get $entry)) (local.get $indent)))
      (local.set $owner (call $queueOwnerPtr))
      (local.set $tail (i32.load ${ownerTailOffset} (local.get $owner)))
      (if (local.get $tail)
        (then (i32.store (call $queueEntry (local.get $tail)) (local.get $id)))
        (else (i32.store (local.get $owner) (local.get $id))))
      (i32.store ${ownerTailOffset} (local.get $owner) (local.get $id))
      (global.set $queueUsed (i32.add (global.get $queueUsed) (i32.const ${entryBytes}))))
    (func $queueShift
      (local $head i32) (local $next i32)
      (local.set $head (call $queueHead))
      (if (local.get $head)
        (then
          (local.set $next (i32.load (call $queueEntry (local.get $head))))
          (i32.store (call $queueOwnerPtr) (local.get $next))
          (if (i32.eqz (local.get $next))
            (then (i32.store ${ownerTailOffset} (call $queueOwnerPtr) (i32.const 0)))))))
    (func $queueHas (param $mask i32) (param $flags i32) (result i32)
      (local $head i32)
      (local.set $head (call $queueHead))
      (if (i32.eqz (local.get $head)) (then (return (i32.const 0))))
      (i32.eq
        (i32.and (i32.load ${flagsOffset} (call $queueEntry (local.get $head))) (local.get $mask))
        (local.get $flags)))
    (func $queueFooter (param $input i32) (param $pos i32) (param $end i32) (result i32)
      (local $head i32) (local $entry i32) (local $length i32)
      (local.set $head (call $queueHead))
      (if (i32.eqz (local.get $head)) (then (return (i32.const -1))))
      (local.set $entry (call $queueEntry (local.get $head)))
      (if (i32.load ${overflowOffset} (local.get $entry)) (then (return (i32.const -1))))
      (local.set $length (i32.load ${lengthOffset} (local.get $entry)))
      (if
        (i32.eqz
          (call $heredocFooter
            (local.get $input)
            (local.get $pos)
            (local.get $end)
            (i32.add (local.get $entry) (i32.const ${dataInEntry}))
            (local.get $length)))
        (then (return (i32.const -1))))
      (i32.add (local.get $pos) (local.get $length)))
    (func $queueText (param $input i32) (param $pos i32) (param $end i32) (result i32)
      (local $head i32) (local $entry i32) (local $length i32) (local $index i32)
      (local.set $head (call $queueHead))
      (if (i32.eqz (local.get $head)) (then (return (i32.const -1))))
      (local.set $entry (call $queueEntry (local.get $head)))
      (if (i32.load ${overflowOffset} (local.get $entry)) (then (return (i32.const -1))))
      (local.set $length (i32.load ${lengthOffset} (local.get $entry)))
      (if (i32.gt_u (local.get $length) (i32.sub (local.get $end) (local.get $pos)))
        (then (return (i32.const -1))))
      (block $matched (loop $compareBytes
        (br_if $matched (i32.ge_u (local.get $index) (local.get $length)))
        (if
          (i32.ne
            (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $index))))
            (i32.load8_u ${dataOffset} (i32.add (local.get $entry) (local.get $index))))
          (then (return (i32.const -1))))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $compareBytes)))
      (i32.add (local.get $pos) (local.get $length)))`;
}

export function lowerQueueHas(
  m: Extract<Matcher, { kind: "queueHas" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { mask, flags } = m;
  return `(br_if ${fail} (i32.eqz (call $queueHas (i32.const ${mask}) (i32.const ${flags}))))`;
}

export function lowerQueueFooter(
  m: Extract<Matcher, { kind: "queueFooter" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $matchCursor (call $queueFooter (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}

export function lowerQueueText(
  m: Extract<Matcher, { kind: "queueText" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $matchCursor (call $queueText (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}

export function queueSweepCode(
  sweep: NonNullable<Grammar["queueSweep"]>,
  names: string[],
  styles: string[],
  ownerOffset: number,
  bodyOffset: number,
  hasInjections: boolean,
  hasContainers: boolean,
  frameRuns: {
    indices: number[];
    offset: number;
    counterIndices: number[];
    counterOffset: number;
    frameBytes: number;
    sharedStates: readonly number[];
    framesOffset: number;
  },
): string {
  const ownerAddressOffset = `offset=${ownerOffset}`;
  const flagsOffset = `offset=${queueEntryLayout.flags}`;
  const overflowOffset = `offset=${queueEntryLayout.overflow}`;
  const lengthOffset = `offset=${queueEntryLayout.length}`;
  const dataInEntry = queueEntryLayout.data;
  const tabsFlag = footerIndentFlags.tabs;
  const whitespaceFlag = footerIndentFlags.whitespace;
  const tabStyle = styles.indexOf(sweep.tabStyle);
  const footerStyle = styles.indexOf(sweep.footerStyle);
  const footerState = names.indexOf(sweep.footer);
  const paintHost = hasInjections
    ? `(if (local.get $host)
      (then
        (local.set $hostCurrent (i32.const -1))
        (local.set $parentPaint (i32.const 1))))`
    : "";
  const closeHost = hasInjections
    ? `(if (i32.and (local.get $host) (i32.gt_u (local.get $hostDepth) (local.get $depth)))
      (then
        (call $sealHost (local.get $hostLast))
        (local.set $host (i32.const 0))
        (local.set $hostCurrent (i32.const -1))))`
    : "";
  const findContainer = hasContainers
    ? `(local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))`
    : "";
  const shared = frameRuns.sharedStates.length > 0;
  const frameBytes = frameRuns.frameBytes;
  const frameOffset = `offset=${frameRuns.framesOffset}`;
  const bodyState = `(if (result i32)
    (i32.eq (i32.load ${bodyDepthOffset} (local.get $sweepBody)) (local.get $depth))
    (then (local.get $state))
    (else
      (i32.load ${frameOffset}
        (i32.add
          (global.get $base)
          (i32.mul (i32.load ${bodyDepthOffset} (local.get $sweepBody)) (i32.const ${frameBytes}))))))`;
  const bodyShared = isSharedState(bodyState, frameRuns.sharedStates);
  const footerShared = Number(frameRuns.sharedStates.includes(footerState));
  const checkShared = shared
    ? `(if (i32.gt_u (i32.load ${bodyDepthOffset} (local.get $sweepBody)) (local.get $depth))
        (then (call $fail)))
      (if (i32.ne ${bodyShared} (i32.const ${footerShared})) (then (call $fail)))`
    : "";
  const owner = shared
    ? `(local.set $slotOwnerIndex
      (call $findSlotOwner
        (i32.load ${bodyDepthOffset} (local.get $sweepBody))
        (local.get $depth)
        (local.get $state)))`
    : "";
  const slotIndex = shared
    ? "(local.get $slotOwnerIndex)"
    : "(i32.load ${bodyDepthOffset} (local.get $sweepBody))";
  const slotAvailable = shared
    ? "(i32.ge_s (local.get $slotOwnerIndex) (i32.const 0))"
    : "(i32.lt_u (i32.load ${bodyDepthOffset} (local.get $sweepBody)) (local.get $depth))";
  const address = `(i32.add (global.get $base) (i32.mul ${slotIndex} (i32.const ${frameBytes})))`;
  const runs = frameRuns.indices
    .map((slot, index) => {
      const byte = `$runByte${slot}`;
      const length = `$runLength${slot}`;
      const byteOffset = `offset=${frameRuns.offset + index * 8}`;
      const lengthOffset = `offset=${frameRuns.offset + index * 8 + 4}`;
      return `(local.set ${byte} (i32.load ${byteOffset} ${address}))
        (local.set ${length} (i32.load ${lengthOffset} ${address}))`;
    })
    .join("\n");
  const counters = frameRuns.counterIndices
    .map((slot, index) => {
      const counter = `$counter${slot}`;
      const counterOffset = `offset=${frameRuns.counterOffset + index * 4}`;
      return `(local.set ${counter} (i32.load ${counterOffset} ${address}))`;
    })
    .join("\n");
  const restoreSlots =
    frameRuns.indices.length || frameRuns.counterIndices.length
      ? `${owner} (if ${slotAvailable} (then ${runs} ${counters}))`
      : "";
  return `(if (local.get $lineStart)
    (then
      (local.set $lineStart (i32.const 0))
      (local.set $sweepIndex (global.get $queueBodies))
      (block $sweepDone (loop $sweepMore
        (br_if $sweepDone (i32.eqz (local.get $sweepIndex)))
        (local.set $sweepIndex (i32.sub (local.get $sweepIndex) (i32.const 1)))
        (local.set $sweepBody
          (i32.add
            (i32.add (global.get $base) (i32.const ${bodyOffset}))
            (i32.shl (local.get $sweepIndex) (i32.const ${queuePairShift}))))
        (local.set $sweepOwner (i32.load (local.get $sweepBody)))
        (if (i32.gt_u (local.get $sweepOwner) (global.get $queueOwner)) (then (call $fail)))
        (local.set $sweepEntry
          (i32.load ${ownerAddressOffset}
            (i32.add (global.get $base) (i32.shl (local.get $sweepOwner) (i32.const ${queuePairShift})))))
        (if (i32.eqz (local.get $sweepEntry)) (then (call $fail)))
        (local.set $sweepEntry (call $queueEntry (local.get $sweepEntry)))
        (local.set $sweepFlags (i32.load ${flagsOffset} (local.get $sweepEntry)))
        (if
          (i32.and
            (i32.ne (i32.and (local.get $sweepFlags) (i32.const ${tabsFlag})) (i32.const 0))
            (i32.eq (local.get $byte) (i32.const 9)))
          (then
            (local.set $next (local.get $pos))
            (block $tabsDone (loop $tabs
              (br_if $tabsDone (i32.ge_u (local.get $next) (local.get $limit)))
              (br_if $tabsDone
                (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $next))) (i32.const 9)))
              (local.set $next (i32.add (local.get $next) (i32.const 1)))
              (br $tabs)))
            (local.set $recheck (i32.lt_u (local.get $next) (local.get $limit)))
            ${paintHost}
            (local.set $style (i32.const ${tabStyle}))
            (br $paint)))
        (if
          (i32.eqz
            (i32.and (local.get $joined) (i32.eqz (i32.and (local.get $sweepFlags) (i32.const ${quotedDelimiterFlag})))))
          (then
            (if (i32.eqz (i32.load ${overflowOffset} (local.get $sweepEntry)))
              (then
                (local.set $sweepLen (i32.load ${lengthOffset} (local.get $sweepEntry)))
                (local.set $sweepPos (local.get $pos))
                (if (i32.and (local.get $sweepFlags) (i32.const ${whitespaceFlag}))
                  (then
                    (block $indentDone (loop $indent
                      (br_if $indentDone (i32.ge_u (local.get $sweepPos) (local.get $limit)))
                      (br_if $indentDone
                        (i32.and
                          (i32.ne
                            (i32.load8_u (i32.add (local.get $input) (local.get $sweepPos)))
                            (i32.const 32))
                          (i32.ne
                            (i32.load8_u (i32.add (local.get $input) (local.get $sweepPos)))
                            (i32.const 9))))
                      (local.set $sweepPos (i32.add (local.get $sweepPos) (i32.const 1)))
                      (br $indent)))))
                (if
                  (call $heredocFooter
                    (local.get $input)
                    (local.get $sweepPos)
                    (local.get $limit)
                    (i32.add (local.get $sweepEntry) (i32.const ${dataInEntry}))
                    (local.get $sweepLen))
                  (then ${checkShared}
                    (global.set $queueBodies (local.get $sweepIndex))
                    (global.set $queueOwner (local.get $sweepOwner))
                    ${restoreSlots}
                    (local.set $depth (i32.load ${bodyDepthOffset} (local.get $sweepBody)))
                    ${closeHost}
                    (call $queueShift)
                    (local.set $state (i32.const ${footerState}))
                    ${findContainer}
                    (local.set $next (i32.add (local.get $sweepPos) (local.get $sweepLen)))
                    (if (i32.ne (local.get $next) (local.get $pos))
                      (then
                        (local.set $style (i32.const ${footerStyle}))
                        (br $paint)))
                    (br $sweepDone)))))))
        (br $sweepMore)))))`;
}
