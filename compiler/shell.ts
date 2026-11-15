import { captureLimit, type Grammar, type FooterIndent, maxDepth } from "#/grammar/mod.ts";
import { isSharedState } from "./effects.ts";
import { record } from "#/abi/mod.ts";
import { splat } from "./runtime.ts";

export const lowerCaptureReset = () => `(call $captureReset)`;
export const lowerCaptureAppend = (skip: number) =>
  `(call $captureAppend (local.get $input) (local.get $pos) (local.get $next) (i32.const ${skip}))`;
export const lowerCaptureMark = (flags: number) => `(call $captureMark (i32.const ${flags}))`;

const captureDataOffset = 8;
const captureFlagsOffset = captureDataOffset + captureLimit;
const captureLayout = {
  length: 0,
  overflow: 4,
  data: captureDataOffset,
  flags: captureFlagsOffset,
  bytes: captureFlagsOffset + 4,
} as const;
const captureBytes = captureLayout.bytes;
export const captureAreaBytes = (enabled: boolean): number => (enabled ? captureBytes : 0);

/** Lower reset to stores, append to a bounded memory.copy, and match to a bounded byte loop. */
export function captureWat(offset: number): string {
  const lengthOffset = `offset=${offset + captureLayout.length}`;
  const overflowOffset = `offset=${offset + captureLayout.overflow}`;
  const dataOffset = offset + captureLayout.data;
  const dataLoadOffset = `offset=${dataOffset}`;
  const flagsOffset = `offset=${offset + captureLayout.flags}`;
  return `(func $captureReset
      (i64.store ${lengthOffset} (global.get $base) (i64.const 0))
      (i32.store ${flagsOffset} (global.get $base) (i32.const 0)))
    (func $captureMark (param $flags i32)
      (i32.store ${flagsOffset}
        (global.get $base)
        (i32.or (i32.load ${flagsOffset} (global.get $base)) (local.get $flags))))
    (func $captureAppend (param $input i32) (param $start i32) (param $end i32) (param $skip i32)
      (local $length i32) (local $remaining i32) (local $previousLength i32)
      (if (i32.load ${overflowOffset} (global.get $base)) (then (return)))
      (if (i32.gt_u (local.get $skip) (i32.sub (local.get $end) (local.get $start)))
        (then (local.set $skip (i32.sub (local.get $end) (local.get $start)))))
      (local.set $start (i32.add (local.get $start) (local.get $skip)))
      (local.set $length (i32.sub (local.get $end) (local.get $start)))
      (local.set $previousLength (i32.load ${lengthOffset} (global.get $base)))
      (local.set $remaining (i32.sub (i32.const ${captureLimit}) (local.get $previousLength)))
      (if (i32.gt_u (local.get $length) (local.get $remaining))
        (then
          (i32.store ${overflowOffset} (global.get $base) (i32.const 1))
          (local.set $length (local.get $remaining))))
      (memory.copy
        (i32.add (i32.add (global.get $base) (i32.const ${dataOffset})) (local.get $previousLength))
        (i32.add (local.get $input) (local.get $start))
        (local.get $length))
      (i32.store ${lengthOffset} (global.get $base) (i32.add (local.get $previousLength) (local.get $length))))
    (func $captureMatch (param $input i32) (param $pos i32) (param $end i32) (result i32)
      (local $length i32) (local $index i32)
      (if (i32.load ${overflowOffset} (global.get $base)) (then (return (i32.const -1))))
      (local.set $length (i32.load ${lengthOffset} (global.get $base)))
      (if (i32.gt_u (local.get $length) (i32.sub (local.get $end) (local.get $pos)))
        (then (return (i32.const -1))))
      (block $matched (loop $compareBytes
        (br_if $matched (i32.ge_u (local.get $index) (local.get $length)))
        (if
          (i32.ne
            (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (local.get $index))))
            (i32.load8_u ${dataLoadOffset} (i32.add (global.get $base) (local.get $index))))
          (then (return (i32.const -1))))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $compareBytes)))
      (i32.add (local.get $pos) (local.get $length)))`;
}

export function lowerCaptured(fail: string): string {
  return `(local.set $matchCursor (call $captureMatch (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}

const dollar = "$".charCodeAt(0);
const openParen = "(".charCodeAt(0);
const closeParen = ")".charCodeAt(0);
const openBrace = "{".charCodeAt(0);
const closeBrace = "}".charCodeAt(0);
const singleQuote = "'".charCodeAt(0);
const doubleQuote = '"'.charCodeAt(0);
const backtick = "`".charCodeAt(0);
const backslash = "\\".charCodeAt(0);
const newline = "\n".charCodeAt(0);
const groupKind = { parentheses: 0, braces: 1, arithmetic: 2, backtick: 3 } as const;
const maxNestedDepth = 2;

export const groupWat = `
  (func $groupNested (param $input i32) (param $cursor i32) (param $end i32) (param $depth i32)
    (result i32)
    (local $byte i32) (local $nextByte i32)
    (if (i32.or (i32.eqz (local.get $depth)) (i32.ge_u (local.get $cursor) (local.get $end)))
      (then (return (i32.const -1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if
      (i32.and
        (i32.eq (local.get $byte) (i32.const ${dollar}))
        (i32.lt_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
      (then
        (local.set $nextByte
          (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1)))))
        (if (i32.or (i32.eq (local.get $nextByte) (i32.const ${openParen})) (i32.eq (local.get $nextByte) (i32.const ${openBrace})))
          (then
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.eq (local.get $nextByte) (i32.const ${openBrace}))
                (i32.sub (local.get $depth) (i32.const 1))))))))
    (if (i32.eq (local.get $byte) (i32.const ${openParen}))
      (then
        (return
          (call $groupBody
            (local.get $input)
            (i32.add (local.get $cursor) (i32.const 1))
            (local.get $end)
            (i32.const ${groupKind.parentheses})
            (i32.sub (local.get $depth) (i32.const 1))))))
    (i32.const -1))
  (func $groupQuote (param $input i32) (param $cursor i32) (param $end i32) (param $quote i32)
    (param $depth i32) (result i32)
    (local $byte i32) (local $next i32)
    (block $fail (loop $more
      (br_if $fail (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (if (i32.eq (local.get $byte) (local.get $quote))
        (then (return (i32.add (local.get $cursor) (i32.const 1)))))
      (br_if $fail (i32.eq (local.get $byte) (i32.const ${newline})))
      (if
        (i32.and (i32.eq (local.get $byte) (i32.const ${backslash})) (i32.ne (local.get $quote) (i32.const ${singleQuote})))
        (then
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.eq
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${newline})))
          (local.set $cursor (i32.add (local.get $cursor) (i32.const 2)))
          (br $more)))
      (if (i32.eq (local.get $quote) (i32.const ${doubleQuote}))
        (then
          (local.set $next
            (call $groupNested
              (local.get $input)
              (local.get $cursor)
              (local.get $end)
              (local.get $depth)))
          (if (i32.ge_s (local.get $next) (i32.const 0))
            (then
              (local.set $cursor (local.get $next))
              (br $more)))))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
      (br $more)))
    (i32.const -1))
  (func $groupBody (param $input i32) (param $cursor i32) (param $end i32) (param $kind i32)
    (param $depth i32) (result i32)
    (local $byte i32) (local $closing i32) (local $next i32)
    (local.set $closing
      (if (result i32) (i32.eq (local.get $kind) (i32.const ${groupKind.braces}))
        (then (i32.const ${closeBrace}))
        (else
          (if (result i32) (i32.eq (local.get $kind) (i32.const ${groupKind.backtick}))
            (then (i32.const ${backtick}))
            (else (i32.const ${closeParen}))))))
    (block $fail (loop $more
      (br_if $fail (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (if (i32.eq (local.get $byte) (local.get $closing))
        (then
          (if (i32.ne (local.get $kind) (i32.const ${groupKind.arithmetic}))
            (then (return (i32.add (local.get $cursor) (i32.const 1)))))
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.ne
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${closeParen})))
          (return (i32.add (local.get $cursor) (i32.const 2)))))
      (br_if $fail (i32.eq (local.get $byte) (i32.const ${newline})))
      (if (i32.eq (local.get $byte) (i32.const ${backslash}))
        (then
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.eq
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${newline})))
          (local.set $cursor (i32.add (local.get $cursor) (i32.const 2)))
          (br $more)))
      (if
        (i32.or
          (i32.eq (local.get $byte) (i32.const ${singleQuote}))
          (i32.or (i32.eq (local.get $byte) (i32.const ${doubleQuote})) (i32.eq (local.get $byte) (i32.const ${backtick}))))
        (then
          (local.set $next
            (call $groupQuote
              (local.get $input)
              (i32.add (local.get $cursor) (i32.const 1))
              (local.get $end)
              (local.get $byte)
              (local.get $depth)))
          (br_if $fail (i32.lt_s (local.get $next) (i32.const 0)))
          (local.set $cursor (local.get $next))
          (br $more)))
      (local.set $next
        (call $groupNested (local.get $input) (local.get $cursor) (local.get $end) (local.get $depth)))
      (local.set $cursor
        (if (result i32) (i32.ge_s (local.get $next) (i32.const 0))
          (then (local.get $next))
          (else (i32.add (local.get $cursor) (i32.const 1)))))
      (br $more)))
    (i32.const -1))
  (func $group (param $input i32) (param $cursor i32) (param $end i32) (result i32)
    (local $byte i32) (local $nextByte i32) (local $result i32)
    (if (i32.ge_u (local.get $cursor) (local.get $end)) (then (return (i32.const -1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if
      (i32.and
        (i32.eq (local.get $byte) (i32.const ${dollar}))
        (i32.lt_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
      (then
        (local.set $nextByte
          (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1)))))
        (if (i32.eq (local.get $nextByte) (i32.const ${openParen}))
          (then
            (if (i32.lt_u (i32.add (local.get $cursor) (i32.const 2)) (local.get $end))
              (then
                (if
                  (i32.eq
                    (i32.load8_u
                      (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 2))))
                    (i32.const ${openParen}))
                  (then
                    (local.set $result
                      (call $groupBody
                        (local.get $input)
                        (i32.add (local.get $cursor) (i32.const 3))
                        (local.get $end)
                        (i32.const ${groupKind.arithmetic})
                        (i32.const ${maxNestedDepth})))
                    (if (i32.ge_s (local.get $result) (i32.const 0))
                      (then (return (local.get $result))))))))
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.const ${groupKind.parentheses})
                (i32.const ${maxNestedDepth})))))
        (if (i32.eq (local.get $nextByte) (i32.const ${openBrace}))
          (then
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.const ${groupKind.braces})
                (i32.const ${maxNestedDepth})))))))
    (if (i32.eq (local.get $byte) (i32.const ${backtick}))
      (then
        (return
          (call $groupBody
            (local.get $input)
            (i32.add (local.get $cursor) (i32.const 1))
            (local.get $end)
            (i32.const ${groupKind.backtick})
            (i32.const ${maxNestedDepth})))))
    (i32.const -1))`;

export function lowerGroup(fail: string): string {
  return `(local.set $matchCursor (call $group (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}

export const lowerQueueAction = (kind: "queueEnter" | "queueLeave" | "queueShift"): string => {
  const action = `$${kind}`;
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

export const lowerQueueSave = (footerIndent: FooterIndent) => {
  const flags = footerIndentFlags[footerIndent];
  return `(call $queueSave (local.get $out) (i32.const ${flags}))`;
};

export const lowerQueueOpen = () => `(call $queueOpen (local.get $depth))`;

const queueOwnerBytes = maxDepth * queuePairBytes;
const queueBodyBytes = maxDepth * queuePairBytes;

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
  const vectorBytes = 16;
  const inputByte = `(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $index))))`;
  const delimiterByte = `(i32.load8_u (i32.add (local.get $delimiter) (local.get $index)))`;
  const vectorScan = `(block $scalarTail (loop $compareVectors
      (br_if $scalarTail (i32.lt_u (i32.sub (local.get $delimiterLength) (local.get $index)) (i32.const ${vectorBytes})))
      (local.set $chunk
        (v128.load (i32.add (local.get $input) (i32.add (local.get $start) (local.get $index)))))
      (if
        (i8x16.bitmask
          (v128.or
            (i8x16.eq (local.get $chunk) ${splat(newline)})
            (i8x16.ne
              (local.get $chunk)
              (v128.load (i32.add (local.get $delimiter) (local.get $index))))))
        (then (return (i32.const 0))))
      (local.set $index (i32.add (local.get $index) (i32.const ${vectorBytes})))
      (br $compareVectors)))`;
  const footer = `(func $heredocFooter (param $input i32) (param $start i32) (param $end i32)
    (param $delimiter i32) (param $delimiterLength i32) (result i32)
    (local $index i32)
    (local $chunk v128)
    (if
      (i32.or
        (i32.lt_s (local.get $delimiterLength) (i32.const 0))
        (i32.gt_u (local.get $delimiterLength) (i32.sub (local.get $end) (local.get $start))))
      (then (return (i32.const 0))))
    (if (i32.ne (i32.add (local.get $start) (local.get $delimiterLength)) (local.get $end))
      (then
        (if
          (i32.ne
            (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $delimiterLength))))
            (i32.const ${newline}))
          (then (return (i32.const 0))))))
    ${vectorScan}
    (block $matched (loop $compareBytes
      (br_if $matched (i32.ge_u (local.get $index) (local.get $delimiterLength)))
      (if
        (i32.or
          (i32.eq
            ${inputByte}
            (i32.const ${newline}))
          (i32.ne
            ${inputByte}
            ${delimiterByte}))
        (then (return (i32.const 0))))
      (local.set $index (i32.add (local.get $index) (i32.const 1)))
      (br $compareBytes)))
    (i32.const 1))`;
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

export function lowerQueueHas(mask: number, flags: number, fail: string): string {
  return `(br_if ${fail} (i32.eqz (call $queueHas (i32.const ${mask}) (i32.const ${flags}))))`;
}

export function lowerQueueFooter(fail: string): string {
  return `(local.set $matchCursor (call $queueFooter (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}

export function lowerQueueText(fail: string): string {
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
