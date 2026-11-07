import { styleEntry, type Style } from "#/grammar/styles.ts";
import { wat } from "#/testing/wat/mod.ts";

const names = [
  "plain",
  "text.title",
  "punctuation.delimiter",
  "text.literal",
  "label",
  "punctuation.special",
  "text.reference",
  "text.uri",
  "string",
  "string.escape",
  "text.emphasis",
  "text.strong",
  "text.strikethrough",
] as const satisfies readonly Style[];

type Name = (typeof names)[number];

/** The manifest's styles, with glisten's tags; ids are indices into this list. */
export const manifestStyles = names.map(styleEntry);

/** A style's id. */
export const styleId = (name: Name): number => names.indexOf(name);

/** A style's id as a WAT constant. */
export const styled = (name: Name) => wat`(i32.const ${styleId(name)})`;

/**
 * Queue and event kinds that are never rendered: leading whitespace that keeps
 * its own style when replayed, unresolved delimiter runs and brackets, inline text,
 * a resolved link's opening bracket and its tail from `]` onwards, and container
 * indentation, which isn't inline content but takes the style around it.
 */
export const kind = {
  leading: -2,
  delimiterRun: -3,
  inlineText: -4,
  inlineBracket: -5,
  linkOpen: -6,
  linkTail: -7,
  indent: -8,
} as const;
