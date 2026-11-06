import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  lineEnd,
  literal,
  lookahead,
  notNext,
  notLookahead,
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

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), repeat(notLookahead(literal("’")), byte(rest))];
const digits = union(digit, "_");
const hex = union(digits, range("a", "f"), range("A", "F"));
const keywords =
  `addhandler addressof alias and andalso as async await byref byval call case catch class const continue declare default delegate dim directcast do each else elseif end enum erase error event exit finally for friend function get gettype getxmlnamespace global gosub goto handles if implements imports in inherits interface is isnot iterator key let lib like loop me mod module mustinherit mustoverride mybase myclass namespace narrowing new next not notinheritable notoverridable of off on operator option optional or orelse overloads overridable overrides paramarray partial private property protected public readonly redim rem removehandler resume return select set shadows shared static step stop structure sub synclock then throw to try trycast typeof using variant wend when while widening with withevents writeonly xor yield`.split(
    /\s+/,
  );
const types =
  `boolean byte char date decimal double integer long object sbyte short single string uinteger ulong ushort`.split(
    /\s+/,
  );
const declarationWords = ["sub", "function", "property", "operator"];
const directives = [
  "const",
  "if",
  "elseif",
  "else",
  "end",
  "region",
  "externalsource",
  "externalchecksum",
  "enable",
  "disable",
  "reference",
  "r",
  "load",
];
const wordCases = [
  ...declarationWords.map((text) => ({
    text,
    then: [paint("keyword" as const), setState("declaration")],
  })),
  ...keywordTable(
    keywords.filter((word) => !declarationWords.includes(word)),
    "keyword",
  ),
  ...keywordTable(types, "type"),
  ...keywordTable(["true", "false", "nothing"], "constant.builtin"),
];
const suffix = optional(choice([byte("uU"), byte("sSiIlL")], [byte("sSiIlLdDfFrR%&@!#$")]));
const number = on(
  "&0123456789",
  choice(
    [literal("&"), byte("hH"), bytes(hex)],
    [literal("&"), byte("oO"), bytes(union("01234567", "_"))],
    [literal("&"), byte("bB"), bytes(union("01", "_"))],
    [
      bytes(digits),
      optional(literal("."), byte(digit), bytes(digits, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(digits)),
    ],
  ),
  suffix,
  paint("number"),
);
const comments = [
  token("'", "comment", pushState("comment")),
  token("’", "comment", pushState("comment")),
];
const date = on("#", literal("#"), bytes(except(all, "#\r\n")), literal("#"), paint("string"));
const attribute = on(
  "<",
  literal("<"),
  lookahead(bytes(" \t", { min: 0 }), ...ident, bytes(" \t", { min: 0 }), byte("(,:>")),
  paint("punctuation.special"),
  pushState("attribute"),
);
const continuation = on(
  "_",
  literal("_"),
  lookahead(bytes(" \t", { min: 0 }), byte("\r\n")),
  paint("punctuation.special"),
  setState("continuedLine"),
);
const code = [
  ...comments,
  continuation,
  token('$"', "string", pushState("interpolated")),
  token('"', "string", pushState("string")),
  date,
  number,
  token("[", "variable", pushState("escapedIdentifier")),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    classify(wordCases, [paint("function")], { caseless: true }),
  ),
  on(start, ...ident, classify(wordCases, [paint("variable")], { caseless: true })),
  ...[
    "<=",
    ">=",
    "<>",
    ":=",
    "+=",
    "-=",
    "*=",
    "/=",
    "\\=",
    "^=",
    "&=",
    "<<=",
    ">>=",
    "<<",
    ">>",
  ].map((op) => token(op, "operator")),
  token(oneOf("+-*/\\^&=<>"), "operator"),
  token(oneOf("(){}"), "punctuation.bracket"),
  token(oneOf(".,;"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "vb",
  aliases: ["vbnet", "vb.net"],
  initial: "statementStart",
  states: {
    statementStart: {
      style: "plain",
      arms: [
        token("\uFEFF", "plain"),
        on(" \t", bytes(" \t"), paint("plain")),
        on(
          "#",
          literal("#"),
          choice(
            ...directives.map((word) =>
              [...word].map((letter) => byte(letter + letter.toUpperCase())),
            ),
          ),
          notNext(rest),
          paint("keyword"),
          setState("directive"),
        ),
        on(
          "rR",
          byte("rR"),
          byte("eE"),
          byte("mM"),
          notNext(rest),
          choice([lookahead(byte(" \t"))], [lineEnd()]),
          paint("comment"),
          pushState("comment"),
        ),
        attribute,
        token("\n", "plain"),
        token("\r", "plain"),
      ],
      otherwise: [setState("code")],
    },
    directive: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("statementStart")),
        token("\r", "plain", setState("statementStart")),
        on(
          "rRwWeE",
          choice(
            ...["region", "warning", "externalsource", "externalchecksum"].map((word) =>
              [...word].map((letter) => byte(letter + letter.toUpperCase())),
            ),
          ),
          notNext(rest),
          paint("keyword"),
        ),
        ...code,
      ],
    },
    code: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("statementStart")),
        token("\r", "plain", setState("statementStart")),
        token(":", "punctuation.delimiter", setState("statementStart")),
        ...code,
      ],
    },
    declaration: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("statementStart")),
        token("\r", "plain", setState("statementStart")),
        token(":", "punctuation.delimiter", setState("statementStart")),
        token("(", "punctuation.bracket", pushState("parameterStart")),
        ...code,
      ],
    },
    parameterStart: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        attribute,
        token(")", "punctuation.bracket", popState()),
        on(
          start,
          ...ident,
          classify(
            [
              ...keywordTable(["byval", "byref", "optional", "paramarray", "of"], "keyword"),
              ...types.map((text) => ({
                text,
                then: [paint("type" as const), setState("parameter")],
              })),
            ],
            [paint("variable"), setState("parameter")],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [setState("parameter")],
    },
    parameter: {
      style: "plain",
      arms: [
        token(",", "punctuation.delimiter", setState("parameterStart")),
        token(")", "punctuation.bracket", popState()),
        token("(", "punctuation.bracket", pushState("parameterNested")),
        ...code,
      ],
    },
    parameterNested: {
      style: "plain",
      arms: [
        token("(", "punctuation.bracket", pushState("parameterNested")),
        token(")", "punctuation.bracket", popState()),
        ...code,
      ],
    },
    attribute: {
      style: "plain",
      arms: [
        token(">", "punctuation.special", popState()),
        token("(", "punctuation.bracket", pushState("attributeNested")),
        token('"', "string", pushState("string")),
        on(start, ...ident, paint("attribute")),
        number,
        token(oneOf(",:."), "punctuation.delimiter"),
        token(oneOf("=+-*/"), "operator"),
      ],
    },
    attributeNested: {
      style: "plain",
      arms: [
        token("(", "punctuation.bracket", pushState("attributeNested")),
        token(")", "punctuation.bracket", popState()),
        ...code,
      ],
    },
    continuedLine: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on("\r\n", choice([literal("\r\n")], [byte("\r\n")]), paint("plain"), setState("code")),
      ],
      otherwise: [setState("code")],
    },
    interpolated: {
      style: "string",
      arms: [
        token('""', "string.escape"),
        token("{{", "string.escape"),
        token("}}", "string.escape"),
        token("{", "punctuation.special", pushState("interpolation")),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    interpolation: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("interpolationNested")),
        token(":", "punctuation.delimiter", setState("format")),
        ...code,
      ],
    },
    interpolationNested: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("interpolationNested")),
        ...code,
      ],
    },
    format: {
      style: "string",
      arms: [token("}", "punctuation.special", popState()), redispatch("\r\n", popState())],
    },
    string: {
      style: "string",
      arms: [
        token('""', "string.escape"),
        on('"', literal('"'), optional(byte("cC")), paint("string"), popState()),
        redispatch("\r\n", popState()),
      ],
    },
    escapedIdentifier: {
      style: "variable",
      arms: [token("]", "variable", popState()), redispatch("\r\n", popState())],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
  } satisfies Record<string, State>,
});
