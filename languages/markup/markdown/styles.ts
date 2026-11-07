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
 * its own style when replayed, and an unresolved delimiter run.
 */
export const kind = { leading: -2, delimiterRun: -3 } as const;
