import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  except,
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
  token,
  union,
  type Arm,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const gap = bytes(" \t", { min: 0 });
const word = (text: string) => [literal(text), notNext(rest)];
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const decimal = bytes(union(digit, "_"));
const operators = "!%&*+-/:<=>?^|~";
const operatorPart = choice([byte(except(operators, "/"))], [literal("/"), notNext("/*")]);
const keywords = `
  package import foreign if else for in switch case fallthrough break continue return defer when
  using do or_else or_return or_break or_continue not_in cast transmute auto_cast context proc
  dynamic map matrix struct union enum bit_set bit_field distinct where asm
`
  .trim()
  .split(/\s+/);
const types = `
  bool b8 b16 b32 b64 int uint uintptr i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f16 f32 f64 float
  double rune string cstring rawptr typeid any complex32 complex64 complex128 complex_float
  complex_double quaternion64 quaternion128 quaternion256 byte
`
  .trim()
  .split(/\s+/);
const words = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(types, "type"),
  ...keywordTable(
    `
      i16le i16be i32le i32be i64le i64be i128le i128be
      u16le u16be u32le u32be u64le u64be u128le u128be
      f16le f16be f32le f32be f64le f64be
    `
      .trim()
      .split(/\s+/),
    "type",
  ),
  ...keywordTable(
    ["typeid_of", "align_of", "size_of", "offset_of", "type_of", "type_info_of"],
    "function",
  ),
  ...keywordTable(["true", "false", "nil", "undef"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [bytes("01234567", { min: 3, max: 3 })],
    [character()],
  ),
  paint("string.escape"),
);
const number = on(
  digit,
  choice(
    [literal("0"), byte("hH"), bytes(hex)],
    [
      literal("0"),
      byte("xX"),
      bytes(hex),
      optional(literal("."), bytes(hex)),
      optional(byte("pP"), optional(byte("+-")), decimal),
    ],
    [literal("0"), byte("bB"), bytes("01_")],
    [literal("0"), byte("oO"), bytes("01234567_")],
    [literal("0"), byte("zZ"), bytes("0123456789abAB_")],
    [
      decimal,
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), decimal),
    ],
  ),
  optional(byte("ijk")),
  paint("number"),
);
const comments: Arm[] = [
  token("#!", "comment", pushState("lineComment")),
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const code: Arm[] = [
  ...comments,
  token('"', "string", pushState("string")),
  token("`", "string", pushState("rawString")),
  token("'", "string", pushState("rune")),
  on("#", literal("#"), optional(literal("+")), gap, ...ident, paint("attribute")),
  token("@(", "punctuation.special", pushState("attribute")),
  on("@", literal("@"), ...ident, paint("attribute")),
  on("$", literal("$"), ...ident, paint("type")),
  number,
  token("---", "constant.builtin"),
  on(
    start,
    ...ident,
    lookahead(gap, literal("::"), gap, optional(literal("#"), gap, ...ident, gap), ...word("proc")),
    paint("function"),
  ),
  on(
    start,
    ...ident,
    lookahead(
      gap,
      literal("::"),
      gap,
      choice(...["struct", "union", "enum", "bit_set", "bit_field", "distinct"].map(word)),
    ),
    paint("type"),
  ),
  on(start, ...ident, lookahead(gap, literal("(")), classify(words, [paint("function")])),
  on(upper, ...ident, classify(words, [paint("type")])),
  on(start, ...ident, classify(words, [paint("variable")])),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token("..=", "operator"),
  token("..<", "operator"),
  token("...", "operator"),
  token("..", "operator"),
  token(".", "punctuation.delimiter", pushState("member")),
  token(oneOf(",;"), "punctuation.delimiter"),
  on(operators, operatorPart, repeat(operatorPart), paint("operator")),
];
// Procedure/type declarations and qualified members use local lexical lookahead.
export default defineGrammar({
  name: "odin",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(start, ...ident, lookahead(gap, literal("(")), paint("function"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    attribute: {
      style: "plain",
      arms: [
        token(")", "punctuation.special", popState()),
        on(start, ...ident, paint("attribute")),
        token('"', "string", pushState("string")),
        number,
        token(",", "punctuation.delimiter"),
        token("=", "operator"),
      ],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    rawString: { style: "string", arms: [token("`", "string", popState())] },
    rune: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\r\n", popState())],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
  },
});
