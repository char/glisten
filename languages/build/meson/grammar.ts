import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  on,
  oneOf,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const keywords = keywordTable(
  `
    if elif else endif foreach endforeach and or not in continue break
  `
    .trim()
    .split(/\s+/),
  "keyword",
);
const cases = [
  { text: "foreach", then: [paint("keyword"), pushState("foreachNames")] },
  ...keywords.filter(({ text }) => text !== "foreach"),
  ...keywordTable(["true", "false"], "constant.builtin"),
];
const whitespace = bytes(" \t\r\n", { min: 0 });
const interpolation = on("@", literal("@"), ...ident, literal("@"), paint("punctuation.special"));
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [bytes(range("0", "7"), { min: 1, max: 3 })],
    [literal("N{"), bytes(except(byteSet({ ranges: [[0, 255]] }), "}")), literal("}")],
    [byte("\\'abfnrtv")],
  ),
  paint("string.escape"),
);
const singleArms = [
  escape,
  on("\\", literal("\\"), character(), paint("string")),
  token("'", "string", popState()),
];

// Call and keyword-argument lookahead does not cross comments or continuations.
// Format substitutions are recognized in source, not after decoding escapes;
// escape values and continuation-line syntax are not validated.
const syntax = (context: "expression" | "call") => [
  token("#", "comment", pushState("comment")),
  token("f'''", "string", pushState("formatMultiline")),
  token("f'", "string", pushState("formatSingle")),
  token("'''", "string", pushState("multiline")),
  token("'", "string", pushState("single")),
  on(
    digit,
    choice(
      [literal("0"), byte("xX"), bytes(hex)],
      [literal("0"), byte("oO"), bytes(range("0", "7"))],
      [literal("0"), byte("bB"), bytes("01")],
      [literal("0")],
      [byte(range("1", "9")), bytes(digit, { min: 0 })],
    ),
    paint("number"),
  ),
  on(
    start,
    ...ident,
    lookahead(whitespace, literal("(")),
    classify(cases, [paint("function"), pushState("callOpen")]),
  ),
  ...(context === "call"
    ? [
        on(
          start,
          ...ident,
          lookahead(whitespace, literal(":")),
          classify(cases, [paint("property")]),
        ),
      ]
    : []),
  on(start, ...ident, classify(cases, [paint("variable")])),
  ...["+=", "==", "!=", "<=", ">="].map((s) => token(s, "operator")),
  token("?", "operator", pushState("ternary")),
  token(oneOf("+-*/%<>="), "operator"),
  token("(", "punctuation.bracket", pushState("parentheses")),
  token("[", "punctuation.bracket", pushState("array")),
  token("{", "punctuation.bracket", pushState("dictionary")),
  token(oneOf(")]}"), "punctuation.bracket"),
  token(oneOf(",.:"), "punctuation.delimiter"),
  token("\\", "punctuation.special"),
];

export default defineGrammar({
  name: "meson",
  extensions: ["meson"],
  filenames: ["meson.build", "meson.options", "meson_options.txt"],
  initial: "root",
  states: {
    root: { style: "plain", arms: syntax("expression") },
    callOpen: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("(", "punctuation.bracket", setState("call")),
      ],
    },
    call: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...syntax("call")],
    },
    parentheses: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...syntax("expression")],
    },
    array: {
      style: "plain",
      arms: [token("]", "punctuation.bracket", popState()), ...syntax("expression")],
    },
    dictionary: {
      style: "plain",
      arms: [token("}", "punctuation.bracket", popState()), ...syntax("expression")],
    },
    ternary: {
      style: "plain",
      arms: [token(":", "punctuation.delimiter", popState()), ...syntax("expression")],
    },
    foreachNames: {
      style: "plain",
      arms: [
        on(start, ...ident, paint("variable")),
        token(",", "punctuation.delimiter"),
        token(":", "punctuation.delimiter", popState()),
        token("#", "comment", pushState("comment")),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    single: { style: "string", arms: singleArms },
    formatSingle: { style: "string", arms: [interpolation, ...singleArms] },
    multiline: { style: "string", arms: [token("'''", "string", popState())] },
    formatMultiline: {
      style: "string",
      arms: [interpolation, token("'''", "string", popState())],
    },
  },
});
