import { wat, type Part } from "#/testing/wat/mod.ts";

/** Pack a queued-range index and byte position into the high and low words of a logical cursor. */
export function packCursor(index: Part, position: Part) {
  return wat`(i64.or
    (i64.shl (i64.extend_i32_u ${index}) (i64.const 32))
    (i64.extend_i32_u ${position}))`;
}

/** Extract the queued-range index from a logical cursor. */
export function cursorIndex(cursor: Part) {
  return wat`(i32.wrap_i64 (i64.shr_u ${cursor} (i64.const 32)))`;
}

/** Extract the byte position from a logical cursor. */
export function cursorPosition(cursor: Part) {
  return wat`(i32.wrap_i64 ${cursor})`;
}
