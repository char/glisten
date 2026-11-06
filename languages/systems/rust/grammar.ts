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
  matchRun,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const hashes = slot.run("rawHashes");
const keywords = [
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "abstract",
  "become",
  "box",
  "do",
  "final",
  "macro",
  "override",
  "priv",
  "try",
  "typeof",
  "unsized",
  "virtual",
  "yield",
  "union",
  "default",
  "gen",
];
const types = [
  "bool",
  "char",
  "str",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "isize",
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "usize",
  "f32",
  "f64",
];
const cases = [
  ...keywordTable(
    keywords.filter((keyword) => keyword !== "fn" && keyword !== "struct"),
    "keyword",
  ),
  { text: "fn", then: [paint("keyword"), pushState("functionName")] },
  { text: "struct", then: [paint("keyword"), pushState("structHead")] },
  ...keywordTable(types, "type"),
  ...keywordTable(["true", "false"], "constant.builtin"),
];
const word = (style: "variable" | "function" | "type") => classify(cases, [paint(style)]);
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const number = on(
  digit,
  choice(
    [literal("0x"), bytes(hex)],
    [literal("0o"), bytes("01234567_")],
    [literal("0b"), bytes("01_")],
    [
      bytes(union(digit, "_")),
      optional(literal("."), choice([bytes(union(digit, "_"))], [notNext(union(start, "."))])),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
  bytes(rest, { min: 0 }),
  paint("number"),
);
const escapeBody = choice(
  [literal("u{"), bytes(hex), literal("}")],
  [literal("x"), byte(hex), byte(hex)],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));

const code = [
  ...comments,
  on(
    "brc",
    choice([literal("br")], [literal("cr")], [literal("r")]),
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("string"),
    pushState("rawOpen"),
  ),
  ...['br"', 'cr"', 'r"'].map((text) => token(text, "string", pushState("raw"))),
  ...['b"', 'c"', '"'].map((text) => token(text, "string", pushState("string"))),
  on(
    "b'",
    optional(literal("b")),
    literal("'"),
    lookahead(choice([literal("\\"), escapeBody], [character()]), literal("'")),
    paint("string"),
    pushState("char"),
  ),
  on("'", literal("'"), ...ident, lookahead(literal(":"), notNext(":")), paint("label")),
  on("'", literal("'"), ...ident, paint("label")),
  number,
  token("#![", "punctuation.special", pushState("attribute")),
  token("#[", "punctuation.special", pushState("attribute")),
  on("r", literal("r#"), ...ident, lookahead(literal("!")), paint("function")),
  on(
    "r",
    literal("r#"),
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    paint("function"),
  ),
  on("r", literal("r#"), ...ident, paint("variable")),
  on(start, ...ident, lookahead(literal("!")), word("function")),
  on(start, ...ident, lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")), word("function")),
  on(upper, byte(upper), bytes(union(upper, digit, "_")), notNext(rest), paint("constant.builtin")),
  on(upper, ...ident, word("type")),
  on(start, ...ident, word("variable")),
  token(".", "operator", pushState("field")),
  token(oneOf("{}[]()"), "punctuation.bracket"),
  token(oneOf(",;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^~?#@"), "operator"),
];

export default defineGrammar({
  name: "rust",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    attribute: {
      style: "plain",
      arms: [
        token("]", "punctuation.special", popState()),
        token("[", "punctuation.bracket", pushState("attributeNested")),
        ...code,
      ],
    },
    attributeNested: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        token("[", "punctuation.bracket", pushState("attributeNested")),
        ...code,
      ],
    },
    functionName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on("r", literal("r#"), ...ident, paint("function"), popState()),
        on(start, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    structHead: {
      style: "plain",
      arms: [
        token("{", "punctuation.bracket", setState("structBody")),
        redispatch("(;", popState()),
        ...code,
      ],
    },
    structBody: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        on(
          "r",
          literal("r#"),
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal(":"), notNext(":")),
          paint("variable.member"),
          setState("structType"),
        ),
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal(":"), notNext(":")),
          paint("variable.member"),
          setState("structType"),
        ),
        ...code,
      ],
    },
    structType: {
      style: "plain",
      arms: [
        token(",", "punctuation.delimiter", setState("structBody")),
        token("}", "punctuation.bracket", popState()),
        ...[
          ["<", "structAngle"],
          ["(", "structParen"],
          ["[", "structBracket"],
          ["{", "structBrace"],
        ].map(([open, state]) =>
          token(open!, open === "<" ? "operator" : "punctuation.bracket", pushState(state!)),
        ),
        ...code,
      ],
    },
    ...Object.fromEntries(
      [
        ["structAngle", ">"],
        ["structParen", ")"],
        ["structBracket", "]"],
        ["structBrace", "}"],
      ].map(([state, close]) => [
        state!,
        {
          style: "plain" as const,
          arms: [
            token(close!, close === ">" ? "operator" : "punctuation.bracket", popState()),
            ...[
              ["<", "structAngle"],
              ["(", "structParen"],
              ["[", "structBracket"],
              ["{", "structBrace"],
            ].map(([open, nested]) =>
              token(open!, open === "<" ? "operator" : "punctuation.bracket", pushState(nested!)),
            ),
            ...code,
          ],
        },
      ]),
    ),
    field: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(
          "r",
          literal("r#"),
          ...ident,
          lookahead(
            bytes(" \t\r\n", { min: 0 }),
            choice([literal("(")], [literal("::"), bytes(" \t\r\n", { min: 0 }), literal("<")]),
          ),
          paint("function"),
          popState(),
        ),
        on("r", literal("r#"), ...ident, paint("variable.member"), popState()),
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          paint("function"),
          popState(),
        ),
        on(
          start,
          ...ident,
          lookahead(
            bytes(" \t\r\n", { min: 0 }),
            literal("::"),
            bytes(" \t\r\n", { min: 0 }),
            literal("<"),
          ),
          paint("function"),
          popState(),
        ),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    rawOpen: {
      style: "string",
      arms: [token('"', "string", popState(), pushState("rawHashes"))],
      otherwise: [popState()],
    },
    rawHashes: {
      style: "string",
      arms: [
        on(
          '"',
          literal('"'),
          matchRun(hashes, { relation: "prefix" }),
          paint("string"),
          popState(),
        ),
      ],
    },
    raw: { style: "string", arms: [token('"', "string", popState())] },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
    char: { style: "string", arms: [escape, token("'", "string", popState())] },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
  },
});
