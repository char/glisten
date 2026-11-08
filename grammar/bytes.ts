import type { Matcher } from "./mod.ts";

/** An ASCII string shorthand or an explicitly constructed set of bytes. */
export type ByteSet = string | { readonly bytes: readonly number[] };

export type ByteMatcher =
  | { readonly kind: "literal"; readonly text: string }
  | { readonly kind: "one"; readonly set: ByteSet }
  | { readonly kind: "character" }
  | {
      readonly kind: "run";
      readonly set: ByteSet;
      readonly min: number;
      readonly max?: number;
      readonly untilColumn?: number;
    };

/** Bytes of a literal. */
export const literal = (text: string): Matcher => ({ kind: "literal", text });
/** One byte in a set. */
export const byte = (set: ByteSet): Matcher => {
  bytesOf(set);
  return { kind: "one", set };
};
/** One segment-bounded UTF-8 character. */
export const character = (): Matcher => ({ kind: "character" });
/** A maximal run of bytes in a set, limited by `max` or `untilColumn` when supplied. */
export const bytes = (
  set: ByteSet,
  options: { min?: number; max?: number; untilColumn?: number } = {},
): Matcher => {
  const { min = 1, max, untilColumn } = options;
  bytesOf(set);
  checkRunBounds(min, max);
  if (untilColumn !== undefined) checkColumn(untilColumn);
  return {
    kind: "run",
    set,
    min,
    ...(max === undefined ? {} : { max }),
    ...(untilColumn === undefined ? {} : { untilColumn }),
  };
};

export function checkColumn(column: number): void {
  if (!Number.isSafeInteger(column) || column < 0 || column > 0x7fffffff)
    throw new RangeError("Column must be an integer from 0 to 2,147,483,647");
}

export function checkRunBounds(min: number, max?: number): void {
  if (
    !Number.isSafeInteger(min) ||
    min < 0 ||
    min > 0x7fffffff ||
    (max !== undefined && (!Number.isSafeInteger(max) || max < min || max > 0x7fffffff))
  )
    throw new RangeError("Invalid run bounds");
}
function checkedByte(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new RangeError("Byte values must be integers from 0 to 255");
  return value;
}

/** Construct a byte set from explicit byte values and inclusive byte ranges. */
export function byteSet(options: {
  bytes?: readonly number[];
  ranges?: readonly (readonly [number, number])[];
}): ByteSet {
  const members = new Set((options.bytes ?? []).map(checkedByte));
  for (const [start, end] of options.ranges ?? []) {
    checkedByte(start);
    checkedByte(end);
    if (start > end) throw new RangeError("Byte range start must not exceed its end");
    for (let byte = start; byte <= end; byte++) members.add(byte);
  }
  return Object.freeze({ bytes: Object.freeze([...members].sort((a, b) => a - b)) });
}

/** Encode a string as UTF-8 bytes and use those bytes as set members. */
export const utf8Bytes = (text: string): ByteSet =>
  byteSet({ bytes: [...new TextEncoder().encode(text)] });

/** Construct an inclusive range from single ASCII endpoints. */
export function range(start: string, end: string): ByteSet {
  if (
    start.length !== 1 ||
    end.length !== 1 ||
    start.charCodeAt(0) > 0x7f ||
    end.charCodeAt(0) > 0x7f
  )
    throw new RangeError("Range endpoints must be single ASCII characters");
  return byteSet({ ranges: [[start.charCodeAt(0), end.charCodeAt(0)]] });
}

/** Construct a set from ASCII characters, rejecting non-ASCII input. */
export const ascii = (text: string): ByteSet => byteSet({ bytes: bytesOf(text) });

/** Construct the union of byte sets. */
export const union = (...sets: readonly ByteSet[]): ByteSet =>
  byteSet({ bytes: sets.flatMap(bytesOf) });
/** Construct the bytes present in every supplied set. */
export const intersection = (first: ByteSet, ...rest: readonly ByteSet[]): ByteSet => {
  const others = rest.map((set) => new Set(bytesOf(set)));
  return byteSet({ bytes: bytesOf(first).filter((byte) => others.every((set) => set.has(byte))) });
};
/** Remove all bytes in the excluded sets from the first set. */
export const except = (first: ByteSet, ...excluded: readonly ByteSet[]): ByteSet => {
  const removed = new Set(excluded.flatMap(bytesOf));
  return byteSet({ bytes: bytesOf(first).filter((byte) => !removed.has(byte)) });
};

/** The members of a byte set, ascending. */
export function bytesOf(set: ByteSet): number[] {
  if (typeof set === "string") {
    const bytes = [...set].map((character) => character.codePointAt(0)!);
    if (bytes.some((byte) => byte > 0x7f)) throw new RangeError("Expected ASCII characters");
    return [...new Set(bytes)].sort((a, b) => a - b);
  }
  return [...new Set(set.bytes.map(checkedByte))].sort((a, b) => a - b);
}
