import { bytesOf, type ByteSet } from "./bytes.ts";

/** A run of one selected byte, allowing separators between and after occurrences. */
export type SeparatedRun = {
  readonly kind: "separatedRun";
  readonly set: ByteSet;
  readonly separators: ByteSet;
  readonly min: number;
};

export const separatedRun = (set: ByteSet, separators: ByteSet, min = 1): SeparatedRun => {
  bytesOf(set);
  bytesOf(separators);
  checkSeparatedRunMinimum(min);
  return { kind: "separatedRun", set, separators, min };
};

export function checkSeparatedRunMinimum(min: number): void {
  if (!Number.isSafeInteger(min) || min < 1 || min > 0x7fffffff)
    throw new RangeError("Invalid separated run minimum");
}
