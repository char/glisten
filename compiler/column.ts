import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
import type { ShapeLowering } from "./effect.ts";
import type { ToColumn } from "#/grammar/column.ts";

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
  if (!matcher.ancestor)
    return matchColumnCode(`(local.get $columnSlot${slot})`, fail, done, tabStop);
  const address = `(i32.add (global.get $base) (i32.mul (i32.sub (local.get $depth) (i32.const ${matcher.ancestor})) (i32.const ${frameBytes})))`;
  return `(br_if ${fail} (i32.lt_u (local.get $depth) (i32.const ${matcher.ancestor})))\n${matchColumnCode(`(i64.load offset=${framesOffset + 4 + slot * 8} ${address})`, fail, done, tabStop)}`;
}

export function lowerCaptureColumn(slot: number): string {
  return `(local.set $columnSlot${slot} (i64.and (call $advanceColumn (local.get $input) (local.get $pos) (local.get $p) (local.get $column)) (i64.const 4611686018427387903)))`;
}

/** Match spaces and tabs through the saved physical column, including tab overshoot. */
export function matchColumnCode(
  target: string,
  fail: string,
  done: string,
  tabStop: number,
): string {
  return `(local.set $matchTarget ${target})
    (br_if ${fail} (i64.eq (local.get $matchTarget) (i64.const -1)))
    (local.set $matchColumn (i64.and (call $advanceColumn (local.get $input) (local.get $pos) (local.get $p) (local.get $column)) (i64.const 4611686018427387903)))
    (block ${done} (loop ${done}_more
      (br_if ${done} (i64.ge_u (local.get $matchColumn) (local.get $matchTarget)))
      (br_if ${fail} (i32.ge_u (local.get $p) (local.get $limit)))
      (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
      (if (i32.eq (local.get $b) (i32.const 32))
        (then (local.set $matchColumn (i64.add (local.get $matchColumn) (i64.const 1))))
        (else (if (i32.eq (local.get $b) (i32.const 9))
          (then (local.set $matchColumn (i64.and (i64.add (local.get $matchColumn) (i64.const ${tabStop})) (i64.const -${tabStop}))))
          (else (br ${fail})))))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (br ${done}_more)))`;
}

/** The low 62 bits hold the column; the high two hold UTF-8 continuations. */
export const columnFunction = (
  tabStop: number,
) => `(func $advanceColumn (param $input i32) (param $at i32) (param $end i32) (param $state i64) (result i64)
  (local $column i64) (local $continuations i64) (local $byte i32) (local $chunk v128)
  (local.set $column (i64.and (local.get $state) (i64.const 4611686018427387903)))
  (local.set $continuations (i64.shr_u (local.get $state) (i64.const 62)))
  (block $vectorDone (loop $vector
    (br_if $vectorDone (i32.lt_u (i32.sub (local.get $end) (local.get $at)) (i32.const 16)))
    (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $at))))
    (br_if $vectorDone (i32.or (i8x16.bitmask (local.get $chunk))
      (i8x16.bitmask (v128.or
        (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 9)))
        (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 10)))))))
    (local.set $column (i64.add (local.get $column) (i64.const 16)))
    (local.set $continuations (i64.const 0))
    (local.set $at (i32.add (local.get $at) (i32.const 16)))
    (br $vector)))
  (block $done (loop $next
    (br_if $done (i32.ge_u (local.get $at) (local.get $end)))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $at))))
    (block $step
      (if (i32.eq (local.get $byte) (i32.const 10)) (then
        (local.set $column (i64.const 0)) (local.set $continuations (i64.const 0)) (br $step)))
      (if (i32.eq (local.get $byte) (i32.const 9)) (then
        (local.set $column (i64.and (i64.add (local.get $column) (i64.const ${tabStop})) (i64.const -${tabStop})))
        (local.set $continuations (i64.const 0)) (br $step)))
      (if (i32.and (i64.ne (local.get $continuations) (i64.const 0)) (i32.le_u (i32.sub (local.get $byte) (i32.const 128)) (i32.const 63))) (then
        (local.set $continuations (i64.sub (local.get $continuations) (i64.const 1))) (br $step)))
      (local.set $column (i64.add (local.get $column) (i64.const 1)))
      (local.set $continuations (i64.const 0))
      (if (i32.le_u (i32.sub (local.get $byte) (i32.const 192)) (i32.const 31)) (then (local.set $continuations (i64.const 1)) (br $step)))
      (if (i32.le_u (i32.sub (local.get $byte) (i32.const 224)) (i32.const 15)) (then (local.set $continuations (i64.const 2)) (br $step)))
      (if (i32.le_u (i32.sub (local.get $byte) (i32.const 240)) (i32.const 7)) (then (local.set $continuations (i64.const 3)))))
    (local.set $at (i32.add (local.get $at) (i32.const 1)))
    (br $next)))
  (i64.or (local.get $column) (i64.shl (local.get $continuations) (i64.const 62))))`;

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
