/** The language-facing style vocabulary (docs/styles.md). */
export const styles = [
  "plain",
  "comment",
  "keyword",
  "string",
  "string.escape",
  "number",
  "constant.builtin",
  "variable",
  "variable.member",
  "property",
  "function",
  "operator",
  "punctuation.bracket",
  "punctuation.delimiter",
  "punctuation.special",
  "label",
  "text.title",
  "text.strong",
  "text.emphasis",
  "text.literal",
  "text.uri",
  "text.reference",
  "text.strikethrough",
  "error",
  "type",
  "tag",
  "attribute",
  "constant.color",
  "diff.plus",
  "diff.minus",
] as const;

/** HTML tags for styles, rendered as `<g-TAG>` (docs/styles.md). */
export const styleTags: Partial<Record<(typeof styles)[number], string>> = {
  comment: "c",
  keyword: "k",
  string: "s",
  "string.escape": "se",
  number: "n",
  "constant.builtin": "cb",
  variable: "v",
  "variable.member": "vm",
  property: "pr",
  function: "f",
  operator: "o",
  "punctuation.bracket": "pb",
  "punctuation.delimiter": "pd",
  "punctuation.special": "ps",
  label: "l",
  "text.title": "tt",
  "text.strong": "ts",
  "text.emphasis": "em",
  "text.literal": "tl",
  "text.uri": "tu",
  "text.reference": "tr",
  "text.strikethrough": "tx",
  error: "er",
  type: "t",
  tag: "tg",
  attribute: "at",
  "diff.plus": "da",
  "diff.minus": "dd",
  "constant.color": "co",
};

/** Optional HTML attributes for group styles. */
export const styleAttributes: Partial<Record<(typeof styles)[number], string>> = {
  "constant.color": "v",
};

/** A style name recognized by grammars. */
export type Style = (typeof styles)[number];

/** Manifest representation of a vocabulary style. */
export function styleEntry(name: Style): { name: Style; tag?: string; attribute?: string } {
  const tag = styleTags[name];
  const attribute = styleAttributes[name];
  return {
    name,
    ...(tag === undefined ? {} : { tag }),
    ...(attribute === undefined ? {} : { attribute }),
  };
}
