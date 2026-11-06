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
  previousNotIn,
  pushState,
  range,
  redispatch,
  repeat,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit, "'");
const ident = [byte(start), bytes(rest, { min: 0 })];
const hex = union(digit, range("a", "f"), range("A", "F"));
const decimal = bytes(union(digit, "_"));
const word = (text: string) => [literal(text), notNext(rest)];
const operators = "!%&*+-./<=>?@^|~:";
const opPart = choice([byte(except(operators, "/"))], [literal("/"), notNext("/")]);
const keywords =
  "abstract and as assert base begin class default delegate do done downcast downto elif else end exception extern false finally fixed for fun function global if in inherit inline interface internal lazy let match member module mutable namespace new not null of open or override private public rec return sig static struct then to true try type upcast use val void when while with yield".split(
    " ",
  );
const words = [
  ...keywordTable(
    "bool byte sbyte int int8 int16 int32 int64 uint uint16 uint32 uint64 nativeint unativeint float float32 double decimal string char unit obj bigint".split(
      " ",
    ),
    "type",
  ),
  ...keywordTable(
    keywords.filter((w) => w !== "true" && w !== "false" && w !== "null"),
    "keyword",
  ),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [character()],
  ),
  paint("string.escape"),
);
const charBody = choice(
  [
    literal("\\"),
    choice(
      [literal("u"), bytes(hex, { min: 4, max: 4 })],
      [literal("U"), bytes(hex, { min: 8, max: 8 })],
      [character()],
    ),
  ],
  [character()],
);
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(union(hex, "_"))],
    [literal("0"), byte("bB"), bytes("01_")],
    [literal("0"), byte("oO"), bytes("01234567_")],
    [
      decimal,
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), decimal),
    ],
  ),
  optional(
    choice(
      [literal("uy")],
      [literal("us")],
      [literal("ul")],
      [literal("un")],
      [literal("UL")],
      [byte("yYsSlLuUnNfFmM")],
    ),
  ),
  paint("number"),
);

const code: Arm[] = [
  token("//", "comment", pushState("lineComment")),
  token("(*)", "operator"),
  token("(*", "comment", pushState("blockComment")),
  token("[<", "punctuation.bracket", pushState("attribute")),
  on("#", literal("#"), ...ident, paint("keyword")),
  ...Array.from({ length: 8 }, (_, i) => 8 - i).map((n) =>
    on(
      "$",
      previousNotIn("$"),
      literal("$".repeat(n) + '"""'),
      paint("string"),
      pushState(`interpolatedTriple${n}`),
    ),
  ),
  token('$@"', "string", pushState("interpolatedVerbatim")),
  token('@$"', "string", pushState("interpolatedVerbatim")),
  token('$"', "string", pushState("interpolated")),
  token('@"', "string", pushState("verbatim")),
  token('"""', "string", pushState("triple")),
  token('"', "string", pushState("string")),
  on(
    "'",
    lookahead(literal("'"), charBody, literal("'")),
    literal("'"),
    paint("string"),
    pushState("char"),
  ),
  on("'", literal("'"), ...ident, paint("type")),
  on("^", literal("^"), ...ident, paint("type")),
  on(
    "`",
    literal("``"),
    bytes(except(byteSet({ ranges: [[0, 255]] }), "`\r\n")),
    literal("``"),
    paint("variable"),
  ),
  number,
  ...["let", "use", "do", "return", "yield", "match", "and"].map((w) =>
    on(w[0]!, literal(w + "!"), notNext(rest), paint("keyword")),
  ),
  on("l", ...word("let"), paint("keyword"), pushState("bindingName")),
  ...["type", "module", "namespace", "interface"].map((w) =>
    on(w[0]!, ...word(w), paint("keyword"), pushState("typeName")),
  ),
  on(upper, ...ident, classify(words, [paint("type")])),
  on(start, ...ident, classify(words, [paint("variable")])),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token("..", "operator"),
  token(".", "punctuation.delimiter", pushState("member")),
  token(oneOf(",;"), "punctuation.delimiter"),
  on(
    "<",
    literal("<"),
    lookahead(...ident, repeat(byte("*/^"), choice(ident, [decimal])), literal(">")),
    paint("operator"),
    pushState("measure"),
  ),
  on(operators, opPart, repeat(opPart), paint("operator")),
];
const interpolation: Arm[] = [
  token("{{", "string.escape"),
  token("}}", "string.escape"),
  token("{", "punctuation.special", pushState("expression")),
];
const states: Record<string, State> = {
  root: { style: "plain", arms: code },
  bindingName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      ...["rec", "inline", "mutable", "private", "internal"].map((w) =>
        on(w[0]!, ...word(w), paint("keyword")),
      ),
      on(
        start,
        ...ident,
        lookahead(choice([bytes(" \t"), byte(start)], [bytes(" \t", { min: 0 }), literal("(")])),
        paint("function"),
        popState(),
      ),
      on(start, ...ident, paint("variable"), popState()),
    ],
    otherwise: [popState()],
  },
  typeName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(start, ...ident, paint("type"), popState()),
    ],
    otherwise: [popState()],
  },
  member: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(
        start,
        ...ident,
        lookahead(bytes(" \t", { min: 0 }), literal("(")),
        paint("function"),
        popState(),
      ),
      on(start, ...ident, paint("variable.member"), popState()),
    ],
    otherwise: [popState()],
  },
  measure: {
    style: "plain",
    arms: [
      token(">", "operator", popState()),
      on(start, ...ident, paint("type")),
      on(digit, decimal, paint("number")),
      token(oneOf("*/^"), "operator"),
    ],
    otherwise: [popState()],
  },
  lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
  blockComment: {
    style: "comment",
    arms: [token("(*", "comment", pushState("blockComment")), token("*)", "comment", popState())],
  },
  attribute: {
    style: "plain",
    arms: [
      token(">]", "punctuation.bracket", popState()),
      on(start, ...ident, paint("attribute")),
      ...code,
    ],
  },
  string: {
    style: "string",
    arms: [escape, on('"', literal('"'), optional(literal("B")), paint("string"), popState())],
  },
  verbatim: {
    style: "string",
    arms: [
      token('""', "string.escape"),
      on('"', literal('"'), optional(literal("B")), paint("string"), popState()),
    ],
  },
  triple: {
    style: "string",
    arms: [on('"', literal('"""'), optional(literal("B")), paint("string"), popState())],
  },
  char: {
    style: "string",
    arms: [
      escape,
      on("'", literal("'"), optional(literal("B")), paint("string"), popState()),
      redispatch("\r\n", popState()),
    ],
  },
  interpolated: {
    style: "string",
    arms: [escape, ...interpolation, token('"', "string", popState())],
  },
  interpolatedVerbatim: {
    style: "string",
    arms: [token('""', "string.escape"), ...interpolation, token('"', "string", popState())],
  },
  expression: {
    style: "plain",
    arms: [
      token("}", "punctuation.special", popState()),
      token("{", "punctuation.bracket", pushState("expressionBrace")),
      ...code,
    ],
  },
  expressionBrace: {
    style: "plain",
    arms: [
      token("}", "punctuation.bracket", popState()),
      token("{", "punctuation.bracket", pushState("expressionBrace")),
      ...code,
    ],
  },
};
for (let n = 1; n <= 8; n++) {
  states[`interpolatedTriple${n}`] = {
    style: "string",
    arms: [
      token('"""', "string", popState()),
      ...(n === 1
        ? [token("{{", "string.escape"), token("}}", "string.escape")]
        : [on("{", literal("{"), lookahead(literal("{".repeat(n))), paint("string"))]),
      token("{".repeat(n), "punctuation.special", pushState(`tripleExpression${n}`)),
    ],
  };
  states[`tripleExpression${n}`] = {
    style: "plain",
    arms: [
      token("}".repeat(n), "punctuation.special", popState()),
      token("{", "punctuation.bracket", pushState("expressionBrace")),
      ...code,
    ],
  };
}

// Dollar/brace counts use distinct bytes, so raw interpolation is bounded to eight dollars.
// Names, numeric validation, contextual meaning and Unicode identifier categories are lexical approximations.
export default defineGrammar({
  name: "fsharp",
  aliases: ["fs"],
  initial: "root",
  states,
});
