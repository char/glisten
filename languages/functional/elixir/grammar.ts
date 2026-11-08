import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const start = union(lower, upper, "_", high);
const rest = union(start, digit);
const name = [byte(start), bytes(rest, { min: 0 }), optional(byte("?!"))];
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = (set = digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const keywords = `
  after alias and case catch cond def defdelegate defexception defguard defguardp defimpl defmacro
  defmacrop defmodule defoverridable defp defprotocol defstruct do else end fn for if import in
  not or quote raise receive require rescue reraise super throw try unless unquote
  unquote_splicing use when with
`
  .trim()
  .split(/\s+/);
const defining = `
  def defp defmacro defmacrop defguard defguardp defdelegate
`
  .trim()
  .split(/\s+/);
const cases = [
  ...defining.map((text) => ({ text, then: [paint("keyword"), pushState("definition")] })),
  ...keywordTable(
    keywords.filter((text) => !defining.includes(text)),
    "keyword",
  ),
  ...keywordTable(["true", "false", "nil"], "constant.builtin"),
];
const comment = token("#", "comment", pushState("comment"));
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("x"), byte(hex), byte(hex)],
    [character()],
  ),
  paint("string.escape"),
);
const interpolation = token("#{", "punctuation.special", pushState("interpolation"));
const number = on(
  digit,
  choice(
    [literal("0x"), ...digits(hex)],
    [literal("0o"), ...digits("01234567")],
    [literal("0b"), ...digits("01")],
    [
      ...digits(),
      optional(literal("."), ...digits()),
      optional(byte("eE"), optional(byte("+-")), ...digits()),
    ],
  ),
  paint("number"),
);
const sigils = [
  ["/", "/", "Slash"],
  ["|", "|", "Pipe"],
  ['"', '"', "Double"],
  ["'", "'", "Single"],
  ["(", ")", "Paren"],
  ["[", "]", "Square"],
  ["{", "}", "Brace"],
  ["<", ">", "Angle"],
] as const;
const sigilOpeners = sigils.flatMap(([open, , suffix]) => [
  ...(open === '"' || open === "'"
    ? [
        on(
          "~",
          literal("~"),
          byte(lower),
          literal(open.repeat(3)),
          paint("string"),
          pushState(`sigilInterpolatedTriple${suffix}`),
        ),
        on(
          "~",
          literal("~"),
          byte(upper),
          bytes(union(upper, digit), { min: 0 }),
          literal(open.repeat(3)),
          paint("string"),
          pushState(`sigilRawTriple${suffix}`),
        ),
      ]
    : []),
  on(
    "~",
    literal("~"),
    byte(lower),
    literal(open),
    paint("string"),
    pushState(`sigilInterpolated${suffix}`),
  ),
  on(
    "~",
    literal("~"),
    byte(upper),
    bytes(union(upper, digit), { min: 0 }),
    literal(open),
    paint("string"),
    pushState(`sigilRaw${suffix}`),
  ),
]);
const sigilStates: Record<string, State> = {};
for (const [open, close, suffix] of sigils) {
  for (const mode of ["Interpolated", "Raw"]) {
    const state = `sigil${mode}${suffix}`;
    const content =
      mode === "Interpolated"
        ? [escape, interpolation]
        : [on("\\", literal("\\"), literal(close), paint("string"))];
    sigilStates[state] = {
      style: "string",
      arms: [...content, token(close, "string", setState("sigilModifiers"))],
    };
    if (open === '"' || open === "'")
      sigilStates[`sigil${mode}Triple${suffix}`] = {
        style: "string",
        arms: [...content, token(close.repeat(3), "string", setState("sigilModifiers"))],
      };
  }
}
// Identifier Unicode categories, escape validity and context-sensitive no-parentheses calls are approximated lexically.
// Heredoc delimiters are not restricted to indentation-only lines. Uppercase sigils are raw,
// but an escaped closing delimiter is consumed as raw text; module docs are strings, not injected Markdown.
const code = [
  comment,
  ...sigilOpeners,
  token('"""', "string", pushState("heredocDouble")),
  token("'''", "string", pushState("heredocSingle")),
  token('"', "string", pushState("quotedDouble")),
  token("'", "string", pushState("quotedSingle")),
  on(":", literal(":"), lookahead(byte("\"'")), paint("constant.builtin")),
  on(":", literal(":"), ...name, paint("constant.builtin")),
  on("@", literal("@"), ...name, paint("attribute")),
  on("?", literal("?"), choice([literal("\\"), character()], [character()]), paint("number")),
  number,
  on(
    start,
    ...name,
    lookahead(literal(":"), notNext(":"), byte(" \t\r\n")),
    classify(keywordTable(["do", "else", "after", "rescue", "catch"], "keyword"), [
      paint("property"),
    ]),
  ),
  on(upper, byte(upper), bytes(rest, { min: 0 }), paint("type")),
  on(
    start,
    ...name,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    classify(cases, [paint("function")]),
  ),
  on(start, ...name, classify(cases, [paint("variable")])),
  ...[
    "===",
    "!==",
    "<<<",
    ">>>",
    "~~~",
    "<~>",
    "<|>",
    "...",
    "..//",
    "|>",
    "<>",
    "++",
    "--",
    "=~",
    "::",
    "->",
    "<-",
    "=>",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "**",
    "..",
    "\\\\",
  ].map((operator) => token(operator, "operator")),
  token("<<", "punctuation.bracket"),
  token(">>", "punctuation.bracket"),
  token("&", "operator", pushState("capture")),
  token(oneOf("+-*/=<>|!^~%"), "operator"),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(".,;:"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "elixir",
  extensions: ["ex", "exs"],
  aliases: ["ex", "exs"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    capture: {
      style: "plain",
      arms: [
        on(upper, byte(upper), bytes(rest, { min: 0 }), paint("type")),
        token(".", "punctuation.delimiter"),
        on(start, ...name, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    definition: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        comment,
        on(start, ...name, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    interpolation: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("interpolationBrace")),
        ...code,
      ],
    },
    interpolationBrace: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("interpolationBrace")),
        ...code,
      ],
    },
    quotedDouble: {
      style: "string",
      arms: [escape, interpolation, token('"', "string", popState())],
    },
    quotedSingle: {
      style: "string",
      arms: [escape, interpolation, token("'", "string", popState())],
    },
    heredocDouble: {
      style: "string",
      arms: [escape, interpolation, token('"""', "string", popState())],
    },
    heredocSingle: {
      style: "string",
      arms: [escape, interpolation, token("'''", "string", popState())],
    },
    sigilModifiers: {
      style: "plain",
      arms: [
        on(
          union(lower, upper, digit),
          bytes(union(lower, upper, digit)),
          paint("attribute"),
          popState(),
        ),
      ],
      otherwise: [popState()],
    },
    ...sigilStates,
  },
});
