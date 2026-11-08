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
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const hex = union(digit, range("a", "f"), range("A", "F"));
const decimal = bytes(union(digit, "_"));
const words = [
  ...keywordTable(
    `
      fn let const def type export use static if else for switch match case break continue
      return yield defer is as nullable void done never size len offset alloc free append insert
      delete abort assert vastart vaarg vaend struct union enum
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(
    `
      int uint i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 bool rune str uintptr opaque valist
    `
      .trim()
      .split(/\s+/),
    "type",
  ),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [byte("0abfnrtv\\\"'")],
  ),
  paint("string.escape"),
);
// Numeric separators and suffixes are colored without checking their placement or type compatibility.
const number = on(
  digit,
  choice(
    [literal("0x"), bytes(union(hex, "_"))],
    [literal("0o"), bytes("01234567_")],
    [literal("0b"), bytes("01_")],
    [
      decimal,
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), decimal),
    ],
  ),
  optional(
    choice(
      ...`
        i16 i32 i64 u16 u32 u64 f32 f64 i8 u8 i u z
      `
        .trim()
        .split(/\s+/)
        .map((suffix) => [literal(suffix), notNext(rest)]),
    ),
  ),
  paint("number"),
);

// Calls are recognized lexically; a parenthesized value can be indistinguishable from a call.
// Rune length is not validated, and an unclosed quoted literal colors the rest of the document.
export default defineGrammar({
  name: "hare",
  extensions: ["ha"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("//", "comment", pushState("comment")),
        token('"', "string", pushState("string")),
        token("`", "string", pushState("raw")),
        token("'", "string", pushState("rune")),
        on("@", literal("@"), ...ident, paint("attribute")),
        number,
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          classify(words, [paint("function")]),
        ),
        on(start, ...ident, classify(words, [paint("variable")])),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token("::", "punctuation.delimiter"),
        token(oneOf(",;:."), "punctuation.delimiter"),
        token(oneOf("+-*/%=!<>&|^~?"), "operator"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState())],
    },
    raw: { style: "string", arms: [token("`", "string", popState())] },
    rune: {
      style: "string",
      arms: [escape, token("'", "string", popState())],
    },
  },
});
