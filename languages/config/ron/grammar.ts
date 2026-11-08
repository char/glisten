import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  markRecord,
  matchRun,
  notNext,
  notLookahead,
  on,
  oneOf,
  optional,
  paint,
  patchRecord,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
// Non-ASCII bytes are accepted as identifiers without checking Unicode XID properties.
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const unicodeSpace = choice(
  ...["\u0085", "\u200e", "\u200f", "\u2028", "\u2029"].map((text) => [literal(text)]),
);
const identByte = [notLookahead(unicodeSpace), byte(rest)];
const rawIdentByte = [notLookahead(unicodeSpace), byte(union(rest, ".+-"))];
const identifier = choice(
  [literal("r#"), ...rawIdentByte, repeat(...rawIdentByte)],
  [notLookahead(unicodeSpace), byte(start), repeat(...identByte)],
);
const space = on(
  union(" \t\r\n\v\f", byteSet({ bytes: [0xc2, 0xe2] })),
  choice([bytes(" \t\r\n\v\f")], [unicodeSpace]),
  paint("plain"),
);
const hashes = slot.run("raw-hashes");
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
// Escape scalar values and byte/character literal lengths are not validated.
const escapeBody = choice(
  [byte("'\"\\nrt0")],
  [literal("x"), byte(hex), byte(hex)],
  [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const continuation = on(
  "\\",
  literal("\\"),
  choice([literal("\r\n")], [literal("\n")]),
  bytes(" \t\r\n", { min: 0 }),
  paint("string.escape"),
);
const integerSuffix = choice(
  ...["i128", "u128", "i16", "u16", "i32", "u32", "i64", "u64", "i8", "u8"].map((suffix) => [
    literal(suffix),
  ]),
);
const floatSuffix = choice([literal("f32")], [literal("f64")]);
const decimal = [byte(digit), bytes(union(digit, "_"), { min: 0 })];
const exponent = [byte("eE"), optional(byte("+-")), bytes("_", { min: 0 }), ...decimal];
const number = on(
  "+-.0123456789iN",
  optional(byte("+-")),
  choice(
    [choice([literal("inf")], [literal("NaN")]), optional(floatSuffix)],
    [literal("0x"), byte(hex), bytes(union(hex, "_"), { min: 0 }), optional(integerSuffix)],
    [literal("0o"), byte("01234567"), bytes("01234567_", { min: 0 }), optional(integerSuffix)],
    [literal("0b"), byte("01"), bytes("01_", { min: 0 }), optional(integerSuffix)],
    [
      ...decimal,
      literal("."),
      notNext("."),
      optional(...decimal),
      optional(...exponent),
      optional(floatSuffix),
    ],
    [literal("."), ...decimal, optional(...exponent), optional(floatSuffix)],
    [...decimal, ...exponent, optional(floatSuffix)],
    [...decimal, floatSuffix],
    [...decimal, optional(integerSuffix)],
  ),
  notLookahead(...identByte),
  paint("number"),
);
const strings = [
  on(
    "br",
    choice([literal("br")], [literal("r")]),
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("string"),
    pushState("rawOpen"),
  ),
  ...['br"', 'r"'].map((text) => token(text, "string", pushState("raw"))),
  ...['b"', '"'].map((text) => token(text, "string", pushState("string"))),
  ...["b'", "'"].map((text) => token(text, "string", pushState("char"))),
];
type ValueContext = "ordinary" | "field";

const identifiers = (context: ValueContext) => {
  const fieldProbe = context === "field" ? [markRecord(), pushState("fieldProbe")] : [];
  return on(
    start,
    identifier,
    classify(
      [
        ...keywordTable(["true", "false", "Some", "None"], "constant.builtin", () => fieldProbe),
        ...keywordTable(
          ["inf", "inff32", "inff64", "NaN", "NaNf32", "NaNf64"],
          "number",
          () => fieldProbe,
        ),
      ],
      [paint("type"), ...fieldProbe],
    ),
  );
};
const values = (context: ValueContext = "ordinary") => [
  ...comments,
  ...strings,
  ...(context === "field" ? [identifiers(context)] : []),
  number,
  token("..=", "operator"),
  token("..", "operator"),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("list")),
  token("{", "punctuation.bracket", pushState("map")),
  token(oneOf(",:"), "punctuation.delimiter"),
  ...(context === "ordinary" ? [identifiers(context)] : []),
];

export default defineGrammar({
  name: "ron",
  extensions: ["ron"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [token("#", "punctuation.special", pushState("directiveBang")), ...values()],
    },
    paren: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...values("field")],
    },
    list: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...values()] },
    map: { style: "plain", arms: [token("}", "punctuation.bracket", popState()), ...values()] },
    fieldProbe: {
      style: "plain",
      arms: [
        space,
        ...comments,
        on(":", literal(":"), patchRecord("property"), paint("punctuation.delimiter"), popState()),
      ],
      otherwise: [popState()],
    },
    directiveBang: {
      style: "plain",
      arms: [space, ...comments, token("!", "punctuation.special", setState("directiveBracket"))],
      otherwise: [popState()],
    },
    directiveBracket: {
      style: "plain",
      arms: [space, ...comments, token("[", "punctuation.special", setState("directive"))],
      otherwise: [popState()],
    },
    directive: {
      style: "plain",
      arms: [
        ...comments,
        token("]", "punctuation.special", popState()),
        token(oneOf("()"), "punctuation.bracket"),
        token(",", "punctuation.delimiter"),
        on(
          start,
          identifier,
          classify(keywordTable(["enable"], "keyword"), [paint("constant.builtin")]),
        ),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    string: { style: "string", arms: [continuation, escape, token('"', "string", popState())] },
    // Malformed character literals and non-scalar Unicode escapes remain string-colored.
    char: { style: "string", arms: [escape, token("'", "string", popState())] },
    rawOpen: { style: "string", arms: [token('"', "string", setState("rawHashes"))] },
    raw: { style: "string", arms: [token('"', "string", popState())] },
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
  },
});
