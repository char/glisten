import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import type { ShapeLowering } from "./effect.ts";
import type { ToColumn } from "#/grammar/column.ts";
import { byteInRange, splat, utf8 } from "./idioms.ts";

const continuationBits = 2;
const columnBits = 64 - continuationBits;
const frameStateBytes = 4;
const columnSlotBytes = 8;
const vectorBytes = 16;
/** Mask for the physical column in a packed column/UTF-8 state. */
export const columnValueMask = (1n << BigInt(columnBits)) - 1n;

function physicalColumn(state: string): string {
  return `(i64.and ${state} (i64.const ${columnValueMask}))`;
}

export const lowerColumnAction: ShapeLowering<"captureColumn"> = (op, _i, context) =>
  lowerCaptureColumn(context.columns.indexOf(op.slot.name));

export function lowerToColumn(
  matcher: ToColumn,
  slot: number,
  fail: string,
  done: string,
  frameBytes: number,
  framesOffset: number,
  tabStop: number,
): string {
  const columnSlot = `$columnSlot${slot}`;
  const { ancestor } = matcher;
  if (!ancestor) return matchColumnCode(`(local.get ${columnSlot})`, fail, done, tabStop);
  const address = `(i32.add
    (global.get $base)
    (i32.mul (i32.sub (local.get $depth) (i32.const ${ancestor})) (i32.const ${frameBytes})))`;
  const offset = `offset=${framesOffset + frameStateBytes + slot * columnSlotBytes}`;
  const target = `(i64.load ${offset} ${address})`;
  const match = matchColumnCode(target, fail, done, tabStop);
  return `(br_if ${fail} (i32.lt_u (local.get $depth) (i32.const ${ancestor}))) ${match}`;
}

export function lowerCaptureColumn(slot: number): string {
  const columnSlot = `$columnSlot${slot}`;
  const advanced =
    "(call $advanceColumn (local.get $input) (local.get $pos) (local.get $matchCursor) (local.get $column))";
  const column = physicalColumn(advanced);
  return `(local.set ${columnSlot} ${column})`;
}

/** Match spaces and tabs through the saved physical column, including tab overshoot. */
export function matchColumnCode(
  target: string,
  fail: string,
  done: string,
  tabStop: number,
): string {
  const more = `${done}_more`;
  const tabMask = -tabStop;
  const advanced =
    "(call $advanceColumn (local.get $input) (local.get $pos) (local.get $matchCursor) (local.get $column))";
  const column = physicalColumn(advanced);
  const space = 0x20;
  const tab = 0x09;
  return `(local.set $matchTarget ${target})
    (br_if ${fail} (i64.eq (local.get $matchTarget) (i64.const -1)))
    (local.set $matchColumn ${column})
    (block ${done} (loop ${more}
      (br_if ${done} (i64.ge_u (local.get $matchColumn) (local.get $matchTarget)))
      (br_if ${fail} (i32.ge_u (local.get $matchCursor) (local.get $limit)))
      (local.set $matchByte (i32.load8_u (i32.add (local.get $input) (local.get $matchCursor))))
      (if (i32.eq (local.get $matchByte) (i32.const ${space}))
        (then (local.set $matchColumn (i64.add (local.get $matchColumn) (i64.const 1))))
        (else
          (if (i32.eq (local.get $matchByte) (i32.const ${tab}))
            (then
              (local.set $matchColumn
                (i64.and
                  (i64.add (local.get $matchColumn) (i64.const ${tabStop}))
                  (i64.const ${tabMask}))))
            (else (br ${fail})))))
      (local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))
      (br ${more})))`;
}

/** The low 62 bits hold the column; the high two hold UTF-8 continuations. */
export const columnFunction = (tabStop: number) => {
  const tabMask = -tabStop;
  const tab = 0x09;
  const newline = 0x0a;
  const byte = "(local.get $byte)";
  const continuationByte = byteInRange(byte, ...utf8.continuation);
  const twoByteLead = byteInRange(byte, ...utf8.lead.two);
  const threeByteLead = byteInRange(byte, ...utf8.lead.three);
  const fourByteLead = byteInRange(byte, ...utf8.lead.four);
  const initialColumn = physicalColumn("(local.get $columnState)");
  return `(func $advanceColumn (param $input i32) (param $cursor i32) (param $end i32)
    (param $columnState i64) (result i64)
    (local $column i64) (local $continuations i64) (local $byte i32) (local $chunk v128)
    (local.set $column ${initialColumn})
    (local.set $continuations (i64.shr_u (local.get $columnState) (i64.const ${columnBits})))
    (block $vectorDone (loop $vector
      (br_if $vectorDone (i32.lt_u (i32.sub (local.get $end) (local.get $cursor)) (i32.const ${vectorBytes})))
      (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $cursor))))
      (br_if $vectorDone
        (i32.or
          (i8x16.bitmask (local.get $chunk))
          (i8x16.bitmask
            (v128.or
              (i8x16.eq (local.get $chunk) ${splat(tab)})
              (i8x16.eq (local.get $chunk) ${splat(newline)})))))
      (local.set $column (i64.add (local.get $column) (i64.const ${vectorBytes})))
      (local.set $continuations (i64.const 0))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const ${vectorBytes})))
      (br $vector)))
    (block $done (loop $next
      (br_if $done (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (block $step
        (if (i32.eq (local.get $byte) (i32.const ${newline}))
          (then
            (local.set $column (i64.const 0))
            (local.set $continuations (i64.const 0))
            (br $step)))
        (if (i32.eq (local.get $byte) (i32.const ${tab}))
          (then
            (local.set $column
              (i64.and (i64.add (local.get $column) (i64.const ${tabStop})) (i64.const ${tabMask})))
            (local.set $continuations (i64.const 0))
            (br $step)))
        (if
          (i32.and
            (i64.ne (local.get $continuations) (i64.const 0))
            ${continuationByte})
          (then
            (local.set $continuations (i64.sub (local.get $continuations) (i64.const 1)))
            (br $step)))
        (local.set $column (i64.add (local.get $column) (i64.const 1)))
        (local.set $continuations (i64.const 0))
        (if ${twoByteLead}
          (then
            (local.set $continuations (i64.const 1))
            (br $step)))
        (if ${threeByteLead}
          (then
            (local.set $continuations (i64.const 2))
            (br $step)))
        (if ${fourByteLead}
          (then (local.set $continuations (i64.const 3)))))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
      (br $next)))
    (i64.or (local.get $column) (i64.shl (local.get $continuations) (i64.const ${columnBits}))))`;
};

export function lowerColumnMatcher(
  m: Extract<Matcher, { kind: "toColumn" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, columns, frameBytes, framesOffset, tabStop } = context;
  return lowerToColumn(
    m,
    columns.indexOf(m.slot.name),
    fail,
    fresh("column"),
    frameBytes,
    framesOffset,
    tabStop,
  );
}
