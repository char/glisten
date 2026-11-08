/** An unsigned inclusive range test; `value` is a folded i32 expression. */
export function byteInRange(value: string, first: number, last: number): string {
  return `(i32.le_u (i32.sub ${value} (i32.const ${first})) (i32.const ${last - first}))`;
}

function chain(operator: string, terms: readonly string[], seed: string): string {
  return terms.reduce((left, right) => (left ? `(${operator} ${left} ${right})` : right), seed);
}

/** Left-fold i32 OR; an empty list returns the seed, or an empty string without one. */
export function i32Or(terms: readonly string[], seed = ""): string {
  return chain("i32.or", terms, seed);
}

/** Left-fold i32 AND; an empty list returns the seed, or an empty string without one. */
export function i32And(terms: readonly string[], seed = ""): string {
  return chain("i32.and", terms, seed);
}

/** Left-fold vector OR; an empty list returns the seed, or an empty string without one. */
export function v128Or(terms: readonly string[], seed = ""): string {
  return chain("v128.or", terms, seed);
}

/** Byte ranges for width detection and strict scalar decoding, respectively. */
export const utf8 = {
  continuation: [0x80, 0xbf],
  lead: { two: [0xc0, 0xdf], three: [0xe0, 0xef], four: [0xf0, 0xf7] },
  scalarLead: { two: [0xc2, 0xdf], three: [0xe0, 0xef], four: [0xf0, 0xf4] },
} as const;

/** Values staged in the open-action local before an injection is emitted. */
export const injectionAction = { none: 0, named: 1, static: 2 } as const;

/** A byte splat as a constant vector; engines fold it into the consuming comparison. */
export function splat(byte: number): string {
  return `(v128.const i8x16 ${Array(16).fill(byte).join(" ")})`;
}
