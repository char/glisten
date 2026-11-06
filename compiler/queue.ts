import type { Grammar } from "#/grammar/mod.ts";
import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import type { ShapeLowering } from "./effect.ts";
import { captureLimit } from "#/grammar/capture.ts";
import { captureBytes } from "./capture.ts";
import { maxDepth } from "#/grammar/limits.ts";
import { heredocFooterWat } from "./heredoc_footer.ts";

export const lowerQueueAction = (op: {
  kind: "queueEnter" | "queueLeave" | "queueShift";
}): string => `(call $${op.kind})`;
export const lowerQueueSave: ShapeLowering<"queueSave"> = (op) =>
  `(call $queueSave (local.get $out) (i32.const ${op.footerIndent === "tabs" ? 2 : op.footerIndent === "whitespace" ? 4 : 0}))`;
export const lowerQueueOpen: ShapeLowering<"queueOpen"> = () =>
  `(call $queueOpen (local.get $depth))`;
export const queueOwnerBytes = maxDepth * 8;
export const queueBodyBytes = maxDepth * 8;
export const queueAreas = (enabled: boolean, sweep: boolean) => ({
  owners: enabled ? queueOwnerBytes : 0,
  bodies: sweep ? queueBodyBytes : 0,
});

/** Scratch entries are relocatable offsets; output growth and scratch growth share one allocator. */
export function queueWat(captureOffset: number, ownerOffset: number, bodyOffset: number): string {
  const entryBytes = captureBytes + 4;
  return `
  (global $queueOwner (mut i32) (i32.const 0))
  (global $queueBodies (mut i32) (i32.const 0))
  ${heredocFooterWat()}
  (func $queueBase (result i32)
    (i32.add (global.get $specScratch) (global.get $specScratchSize)))
  (func $queueOwnerPtr (result i32)
    (i32.add (i32.add (global.get $base) (i32.const ${ownerOffset})) (i32.shl (global.get $queueOwner) (i32.const 3))))
  (func $queueHead (result i32) (i32.load (call $queueOwnerPtr)))
  (func $queueEntry (param $id i32) (result i32)
    (i32.add (call $queueBase) (i32.sub (local.get $id) (i32.const 1))))
  (func $queueResize (param $capacity i32) (param $out i32)
    (call $scratchResize (local.get $capacity) (i64.add (i64.extend_i32_u (local.get $out)) (i64.const 8))))
  (func $queueReserve (param $out i32)
    (local $need i64) (local $capacity i32)
    (local.set $need (i64.add (i64.extend_i32_u (global.get $queueUsed)) (i64.const ${entryBytes})))
    (if (i64.gt_u (local.get $need) (i64.const 2147483648)) (then (call $fail)))
    (local.set $capacity (global.get $queueCapacity))
    (if (i64.gt_u (local.get $need) (i64.extend_i32_u (local.get $capacity))) (then
      (if (i32.eqz (local.get $capacity)) (then (local.set $capacity (i32.const 512))))
      (block $done (loop $double
        (br_if $done (i64.le_u (local.get $need) (i64.extend_i32_u (local.get $capacity))))
        (local.set $capacity (i32.shl (local.get $capacity) (i32.const 1))) (br $double)))
      (call $queueResize (local.get $capacity) (local.get $out)))))
  (func $queueReset
    (global.set $queueUsed (i32.const 0)) (global.set $queueOwner (i32.const 0)) (global.set $queueBodies (i32.const 0))
    (i64.store (call $queueOwnerPtr) (i64.const 0)))
  (func $queueEnter
    (if (i32.ge_u (global.get $queueOwner) (i32.const ${maxDepth - 1})) (then (call $fail)))
    (global.set $queueOwner (i32.add (global.get $queueOwner) (i32.const 1)))
    (i64.store (call $queueOwnerPtr) (i64.const 0)))
  (func $queueOpen (param $depth i32) (local $body i32)
    (if (i32.or (i32.eqz (call $queueHead)) (i32.ge_u (global.get $queueBodies) (i32.const ${maxDepth}))) (then (call $fail)))
    (local.set $body (i32.add (i32.add (global.get $base) (i32.const ${bodyOffset})) (i32.shl (global.get $queueBodies) (i32.const 3))))
    (i32.store (local.get $body) (global.get $queueOwner)) (i32.store offset=4 (local.get $body) (local.get $depth))
    (global.set $queueBodies (i32.add (global.get $queueBodies) (i32.const 1))))
  (func $queueLeave
    (if (global.get $queueOwner) (then (global.set $queueOwner (i32.sub (global.get $queueOwner) (i32.const 1))))))
  (func $queueSave (param $out i32) (param $indent i32) (local $id i32) (local $entry i32) (local $owner i32) (local $tail i32)
    (call $queueReserve (local.get $out))
    (local.set $id (i32.add (global.get $queueUsed) (i32.const 1)))
    (local.set $entry (call $queueEntry (local.get $id)))
    (i32.store (local.get $entry) (i32.const 0))
    (memory.copy (i32.add (local.get $entry) (i32.const 4)) (i32.add (global.get $base) (i32.const ${captureOffset})) (i32.const ${captureBytes}))
    (i32.store offset=${4 + 8 + captureLimit} (local.get $entry)
      (i32.or (i32.load offset=${4 + 8 + captureLimit} (local.get $entry)) (local.get $indent)))
    (local.set $owner (call $queueOwnerPtr))
    (local.set $tail (i32.load offset=4 (local.get $owner)))
    (if (local.get $tail) (then (i32.store (call $queueEntry (local.get $tail)) (local.get $id)))
      (else (i32.store (local.get $owner) (local.get $id))))
    (i32.store offset=4 (local.get $owner) (local.get $id))
    (global.set $queueUsed (i32.add (global.get $queueUsed) (i32.const ${entryBytes}))))
  (func $queueShift (local $head i32) (local $next i32)
    (local.set $head (call $queueHead))
    (if (local.get $head) (then
      (local.set $next (i32.load (call $queueEntry (local.get $head))))
      (i32.store (call $queueOwnerPtr) (local.get $next))
      (if (i32.eqz (local.get $next)) (then (i32.store offset=4 (call $queueOwnerPtr) (i32.const 0)))))))
  (func $queueHas (param $mask i32) (param $flags i32) (result i32) (local $head i32)
    (local.set $head (call $queueHead))
    (if (i32.eqz (local.get $head)) (then (return (i32.const 0))))
    (i32.eq (i32.and (i32.load offset=${4 + 8 + captureLimit} (call $queueEntry (local.get $head))) (local.get $mask)) (local.get $flags)))
  (func $queueFooter (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $head i32) (local $entry i32) (local $length i32)
    (local.set $head (call $queueHead))
    (if (i32.eqz (local.get $head)) (then (return (i32.const -1))))
    (local.set $entry (call $queueEntry (local.get $head)))
    (if (i32.load offset=8 (local.get $entry)) (then (return (i32.const -1))))
    (local.set $length (i32.load offset=4 (local.get $entry)))
    (if (i32.eqz (call $heredocFooter (local.get $input) (local.get $pos) (local.get $end)
      (i32.add (local.get $entry) (i32.const 12)) (local.get $length))) (then (return (i32.const -1))))
    (i32.add (local.get $pos) (local.get $length)))
  (func $queueText (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $head i32) (local $entry i32) (local $length i32) (local $i i32)
    (local.set $head (call $queueHead))
    (if (i32.eqz (local.get $head)) (then (return (i32.const -1))))
    (local.set $entry (call $queueEntry (local.get $head)))
    (if (i32.load offset=8 (local.get $entry)) (then (return (i32.const -1))))
    (local.set $length (i32.load offset=4 (local.get $entry)))
    (if (i32.gt_u (local.get $length) (i32.sub (local.get $end) (local.get $pos))) (then (return (i32.const -1))))
    (block $done (loop $more
      (br_if $done (i32.ge_u (local.get $i) (local.get $length)))
      (if (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $i))))
        (i32.load8_u offset=12 (i32.add (local.get $entry) (local.get $i)))) (then (return (i32.const -1))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $more)))
    (i32.add (local.get $pos) (local.get $length)))`;
}

export function lowerQueueHas(
  m: Extract<Matcher, { kind: "queueHas" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(br_if ${fail} (i32.eqz (call $queueHas (i32.const ${m.mask}) (i32.const ${m.flags}))))`;
}

export function lowerQueueFooter(
  m: Extract<Matcher, { kind: "queueFooter" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $p (call $queueFooter (local.get $input) (local.get $p) (local.get $limit)))
          (br_if ${fail} (i32.lt_s (local.get $p) (i32.const 0)))`;
}

export function lowerQueueText(
  m: Extract<Matcher, { kind: "queueText" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $p (call $queueText (local.get $input) (local.get $p) (local.get $limit)))
          (br_if ${fail} (i32.lt_s (local.get $p) (i32.const 0)))`;
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
  },
): string {
  return `(if (local.get $lineStart) (then
    (local.set $lineStart (i32.const 0))
    (local.set $sweepIndex (global.get $queueBodies))
    (block $sweepDone (loop $sweepMore
      (br_if $sweepDone (i32.eqz (local.get $sweepIndex)))
      (local.set $sweepIndex (i32.sub (local.get $sweepIndex) (i32.const 1)))
      (local.set $sweepBody (i32.add (i32.add (global.get $base) (i32.const ${bodyOffset})) (i32.shl (local.get $sweepIndex) (i32.const 3))))
      (local.set $sweepOwner (i32.load (local.get $sweepBody)))
      (if (i32.gt_u (local.get $sweepOwner) (global.get $queueOwner)) (then (call $fail)))
      (local.set $sweepEntry (i32.load offset=${ownerOffset} (i32.add (global.get $base) (i32.shl (local.get $sweepOwner) (i32.const 3)))))
      (if (i32.eqz (local.get $sweepEntry)) (then (call $fail)))
      (local.set $sweepEntry (call $queueEntry (local.get $sweepEntry)))
      (local.set $sweepFlags (i32.load offset=268 (local.get $sweepEntry)))
      (if (i32.and (i32.ne (i32.and (local.get $sweepFlags) (i32.const 2)) (i32.const 0)) (i32.eq (local.get $byte) (i32.const 9))) (then
        (local.set $next (local.get $pos))
        (block $tabsDone (loop $tabs
          (br_if $tabsDone (i32.ge_u (local.get $next) (local.get $limit)))
          (br_if $tabsDone (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $next))) (i32.const 9)))
          (local.set $next (i32.add (local.get $next) (i32.const 1))) (br $tabs)))
        (local.set $recheck (i32.lt_u (local.get $next) (local.get $limit)))
        ${hasInjections ? "(if (local.get $host) (then (local.set $hostCurrent (i32.const -1)) (local.set $parentPaint (i32.const 1))))" : ""}
        (local.set $style (i32.const ${styles.indexOf(sweep.tabStyle)})) (br $paint)))
      (if (i32.eqz (i32.and (local.get $joined) (i32.eqz (i32.and (local.get $sweepFlags) (i32.const 1))))) (then
        (if (i32.eqz (i32.load offset=8 (local.get $sweepEntry))) (then
          (local.set $sweepLen (i32.load offset=4 (local.get $sweepEntry)))
          (local.set $sweepPos (local.get $pos))
          (if (i32.and (local.get $sweepFlags) (i32.const 4)) (then
            (block $indentDone (loop $indent
              (br_if $indentDone (i32.ge_u (local.get $sweepPos) (local.get $limit)))
              (br_if $indentDone (i32.and
                (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $sweepPos))) (i32.const 32))
                (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $sweepPos))) (i32.const 9))))
              (local.set $sweepPos (i32.add (local.get $sweepPos) (i32.const 1))) (br $indent)))))
          (if (call $heredocFooter (local.get $input) (local.get $sweepPos) (local.get $limit)
            (i32.add (local.get $sweepEntry) (i32.const 12)) (local.get $sweepLen)) (then
            (global.set $queueBodies (local.get $sweepIndex))
            (global.set $queueOwner (local.get $sweepOwner))
            ${
              frameRuns.indices.length || frameRuns.counterIndices.length
                ? `(if (i32.lt_u (i32.load offset=4 (local.get $sweepBody)) (local.get $depth)) (then
              ${frameRuns.indices
                .map((slot, index) => {
                  const address = `(i32.add (global.get $base) (i32.mul (i32.load offset=4 (local.get $sweepBody)) (i32.const ${frameRuns.frameBytes})))`;
                  return `(local.set $runByte${slot} (i32.load offset=${frameRuns.offset + index * 8} ${address})) (local.set $runLength${slot} (i32.load offset=${frameRuns.offset + index * 8 + 4} ${address}))`;
                })
                .join(" ")}
              ${frameRuns.counterIndices
                .map((slot, index) => {
                  const address = `(i32.add (global.get $base) (i32.mul (i32.load offset=4 (local.get $sweepBody)) (i32.const ${frameRuns.frameBytes})))`;
                  return `(local.set $counter${slot} (i32.load offset=${frameRuns.counterOffset + index * 4} ${address}))`;
                })
                .join(" ")}))`
                : ""
            }
            (local.set $depth (i32.load offset=4 (local.get $sweepBody)))
            ${hasInjections ? "(if (i32.and (local.get $host) (i32.gt_u (local.get $hostDepth) (local.get $depth))) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0)) (local.set $hostCurrent (i32.const -1))))" : ""}
            (call $queueShift)
            (local.set $state (i32.const ${names.indexOf(sweep.footer)}))
            ${hasContainers ? "(local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))" : ""}
            (local.set $next (i32.add (local.get $sweepPos) (local.get $sweepLen)))
            (if (i32.ne (local.get $next) (local.get $pos)) (then
              (local.set $style (i32.const ${styles.indexOf(sweep.footerStyle)})) (br $paint)))
            (br $sweepDone)))))))
      (br $sweepMore)))))`;
}
