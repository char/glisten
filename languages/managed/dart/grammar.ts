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
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_$", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const gap = bytes(" \t\r\n", { min: 0 });
const space = bytes(" \t\r\n");
const word = (value: string) => [literal(value), notNext(rest)];
const hard =
  "assert break case catch class const continue default do else enum extends false final finally for if in is new null rethrow return super switch this throw true try var void while with".split(
    " ",
  );
const words = [
  ...keywordTable(
    hard.filter((x) => !["true", "false", "null"].includes(x)),
    "keyword",
  ),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
  ...keywordTable(["int", "double", "num", "bool", "dynamic"], "type"),
];
const modifier = [
  "abstract",
  "base",
  "covariant",
  "external",
  "factory",
  "interface",
  "late",
  "required",
  "sealed",
  "static",
];
const hex = union(digit, range("a", "f"), range("A", "F"));
const decimal = bytes(union(digit, "_"));
const exponent = [byte("eE"), optional(byte("+-")), decimal];
// Generic call lookahead only recognizes a single, non-nested type argument list.
const call = lookahead(
  gap,
  choice(
    [literal("(")],
    [literal("<"), bytes(except(all, "<>\r\n")), literal(">"), gap, literal("(")],
  ),
);
const code = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  token("r'''", "string", pushState("rawTripleSingle")),
  token('r"""', "string", pushState("rawTripleDouble")),
  token("r'", "string", pushState("rawSingle")),
  token('r"', "string", pushState("rawDouble")),
  token("'''", "string", pushState("tripleSingle")),
  token('"""', "string", pushState("tripleDouble")),
  token("'", "string", pushState("single")),
  token('"', "string", pushState("double")),
  on("@", literal("@"), ...ident, repeat(literal("."), ...ident), paint("attribute")),
  on(
    digit,
    choice(
      [literal("0"), byte("xX"), bytes(union(hex, "_"))],
      [
        decimal,
        optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
        optional(...exponent),
      ],
    ),
    paint("number"),
  ),
  // Contextual identifiers use nearby spelling, not syntax: `get name` can be a false accessor,
  // and `when` followed by a non-identifier expression can be missed.
  ...modifier.map((value) =>
    on(value[0]!, ...word(value), lookahead(space, ...ident), paint("keyword")),
  ),
  on("g", ...word("get"), lookahead(space, ...ident), paint("keyword"), pushState("getterName")),
  on("s", ...word("set"), lookahead(space, ...ident), paint("keyword")),
  ...["async", "sync"].map((value) =>
    on(
      value[0]!,
      ...word(value),
      optional(literal("*")),
      lookahead(gap, choice([literal("{")], [literal("=>")])),
      paint("keyword"),
    ),
  ),
  ...["await", "yield"].map((value) =>
    on(
      value[0]!,
      ...word(value),
      lookahead(
        gap,
        choice([literal("*")], [byte(union(start, digit))], [byte("([{!'")], [literal('"')]),
      ),
      paint("keyword"),
    ),
  ),
  ...["export", "import", "part"].map((value) =>
    on(value[0]!, ...word(value), lookahead(space, byte("'\"")), paint("keyword")),
  ),
  on("l", ...word("library"), lookahead(gap, literal(";")), paint("keyword")),
  on("o", ...word("operator"), lookahead(space, byte("[]=+-*/%~<>&|^")), paint("keyword")),
  ...[
    "as",
    "deferred",
    "export",
    "extension",
    "hide",
    "implements",
    "import",
    "library",
    "mixin",
    "on",
    "operator",
    "part",
    "show",
    "typedef",
    "when",
  ].map((value) => on(value[0]!, ...word(value), lookahead(space, ...ident), paint("keyword"))),
  on(upper, ...ident, classify(words, [paint("type")])),
  on("_", literal("_"), byte(upper), bytes(rest, { min: 0 }), paint("type")),
  on(start, ...ident, call, classify(words, [paint("function")])),
  on(start, ...ident, classify(words, [paint("variable")])),
  token("?..", "operator", pushState("member")),
  token("..", "operator", pushState("member")),
  token("?.", "operator", pushState("member")),
  token(".", "punctuation.delimiter", pushState("member")),
  ...[
    "...?",
    "...",
    "??=",
    "??",
    "=>",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "<<",
    ">>>",
    ">>",
    "~/",
    "++",
    "--",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "&=",
    "|=",
    "^=",
  ].map((value) => token(value, "operator")),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^?~"), "operator"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u{"), bytes(hex), literal("}")],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [character()],
  ),
  paint("string.escape"),
);
const interpolation = [
  token("${", "punctuation.special", pushState("template")),
  on(
    "$",
    literal("$"),
    byte(union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }))),
    bytes(rest, { min: 0 }),
    paint("variable"),
  ),
];

// Numeric separator placement, Unicode identifier categories and escape validity are approximated.
export default defineGrammar({
  name: "dart",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    getterName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(start, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(start, ...ident, call, paint("function"), popState()),
        on(upper, ...ident, paint("type"), popState()),
        on("_", literal("_"), byte(upper), bytes(rest, { min: 0 }), paint("type"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    template: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("templateBrace")),
        ...code,
      ],
    },
    templateBrace: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("templateBrace")),
        ...code,
      ],
    },
    single: {
      style: "string",
      arms: [
        escape,
        ...interpolation,
        token("'", "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    double: {
      style: "string",
      arms: [
        escape,
        ...interpolation,
        token('"', "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    tripleSingle: {
      style: "string",
      arms: [escape, ...interpolation, token("'''", "string", popState())],
    },
    tripleDouble: {
      style: "string",
      arms: [escape, ...interpolation, token('"""', "string", popState())],
    },
    rawSingle: {
      style: "string",
      arms: [token("'", "string", popState()), redispatch("\n", popState())],
    },
    rawDouble: {
      style: "string",
      arms: [token('"', "string", popState()), redispatch("\n", popState())],
    },
    rawTripleSingle: { style: "string", arms: [token("'''", "string", popState())] },
    rawTripleDouble: { style: "string", arms: [token('"""', "string", popState())] },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
  },
});
