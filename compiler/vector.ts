/** A byte splat as a constant vector; engines fold it into the consuming comparison. */
export const splat = (byte: number): string =>
  `(v128.const i8x16 ${Array(16).fill(byte).join(" ")})`;
