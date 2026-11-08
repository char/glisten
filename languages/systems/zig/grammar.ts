import {
  byte,
  bytes,
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
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const hex = union(digit, range("a", "f"), range("A", "F"));
const keywords = `
  addrspace align allowzero and anyframe anytype asm async await break callconv catch comptime
  const continue defer else enum errdefer error export extern fn for if inline linksection
  noalias noinline nosuspend opaque or orelse packed pub resume return struct suspend switch
  test threadlocal try union usingnamespace var volatile while
`
  .trim()
  .split(/\s+/);
const types = `
  usize isize c_char c_short c_ushort c_int c_uint c_long c_ulong c_longlong c_ulonglong
  c_longdouble f16 f32 f64 f80 f128 anyerror noreturn type void bool comptime_int comptime_float
  anyopaque
`
  .trim()
  .split(/\s+/);
const containerKeywords = ["struct", "union", "enum", "opaque"];
const cases = [
  ...keywordTable(
    keywords.filter(
      (word) => word !== "break" && word !== "continue" && !containerKeywords.includes(word),
    ),
    "keyword",
  ),
  ...containerKeywords.map((text) => ({
    text,
    then: [paint("keyword"), pushState("containerOpen")],
  })),
  { text: "break", then: [paint("keyword"), pushState("breakLabel")] },
  { text: "continue", then: [paint("keyword"), pushState("breakLabel")] },
  ...keywordTable(types, "type"),
  ...keywordTable(["true", "false", "null", "undefined", "unreachable"], "constant.builtin"),
];
const word = (style: "variable" | "function" | "type") => classify(cases, [paint(style)]);
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("x"), byte(hex), byte(hex)],
    [literal("u{"), bytes(hex), literal("}")],
    [byte("nrt\\'\"0")],
  ),
  paint("string.escape"),
);
const quotedStringArms = [escape, token('"', "string", popState()), redispatch("\n", popState())];
const code = [
  token("//", "comment", pushState("lineComment")),
  token("\\\\", "string", pushState("lineString")),
  token('@"', "string", pushState("quotedIdentifier")),
  on("@", literal("@"), ...ident, paint("function")),
  token('"', "string", pushState("string")),
  token("'", "string", pushState("char")),
  on(
    digit,
    choice(
      [
        literal("0x"),
        bytes(union(hex, "_")),
        optional(literal("."), bytes(union(hex, "_"))),
        optional(byte("pP"), optional(byte("+-")), bytes(union(digit, "_"))),
      ],
      [literal("0o"), bytes("01234567_")],
      [literal("0b"), bytes("01_")],
      [
        bytes(union(digit, "_")),
        optional(literal("."), bytes(union(digit, "_"))),
        optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
      ],
    ),
    paint("number"),
  ),
  on(
    start,
    ...ident,
    lookahead(
      literal(":"),
      bytes(" \t\r\n", { min: 0 }),
      choice(
        [literal("{")],
        [
          optional(literal("inline"), bytes(" \t\r\n")),
          choice([literal("while")], [literal("for")]),
          notNext(rest),
        ],
        [literal("switch"), notNext(rest)],
      ),
    ),
    paint("label"),
  ),
  on("ui", byte("ui"), bytes(digit), notNext(rest), paint("type")),
  on(start, ...ident, lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")), word("function")),
  on(range("A", "Z"), ...ident, word("type")),
  on(start, ...ident, word("variable")),
  token(".*", "operator"),
  token(".?", "operator"),
  token("...", "operator"),
  token("..", "operator"),
  token(".", "punctuation.delimiter", pushState("field")),
  token("{", "punctuation.bracket", pushState("block")),
  token("}", "punctuation.bracket", popState()),
  token("(", "punctuation.bracket", pushState("paren")),
  token(")", "punctuation.bracket", popState()),
  token("[", "punctuation.bracket", pushState("bracket")),
  token("]", "punctuation.bracket", popState()),
  token(oneOf(",;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^~?"), "operator"),
];
export default defineGrammar({
  name: "zig",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    block: { style: "plain", arms: code },
    paren: { style: "plain", arms: code },
    bracket: { style: "plain", arms: code },
    containerOpen: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("(", "punctuation.bracket", pushState("containerParams")),
        token("{", "punctuation.bracket", setState("container")),
      ],
      otherwise: [popState()],
    },
    containerParams: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...code],
    },
    container: {
      style: "plain",
      arms: [
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal(":")),
          paint("variable.member"),
        ),
        ...code,
      ],
    },
    breakLabel: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token(":", "punctuation.delimiter", setState("labelName")),
      ],
      otherwise: [popState()],
    },
    labelName: {
      style: "plain",
      arms: [on(start, ...ident, paint("label"), popState())],
      otherwise: [popState()],
    },
    field: {
      style: "plain",
      arms: [
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          paint("function"),
          popState(),
        ),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    lineString: { style: "string", arms: [redispatch("\n", popState())] },
    string: { style: "string", arms: quotedStringArms },
    quotedIdentifier: { style: "string", arms: quotedStringArms },
    char: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\n", popState())],
    },
  },
});
