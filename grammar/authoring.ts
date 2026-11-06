import { on } from "./arm.ts";
import { byte, byteSet, bytesOf, literal, type ByteSet } from "./bytes.ts";
import { paint } from "./record.ts";
import type { Arm, Effect } from "./mod.ts";
import type { Style } from "./styles.ts";

type OneOf = { readonly kind: "oneOf"; readonly set: ByteSet };

/** Select one byte from a set. */
export function oneOf(set: ByteSet): OneOf {
  bytesOf(set);
  return { kind: "oneOf", set };
}

/** Match and paint a literal or a single selected byte. */
export function token(pattern: string | OneOf, style: Style, ...effects: Effect[]): Arm {
  if (typeof pattern !== "string")
    return on(pattern.set, byte(pattern.set), paint(style), ...effects);
  const first = new TextEncoder().encode(pattern)[0];
  if (first === undefined) throw new Error("A token cannot be empty");
  return on(
    first < 128 ? String.fromCharCode(first) : byteSet({ bytes: [first] }),
    literal(pattern),
    paint(style),
    ...effects,
  );
}

/** Build classification cases in the order of the supplied words. */
export function keywordTable(
  words: readonly string[],
  style: Style,
  effects: (word: string) => readonly Effect[] = () => [],
): { text: string; then: Effect[] }[] {
  return words.map((text) => ({ text, then: [paint(style), ...effects(text)] }));
}
