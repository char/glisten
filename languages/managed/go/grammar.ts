import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  notLookahead,
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
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hexDigit = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const decimalDigits = [byte(digit), repeat(optional(literal("_")), byte(digit))];
const hexDigits = [byte(hexDigit), repeat(optional(literal("_")), byte(hexDigit))];
const binaryDigits = [byte("01"), repeat(optional(literal("_")), byte("01"))];
const octalDigits = [byte("01234567"), repeat(optional(literal("_")), byte("01234567"))];
const keywords = [
  "case",
  "chan",
  "const",
  "default",
  "defer",
  "else",
  "fallthrough",
  "for",
  "go",
  "if",
  "import",
  "interface",
  "map",
  "package",
  "range",
  "return",
  "select",
  "struct",
  "switch",
  "type",
  "var",
];
const cases = [
  ...keywordTable(keywords, "keyword"),
  ...["break", "continue", "goto"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("labelReference")],
  })),
  { text: "func", then: [paint("keyword"), pushState("functionHead")] },
  ...keywordTable(
    [
      "any",
      "bool",
      "byte",
      "comparable",
      "complex64",
      "complex128",
      "error",
      "float32",
      "float64",
      "int",
      "int8",
      "int16",
      "int32",
      "int64",
      "rune",
      "string",
      "uint",
      "uint8",
      "uint16",
      "uint32",
      "uint64",
      "uintptr",
    ],
    "type",
  ),
  ...keywordTable(["true", "false", "iota", "nil"], "constant.builtin"),
  ...keywordTable(
    [
      "append",
      "cap",
      "clear",
      "close",
      "complex",
      "copy",
      "delete",
      "imag",
      "len",
      "make",
      "max",
      "min",
      "new",
      "panic",
      "print",
      "println",
      "real",
      "recover",
    ],
    "function",
  ),
];
const word = (style: "variable" | "function") => classify(cases, [paint(style)]);
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const escape = (quote: string) =>
  on(
    "\\",
    literal("\\"),
    choice(
      [byte(union("abfnrtv\\", quote))],
      [literal("x"), byte(hexDigit), byte(hexDigit)],
      [literal("u"), byte(hexDigit), byte(hexDigit), byte(hexDigit), byte(hexDigit)],
      [
        literal("U"),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
        byte(hexDigit),
      ],
      [byte("01234567"), byte("01234567"), byte("01234567")],
    ),
    paint("string.escape"),
  );
const exponent = [byte("eE"), optional(byte("+-")), ...decimalDigits];
const binaryExponent = [byte("pP"), optional(byte("+-")), ...decimalDigits];
const number = on(
  union(digit, "."),
  choice(
    [
      literal("0"),
      byte("xX"),
      optional(literal("_")),
      ...hexDigits,
      optional(literal("."), optional(...hexDigits)),
      ...binaryExponent,
    ],
    [literal("0"), byte("xX"), literal("."), ...hexDigits, ...binaryExponent],
    [literal("0"), byte("xX"), optional(literal("_")), ...hexDigits],
    [literal("0"), byte("bB"), optional(literal("_")), ...binaryDigits],
    [literal("0"), byte("oO"), optional(literal("_")), ...octalDigits],
    [...decimalDigits, literal("."), optional(...decimalDigits), optional(...exponent)],
    [...decimalDigits, ...exponent],
    [literal("."), ...decimalDigits, optional(...exponent)],
    [...decimalDigits],
  ),
  optional(literal("i")),
  paint("number"),
);
const callSuffix = lookahead(
  bytes(" \t\r\n", { min: 0 }),
  optional(
    literal("["),
    bytes(except(byteSet({ ranges: [[0, 255]] }), "]\r\n")),
    literal("]"),
    bytes(" \t\r\n", { min: 0 }),
  ),
  literal("("),
);
const code = [
  token("\n", "plain", pushState("lineHead")),
  ...comments,
  token("`", "string", pushState("rawString")),
  token('"', "string", pushState("string")),
  token("'", "string", pushState("rune")),
  number,
  on(start, ...ident, callSuffix, word("function")),
  on(start, ...ident, word("variable")),
  token("...", "operator"),
  token(":=", "operator"),
  token(".", "punctuation.delimiter", pushState("field")),
  token(oneOf("{}[]()"), "punctuation.bracket"),
  token(oneOf(",;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^~"), "operator"),
];
export default defineGrammar({
  name: "go",
  aliases: ["golang"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    lineHead: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        on(
          start,
          notLookahead(
            choice(
              ...[...keywords, "func", "break", "continue", "goto"].map((text) => [
                literal(text),
                notNext(rest),
              ]),
            ),
          ),
          ...ident,
          lookahead(
            literal(":"),
            bytes(" \t\r\n", { min: 0 }),
            choice(
              [byte("{;")],
              [
                choice(
                  ...[
                    "for",
                    "switch",
                    "select",
                    "if",
                    "goto",
                    "break",
                    "continue",
                    "return",
                    "go",
                    "defer",
                    "fallthrough",
                  ].map((text) => [literal(text)]),
                ),
                notNext(rest),
              ],
            ),
          ),
          paint("label"),
          popState(),
        ),
      ],
      otherwise: [popState()],
    },
    functionHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(
          "(",
          literal("("),
          lookahead(
            bytes(except(byteSet({ ranges: [[0, 255]] }), "()\r\n"), { min: 0 }),
            literal(")"),
            bytes(" \t\r\n", { min: 0 }),
            ...ident,
            bytes(" \t\r\n", { min: 0 }),
            literal("("),
          ),
          paint("punctuation.bracket"),
          setState("receiver"),
        ),
        on(start, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    receiver: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", setState("functionName")), ...code],
    },
    functionName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    field: {
      style: "plain",
      arms: [
        on(start, ...ident, callSuffix, paint("function"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    labelReference: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        on(start, ...ident, paint("label"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    rawString: { style: "string", arms: [token("`", "string", popState())] },
    string: {
      style: "string",
      arms: [escape('"'), token('"', "string", popState()), redispatch("\n", popState())],
    },
    rune: {
      style: "string",
      arms: [escape("'"), token("'", "string", popState()), redispatch("\n", popState())],
    },
  },
});
