export type ByteSet = string | { readonly bytes: readonly number[] };

function checkedByte(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new RangeError("Byte values must be integers from 0 to 255");
  return value;
}

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

export const utf8Bytes = (text: string): ByteSet =>
  byteSet({ bytes: [...new TextEncoder().encode(text)] });

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

export const ascii = (text: string): ByteSet => byteSet({ bytes: bytesOf(text) });

export const union = (...sets: readonly ByteSet[]): ByteSet =>
  byteSet({ bytes: sets.flatMap(bytesOf) });
export const intersection = (first: ByteSet, ...rest: readonly ByteSet[]): ByteSet => {
  const others = rest.map((set) => new Set(bytesOf(set)));
  return byteSet({ bytes: bytesOf(first).filter((byte) => others.every((set) => set.has(byte))) });
};
export const except = (first: ByteSet, ...excluded: readonly ByteSet[]): ByteSet => {
  const removed = new Set(excluded.flatMap(bytesOf));
  return byteSet({ bytes: bytesOf(first).filter((byte) => !removed.has(byte)) });
};

export function bytesOf(set: ByteSet): number[] {
  if (typeof set === "string") {
    const bytes = [...set].map((character) => character.codePointAt(0)!);
    if (bytes.some((byte) => byte > 0x7f)) throw new RangeError("Expected ASCII characters");
    return [...new Set(bytes)].sort((a, b) => a - b);
  }
  return [...new Set(set.bytes.map(checkedByte))].sort((a, b) => a - b);
}

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

export type CharRanges = readonly (readonly [number, number])[];

export function checkCharRanges(ranges: CharRanges): void {
  if (!Array.isArray(ranges)) throw new RangeError("Expected Unicode code-point ranges");
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2)
      throw new RangeError("Invalid Unicode code-point range");
    const [start, end] = range;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      end > 0x10ffff
    )
      throw new RangeError("Invalid Unicode code-point range");
  }
}

export function checkSeparatedRunMinimum(min: number): void {
  if (!Number.isSafeInteger(min) || min < 1 || min > 0x7fffffff)
    throw new RangeError("Invalid separated run minimum");
}
